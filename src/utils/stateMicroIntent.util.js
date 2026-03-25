/**
 * Deterministic micro-intent labels for active interactive states (no LLM routing).
 */

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
  "ok",
  "okay",
]);

function normText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

/** @returns {boolean} */
export function isLoosePayIntentExact(text) {
  const t = normText(text);
  if (!t) return false;
  const lt = t.toLowerCase();
  if (lt === "payment") return true;
  return PAY_INTENT_WORDS.has(t);
}

export function isGenericAckText(text) {
  const t = normText(text);
  if (!t) return false;
  return GENERIC_ACK.has(t) || GENERIC_ACK.has(t.toLowerCase());
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

export function isPayIntentTooEarlyInPaywall(text) {
  return isLoosePayIntentExact(text);
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
  return (
    /ยังไง|ยังไงบ้าง|ถึงไหน|ถึงไหนแล้ว|ตรวจ|อนุมัติ|สถานะ|คืบหน้า|รอ|pending|เมื่อไหร่|เมื่อไร/i.test(
      t,
    )
  );
}

export function isPendingVerifyStatusLikeText(text) {
  const t = normText(text);
  if (!t) return false;
  return (
    /สถานะ|คืบหน้า|รอ|ตรวจ|อนุมัติ|pending|ยังไง|ถึงไหน|เมื่อไหร่|เมื่อไร/i.test(
      t,
    )
  );
}

export function isWaitingBirthdatePackageOrPaymentWords(text) {
  const t = normText(text);
  if (!t) return false;
  if (isLoosePayIntentExact(t)) return true;
  if (/แพ็ก|แพ็ค|แพ็กเกจ|package|บาท|49|99|ชำระ|โอน|จ่าย|คิวอาร์|qr/i.test(t)) {
    return true;
  }
  return false;
}
