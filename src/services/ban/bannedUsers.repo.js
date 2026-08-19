/**
 * ระบบแบน ID (กบ 18 ส.ค. + Codex 5 รอบ)
 *
 * Concurrency model (Codex รอบ 5 — linearizable จริง):
 * 1. ทุก mutation (ban/unban/already_banned resync) ถือ per-uid distributed lock
 *    (`ban:mutex`) ครอบทั้ง DB mutation + gen bump + cache sync — ban/unban
 *    แข่งกัน = เข้าคิวกัน ไม่สลับกลางคัน
 * 2. DB call ภายใน lock อาจลากเกิน TTL — หลัง DB ตอบต้องเช็คว่ายังถือ lock อยู่
 *    (compare token) ก่อนแตะ cache: เสีย lock = ห้าม mutate cache (มี mutation
 *    ใหม่กว่าแซงไปแล้ว) → คืน cacheSynced/cacheCleared=false ตามจริง
 * 3. cache state เขียนเป็น Lua ก้อนเดียว (applyBanStateIfGen: SET+DEL ทั้งชุด
 *    atomic, guarded ด้วย generation) — ไม่มีหน้าต่างระหว่างคำสั่ง
 * 4. isBanned: จับ gen ก่อน query → หลัง DB ตอบ re-read gen — เปลี่ยน = มี mutation
 *    แทรก ห้ามคืนผลเก่า → retry รอบใหม่ (สูงสุด 2) · หมดงบ = อ่าน authoritative
 *    cache ที่ mutation เพิ่งเขียน (positive → true, tombstone → false)
 */
import { db } from "../../config/supabase.js";
import {
  getValue,
  applyBanStateIfGen,
  bumpGeneration,
  acquireShortLock,
  releaseShortLock,
  checkShortLockHeld,
  renewShortLock,
  tryDedupeOnce,
} from "../../redis/scanV2Redis.js";

const banCacheKey = (uid) => `ban:active:${uid}`;
const banNegCacheKey = (uid) => `ban:neg:${uid}`;
const banTombstoneKey = (uid) => `ban:tomb:${uid}`;
const banGenKey = (uid) => `ban:gen:${uid}`;
const banMutexKey = (uid) => `ban:mutex:${uid}`;
export const BAN_UID_RE = /^U[0-9a-f]{32}$/;
const OVERALL_TIMEOUT_MS = 800;
const MUTATION_LOCK_TTL_MS = 8000;
const MUTATION_LOCK_WAIT_MS = 2000;
const MUTATION_LOCK_RENEW_MS = 3000; // ต่ออายุระหว่าง DB call (Codex รอบ 6)
const MUTATION_DB_TIMEOUT_MS = 10000; // DB op ต้อง bounded ห้ามค้างไม่จำกัด
const RECONCILE_ATTEMPTS = 2;
const POSITIVE_TTL_SEC = 30 * 24 * 3600;
const NEG_TTL_SEC = 45;
const TOMBSTONE_TTL_SEC = 120;

const log = (event, extra = {}) => console.log(JSON.stringify({ event, ...extra }));

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

/** single-flight DB read ต่อ uid — evict เมื่อ caller ชน deadline */
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

function mutationDeps(deps) {
  return {
    bump: deps.bumpGen || bumpGeneration,
    applyState: deps.applyBanState || applyBanStateIfGen,
    acquireLock: deps.acquireLock || ((k, ttl) => acquireShortLock(k, ttl)),
    releaseLock: deps.releaseLock || ((k, t) => releaseShortLock(k, t)),
    checkLockHeld: deps.checkLockHeld || ((k, t) => checkShortLockHeld(k, t)),
    renewLock: deps.renewLock || ((k, t, ttl) => renewShortLock(k, t, ttl)),
    renewIntervalMs: Number(deps.lockRenewIntervalMs) > 0 ? Number(deps.lockRenewIntervalMs) : MUTATION_LOCK_RENEW_MS,
    dbTimeoutMs: Number(deps.dbTimeoutMs) > 0 ? Number(deps.dbTimeoutMs) : MUTATION_DB_TIMEOUT_MS,
  };
}

/**
 * รัน DB op โดยต่ออายุ lock เป็นระยะ (Codex รอบ 6: DB ช้าห้ามทำ lock หมดอายุเงียบ ๆ)
 * + bounded deadline
 */
async function runDbOpWithLockRenewal(uid, m, dbOp) {
  const key = banMutexKey(uid);
  // interval ที่ยกเลิกได้ทันที (ห้ามใช้ loop+await sleep — เคยทำ mutation ช้าขึ้น
  // เท่ากับ 1 รอบ renew ทุกครั้ง เจอจากเทสต์ race)
  const renewTimer = setInterval(() => {
    void Promise.resolve(m.renewLock(key, m.__token, MUTATION_LOCK_TTL_MS)).catch(() => {});
  }, m.renewIntervalMs);
  if (typeof renewTimer.unref === "function") renewTimer.unref();
  let dbTimer = null;
  try {
    const TIMEOUT = Symbol("db_timeout");
    const res = await Promise.race([
      Promise.resolve(dbOp()).catch((e) => ({ __throw: e })),
      new Promise((resolve) => { dbTimer = setTimeout(() => resolve(TIMEOUT), m.dbTimeoutMs); }),
    ]);
    if (res === TIMEOUT) throw new Error("db_timeout");
    if (res && res.__throw) throw res.__throw;
    return res;
  } finally {
    clearInterval(renewTimer);
    if (dbTimer) clearTimeout(dbTimer);
  }
}

/**
 * Reconcile cache ให้ตรง DB (SSOT) — ใช้เมื่อเสีย lock หรือ cache sync ไม่สำเร็จ
 * reacquire lock → อ่าน DB → เขียน state ทั้งชุดใน Lua ก้อนเดียว
 * @returns {Promise<{ ok: boolean, banned?: boolean }>}
 */
async function reconcileCacheWithDb(uid, m, client) {
  for (let i = 0; i < RECONCILE_ATTEMPTS; i += 1) {
    const token = await acquireMutationLock(uid, m);
    if (!token) continue;
    try {
      const { data, error } = await Promise.resolve(
        client
          .from("banned_users")
          .select("id")
          .eq("line_user_id", uid)
          .is("unbanned_at", null)
          .limit(1)
          .maybeSingle(),
      );
      if (error) continue;
      const banned = Boolean(data);
      const genRes = await m.bump(banGenKey(uid));
      if (!genRes.ok) continue;
      const state = banned
        ? {
            sets: [{ key: banCacheKey(uid), value: "1", ttlSec: POSITIVE_TTL_SEC }],
            dels: [banNegCacheKey(uid), banTombstoneKey(uid)],
          }
        : {
            sets: [{ key: banTombstoneKey(uid), value: "1", ttlSec: TOMBSTONE_TTL_SEC }],
            dels: UNBAN_CLEAR_KEYS(uid).concat(banNegCacheKey(uid)),
          };
      const r = await m.applyState(banGenKey(uid), genRes.gen, state);
      if (r.ok === true && r.applied === true) {
        log("BAN_CACHE_RECONCILED", { uidPrefix: uid.slice(0, 8), banned });
        return { ok: true, banned };
      }
    } catch { /* ลองรอบถัดไป */ } finally {
      await Promise.resolve(m.releaseLock(banMutexKey(uid), token)).catch(() => {});
    }
  }
  log("BAN_CACHE_RECONCILE_FAILED", { uidPrefix: uid.slice(0, 8) });
  return { ok: false };
}

/** รอ lock แบบ bounded (คำสั่งแอดมิน — retry สั้น ๆ แล้วยอมแพ้เป็น busy) */
async function acquireMutationLock(uid, m) {
  const deadline = Date.now() + MUTATION_LOCK_WAIT_MS;
  for (;;) {
    const token = await m.acquireLock(banMutexKey(uid), MUTATION_LOCK_TTL_MS);
    if (token) return token;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * @param {string} lineUserId
 * @param {{ dbClient?: any, cacheGet?: Function, applyBanState?: Function, alertDedupe?: Function, overallTimeoutMs?: number }} [deps]
 * @returns {Promise<boolean>} true = แบนอยู่ (drop ทุกอย่าง)
 */
export async function isBanned(lineUserId, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return false;
  const cacheGet = deps.cacheGet || getValue;
  const applyState = deps.applyBanState || applyBanStateIfGen;
  const deadlineAt = Date.now() + (deps.overallTimeoutMs || OVERALL_TIMEOUT_MS);
  const remaining = () => deadlineAt - Date.now();
  const client = deps.dbClient || db;
  const TIMEOUT_SENTINEL = { __timeout: true };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const genBefore = String((await raceRemaining(cacheGet(banGenKey(uid)), null, remaining())) ?? "0");
    const tomb = await raceRemaining(cacheGet(banTombstoneKey(uid)), null, remaining());
    if (tomb !== "1") {
      const pos = await raceRemaining(cacheGet(banCacheKey(uid)), null, remaining());
      if (pos === "1") return true;
      const neg = await raceRemaining(cacheGet(banNegCacheKey(uid)), null, remaining());
      if (neg === "1") return false;
    }

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

    // linearizability (Codex รอบ 5): gen ขยับระหว่าง query = มี mutation แทรก —
    // ผล DB ที่อ่านมา "เก่า" แล้ว ห้ามคืน · retry รอบใหม่ (อ่าน state ปัจจุบัน)
    const genAfter = String((await raceRemaining(cacheGet(banGenKey(uid)), null, Math.max(remaining(), 50))) ?? "0");
    if (genAfter !== genBefore) {
      evictDbReadInFlight(uid, flight); // query ที่แชร์อยู่ก็เก่าแล้วเหมือนกัน
      continue;
    }

    // gen นิ่ง — cache ผลกลับแบบ atomic gen-guarded (fire-and-forget)
    if (banned) {
      void Promise.resolve(
        applyState(banGenKey(uid), genBefore, {
          sets: [{ key: banCacheKey(uid), value: "1", ttlSec: POSITIVE_TTL_SEC }],
        }),
      ).catch(() => {});
      return true;
    }
    void Promise.resolve(
      applyState(banGenKey(uid), genBefore, {
        sets: [{ key: banNegCacheKey(uid), value: "1", ttlSec: NEG_TTL_SEC }],
      }),
    ).catch(() => {});
    return false;
  }

  // retry หมดงบ — อ่าน authoritative cache ที่ mutation ล่าสุดเพิ่งเขียน (ภายใต้ lock)
  const tombNow = await raceRemaining(cacheGet(banTombstoneKey(uid)), null, Math.max(remaining(), 50));
  if (tombNow === "1") return false;
  const posNow = await raceRemaining(cacheGet(banCacheKey(uid)), null, Math.max(remaining(), 50));
  return posNow === "1";
}

/** cache state "แบน" ทั้งชุดใน Lua เดียว (ล้าง neg+tomb + ตั้ง positive) */
async function syncCacheToBanned(uid, m) {
  const genRes = await m.bump(banGenKey(uid));
  if (!genRes.ok) return false;
  const r = await m.applyState(banGenKey(uid), genRes.gen, {
    sets: [{ key: banCacheKey(uid), value: "1", ttlSec: POSITIVE_TTL_SEC }],
    dels: [banNegCacheKey(uid), banTombstoneKey(uid)],
  });
  return r.ok === true && r.applied === true;
}

/**
 * แบน — ถือ per-uid lock ครอบ DB insert + cache sync
 * @returns {Promise<{ ok: boolean, reason?: string, cacheSynced?: boolean }>}
 */
export async function banUser({ lineUserId, reason, bannedBy }, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!BAN_UID_RE.test(uid)) return { ok: false, reason: "invalid_uid" };
  const client = deps.dbClient || db;
  const m = mutationDeps(deps);
  const lockToken = await acquireMutationLock(uid, m);
  if (!lockToken) return { ok: false, reason: "busy" };
  m.__token = lockToken;
  try {
    // 1) ล้าง negative/tombstone "ก่อน" เขียน DB (Codex รอบ 6): DB ช้าจน lock หมด
    //    ก็ไม่มี stale negative ค้างปล่อยคนที่กำลังจะโดนแบนผ่านไปได้อีก
    const preGen = await m.bump(banGenKey(uid));
    if (preGen.ok) {
      await m.applyState(banGenKey(uid), preGen.gen, {
        dels: [banNegCacheKey(uid), banTombstoneKey(uid)],
      });
    }

    // 2) DB insert — ต่ออายุ lock ระหว่างรอ + bounded deadline
    const { error } = await runDbOpWithLockRenewal(uid, m, () =>
      client.from("banned_users").insert({
        line_user_id: uid,
        reason: String(reason || "").slice(0, 300) || null,
        source: "manual",
        banned_by: String(bannedBy || "").trim(),
      }),
    );

    const alreadyBanned =
      Boolean(error) &&
      (String(error.message || "").includes("idx_banned_users_active") || String(error.code) === "23505");
    if (error && !alreadyBanned) throw new Error(error.message || "db_error");

    // 3) sync positive cache ถ้ายังถือ lock อยู่จริง
    const stillHeld = await m.checkLockHeld(banMutexKey(uid), lockToken);
    let cacheSynced = stillHeld ? await syncCacheToBanned(uid, m) : false;
    if (!stillHeld) log("BAN_USER_LOCK_LOST", { uidPrefix: uid.slice(0, 8), op: alreadyBanned ? "already_banned" : "ban" });

    // 4) เสีย lock หรือ sync ไม่สำเร็จ → reconcile จาก DB (authoritative) ห้ามปล่อยผ่าน
    if (!cacheSynced) {
      const rec = await reconcileCacheWithDb(uid, m, client);
      cacheSynced = rec.ok === true && rec.banned === true;
      if (!cacheSynced) {
        // enforcement ยังไม่มีผลจริง — ห้ามรายงานว่าสำเร็จ (Codex รอบ 6)
        log("BAN_USER_ENFORCEMENT_UNRECONCILED", { uidPrefix: uid.slice(0, 8) });
        return { ok: false, reason: "cache_unreconciled", dbBanned: true, cacheSynced: false };
      }
    }

    if (alreadyBanned) return { ok: false, reason: "already_banned", cacheSynced };
    log("BAN_USER_BANNED", { uidPrefix: uid.slice(0, 8), bannedBy: String(bannedBy || "").slice(0, 10), cacheSynced });
    return { ok: true, cacheSynced };
  } catch (e) {
    log("BAN_USER_BAN_FAILED", { uidPrefix: uid.slice(0, 8), message: String(e?.message || e).slice(0, 100) });
    return { ok: false, reason: "db_error" };
  } finally {
    await Promise.resolve(m.releaseLock(banMutexKey(uid), lockToken)).catch(() => {});
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
 * ปลดแบน — ถือ per-uid lock ครอบ DB update + cache clear (Lua ชุดเดียว)
 */
export async function unbanUser({ lineUserId, unbannedBy, unbanReason }, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!BAN_UID_RE.test(uid)) return { ok: false, reason: "invalid_uid" };
  const client = deps.dbClient || db;
  const m = mutationDeps(deps);
  const lockToken = await acquireMutationLock(uid, m);
  if (!lockToken) return { ok: false, reason: "busy" };
  m.__token = lockToken;
  try {
    const { data, error } = await runDbOpWithLockRenewal(uid, m, () =>
      client
        .from("banned_users")
        .update({
          unbanned_by: String(unbannedBy || "").trim(),
          unbanned_at: new Date().toISOString(),
          unban_reason: String(unbanReason || "").slice(0, 300) || null,
        })
        .eq("line_user_id", uid)
        .is("unbanned_at", null)
        .select("id"),
    );
    if (error) throw new Error(error.message || "db_error");
    const wasBanned = Array.isArray(data) && data.length > 0;

    // เสีย lock = อาจมี ban ใหม่กว่าแซง — ห้ามทิ้ง tombstone ทับ ให้ reconcile กับ DB แทน
    const stillHeld = await m.checkLockHeld(banMutexKey(uid), lockToken);
    let cacheCleared = false;
    if (stillHeld) {
      const genRes = await m.bump(banGenKey(uid));
      if (genRes.ok) {
        const r = await m.applyState(banGenKey(uid), genRes.gen, {
          sets: [{ key: banTombstoneKey(uid), value: "1", ttlSec: TOMBSTONE_TTL_SEC }],
          dels: UNBAN_CLEAR_KEYS(uid).concat(banNegCacheKey(uid)),
        });
        cacheCleared = r.ok === true && r.applied === true;
      }
    } else {
      log("BAN_USER_LOCK_LOST", { uidPrefix: uid.slice(0, 8), op: "unban" });
      // reconcile: cache ต้องตรง DB (ถ้ามี ban ใหม่กว่า = ยังแบน, ถ้าไม่มี = ปลดจริง)
      const rec = await reconcileCacheWithDb(uid, m, client);
      cacheCleared = rec.ok === true && rec.banned === false;
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
  } finally {
    await Promise.resolve(m.releaseLock(banMutexKey(uid), lockToken)).catch(() => {});
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
