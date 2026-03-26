import {
  parseBirthdateInput,
  looksLikeBirthdateInput,
} from "../../../utils/birthdateParse.util.js";
import {
  isGenericAckText,
  isUnclearNoiseText,
  isWaitingBirthdatePackageOrPaymentWords,
} from "../../../utils/stateMicroIntent.util.js";
import { isBirthdateChangeCandidateText } from "../../../utils/birthdateChangeFlow.util.js";
import { isBirthdateFlowConfirmYes } from "../../../utils/birthdateChangeFlow.util.js";

/**
 * Narrow “no” for birthdate echo / same-state (not full birthdate-change-flow negatives).
 * @param {string} t
 */
function isWaitingBirthdateEchoDenial(t) {
  const s = String(t || "").trim();
  if (!s || s.length > 48) return false;
  if (/^(ไม่ใช่|ผิด|ไม่ถูก)(\s*(ครับ|ค่ะ|คะ|นะครับ|นะคะ))?$/u.test(s)) return true;
  const lt = s.toLowerCase();
  return lt === "no";
}

/**
 * Affirmative confirmation (polite variants) — excludes standalone polite-only particles.
 * @param {string} text
 */
function isWaitingBirthdateConfirmYes(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/^(ครับ|ค่ะ|คะ|นะครับ|นะคะ)$/u.test(t)) return false;
  return isBirthdateFlowConfirmYes(text);
}

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

  if (/^\d{6,7}$/.test(t)) {
    return {
      microIntent: "invalid_date",
      confidence: "high",
      safeToConsume: true,
      reason: "ambiguous_compact",
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

  if (isBirthdateChangeCandidateText(t)) {
    return {
      microIntent: "change_birthdate",
      confidence: "high",
      safeToConsume: true,
      reason: "birthdate_change_phrase",
    };
  }

  if (isWaitingBirthdateEchoDenial(t)) {
    return {
      microIntent: "confirm_no",
      confidence: "medium",
      safeToConsume: true,
      reason: "echo_denial",
    };
  }

  if (isWaitingBirthdateConfirmYes(t)) {
    return {
      microIntent: "confirm_yes",
      confidence: "high",
      safeToConsume: true,
      reason: "echo_confirm_yes",
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
      microIntent: "unclear_noise",
      confidence: "medium",
      safeToConsume: true,
      reason: "unclear_noise",
    };
  }

  return {
    microIntent: "unrelated_noise",
    confidence: "low",
    safeToConsume: true,
    reason: "default_same_state",
  };
}
