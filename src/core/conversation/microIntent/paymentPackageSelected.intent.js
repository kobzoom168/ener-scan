import {
  isPaymentCommand,
  isMainMenuAlias,
} from "../../../utils/webhookText.util.js";
import {
  isPackageChangeIntentPhrase,
  isPackageSelectedHesitation,
  isGenericAckText,
} from "../../../utils/stateMicroIntent.util.js";
import {
  isAwaitingSlipStatusLikeText,
  isPendingVerifyStatusLikeText,
} from "../../../utils/stateMicroIntent.util.js";

/**
 * @param {string} text
 * @param {{ lowerText?: string }} opts
 * @returns {import("../contracts.types.js").MicroIntentResult}
 */
export function resolvePaymentPackageSelectedMicroIntent(text, opts = {}) {
  const t = String(text || "").trim();
  const lowerText = String(opts.lowerText || t.toLowerCase()).trim();

  if (isPaymentCommand(t, lowerText)) {
    return {
      microIntent: "pay_now",
      confidence: "high",
      safeToConsume: true,
      reason: "payment_command",
    };
  }

  if (isPackageChangeIntentPhrase(t)) {
    return {
      microIntent: "package_change",
      confidence: "medium",
      safeToConsume: true,
      reason: "change_package_phrase",
    };
  }

  if (isPackageSelectedHesitation(t)) {
    return {
      microIntent: "hesitation",
      confidence: "high",
      safeToConsume: true,
      reason: "hesitation",
    };
  }

  if (isGenericAckText(t)) {
    return {
      microIntent: "ack",
      confidence: "high",
      safeToConsume: true,
      reason: "ack",
    };
  }

  if (
    isAwaitingSlipStatusLikeText(t) ||
    isPendingVerifyStatusLikeText(t) ||
    isMainMenuAlias(t, lowerText)
  ) {
    return {
      microIntent: "status_like",
      confidence: "medium",
      safeToConsume: true,
      reason: "status_or_menu_shape",
    };
  }

  return {
    microIntent: "ack",
    confidence: "low",
    safeToConsume: true,
    reason: "default_nudge_pay",
  };
}
