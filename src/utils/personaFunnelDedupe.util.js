/**
 * In-memory per-process dedupe for funnel analytics (paywall_shown, payment_intent, slip_uploaded).
 * Keys: userId + event + paymentId (when present) or rolling time bucket.
 */

import { env } from "../config/env.js";

/** @type {Map<string, number>} key -> expiresAtMs */
const funnelDedupeExpiry = new Map();

const MAX_DEDUPE_MAP_SIZE = 50_000;

function pruneDedupeMap(now) {
  if (funnelDedupeExpiry.size < MAX_DEDUPE_MAP_SIZE) return;
  for (const [k, exp] of funnelDedupeExpiry) {
    if (exp <= now) funnelDedupeExpiry.delete(k);
  }
  if (funnelDedupeExpiry.size > MAX_DEDUPE_MAP_SIZE) {
    const drop = funnelDedupeExpiry.size - Math.floor(MAX_DEDUPE_MAP_SIZE * 0.5);
    let i = 0;
    for (const k of funnelDedupeExpiry.keys()) {
      funnelDedupeExpiry.delete(k);
      i += 1;
      if (i >= drop) break;
    }
  }
}

/**
 * Build a stable funnel dedupe key.
 * - If `paymentId` is set: scope to that payment row (same user + event + paymentId).
 * - Else: rolling window bucket per user + event (spam / repeated UI without a payment row).
 *
 * @param {{ userId: string, eventName: string, paymentId?: string | null, now?: number }} p
 */
export function buildFunnelDedupeKey({
  userId,
  eventName,
  paymentId = null,
  now = Date.now(),
}) {
  const uid = String(userId || "").trim();
  const ev = String(eventName || "").trim();
  const pay = String(paymentId || "").trim();
  if (pay) {
    return `${uid}|${ev}|pay:${pay}`;
  }
  const windowMs = env.PERSONA_FUNNEL_DEDUPE_WINDOW_MS;
  const bucket = Math.floor(now / windowMs);
  return `${uid}|${ev}|win:${bucket}`;
}

/**
 * TTL for a dedupe key: longer when payment-scoped (payment session), shorter for window keys.
 * @param {string} key
 */
function ttlMsForKey(key) {
  if (key.includes("|pay:")) {
    return env.PERSONA_FUNNEL_DEDUPE_PAYMENT_TTL_MS;
  }
  return env.PERSONA_FUNNEL_DEDUPE_WINDOW_MS;
}

/**
 * Claim first occurrence for this key in the TTL window. Returns true if this is the first
 * (deduped count should increment); false if duplicate.
 * @param {string} key
 * @param {number} [now]
 * @returns {boolean}
 */
export function claimFunnelDedupeSlot(key, now = Date.now()) {
  pruneDedupeMap(now);
  const exp = funnelDedupeExpiry.get(key);
  if (exp != null && exp > now) {
    return false;
  }
  const ttl = ttlMsForKey(key);
  funnelDedupeExpiry.set(key, now + ttl);
  return true;
}

/** Test helper */
export function clearFunnelDedupeMapForTests() {
  funnelDedupeExpiry.clear();
}
