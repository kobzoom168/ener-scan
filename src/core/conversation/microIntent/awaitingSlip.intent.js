import {
  isPaymentCommand,
} from "../../../utils/webhookText.util.js";
import {
  isResendQrIntentText,
  isAwaitingSlipStatusLikeText,
  isGenericAckText,
  isSlipClaimWithoutImageIntent,
} from "../../../utils/stateMicroIntent.util.js";

/**
 * @param {string} text
 * @param {{ lowerText?: string }} opts
 * @returns {import("../contracts.types.js").MicroIntentResult}
 */
export function resolveAwaitingSlipMicroIntent(text, opts = {}) {
  const t = String(text || "").trim();
  const lowerText = String(opts.lowerText || t.toLowerCase()).trim();

  if (isResendQrIntentText(t)) {
    return { microIntent: "resend_qr", confidence: "high", safeToConsume: true, reason: "resend_qr" };
  }

  if (isPaymentCommand(t, lowerText)) {
    return { microIntent: "resend_qr", confidence: "high", safeToConsume: true, reason: "pay_again_show_qr" };
  }

  if (isSlipClaimWithoutImageIntent(t)) {
    return {
      microIntent: "slip_claim_but_no_image",
      confidence: "medium",
      safeToConsume: true,
      reason: "text_claim_no_image",
    };
  }

  if (isAwaitingSlipStatusLikeText(t)) {
    return { microIntent: "status_check", confidence: "high", safeToConsume: true, reason: "status" };
  }

  if (isGenericAckText(t)) {
    return { microIntent: "generic_ack", confidence: "high", safeToConsume: true, reason: "ack" };
  }

  return {
    microIntent: "unrelated_same_state",
    confidence: "low",
    safeToConsume: true,
    reason: "default_slip_reminder",
  };
}
