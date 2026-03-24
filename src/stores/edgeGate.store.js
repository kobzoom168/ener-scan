/**
 * Layer 0 — Edge gate (no LLM): LINE delivery dedup + rapid identical-text suppression.
 * Routing/state remain in lineWebhook; this only drops or short-circuits inbound noise.
 */

import { env } from "../config/env.js";
import { logConversationCost } from "../utils/conversationCost.util.js";

/** @type {Map<string, number>} messageDedupKey -> expiresAtMs */
const seenMessageIds = new Map();

/** @type {Map<string, { norm: string, at: number }>} */
const lastInboundByUser = new Map();

/** @type {Map<string, { count: number, windowStart: number }>} */
const suppressionWindowByUser = new Map();

/** @type {Map<string, true>} */
const softVerifyPending = new Map();

let stats = {
  duplicateEventsDropped: 0,
  identicalInboundSuppressed: 0,
  emptyIgnored: 0,
};

function resolveDedupTtlMs() {
  const n = Number(env.EDGE_GATE_MESSAGE_DEDUP_TTL_MS);
  return Number.isFinite(n) && n >= 60_000 ? n : 600_000;
}

function resolveIdenticalWindowMs() {
  const n = Number(env.EDGE_GATE_IDENTICAL_TEXT_WINDOW_MS);
  return Number.isFinite(n) && n >= 1000 ? n : 7500;
}

function resolveSoftVerifyThreshold() {
  const n = Number(env.EDGE_GATE_SOFT_VERIFY_SUPPRESSION_THRESHOLD);
  return Number.isFinite(n) && n >= 2 ? Math.floor(n) : 4;
}

function pruneExpiredMessageIds(now) {
  for (const [k, exp] of seenMessageIds.entries()) {
    if (exp <= now) seenMessageIds.delete(k);
  }
}

function normalizeInboundText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getEdgeGateStats() {
  return { ...stats };
}

export function resetEdgeGateStatsForTests() {
  stats = {
    duplicateEventsDropped: 0,
    identicalInboundSuppressed: 0,
    emptyIgnored: 0,
  };
  seenMessageIds.clear();
  lastInboundByUser.clear();
  suppressionWindowByUser.clear();
  softVerifyPending.clear();
}

function bumpSuppression(userId, now) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  const winMs = 10 * 60 * 1000;
  const prev = suppressionWindowByUser.get(uid);
  if (!prev || now - prev.windowStart > winMs) {
    suppressionWindowByUser.set(uid, { count: 1, windowStart: now });
  } else {
    suppressionWindowByUser.set(uid, {
      count: prev.count + 1,
      windowStart: prev.windowStart,
    });
  }
  const s = suppressionWindowByUser.get(uid);
  if (
    env.EDGE_GATE_SOFT_VERIFY_ENABLED &&
    s.count >= resolveSoftVerifyThreshold()
  ) {
    const firstPending = !softVerifyPending.has(uid);
    softVerifyPending.set(uid, true);
    if (firstPending) {
      logConversationCost({
        layer: "layer0_edge",
        aiPath: "edge_gate",
        edgeGateAction: "soft_verify_triggered",
        userId: uid,
        usedAi: false,
        modelUsed: null,
        replyType: null,
        stateOwner: null,
        fallbackToDeterministic: true,
        suppressedDuplicate: true,
        softVerifyTriggered: true,
        softVerifyPassed: false,
      });
    }
  }
}

export function isSoftVerifyPending(userId) {
  return Boolean(softVerifyPending.get(String(userId || "").trim()));
}

export function clearSoftVerifyPending(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  softVerifyPending.delete(uid);
  suppressionWindowByUser.delete(uid);
}

const SOFT_VERIFY_WHITELIST = new Set(["ยืนยัน", "เริ่ม", "เริ่มต้น", "confirm", "start"]);

export function isSoftVerifyUnlockText(text) {
  const t = String(text || "").trim();
  const lt = t.toLowerCase();
  return SOFT_VERIFY_WHITELIST.has(t) || SOFT_VERIFY_WHITELIST.has(lt);
}

/**
 * @param {{
 *   userId: string,
 *   messageId?: string | null,
 *   text: string,
 *   now?: number,
 * }} input
 * @returns {{
 *   action: "ok" | "drop_duplicate_event" | "suppress_identical_inbound" | "ignore_empty",
 *   messageId?: string | null,
 *   normalizedText?: string,
 *   repeatHint?: string,
 * }}
 */
export function evaluateTextEdgeGate({
  userId,
  messageId = null,
  text,
  now = Date.now(),
}) {
  if (!env.EDGE_GATE_ENABLED) {
    return { action: "ok", normalizedText: normalizeInboundText(text) };
  }

  const uid = String(userId || "").trim();
  const norm = normalizeInboundText(text);

  if (!norm.length) {
    stats.emptyIgnored += 1;
    return { action: "ignore_empty", normalizedText: "" };
  }

  pruneExpiredMessageIds(now);

  const mid = String(messageId || "").trim();
  if (mid) {
    const dedupKey = `${uid}:${mid}`;
    if (seenMessageIds.has(dedupKey)) {
      stats.duplicateEventsDropped += 1;
      return {
        action: "drop_duplicate_event",
        messageId: mid,
        normalizedText: norm,
        repeatHint: "line_message_id_replay",
      };
    }
    seenMessageIds.set(dedupKey, now + resolveDedupTtlMs());
  }

  const windowMs = resolveIdenticalWindowMs();
  const prev = lastInboundByUser.get(uid);
  if (
    windowMs > 0 &&
    prev &&
    prev.norm === norm &&
    now - prev.at < windowMs
  ) {
    stats.identicalInboundSuppressed += 1;
    bumpSuppression(uid, now);
    return {
      action: "suppress_identical_inbound",
      normalizedText: norm,
      repeatHint: "same_text_within_window",
    };
  }

  lastInboundByUser.set(uid, { norm, at: now });
  return { action: "ok", normalizedText: norm };
}
