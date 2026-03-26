/**
 * Deterministic micro-intent labels for active interactive states (no LLM routing).
 */

import { listActivePackages } from "../services/scanOffer.packages.js";

/** @param {number} streak */
export function guidanceTierFromStreak(streak) {
  const n = Number(streak) || 0;
  if (n <= 1) return "full";
  if (n === 2) return "short";
  return "micro";
}

const PAY_INTENT_WORDS = new Set([
  "จ่าย",
  "จ่ายเงิน",
  "โอน",
  "พร้อมโอน",
  "ชำระ",
  "ปลดล็อก",
]);

const GENERIC_ACK = new Set([
  "โอเค",
  "ครับ",
  "ค่ะ",
  "ได้",
  "อืม",
  "ตกลง",
  "พร้อม",
  "ok",
  "okay",
  "เค",
  "ดี",
  "คับ",
  "รับทราบ",
]);

function normText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Short acknowledgement / light agreement (not pay intent, not status). */
export function isGenericAckText(text) {
  const t = normText(text);
  if (!t) return false;
  const lt = t.toLowerCase();
  if (GENERIC_ACK.has(t) || GENERIC_ACK.has(lt)) return true;
  if (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]$/u.test(t)) return true;
  return false;
}

/** @returns {boolean} */
export function isLoosePayIntentExact(text) {
  const t = normText(text);
  if (!t) return false;
  const lt = t.toLowerCase();
  if (lt === "payment") return true;
  return PAY_INTENT_WORDS.has(t);
}

/** Short junk / typo-like (stay in state; do not treat as commands). */
export function isUnclearNoiseText(text) {
  const t = normText(text);
  if (!t) return false;
  if (t.length > 12) return false;
  if (/[\u0e00-\u0e7f]{2,}/.test(t)) {
    if (t.length <= 2) return true;
  }
  if (/^[0-9]{2,4}$/.test(t)) return true;
  if (/^([ก-๙])\1{1,3}$/u.test(t)) return true;
  return false;
}

/** Single paid offer: pay intent is never "too early" vs package choice — still used for logging edge cases. */
export function isPayIntentTooEarlyInPaywall(text) {
  return isLoosePayIntentExact(text);
}

/** User defers to tomorrow / later — stay on paywall, no payment push. */
export function isWaitForTomorrowIntent(text) {
  const t = normText(text);
  if (!t) return false;
  return /พรุ่งนี้|มะรืน|รอก่อน|เดี๋ยวค่อย|ค่อยมา|ค่อยว่ากัน|ไม่สะดวกตอนนี้|ยังไม่พร้อม|ขอคิดก่อน/i.test(
    t,
  );
}

/**
 * @param {string} text
 * @param {import("../services/scanOffer.loader.js").NormalizedScanOffer} offer
 */
export function isSingleOfferPriceToken(text, offer) {
  const t = normText(text);
  if (!t) return false;
  const pkgs = listActivePackages(offer);
  const p = pkgs.length === 1 ? pkgs[0] : null;
  if (!p) return false;
  const priceStr = String(p.priceThb);
  if (t === priceStr) return true;
  if (t === `${priceStr} บาท`) return true;
  if (new RegExp(`^${priceStr}\\s*บาท$`, "i").test(t)) return true;
  return false;
}

const HESITATION_PACKAGE_SELECTED = new Set([
  "แพง",
  "แพงไป",
  "เดี๋ยวก่อน",
  "ขอคิดก่อน",
]);

export function isPackageSelectedHesitation(text) {
  const t = normText(text);
  return HESITATION_PACKAGE_SELECTED.has(t);
}

const PACKAGE_CHANGE_VERBS = /^(เปลี่ยน|เปลี่ยนแพ็ก|เปลี่ยนแพ็ค|เปลี่ยนแพ็กเกจ)/;

export function isPackageChangeIntentPhrase(text) {
  return PACKAGE_CHANGE_VERBS.test(normText(text));
}

/** Natural Thai phrases asking to change saved birthdate (deterministic; not LLM). */
export function isBirthdateChangeIntentPhrase(text) {
  const t = normText(text);
  if (!t) return false;
  if (t === "เปลี่ยนวันเกิด") return true;
  // Mid-sentence: "ขอแก้วันเกิดหน่อย", "อยากเปลี่ยนวันเกิดค่ะ"
  if (/แก้วันเกิด|เปลี่ยนวันเกิด/i.test(t)) return true;
  return /^(ขอ)?(เปลี่ยน|แก้|อัปเดต|อัพเดต)วันเกิด|วันเกิด(ไม่ถูก|ผิด|คลาด)|ขอแก้วันเกิด|แก้เดือนเกิด|ขอเปลี่ยนเดือนเกิด/i.test(
    t,
  );
}

/** awaiting_slip / resend QR */
export function isResendQrIntentText(text) {
  const t = normText(text);
  const lt = t.toLowerCase();
  if (!t) return false;
  if (/^คิวอาร์/.test(t)) return true;
  if (/^qr\b/i.test(lt)) return true;
  if (/ขอ\s*qr/i.test(lt)) return true;
  if (/ขอ\s*คิวอาร์/.test(t)) return true;
  if (/ส่งใหม่/.test(t)) return true;
  if (/ขออีกครั้ง/.test(t)) return true;
  return false;
}

export function isAwaitingSlipStatusLikeText(text) {
  const t = normText(text);
  if (!t) return false;
  if (isGenericAckText(t)) return false;
  return (
    /ยังไง|ยังไงบ้าง|ถึงไหน|ถึงไหนแล้ว|ตรวจ|อนุมัติ|สถานะ|คืบหน้า|pending|เมื่อไหร่|เมื่อไร|เช็ก|เช็ค|โอนแล้ว|เข้ายัง|ยังไม่เข้า/i.test(
      t,
    ) ||
    (/รอ/i.test(t) && t.length >= 4)
  );
}

export function isPendingVerifyStatusLikeText(text) {
  const t = normText(text);
  if (!t) return false;
  if (isGenericAckText(t)) return false;
  return (
    /สถานะ|คืบหน้า|ตรวจ|อนุมัติ|pending|ยังไง|ถึงไหน|เมื่อไหร่|เมื่อไร|เช็ก|เช็ค|ยังไม่เข้า|ยังไม่อนุมัติ|ยังไม่ผ่าน|โอนแล้วทำไม|ทำไมยังไม่|เรียบร้อยยัง/i.test(
      t,
    ) ||
    (/รอ/i.test(t) && t.length >= 4)
  );
}

export function isWaitingBirthdatePackageOrPaymentWords(text) {
  const t = normText(text);
  if (!t) return false;
  if (isLoosePayIntentExact(t)) return true;
  if (/แพ็ก|แพ็ค|แพ็กเกจ|package|บาท|49|ชำระ|โอน|จ่าย|คิวอาร์|qr/i.test(t)) {
    return true;
  }
  return false;
}
