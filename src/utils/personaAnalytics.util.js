/**
 * Minimal persona / conversion analytics — structured console lines (grep / log drain).
 * Optional: forward to DB or observability later without changing call sites.
 */

import { incrementPersonaAbStatFromEvent } from "../stores/personaAb.db.js";
import { getAssignedPersonaVariant } from "./personaVariant.util.js";
import {
  buildFunnelDedupeKey,
  claimFunnelDedupeSlot,
} from "./personaFunnelDedupe.util.js";

const DEDUPE_FUNNEL_EVENTS = new Set([
  "paywall_shown",
  "payment_intent",
  "slip_uploaded",
]);

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} [payload]
 */
export function logEvent(eventName, payload = {}) {
  const uid = payload.userId;
  let funnelDedupeKey = null;
  /** @type {boolean | undefined} */
  let funnelDedupeCounted = undefined;

  if (DEDUPE_FUNNEL_EVENTS.has(eventName) && uid) {
    funnelDedupeKey = buildFunnelDedupeKey({
      userId: String(uid),
      eventName,
      paymentId: payload.paymentId,
      now: Date.now(),
    });
    funnelDedupeCounted = claimFunnelDedupeSlot(funnelDedupeKey);
  }

  const line = JSON.stringify({
    event: "PERSONA_ANALYTICS",
    eventName,
    ts: new Date().toISOString(),
    funnelRaw: true,
    ...(funnelDedupeKey != null
      ? {
          funnelDedupeKey,
          funnelDedupeCounted,
        }
      : {}),
    ...payload,
  });
  console.log(line);
  void incrementPersonaAbStatFromEvent(eventName, {
    ...payload,
    funnelDedupeCounted,
  }).catch((err) => {
    console.error("[PERSONA_AB] increment stat failed:", {
      message: err?.message,
      code: err?.code,
    });
  });
}

/**
 * Paywall impression (QR bundle or persona text sequence).
 * @param {string} userId
 * @param {{ personaVariant?: string, patternUsed?: string | null, bubbleCount?: number, source?: string, paymentId?: string | null }} meta
 */
export async function logPaywallShown(userId, meta = {}) {
  const {
    patternUsed = null,
    bubbleCount = 0,
    source = "",
    personaVariant: pvIn,
    paymentId = null,
  } = meta;
  const personaVariant =
    pvIn ?? (await getAssignedPersonaVariant(userId));
  logEvent("paywall_shown", {
    userId,
    personaVariant,
    patternUsed,
    bubbleCount,
    ...(source ? { source } : {}),
    ...(paymentId ? { paymentId: String(paymentId) } : {}),
  });
}
