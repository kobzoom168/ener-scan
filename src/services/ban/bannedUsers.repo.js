/**
 * ระบบแบน ID (กบ 18 ส.ค. + Codex 2 รอบ)
 *
 * Cache contract: DB (PostgREST ของเราเอง) = SSOT · positive-only cache ใน redis ·
 * ban สำเร็จ → เขียน cache ทันที · unban สำเร็จ → ลบ cache ทันที (ห้ามรอ TTL) ·
 * DB พัง + ไม่มี positive cache → fail-open + critical alert · มี positive cache =
 * drop ต่อแม้ DB สะดุด
 *
 * รอบ 18d5d3a (Codex):
 * - deadline เดียวทั้ง isBanned (~800ms รวม ไม่ใช่ 800ms ต่อสเต็ป)
 * - alert ห้าม await ขวางการ return (fire-and-forget)
 * - re-read tombstone หลัง DB query ก่อนเชื่อผล/เขียน positive — กัน query ที่เริ่ม
 *   ก่อน unban แล้วจบทีหลัง
 * - DB read ต่อ uid เป็น single-flight — burst 20 เทิร์นพร้อมกันอ่าน DB ครั้งเดียว
 * - งาน cache ที่ต้องรู้ผลจริง (ban/unban) ใช้ strict primitives {ok,reason}
 *   เพราะ helper ปกติกลืน error — ห้ามใช้ try/catch ตัดสิน cacheCleared
 */
import { db } from "../../config/supabase.js";
import {
  getValue,
  setLargeValueWithTtl,
  setKeyIfGuardAbsent,
  strictDeleteKey,
  strictSetWithTtl,
  tryDedupeOnce,
} from "../../redis/scanV2Redis.js";

const banCacheKey = (uid) => `ban:active:${uid}`;
const banNegCacheKey = (uid) => `ban:neg:${uid}`;
const banTombstoneKey = (uid) => `ban:tomb:${uid}`;
export const BAN_UID_RE = /^U[0-9a-f]{32}$/;
const OVERALL_TIMEOUT_MS = 800;
const POSITIVE_TTL_SEC = 30 * 24 * 3600;
const NEG_TTL_SEC = 45;
const TOMBSTONE_TTL_SEC = 120;

const log = (event, extra = {}) => console.log(JSON.stringify({ event, ...extra }));

/** strict cache op พร้อม deadline (Codex P1): redis ค้างห้ามลากคำสั่งแอดมิน —
 *  timeout = {ok:false} ตามสัญญา strict (ไม่โกหกว่าล้างแล้ว) */
async function strictBound(promise, ms = 1500) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise).catch((e) => ({ ok: false, reason: String(e?.message || e).slice(0, 80) })),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), ms); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** race พร้อม timeout ที่ "เหลืออยู่" จาก deadline รวม — ค้าง/throw = fallback */
async function raceRemaining(promise, fallback, remainingMs) {
  if (remainingMs <= 0) return fallback;
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise).catch(() => fallback),
      new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), remainingMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** single-flight DB read ต่อ uid (in-process) — burst พร้อมกันแชร์ query เดียว
 *  entry มีอายุ: query ที่ค้างเกิน deadline ห้าม poison call ถัดไปของ uid นั้น */
const DB_READ_SHARE_MS = 2000;
const dbReadInFlight = new Map();
function readActiveBanRow(uid, client) {
  const existing = dbReadInFlight.get(uid);
  const now = Date.now();
  if (existing && now - existing.at < DB_READ_SHARE_MS) return existing;
  const p = (async () => {
    const q = client
      .from("banned_users")
      .select("id")
      .eq("line_user_id", uid)
      .is("unbanned_at", null)
      .limit(1)
      .maybeSingle();
    return await Promise.resolve(q);
  })();
  const entry = { p, at: now };
  dbReadInFlight.set(uid, entry);
  p.finally(() => {
    if (dbReadInFlight.get(uid) === entry) dbReadInFlight.delete(uid);
  }).catch(() => {});
  return entry;
}

/** query ค้างจนเกิน deadline ของ caller → ถอดออกจาก map ทันที (Codex: ห้าม
 *  poison call ถัดไป — DB ที่ฟื้นแล้วต้องถูกอ่านใหม่ได้เลย) */
function evictDbReadInFlight(uid, entry) {
  if (dbReadInFlight.get(uid) === entry) dbReadInFlight.delete(uid);
}

function fireFailOpenAlert(deps) {
  // ห้าม await — alert ต้องไม่ขวางการ return ของ webhook (Codex)
  void (async () => {
    try {
      const alertDedupe = deps.alertDedupe || tryDedupeOnce;
      if (await alertDedupe("ban_check_db_error_alert", 600)) {
        const { sendTelegramText } = await import("../telegramNotify.service.js");
        await Promise.race([
          sendTelegramText("[CRITICAL] เช็คแบนอ่าน DB ไม่ได้ — ระบบ fail-open ชั่วคราว รีบเช็คฐานข้อมูลครับ"),
          new Promise((r) => setTimeout(r, 5000)),
        ]);
      }
    } catch { /* ignore */ }
  })();
}

/**
 * @param {string} lineUserId
 * @param {{ dbClient?: any, cacheGet?: Function, cacheSet?: Function, alertDedupe?: Function, overallTimeoutMs?: number }} [deps]
 * @returns {Promise<boolean>} true = แบนอยู่ (drop ทุกอย่าง)
 */
export async function isBanned(lineUserId, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return false;
  const cacheGet = deps.cacheGet || getValue;
  const cacheSet = deps.cacheSet || setLargeValueWithTtl;
  const deadlineAt = Date.now() + (deps.overallTimeoutMs || OVERALL_TIMEOUT_MS);
  const remaining = () => deadlineAt - Date.now();

  // tombstone (P0-3 เดิม): เพิ่งปลดแบน — ห้ามเชื่อ positive cache / ห้าม query เก่าเขียนกลับ
  const tomb = await raceRemaining(cacheGet(banTombstoneKey(uid)), null, remaining());
  if (tomb !== "1") {
    const pos = await raceRemaining(cacheGet(banCacheKey(uid)), null, remaining());
    if (pos === "1") return true;
    const neg = await raceRemaining(cacheGet(banNegCacheKey(uid)), null, remaining());
    if (neg === "1") return false;
  }

  const client = deps.dbClient || db;
  const TIMEOUT_SENTINEL = { __timeout: true };
  const flight = readActiveBanRow(uid, client);
  const res = await raceRemaining(flight.p, TIMEOUT_SENTINEL, remaining());
  if (res === TIMEOUT_SENTINEL) evictDbReadInFlight(uid, flight);
  if (res === TIMEOUT_SENTINEL || !res || res.error) {
    // DB พัง/ช้า + ไม่มี positive cache → fail-open + critical alert (ไม่ block)
    log("BAN_CHECK_DB_ERROR_FAIL_OPEN", {
      uidPrefix: uid.slice(0, 8),
      message: res === TIMEOUT_SENTINEL ? "deadline_exceeded" : String(res?.error?.message || "db_error").slice(0, 100),
    });
    fireFailOpenAlert(deps);
    return false;
  }
  const banned = Boolean(res.data);

  // re-read tombstone หลัง DB query จบ (Codex acceptance b): unban เกิดระหว่าง
  // query เก่ายังวิ่ง → ผลเก่าห้ามถูกเชื่อและห้ามเขียน positive กลับ
  const tombAfter = await raceRemaining(cacheGet(banTombstoneKey(uid)), null, Math.max(remaining(), 50));
  if (tombAfter === "1") return false;

  if (banned) {
    // atomic guarded write (Codex resurrection fix): SET positive เฉพาะเมื่อ
    // tombstone ไม่มี "ณ เวลาเขียนจริง" — stale write ที่จบหลัง unban เขียนไม่เข้า
    const guardedSet = deps.setPositiveGuarded || setKeyIfGuardAbsent;
    void Promise.resolve(guardedSet(banCacheKey(uid), "1", POSITIVE_TTL_SEC, banTombstoneKey(uid))).catch(() => {});
    return true;
  }
  void Promise.resolve(cacheSet(banNegCacheKey(uid), "1", NEG_TTL_SEC)).catch(() => {});
  return false;
}

/**
 * แบน — insert active row + sync cache แบบ strict
 * @returns {Promise<{ ok: boolean, reason?: string, cacheSynced?: boolean }>}
 * cacheSynced=false = แบนบันทึกใน DB แล้ว แต่ negative cache เก่าอาจทำผลช้าสุด 45 วิ
 * (ห้าม caller อ้างว่ามีผลทันที — Codex: ห้ามคืนสำเร็จเฉย ๆ ถ้า cache ยังไม่ effective)
 */
export async function banUser({ lineUserId, reason, bannedBy }, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!BAN_UID_RE.test(uid)) return { ok: false, reason: "invalid_uid" };
  const strictSet = deps.strictSet || strictSetWithTtl;
  const strictDel = deps.strictDel || strictDeleteKey;
  const client = deps.dbClient || db;
  try {
    const { error } = await client.from("banned_users").insert({
      line_user_id: uid,
      reason: String(reason || "").slice(0, 300) || null,
      source: "manual",
      banned_by: String(bannedBy || "").trim(),
    });
    if (error) {
      if (String(error.message || "").includes("idx_banned_users_active") || String(error.code) === "23505") {
        await strictBound(strictSet(banCacheKey(uid), "1", POSITIVE_TTL_SEC));
        return { ok: false, reason: "already_banned" };
      }
      throw new Error(error.message || "db_error");
    }
    const negDel = await strictBound(strictDel(banNegCacheKey(uid)));
    const tombDel = await strictBound(strictDel(banTombstoneKey(uid)));
    const posSet = await strictBound(strictSet(banCacheKey(uid), "1", POSITIVE_TTL_SEC));
    const cacheSynced = negDel.ok && tombDel.ok && posSet.ok;
    if (!cacheSynced) {
      log("BAN_USER_CACHE_SYNC_INCOMPLETE", {
        uidPrefix: uid.slice(0, 8),
        negDel: negDel.ok, tombDel: tombDel.ok, posSet: posSet.ok,
      });
    }
    log("BAN_USER_BANNED", { uidPrefix: uid.slice(0, 8), bannedBy: String(bannedBy || "").slice(0, 10), cacheSynced });
    return { ok: true, cacheSynced };
  } catch (e) {
    log("BAN_USER_BAN_FAILED", { uidPrefix: uid.slice(0, 8), message: String(e?.message || e).slice(0, 100) });
    return { ok: false, reason: "db_error" };
  }
}

/** key ชั่วคราวที่ต้องล้างตอนปลดแบน (soft mute/troll state เดิม) */
const UNBAN_CLEAR_KEYS = (uid) => [
  banCacheKey(uid),
  `scan_v2:banned:${uid}`,
  `scan_v2:troll:${uid}`,
  `scan_v2:troll_notice:${uid}`,
  `scan_v2:last_text:${uid}`,
  `scan_v2:sticker_streak:${uid}`,
];

/**
 * ปลดแบน — ปิด active row (append-only) + ล้าง cache แบบ strict
 * cacheCleared=false = DEL/tombstone อย่างน้อยหนึ่งตัวพลาดจริง — caller ห้ามอ้าง
 * ว่าลูกค้ากลับมาใช้ได้ทันที (positive cache อาจค้างจน TTL)
 */
export async function unbanUser({ lineUserId, unbannedBy, unbanReason }, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!BAN_UID_RE.test(uid)) return { ok: false, reason: "invalid_uid" };
  const strictSet = deps.strictSet || strictSetWithTtl;
  const strictDel = deps.strictDel || strictDeleteKey;
  const client = deps.dbClient || db;
  try {
    const { data, error } = await client
      .from("banned_users")
      .update({
        unbanned_by: String(unbannedBy || "").trim(),
        unbanned_at: new Date().toISOString(),
        unban_reason: String(unbanReason || "").slice(0, 300) || null,
      })
      .eq("line_user_id", uid)
      .is("unbanned_at", null)
      .select("id");
    if (error) throw new Error(error.message || "db_error");
    const wasBanned = Array.isArray(data) && data.length > 0;
    // tombstone ก่อน DEL (strict): กัน stale query เขียน positive กลับระหว่างล้าง
    const tombSet = await strictBound(strictSet(banTombstoneKey(uid), "1", TOMBSTONE_TTL_SEC));
    let cacheCleared = tombSet.ok;
    for (const k of UNBAN_CLEAR_KEYS(uid)) {
      const r = await strictBound(strictDel(k));
      if (!r.ok) cacheCleared = false;
    }
    if (!wasBanned) return { ok: false, reason: "not_banned", cacheCleared };
    if (!cacheCleared) {
      log("BAN_USER_UNBAN_CACHE_CLEAR_FAILED", { uidPrefix: uid.slice(0, 8) });
      return { ok: true, cacheCleared: false };
    }
    log("BAN_USER_UNBANNED", { uidPrefix: uid.slice(0, 8), unbannedBy: String(unbannedBy || "").slice(0, 10) });
    return { ok: true, cacheCleared: true };
  } catch (e) {
    log("BAN_USER_UNBAN_FAILED", { uidPrefix: uid.slice(0, 8), message: String(e?.message || e).slice(0, 100) });
    return { ok: false, reason: "db_error" };
  }
}

/** ลิสต์แบน active (สำหรับคำสั่ง ดูแบน) */
export async function listActiveBans(deps = {}) {
  const client = deps.dbClient || db;
  try {
    const { data, error } = await client
      .from("banned_users")
      .select("line_user_id,reason,banned_at")
      .is("unbanned_at", null)
      .order("banned_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message || "db_error");
    return { ok: true, rows: data || [] };
  } catch {
    return { ok: false, rows: [] };
  }
}
