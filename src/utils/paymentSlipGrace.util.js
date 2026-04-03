/**
 * Grace window when a slip image arrives before `awaiting_payment` row exists (race vs "จ่าย" text).
 * Conservative: needs pay-intent text, in-memory awaiting_slip, or soft slip-like image signal.
 */
import { deterministicSlipPreCheck } from "../core/payments/slipCheck/slipDeterministic.js";
import { getPaymentState } from "../stores/manualPaymentAccess.store.js";
import { paymentRowOwnsImageRouting } from "./paymentConversationRouting.util.js";
import { isPaymentCommand } from "./webhookText.util.js";

/** Recent "จ่าย / สลิป / โอนแล้ว" text window (matches product copy). */
export const SLIP_GRACE_PAY_INTENT_TTL_MS = 45_000;

const payIntentAtMap = new Map();

function normUser(userId) {
  return String(userId || "").trim();
}

/**
 * @param {string} userId
 */
export function clearSlipGracePayIntentForUser(userId) {
  const id = normUser(userId);
  if (id) payIntentAtMap.delete(id);
}

/**
 * Call from LINE text handler when user may be heading to payment + slip.
 * @param {string} userId
 * @param {string} text
 * @param {string} [lowerText]
 */
export function recordSlipGracePayIntentFromUserText(userId, text, lowerText) {
  const id = normUser(userId);
  if (!id) return;
  const lt = String(lowerText ?? String(text || "").toLowerCase()).trim();
  const t = String(text || "").trim();
  if (!textMatchesSlipGracePayIntent(t, lt)) return;
  payIntentAtMap.set(id, {
    at: Date.now(),
    snippet: t.slice(0, 80),
  });
}

/**
 * @param {string} text
 * @param {string} lowerText
 * @returns {boolean}
 */
export function textMatchesSlipGracePayIntent(text, lowerText) {
  const lt = String(lowerText || "").trim();
  const t = String(text || "").trim();
  if (!lt && !t) return false;
  if (isPaymentCommand(t, lt)) return true;
  const phrases = [
    "โอนแล้ว",
    "ส่งสลิป",
    "สลิป",
    "หลักฐานการโอน",
    "หลักฐานโอน",
    "พร้อมเพย์",
    "promptpay",
    "โอนเงิน",
    "ขอqr",
    "ขอ qr",
    "คิวอาร์",
  ];
  return phrases.some((p) => lt.includes(p));
}

/**
 * @param {string} userId
 * @param {number} [now]
 * @returns {{ active: boolean, ageMs?: number, snippet?: string }}
 */
export function getSlipGracePayIntentSnapshot(userId, now = Date.now()) {
  const id = normUser(userId);
  const row = payIntentAtMap.get(id);
  if (!row?.at) return { active: false };
  if (now - row.at > SLIP_GRACE_PAY_INTENT_TTL_MS) {
    payIntentAtMap.delete(id);
    return { active: false };
  }
  return { active: true, ageMs: now - row.at, snippet: row.snippet };
}

const MIN_SOFT_SLIP_BYTES = 8000;

/**
 * Fast, local-only hint (not accept). Excludes tiny images and obvious tall chat screenshots.
 * @param {Buffer} imageBuffer
 * @returns {boolean}
 */
export function slipImageSoftLikelyForGrace(imageBuffer) {
  const pre = deterministicSlipPreCheck(imageBuffer);
  if (pre.kind === "too_small" || pre.kind === "fast_reject_chat") return false;
  if (pre.kind === "needs_vision") {
    return pre.meta.byteLength >= MIN_SOFT_SLIP_BYTES;
  }
  return false;
}

/**
 * @param {object} p
 * @param {string|null|undefined} p.accessReason
 * @param {boolean} p.routeObjectToScanFirst
 * @param {unknown} p.pendingPaymentRow
 * @param {string} p.userId
 * @param {Buffer} p.imageBuffer
 * @returns {false | { reason: string }}
 */
export function shouldOfferSlipPaymentGraceHold({
  accessReason,
  routeObjectToScanFirst,
  pendingPaymentRow,
  userId,
  imageBuffer,
}) {
  if (routeObjectToScanFirst) return false;
  if (String(accessReason || "") !== "payment_required") return false;
  if (paymentRowOwnsImageRouting(pendingPaymentRow)) return false;

  const mem = getPaymentState(userId);
  if (mem.state === "awaiting_slip") {
    return { reason: "memory_awaiting_slip" };
  }

  if (getSlipGracePayIntentSnapshot(userId).active) {
    return { reason: "recent_pay_intent_text" };
  }

  if (slipImageSoftLikelyForGrace(imageBuffer)) {
    return { reason: "slip_like_image_soft" };
  }

  return false;
}

/**
 * Poll DB until an active slip payment row appears or deadline.
 * @param {string} userId
 * @param {() => Promise<unknown>} fetchRow
 * @param {object} [opts]
 * @param {number} [opts.maxMs]
 * @param {number} [opts.pollMs]
 * @param {(ms: number) => Promise<void>} [opts.sleepFn]
 * @returns {Promise<unknown|null>}
 */
export async function pollAwaitingPaymentForSlipGrace(
  userId,
  fetchRow,
  {
    maxMs = Number(process.env.SLIP_PAYMENT_GRACE_MS || 25_000),
    pollMs = Number(process.env.SLIP_PAYMENT_GRACE_POLL_MS || 700),
    sleepFn = (ms) =>
      new Promise((r) => {
        setTimeout(r, ms);
      }),
  } = {},
) {
  void userId;
  const deadline = Date.now() + Math.max(3000, Math.min(maxMs, 60_000));
  let first = true;
  while (Date.now() < deadline) {
    if (first) {
      first = false;
      await sleepFn(Math.min(450, pollMs));
    } else {
      await sleepFn(pollMs);
    }
    let row = null;
    try {
      row = await fetchRow();
    } catch {
      row = null;
    }
    if (paymentRowOwnsImageRouting(row)) return row;
  }
  return null;
}
