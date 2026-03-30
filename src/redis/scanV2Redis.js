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
  const ttl = Math.min(Math.max(Number(ttlSec) || 30, 5), 3600);
  try {
    const ok = await r.set(kDedupe(dedupeKey), "1", "EX", ttl, "NX");
    return ok === "OK";
  } catch {
    return true;
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
