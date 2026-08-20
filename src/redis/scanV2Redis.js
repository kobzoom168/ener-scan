/**
 * Redis for Scan V2: short locks, dedupe windows, LINE rate hints, worker heartbeats.
 * When REDIS_URL is unset, operations return safe defaults (no-op / in-memory only where noted).
 */
import { randomBytes } from "crypto";
import { env } from "../config/env.js";

/** @type {import("ioredis").default | null} */
let client = null;

/** @returns {string} */
function keyPrefix() {
  return String(env.SCAN_V2_REDIS_PREFIX || "ener-scan:v2:").trim() || "ener-scan:v2:";
}

function kLock(resource) {
  return `${keyPrefix()}lock:${String(resource || "").trim()}`;
}

function kDedupe(d) {
  return `${keyPrefix()}dedupe:${String(d || "").trim()}`;
}

function kRate(lineUserId) {
  return `${keyPrefix()}rate:${String(lineUserId || "").trim()}`;
}

function kHeartbeat(kind, workerId) {
  return `${keyPrefix()}hb:${String(kind || "").trim()}:${String(workerId || "").trim()}`;
}

function kCanary429() {
  return `${keyPrefix()}canary:line429:${bucketHour()}`;
}

function bucketHour() {
  return new Date().toISOString().slice(0, 13);
}

/**
 * @returns {Promise<import("ioredis").default | null>}
 */
export async function getScanV2Redis() {
  if (!env.REDIS_URL) return null;
  // URL ไม่ใช่ redis จริง (เช่น test-placeholder ใน test env) → no-op เหมือนไม่ตั้งค่า
  // กัน ioredis DNS-retry ค้างเป็น open handle ทำ node --test แขวน (บทเรียนซ้ำหลายรอบ)
  const redisUrlStr = String(env.REDIS_URL);
  if (!redisUrlStr.startsWith("redis://") && !redisUrlStr.startsWith("rediss://")) return null;
  if (client) return client;
  try {
    const { default: IORedis } = await import("ioredis");
    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on("error", (err) => {
      console.error(
        JSON.stringify({
          event: "SCAN_V2_REDIS_ERROR",
          message: err?.message,
        }),
      );
    });
    return client;
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "SCAN_V2_REDIS_CONNECT_FAILED",
        message: e?.message,
      }),
    );
    return null;
  }
}

/**
 * @returns {Promise<void>}
 */
export async function closeScanV2Redis() {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    /* ignore */
  }
  client = null;
}

/**
 * @returns {Promise<{ ok: boolean, latencyMs?: number, error?: string }>}
 */
export async function pingScanV2Redis() {
  const r = await getScanV2Redis();
  if (!r) {
    return { ok: false, error: "redis_not_configured" };
  }
  const t0 = Date.now();
  try {
    const pong = await r.ping();
    const latencyMs = Date.now() - t0;
    return { ok: pong === "PONG", latencyMs };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * SET NX PX — returns opaque token if lock held, else null.
 * @param {string} resourceKey
 * @param {number} ttlMs
 * @returns {Promise<string | null>}
 */
export async function acquireShortLock(resourceKey, ttlMs) {
  const r = await getScanV2Redis();
  if (!r) return randomBytes(8).toString("hex");
  const token = randomBytes(16).toString("hex");
  const ttl = Math.min(Math.max(Number(ttlMs) || 5000, 1000), 600_000);
  const ok = await r.set(kLock(resourceKey), token, "PX", ttl, "NX");
  return ok === "OK" ? token : null;
}

/* ---------------- strict lock API (Codex B1, 20 ส.ค. 2026) ----------------
 * acquireShortLock/renewShortLock เดิม fail-open โดยตั้งใจ (redis หาย = token
 * ปลอม/renew true) — flow เดิมหลายจุดพึ่งพฤติกรรมนี้ **ห้ามเปลี่ยน**
 * งานที่ต้อง fail-closed (chat-quality outbox: lease ปลอม = รายงานซ้ำ) ใช้ชุด
 * strict นี้แทน: redis ไม่มี/พัง/ค้าง = ไม่ได้ lease ชัด ๆ ไม่มีการเดา + bounded */

const STRICT_LOCK_BOUND_MS = 3000;

function boundedOp(promise, timeoutMs) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("redis_op_timeout")), timeoutMs);
    }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * fail-closed acquire: redis ไม่มี/throw/ค้าง = {ok:false} — ห้ามคืน token ปลอม
 * @param {{ getRedis?: Function, timeoutMs?: number }} [deps] DI สำหรับเทสต์
 * @returns {Promise<{ ok: boolean, token?: string, reason?: "redis_unavailable"|"held"|"redis_error" }>}
 */
export async function acquireShortLockStrict(resourceKey, ttlMs, deps = {}) {
  const bound = Number(deps.timeoutMs) > 0 ? Number(deps.timeoutMs) : STRICT_LOCK_BOUND_MS;
  try {
    const r = await boundedOp(Promise.resolve((deps.getRedis || getScanV2Redis)()), bound);
    if (!r) return { ok: false, reason: "redis_unavailable" };
    const token = randomBytes(16).toString("hex");
    const ttl = Math.min(Math.max(Number(ttlMs) || 5000, 1000), 600_000);
    const res = await boundedOp(r.set(kLock(resourceKey), token, "PX", ttl, "NX"), bound);
    return res === "OK" ? { ok: true, token } : { ok: false, reason: "held" };
  } catch {
    return { ok: false, reason: "redis_error" };
  }
}

/**
 * fail-closed renew (compare-token): redis ไม่มี/throw/ค้าง/token ไม่ตรง = false
 * @param {{ getRedis?: Function, timeoutMs?: number }} [deps]
 */
export async function renewShortLockStrict(resourceKey, token, ttlMs, deps = {}) {
  const bound = Number(deps.timeoutMs) > 0 ? Number(deps.timeoutMs) : STRICT_LOCK_BOUND_MS;
  try {
    const r = await boundedOp(Promise.resolve((deps.getRedis || getScanV2Redis)()), bound);
    if (!r) return false;
    const res = await boundedOp(
      r.eval(
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) end return 0",
        1,
        kLock(resourceKey),
        String(token),
        String(Math.min(Math.max(Number(ttlMs) || 5000, 1000), 600000)),
      ),
      bound,
    );
    return Number(res) === 1;
  } catch {
    return false;
  }
}

/**
 * @param {string} resourceKey
 * @param {string} token
 * @returns {Promise<boolean>}
 */
export async function releaseShortLock(resourceKey, token) {
  const r = await getScanV2Redis();
  if (!r) return true;
  const key = kLock(resourceKey);
  const lua = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  try {
    const n = await r.eval(lua, 1, key, String(token));
    return Number(n) === 1;
  } catch {
    return false;
  }
}

/**
 * First caller wins for TTL seconds (SET NX EX).
 * @param {string} dedupeKey
 * @param {number} ttlSec
 * @returns {Promise<boolean>} true if this caller is the first in the window
 */
export async function tryDedupeOnce(dedupeKey, ttlSec) {
  const r = await getScanV2Redis();
  if (!r) return true;
  // เพดานเดิม 3600s ตัด TTL ยาวเงียบ ๆ (บั๊กเจอ 5 ส.ค.: intro จัดชุดขอ 365 วันเหลือ 1 ชม.
  // เลยเด้งซ้ำทุกวัน — และ dedupe FB/YT 45 วันก็โดนเหมือนกัน) → ขยายเป็น 366 วัน
  const ttl = Math.min(Math.max(Number(ttlSec) || 30, 5), 366 * 86400);
  try {
    const ok = await r.set(kDedupe(dedupeKey), "1", "EX", ttl, "NX");
    return ok === "OK";
  } catch {
    return true;
  }
}

/**
 * Small string value with TTL (e.g. customer's own type correction —
 * "องค์นี้คือพระซุ้มกอ" — remembered so the next scan never contradicts the owner).
 * @param {string} key
 * @param {string} value
 * @param {number} ttlSec
 */
export async function setValueWithTtl(key, value, ttlSec) {
  const r = await getScanV2Redis();
  if (!r) return;
  try {
    await r.set(kDedupe(key), String(value).slice(0, 200), "EX", Math.min(Math.max(Number(ttlSec) || 3600, 60), 604800));
  } catch {}
}

/**
 * @param {string} key
 * @returns {Promise<string|null>}
 */
/**
 * เก็บค่าใหญ่ (เช่น cache คำแปลรายงาน ~หลาย KB) — ต่างจาก setValueWithTtl ที่ตัด 200 ตัว
 * cap 512KB กันหลุด · TTL สูงสุด 45 วัน
 * @param {string} key
 * @param {string} value
 * @param {number} ttlSec
 */
export async function setLargeValueWithTtl(key, value, ttlSec) {
  const r = await getScanV2Redis();
  if (!r) return;
  try {
    const v = String(value).slice(0, 512 * 1024);
    await r.set(kDedupe(key), v, "EX", Math.min(Math.max(Number(ttlSec) || 3600, 60), 45 * 86400));
  } catch {}
}

export async function getValue(key) {
  const r = await getScanV2Redis();
  if (!r) return null;
  try {
    return await r.get(kDedupe(key));
  } catch {
    return null;
  }
}

/**
 * Escalation counter: INCR with TTL set on first hit (e.g. multi-image strikes
 * — ครั้งแรกเตือนสุภาพ ครั้งถัดไปเตือนดุ). Returns the new count (1 = first).
 * @param {string} counterKey
 * @param {number} ttlSec
 * @returns {Promise<number>}
 */
export async function incrementCounterWithTtl(counterKey, ttlSec) {
  const r = await getScanV2Redis();
  if (!r) return 1;
  try {
    const k = kDedupe(counterKey);
    const n = await r.incr(k);
    if (n === 1) await r.expire(k, Math.min(Math.max(Number(ttlSec) || 3600, 60), 86400));
    return Number(n) || 1;
  } catch {
    return 1;
  }
}

/**
 * Non-mutating check: is a dedupe/gate key currently set? (e.g. scan in-flight
 * gate — text messages arriving mid-scan get a "รอแป๊บ" reply instead of AI routing.)
 * @param {string} dedupeKey
 * @returns {Promise<boolean>}
 */
export async function isDedupeKeyActive(dedupeKey) {
  const r = await getScanV2Redis();
  if (!r) return false;
  try {
    return (await r.exists(kDedupe(dedupeKey))) === 1;
  } catch {
    return false;
  }
}

/**
 * Release a dedupe/gate key early (e.g. scan in-flight gate once the report is
 * delivered). Best-effort — TTL remains the safety net when redis is down.
 * @param {string} dedupeKey
 */
/**
 * strict primitives (Codex ban-cache round): งานที่ "ต้องรู้ผลจริง" เช่น ล้าง ban cache
 * ห้ามใช้ตัวกลืน error ข้างบน — คืน {ok, reason} เสมอ ไม่ throw
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function strictDeleteKey(key) {
  try {
    const r = await getScanV2Redis();
    if (!r) return { ok: false, reason: "no_redis" };
    await r.del(kDedupe(key));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 80) };
  }
}

/** @returns {Promise<{ ok: boolean, reason?: string }>} */
export async function strictSetWithTtl(key, value, ttlSec) {
  try {
    const r = await getScanV2Redis();
    if (!r) return { ok: false, reason: "no_redis" };
    const v = String(value).slice(0, 512 * 1024);
    await r.set(kDedupe(key), v, "EX", Math.min(Math.max(Number(ttlSec) || 3600, 60), 45 * 86400));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 80) };
  }
}

/**
 * atomic guarded SET (Codex ban-resurrection): เขียน key ได้เฉพาะเมื่อ guardKey
 * ไม่มีอยู่ ณ เวลาที่เขียนจริง (Lua ก้อนเดียว) — ใช้กัน stale positive-ban write
 * ฟื้น cache หลัง unban (re-read ก่อนเขียนไม่พอ เพราะ TOCTOU)
 * @returns {Promise<{ ok: boolean, written?: boolean, reason?: string }>}
 */
export async function setKeyIfGuardAbsent(key, value, ttlSec, guardKey) {
  try {
    const r = await getScanV2Redis();
    if (!r) return { ok: false, reason: "no_redis" };
    const ttl = Math.min(Math.max(Number(ttlSec) || 3600, 60), 45 * 86400);
    const res = await r.eval(
      "if redis.call('EXISTS',KEYS[2])==1 then return 0 end redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2]) return 1",
      2,
      kDedupe(key),
      kDedupe(guardKey),
      String(value).slice(0, 4096),
      String(ttl),
    );
    return { ok: true, written: Number(res) === 1 };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 80) };
  }
}

/**
 * Generation counter + gen-guarded mutation (Codex รอบ 4 — linearizable ban cache):
 * ทุก mutation รอบใหม่ bump gen ก่อน แล้วเขียน cache ผ่าน applyIfGenEquals —
 * straggler ของ mutation เก่า (gen เก่า) เขียนไม่เข้า ไม่มีทางทับผลของรอบใหม่
 */
export async function bumpGeneration(genKey) {
  try {
    const r = await getScanV2Redis();
    if (!r) return { ok: false, reason: "no_redis" };
    const gen = await r.incr(kDedupe(genKey));
    await r.expire(kDedupe(genKey), 90 * 86400).catch(() => {});
    return { ok: true, gen: String(gen) };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 80) };
  }
}

/**
 * @param {string} genKey
 * @param {string} expectedGen — ค่า gen ตอนเริ่ม mutation ("0" = ยังไม่เคยมี)
 * @param {{ type: "set" | "del", key: string, value?: string, ttlSec?: number }} action
 * @returns {Promise<{ ok: boolean, applied?: boolean, reason?: string }>}
 */
export async function applyIfGenEquals(genKey, expectedGen, action) {
  try {
    const r = await getScanV2Redis();
    if (!r) return { ok: false, reason: "no_redis" };
    const ttl = Math.min(Math.max(Number(action.ttlSec) || 3600, 60), 45 * 86400);
    const res = await r.eval(
      "local g = redis.call('GET', KEYS[1]) or '0' " +
        "if g ~= ARGV[1] then return 0 end " +
        "if ARGV[2] == 'set' then redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4]) " +
        "else redis.call('DEL', KEYS[2]) end return 1",
      2,
      kDedupe(genKey),
      kDedupe(action.key),
      String(expectedGen),
      action.type === "set" ? "set" : "del",
      String(action.value ?? "1").slice(0, 4096),
      String(ttl),
    );
    return { ok: true, applied: Number(res) === 1 };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 80) };
  }
}

/**
 * atomic ban-state mutation (Codex รอบ 5): SET/DEL ทั้งชุดใน Lua ก้อนเดียว
 * guarded ด้วย generation — ห้ามแตกเป็น 3 คำสั่งแยก (ช่องว่างระหว่างคำสั่ง =
 * หน้าต่าง race) · sets: [{key, value, ttlSec}] · dels: [key]
 * @returns {Promise<{ ok: boolean, applied?: boolean, reason?: string }>}
 */
export async function applyBanStateIfGen(genKey, expectedGen, { sets = [], dels = [] } = {}) {
  try {
    const r = await getScanV2Redis();
    if (!r) return { ok: false, reason: "no_redis" };
    const keys = [kDedupe(genKey)];
    const argv = [String(expectedGen), String(sets.length), String(dels.length)];
    for (const it of sets) {
      keys.push(kDedupe(it.key));
      argv.push(String(it.value ?? "1").slice(0, 4096));
      argv.push(String(Math.min(Math.max(Number(it.ttlSec) || 3600, 60), 45 * 86400)));
    }
    for (const k of dels) keys.push(kDedupe(k));
    const script =
      "local g = redis.call('GET', KEYS[1]) or '0' " +
      "if g ~= ARGV[1] then return 0 end " +
      "local nset = tonumber(ARGV[2]) local ndel = tonumber(ARGV[3]) " +
      "for i = 1, nset do " +
      "  redis.call('SET', KEYS[1 + i], ARGV[2 + i * 2], 'EX', ARGV[3 + i * 2]) " +
      "end " +
      "for j = 1, ndel do redis.call('DEL', KEYS[1 + nset + j]) end " +
      "return 1";
    const res = await r.eval(script, keys.length, ...keys, ...argv);
    return { ok: true, applied: Number(res) === 1 };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 80) };
  }
}

/** เช็คว่า lock ยังเป็นของ token เรา (ใช้ก่อน mutation หลัง DB call ที่อาจลากยาว) */
export async function checkShortLockHeld(resourceKey, token) {
  try {
    const r = await getScanV2Redis();
    if (!r) return true; // fail-open สอดคล้อง acquireShortLock ตอน redis หาย
    return (await r.get(kLock(resourceKey))) === token;
  } catch {
    return false;
  }
}

/** ต่ออายุ lock ถ้ายังถือ token อยู่ (compare-and-pexpire) */
export async function renewShortLock(resourceKey, token, ttlMs) {
  try {
    const r = await getScanV2Redis();
    if (!r) return true;
    const res = await r.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) end return 0",
      1,
      kLock(resourceKey),
      token,
      String(Math.min(Math.max(Number(ttlMs) || 5000, 1000), 600000)),
    );
    return Number(res) === 1;
  } catch {
    return false;
  }
}

export async function clearDedupeKey(dedupeKey) {
  const r = await getScanV2Redis();
  if (!r) return;
  try {
    await r.del(kDedupe(dedupeKey));
  } catch {
    /* TTL will expire it */
  }
}

/**
 * Suggested delay before next LINE push/reply for this user (ms).
 * @param {string} lineUserId
 * @returns {Promise<number>}
 */
export async function getDeliveryRateBackoffMs(lineUserId) {
  const r = await getScanV2Redis();
  if (!r) return 0;
  try {
    const v = await r.get(kRate(lineUserId));
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 120_000) : 0;
  } catch {
    return 0;
  }
}

/**
 * @param {string} lineUserId
 * @param {number} backoffMs
 * @param {number} ttlSec
 */
export async function setDeliveryRateBackoffMs(
  lineUserId,
  backoffMs,
  ttlSec = 90,
) {
  const r = await getScanV2Redis();
  if (!r) return;
  const ms = Math.min(Math.max(Number(backoffMs) || 0, 0), 120_000);
  const ttl = Math.min(Math.max(Number(ttlSec) || 60, 10), 600);
  try {
    await r.set(kRate(lineUserId), String(ms), "EX", ttl);
  } catch {
    /* ignore */
  }
}

/**
 * Bump hourly counter for canary / monitoring (LINE 429).
 * @returns {Promise<void>}
 */
export async function incrementLine429CanaryCounter() {
  const r = await getScanV2Redis();
  if (!r) return;
  const key = kCanary429();
  try {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, 7200);
  } catch {
    /* ignore */
  }
}

/**
 * Current rolling-hour bucket count of LINE 429 hints (Redis only; null if Redis down).
 * @returns {Promise<number | null>}
 */
export async function getLine429CanaryCountHour() {
  const r = await getScanV2Redis();
  if (!r) return null;
  try {
    const v = await r.get(kCanary429());
    return v == null ? 0 : Number(v) || 0;
  } catch {
    return null;
  }
}

/**
 * @param {string} kind scan | delivery | maintenance
 * @param {string} workerId
 * @param {number} ttlSec
 */
export async function refreshWorkerHeartbeat(kind, workerId, ttlSec = 45) {
  const r = await getScanV2Redis();
  if (!r) return;
  const ttl = Math.min(Math.max(Number(ttlSec) || 45, 15), 300);
  try {
    await r.set(kHeartbeat(kind, workerId), Date.now().toString(), "EX", ttl);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} kind
 * @param {string} workerId
 * @param {number} ttlSec
 * @param {number} intervalMs
 * @returns {() => void} stop
 */
export function startWorkerHeartbeatLoop(kind, workerId, ttlSec = 45, intervalMs) {
  const every = Math.min(
    Math.max(Number(intervalMs) || 15000, 5000),
    (Number(ttlSec) || 45) * 1000,
  );
  const t = setInterval(() => {
    void refreshWorkerHeartbeat(kind, workerId, ttlSec);
  }, every);
  void refreshWorkerHeartbeat(kind, workerId, ttlSec);
  return () => clearInterval(t);
}

/**
 * @param {(ms: number) => Promise<void>} sleep
 * @param {string} lineUserId
 */
export async function sleepIfRateHint(sleep, lineUserId) {
  const ms = await getDeliveryRateBackoffMs(lineUserId);
  if (ms > 0) {
    console.log(
      JSON.stringify({
        event: "SCAN_V2_RATE_HINT_BACKOFF",
        lineUserIdPrefix: String(lineUserId).slice(0, 8),
        waitMs: ms,
      }),
    );
    await sleep(ms);
  }
}
