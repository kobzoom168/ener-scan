import {
  parseBirthdateInput,
  looksLikeBirthdateInput,
} from "../../../utils/birthdateParse.util.js";
import {
  isGenericAckText,
  isUnclearNoiseText,
} from "../../../utils/stateMicroIntent.util.js";
import { isWaitingBirthdatePackageOrPaymentWords } from "../../../utils/webhookText.util.js";

/**
 * @param {string} text
 * @param {{ lowerText?: string }} [_opts]
 * @returns {import("../contracts.types.js").MicroIntentResult}
 */
export function resolveWaitingBirthdateMicroIntent(text, _opts = {}) {
  const t = String(text || "").trim();
  const parsed = parseBirthdateInput(t);
  if (parsed.ok) {
    return {
      microIntent: "valid_date",
      confidence: "high",
      safeToConsume: true,
      reason: "parsed_ok",
    };
  }
  if (looksLikeBirthdateInput(t)) {
    return {
      microIntent: "invalid_date",
      confidence: "high",
      safeToConsume: true,
      reason: "looks_like_date_failed_parse",
    };
  }
  if (isWaitingBirthdatePackageOrPaymentWords(t)) {
    const payish = /จ่าย|โอน|ชำระ|qr|คิวอาร์|แพ็ก|บาท|49|สแกน/i.test(t);
    return {
      microIntent: payish ? "paymentish_text" : "packageish_text",
      confidence: "medium",
      safeToConsume: true,
      reason: "package_or_pay_words",
    };
  }
  if (isGenericAckText(t)) {
    return {
      microIntent: "ack",
      confidence: "high",
      safeToConsume: true,
      reason: "generic_ack",
    };
  }
  if (isUnclearNoiseText(t)) {
    return {
      microIntent: "noise",
      confidence: "medium",
      safeToConsume: true,
      reason: "unclear_noise",
    };
  }
  return {
    microIntent: "noise",
    confidence: "low",
    safeToConsume: true,
    reason: "default_same_state",
  };
}
