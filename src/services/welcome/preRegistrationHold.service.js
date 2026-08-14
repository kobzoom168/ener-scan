/**
 * Pre-registration hold — เก็บรูป/รายละเอียดที่ลูกค้าส่งก่อนลงทะเบียนแบบ durable
 * (storage R2 + redis metadata — รอด restart/หลาย container) แล้ว resume หลังสมัคร
 * ด้วยปุ่ม token ลับใช้ครั้งเดียว (กบเคาะ 14 ส.ค. 2569 + เงื่อนไข Codex 8 ข้อ)
 *
 * กติกา:
 * - รูปแรกเป็นเจ้าของ hold — รูปถัดไปไม่ overwrite แค่นับ (แจ้งลูกค้าตรง ๆ)
 * - consume (ลบ metadata + ไฟล์) หลัง ingest สำเร็จเท่านั้น — ingest ล้ม = retry ได้
 * - หมดอายุ 24 ชม.: cleanup ledger (redis zset) เก็บ path ไว้ลบไฟล์ทีหลัง กัน orphan
 * - token ไม่ฝัง storage path / user ID — ตรวจเจ้าของก่อนดึงรูปทุกครั้ง
 */
import crypto from "node:crypto";
import {
  uploadScanImageToStorage,
  readScanImageFromStorage,
} from "../../storage/scanUploadStorage.js";
import {
  getValue,
  setLargeValueWithTtl,
  clearDedupeKey,
  acquireShortLock,
  releaseShortLock,
  getScanV2Redis,
} from "../../redis/scanV2Redis.js";
import {
  PREREG_HOLD_TTL_SEC,
  REG_CARD_COOLDOWN_SEC,
  sanitizeDescription,
} from "./registrationOnboarding.logic.js";

const holdKey = (uid) => `prereg:hold:${uid}`;
const cardCoolKey = (uid) => `prereg:cardcool:${uid}`;
const chatRegKey = (uid) => `prereg:chatreg:${uid}`;
const CLEANUP_LEDGER = "prereg:cleanup_ledger";

const log = (event, extra = {}) => console.log(JSON.stringify({ event, ...extra }));

/** @param {string} uid @returns {Promise<object | null>} */
export async function peekHold(uid) {
  try {
    const raw = await getValue(holdKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveHold(uid, hold) {
  await setLargeValueWithTtl(holdKey(uid), JSON.stringify(hold), PREREG_HOLD_TTL_SEC);
}

/** ledger กัน orphan: จดไฟล์ + เวลาหมดอายุไว้ลบทีหลัง (Codex ข้อ 7) */
async function ledgerAdd(bucket, path, expireAtMs) {
  try {
    const r = await getScanV2Redis();
    if (r) await r.zadd(CLEANUP_LEDGER, expireAtMs, `${bucket}|${path}`);
  } catch { /* ledger พังห้ามขวาง hold */ }
}

async function ledgerRemove(bucket, path) {
  try {
    const r = await getScanV2Redis();
    if (r) await r.zrem(CLEANUP_LEDGER, `${bucket}|${path}`);
  } catch { /* ignore */ }
}

async function deleteStorageObject(bucket, path) {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const { s3Client, S3_ENABLED } = await import("../../config/s3Storage.js");
  if (!S3_ENABLED) throw new Error("S3_not_configured");
  await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
}

/**
 * กวาดไฟล์หมดอายุจาก ledger (เรียกแบบ opportunistic จากจุดที่แตะ hold — ไม่ต้องมี worker ใหม่)
 * @param {number} [maxItems]
 */
export async function sweepExpiredPreRegFiles(maxItems = 5) {
  try {
    const r = await getScanV2Redis();
    if (!r) return;
    const due = await r.zrangebyscore(CLEANUP_LEDGER, 0, Date.now(), "LIMIT", 0, maxItems);
    for (const entry of due || []) {
      const [bucket, path] = String(entry).split("|");
      try {
        await deleteStorageObject(bucket, path);
        await r.zrem(CLEANUP_LEDGER, entry);
        log("pending_registration_image_expired", { path: String(path).slice(-24) });
      } catch (e) {
        log("prereg_storage_cleanup_failure", { message: String(e?.message || e).slice(0, 120) });
        // ทิ้งไว้ใน ledger — รอบหน้าลองใหม่
      }
    }
  } catch { /* sweep พังห้ามขวาง flow หลัก */ }
}

/**
 * รับรูปแรกก่อนลงทะเบียน — durable hold · รูปถัดไปไม่ทับ (Codex ข้อ 3)
 * @param {{ uid: string, messageId: string, buffer: Buffer }} p
 * @returns {Promise<{ held: "first" | "extra" | "failed", hold?: object }>}
 */
export async function holdFirstImage({ uid, messageId, buffer, deps = {} }) {
  const peek = deps.peek || peekHold;
  const save = deps.save || saveHold;
  const upload = deps.upload || uploadScanImageToStorage;
  const lock = deps.lock || ((k, ms) => acquireShortLock(k, ms));
  const unlock = deps.unlock || ((k, t) => releaseShortLock(k, t));
  const addLedger = deps.ledgerAdd || ledgerAdd;
  if (!deps.peek) void sweepExpiredPreRegFiles().catch(() => {});

  const asExtra = async (existing) => {
    existing.extraImages = (Number(existing.extraImages) || 0) + 1;
    await save(uid, existing).catch(() => {});
    log("prereg_extra_image_ignored", { uidPrefix: uid.slice(0, 8), extraImages: existing.extraImages });
    return { held: "extra", hold: existing };
  };

  const pre = await peek(uid);
  if (pre?.storagePath) return asExtra(pre); // รูปแรกเป็นเจ้าของ — รูปถัดไปห้ามทับ (Codex ข้อ 3)

  // lock ต่อ uid กัน race สองรูปพร้อมกันข้าม container (Codex รอบ 2 ข้อ 3):
  // ได้ lock แล้ว re-check ก่อนอัปโหลด · ไม่ได้ lock = อีกรูปกำลัง hold อยู่ → extra
  const lockKey = `prereg:holdlock:${uid}`;
  let lockToken = null;
  for (let i = 0; i < 4 && !lockToken; i++) {
    lockToken = await lock(lockKey, 15_000);
    if (!lockToken) await new Promise((r) => setTimeout(r, 300));
  }
  if (!lockToken) {
    const after = await peek(uid);
    if (after?.storagePath) return asExtra(after);
    log("prereg_hold_lock_busy", { uidPrefix: uid.slice(0, 8) });
    return { held: "extra", hold: after || { extraImages: 1 } };
  }
  try {
    const recheck = await peek(uid);
    if (recheck?.storagePath) return asExtra(recheck);
    const up = await upload({
      lineUserId: uid,
      lineMessageId: `prereg-${messageId || "img"}`,
      buffer,
    });
    // จด ledger ทันทีหลัง upload ก่อน save (Codex รอบ 2 ข้อ 4) — save ล้มไฟล์ยังถูกกวาด
    await addLedger(up.bucket, up.path, Date.now() + PREREG_HOLD_TTL_SEC * 1000 + 3600_000);
    const hold = {
      resumeToken: `rs_${crypto.randomBytes(16).toString("hex")}`,
      storageBucket: up.bucket,
      storagePath: up.path,
      messageId: String(messageId || ""),
      description: recheck?.description || pre?.description || null,
      extraImages: 0,
      createdAt: Date.now(),
    };
    await save(uid, hold);
    log("image_received_before_registration", { uidPrefix: uid.slice(0, 8) });
    return { held: "first", hold };
  } catch (e) {
    log("prereg_hold_failed", { message: String(e?.message || e).slice(0, 120) });
    return { held: "failed" };
  } finally {
    await unlock(lockKey, lockToken).catch(() => {});
  }
}

/** เก็บ/เขียนทับรายละเอียดพระที่พิมพ์มาก่อนลงทะเบียน (มีหรือไม่มีรูปค้างก็เก็บ) */
export async function attachDescription(uid, text) {
  const desc = sanitizeDescription(text);
  if (!desc) return null;
  const hold = (await peekHold(uid)) || { resumeToken: null, createdAt: Date.now(), extraImages: 0 };
  hold.description = desc;
  await saveHold(uid, hold).catch(() => {});
  return desc;
}

/**
 * เริ่ม resume: ตรวจสิทธิ์ + lock กันกดซ้ำ + อ่านรูปจาก storage — ยังไม่ consume
 * (consume หลัง ingest สำเร็จเท่านั้น — Codex ข้อ 7)
 * @returns {Promise<{ ok: true, buffer: Buffer, hold: object, releaseLock: () => Promise<void> }
 *   | { ok: false, reason: string }>}
 */
export async function beginResume(uid, token, { validate }) {
  const hold = await peekHold(uid);
  const verdict = validate({ hold, uid, holdUid: uid, token, nowMs: Date.now() });
  if (!verdict.ok) {
    // แยกเคส "เพิ่งเข้าคิวไปแล้ว" ออกจาก "หมดอายุ" — ข้อความถูกต้องต่อลูกค้า
    if (verdict.reason === "no_hold" && (await getValue(`prereg:resumed:${uid}`).catch(() => null))) {
      return { ok: false, reason: "already_resumed" };
    }
    return { ok: false, reason: verdict.reason };
  }
  // lock 10 นาที ครอบ worst-case ของ ingest (Codex รอบ 2 ข้อ 5 — เดิม 120 วิสั้นกว่าเวลาสแกน)
  const lockToken = await acquireShortLock(`prereg:resumelock:${uid}`, 600_000);
  if (!lockToken) return { ok: false, reason: "already_running" };
  const releaseLock = () => releaseShortLock(`prereg:resumelock:${uid}`, lockToken).catch(() => {});
  try {
    const buffer = await readScanImageFromStorage(hold.storageBucket, hold.storagePath);
    return { ok: true, buffer, hold, releaseLock };
  } catch (e) {
    await releaseLock();
    log("prereg_resume_read_failed", { message: String(e?.message || e).slice(0, 120) });
    return { ok: false, reason: "storage_read_failed" };
  }
}

/** consume หลัง ingest สำเร็จ: ลบ metadata + ไฟล์ + ledger (atomic ต่อ uid ผ่าน resume lock) */
export async function consumeHoldAfterIngest(uid, hold) {
  await clearDedupeKey(holdKey(uid)).catch(() => {});
  // marker ให้กดปุ่มซ้ำหลังเข้าคิวแล้วได้คำตอบตรง ("เข้าคิวแล้ว" ไม่ใช่ "หมดอายุ")
  await setLargeValueWithTtl(`prereg:resumed:${uid}`, "1", 3600).catch(() => {});
  try {
    await deleteStorageObject(hold.storageBucket, hold.storagePath);
    await ledgerRemove(hold.storageBucket, hold.storagePath);
  } catch (e) {
    log("prereg_storage_cleanup_failure", { message: String(e?.message || e).slice(0, 120) });
    // ไฟล์ยังอยู่ใน ledger — sweep จะเก็บกวาดตามรอบ
  }
  log("pending_registration_image_resumed", { uidPrefix: uid.slice(0, 8) });
}

/** ยกเลิก hold (ลูกค้าพิมพ์ยกเลิก): ลบทั้ง metadata และไฟล์ */
export async function cancelHold(uid) {
  const hold = await peekHold(uid);
  await clearDedupeKey(holdKey(uid)).catch(() => {});
  if (hold?.storagePath) {
    try {
      await deleteStorageObject(hold.storageBucket, hold.storagePath);
      await ledgerRemove(hold.storageBucket, hold.storagePath);
    } catch { /* ledger เก็บกวาดต่อ */ }
  }
}

/* ---------------- การ์ดลงทะเบียน cooldown 15 นาที ---------------- */

/** true = ส่งการ์ดได้ (และจองรอบ) · false = อยู่ใน cooldown ใช้ reminder สั้นแทน */
export async function tryMarkRegCardShown(uid, source) {
  try {
    const { tryDedupeOnce } = await import("../../redis/scanV2Redis.js");
    const first = await tryDedupeOnce(cardCoolKey(uid), REG_CARD_COOLDOWN_SEC);
    log(first ? "registration_card_shown" : "registration_card_suppressed_cooldown", {
      uidPrefix: uid.slice(0, 8),
      source,
    });
    return first;
  } catch {
    return true; // redis พัง = ยอมส่งการ์ด (fail-open ฝั่งระบบ)
  }
}

/* ---------------- chat fallback state ---------------- */

export async function getChatRegState(uid) {
  try {
    const raw = await getValue(chatRegKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setChatRegState(uid, state) {
  if (!state) {
    await clearDedupeKey(chatRegKey(uid)).catch(() => {});
    return;
  }
  await setLargeValueWithTtl(chatRegKey(uid), JSON.stringify(state), 3600).catch(() => {});
}
