/**
 * ระบบแบน ID (กบ 18 ส.ค. + Codex 4 รอบ)
 *
 * Cache model (Codex รอบ 4 — linearizable): DB = SSOT · redis มี
 * generation counter ต่อ uid (`ban:gen`) — ทุก mutation (ban/unban/already_banned
 * resync) bump gen ก่อน แล้วเขียน cache ทุกตัวผ่าน Lua applyIfGenEquals ที่เช็ค
 * gen ณ เวลาเขียนจริง → straggler ของ mutation เก่า (unban ที่มาช้า ฯลฯ)
 * เขียนไม่เข้า ไม่มีทางทับผลของ ban/unban รอบใหม่กว่า
 *
 * isBanned: อ่าน gen ตอนเริ่ม → ผล DB จะถูก cache กลับก็ต่อเมื่อ gen ยังเท่าเดิม
 * (ไม่มี mutation แทรกระหว่าง query) — ปิดทั้ง resurrection และ stale negative
 *
 * ค้างเดิมที่ยังคุม: overall deadline ~800ms ต่อ isBanned · single-flight DB read
 * (evict เมื่อ caller ชน deadline) · fail-open + alert (fire-and-forget) เมื่อ DB พัง
 */
import { db } from "../../config/supabase.js";
import {
  getValue,
  applyIfGenEquals,
  bumpGeneration,
  tryDedupeOnce,
} from "../../redis/scanV2Redis.js";

const banCacheKey = (uid) => `ban:active:${uid}`;
const banNegCacheKey = (uid) => `ban:neg:${uid}`;
const banTombstoneKey = (uid) => `ban:tomb:${uid}`;
const banGenKey = (uid) => `ban:gen:${uid}`;
export const BAN_UID_RE = /^U[0-9a-f]{32}$/;
const OVERALL_TIMEOUT_MS = 800;
const CACHE_MUTATION_DEADLINE_MS = 2500; // งบรวมทั้งชุด cache ops ของ ban/unban (Codex P1)
const POSITIVE_TTL_SEC = 30 * 24 * 3600;
const NEG_TTL_SEC = 45;
const TOMBSTONE_TTL_SEC = 120;

const log = (event, extra = {}) => console.log(JSON.stringify({ event, ...extra }));

/** race พร้อม timeout ที่เหลือจาก deadline รวม — ค้าง/throw = fallback */
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

/** single-flight DB read ต่อ uid — burst แชร์ query เดียว · entry มีอายุ +
 *  ถูก evict ทันทีเมื่อ caller ชน deadline (query ค้างห้าม poison call ถัดไป) */
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
function evictDbReadInFlight(uid, entry) {
  if (dbReadInFlight.get(uid) === entry) dbReadInFlight.delete(uid);
}

function fireFailOpenAlert(deps) {
  // ห้าม await — alert ต้องไม่ขวางการ return ของ webhook
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
 * @param {{ dbClient?: any, cacheGet?: Function, applyIfGen?: Function, alertDedupe?: Function, overallTimeoutMs?: number }} [deps]
 * @returns {Promise<boolean>} true = แบนอยู่ (drop ทุกอย่าง)
 */
export async function isBanned(lineUserId, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return false;
  const cacheGet = deps.cacheGet || getValue;
  const applyGen = deps.applyIfGen || applyIfGenEquals;
  const deadlineAt = Date.now() + (deps.overallTimeoutMs || OVERALL_TIMEOUT_MS);
  const remaining = () => deadlineAt - Date.now();

  // gen ตอนเริ่ม: ใช้เป็นเงื่อนไขการเขียน cache กลับหลัง DB ตอบ (linearizable)
  const genBefore = String((await raceRemaining(cacheGet(banGenKey(uid)), null, remaining())) ?? "0");

  // tombstone: เพิ่งปลดแบน — ห้ามเชื่อ positive cache
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
    log("BAN_CHECK_DB_ERROR_FAIL_OPEN", {
      uidPrefix: uid.slice(0, 8),
      message: res === TIMEOUT_SENTINEL ? "deadline_exceeded" : String(res?.error?.message || "db_error").slice(0, 100),
    });
    fireFailOpenAlert(deps);
    return false;
  }
  const banned = Boolean(res.data);

  // เขียน cache กลับแบบ gen-guarded (fire-and-forget): มี mutation แทรกระหว่าง
  // query (gen ขยับ) = เขียนไม่เข้า — ผลเก่าไม่มีทางฟื้น cache ผี
  if (banned) {
    void Promise.resolve(
      applyGen(banGenKey(uid), genBefore, { type: "set", key: banCacheKey(uid), value: "1", ttlSec: POSITIVE_TTL_SEC }),
    ).catch(() => {});
    // ผล DB สดกว่า cache เสมอ ณ จุดนี้ — แต่ถ้า gen ขยับระหว่าง query แปลว่ามี
    // mutation ใหม่กว่า (เช่น unban) → เชื่อฝั่ง mutation: อ่าน tombstone ซ้ำ
    const tombAfter = await raceRemaining(cacheGet(banTombstoneKey(uid)), null, Math.max(remaining(), 50));
    if (tombAfter === "1") return false;
    return true;
  }
  void Promise.resolve(
    applyGen(banGenKey(uid), genBefore, { type: "set", key: banNegCacheKey(uid), value: "1", ttlSec: NEG_TTL_SEC }),
  ).catch(() => {});
  return false;
}

/** cache mutation ชุดเต็มของสถานะ "แบน" (ใช้ทั้ง ban สำเร็จ และ already_banned resync) */
async function syncCacheToBanned(uid, deps, deadlineAt) {
  const bump = deps.bumpGen || bumpGeneration;
  const applyGen = deps.applyIfGen || applyIfGenEquals;
  const remaining = () => deadlineAt - Date.now();
  const genRes = await raceRemaining(bump(banGenKey(uid)), { ok: false, reason: "timeout" }, remaining());
  if (!genRes.ok) return false;
  const gen = genRes.gen;
  let synced = true;
  for (const action of [
    { type: "del", key: banNegCacheKey(uid) },
    { type: "del", key: banTombstoneKey(uid) },
    { type: "set", key: banCacheKey(uid), value: "1", ttlSec: POSITIVE_TTL_SEC },
  ]) {
    const r = await raceRemaining(applyGen(banGenKey(uid), gen, action), { ok: false, reason: "timeout" }, remaining());
    if (!r.ok || r.applied === false) synced = false;
  }
  return synced;
}

/**
 * แบน — insert active row + sync cache แบบ gen-guarded
 * @returns {Promise<{ ok: boolean, reason?: string, cacheSynced?: boolean }>}
 */
export async function banUser({ lineUserId, reason, bannedBy }, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!BAN_UID_RE.test(uid)) return { ok: false, reason: "invalid_uid" };
  const client = deps.dbClient || db;
  const deadlineAt = Date.now() + CACHE_MUTATION_DEADLINE_MS;
  try {
    const { error } = await client.from("banned_users").insert({
      line_user_id: uid,
      reason: String(reason || "").slice(0, 300) || null,
      source: "manual",
      banned_by: String(bannedBy || "").trim(),
    });
    if (error) {
      if (String(error.message || "").includes("idx_banned_users_active") || String(error.code) === "23505") {
        // แบนอยู่แล้วใน DB — ต้อง resync cache เต็มชุด (Codex รอบ 4: เดิมตั้งแค่
        // positive ทำ neg/tomb ค้าง ตอบ "แบนอยู่แล้ว" ทั้งที่ isBanned=false)
        const synced = await syncCacheToBanned(uid, deps, deadlineAt);
        return { ok: false, reason: "already_banned", cacheSynced: synced };
      }
      throw new Error(error.message || "db_error");
    }
    const cacheSynced = await syncCacheToBanned(uid, deps, deadlineAt);
    if (!cacheSynced) log("BAN_USER_CACHE_SYNC_INCOMPLETE", { uidPrefix: uid.slice(0, 8) });
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
 * ปลดแบน — ปิด active row (append-only) + ล้าง cache แบบ gen-guarded
 * cacheCleared=false = อย่างน้อยหนึ่ง op พลาด/โดน gen ใหม่กว่าแซง — caller ห้าม
 * อ้างว่าลูกค้ากลับมาใช้ได้ทันที
 */
export async function unbanUser({ lineUserId, unbannedBy, unbanReason }, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!BAN_UID_RE.test(uid)) return { ok: false, reason: "invalid_uid" };
  const bump = deps.bumpGen || bumpGeneration;
  const applyGen = deps.applyIfGen || applyIfGenEquals;
  const client = deps.dbClient || db;
  const deadlineAt = Date.now() + CACHE_MUTATION_DEADLINE_MS;
  const remaining = () => deadlineAt - Date.now();
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
    // gen bump ก่อนทุก cache op — straggler ของรอบเก่าตกทันที และ ops ของรอบนี้
    // จะโดนรอบใหม่กว่า (re-ban) แซงได้เท่านั้น ไม่มีทางแซงกลับ
    const genRes = await raceRemaining(bump(banGenKey(uid)), { ok: false, reason: "timeout" }, remaining());
    let cacheCleared = genRes.ok;
    if (genRes.ok) {
      const gen = genRes.gen;
      const tombSet = await raceRemaining(
        applyGen(banGenKey(uid), gen, { type: "set", key: banTombstoneKey(uid), value: "1", ttlSec: TOMBSTONE_TTL_SEC }),
        { ok: false }, remaining(),
      );
      if (!tombSet.ok || tombSet.applied === false) cacheCleared = false;
      for (const k of UNBAN_CLEAR_KEYS(uid)) {
        const r = await raceRemaining(
          applyGen(banGenKey(uid), gen, { type: "del", key: k }),
          { ok: false }, remaining(),
        );
        if (!r.ok || r.applied === false) cacheCleared = false;
      }
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
