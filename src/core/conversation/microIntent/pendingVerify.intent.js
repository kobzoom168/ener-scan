import {
  isPaymentCommand,
} from "../../../utils/webhookText.util.js";
import {
  isPendingVerifyStatusLikeText,
  isGenericAckText,
} from "../../../utils/stateMicroIntent.util.js";

/**
 * @param {string} text
 * @param {{ lowerText?: string }} opts
 * @returns {import("../contracts.types.js").MicroIntentResult}
 */
export function resolvePendingVerifyMicroIntent(text, opts = {}) {
  const t = String(text || "").trim();
  const lowerText = String(opts.lowerText || t.toLowerCase()).trim();

  if (isPaymentCommand(t, lowerText)) {
    return {
      microIntent: "hurry",
      confidence: "high",
      safeToConsume: true,
      reason: "pay_while_pending_verify",
    };
  }

  if (isPendingVerifyStatusLikeText(t)) {
    return {
      microIntent: "status_check",
      confidence: "high",
      safeToConsume: true,
      reason: "status_check",
    };
  }

  if (isGenericAckText(t)) {
    return {
      microIntent: "generic_ack",
      confidence: "high",
      safeToConsume: true,
      reason: "ack",
    };
  }

  const hurry = /เร็ว|รีบ|นาน|เมื่อไหร่|ยัง|เช็ค|เช็ก/i.test(t);
  if (hurry && t.length >= 3) {
    return {
      microIntent: "hurry",
      confidence: "medium",
      safeToConsume: true,
      reason: "hurry_like",
    };
  }

  return {
    microIntent: "unrelated_same_state",
    confidence: "low",
    safeToConsume: true,
    reason: "default_pv_wait",
  };
}
