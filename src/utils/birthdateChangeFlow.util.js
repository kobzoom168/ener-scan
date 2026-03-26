/**
 * Deterministic birthdate-change subflow: soft-detect → confirm intent → date → confirm save.
 * Routing stays in lineWebhook; this module holds labels + detectors only.
 */

import { isBirthdateChangeIntentPhrase } from "./stateMicroIntent.util.js";

function normText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

/** @typedef {'birthdate_change_candidate' | 'waiting_birthdate_change' | 'waiting_birthdate_change_confirm'} BirthdateChangeFlowState */

export const BIRTHDATE_CHANGE_FLOW = {
  CANDIDATE: "birthdate_change_candidate",
  WAITING_DATE: "waiting_birthdate_change",
  WAITING_FINAL_CONFIRM: "waiting_birthdate_change_confirm",
};

const FIRST_CONFIRM_QUESTIONS = [
  "ต้องการเปลี่ยนวันเกิดที่ใช้ในระบบใช่ไหมครับ",
  "ถ้าจะเปลี่ยนวันเกิด เดี๋ยวผมอัปเดตให้ได้ครับ ใช่ไหมครับ",
];

const ASK_DATE_LINES = [
  "ส่งวันเกิดมาได้เลยครับ เช่น 19/08/1985 หรือ 19/08/2528",
  "พิมพ์วันเกิดมาในแชตนี้ได้เลยครับ รองรับทั้ง ค.ศ. และ พ.ศ. เช่น 19-8-1985 หรือ 19-8-2528",
];

const CONFIRM_YES = new Set([
  "ใช่",
  "ใช้",
  "ครับ",
  "ค่ะ",
  "โอเค",
  "เปลี่ยนเลย",
  "ok",
  "okay",
]);

const CONFIRM_NO = new Set([
  "ไม่",
  "ยัง",
  "ยังไม่",
  "ยกเลิก",
  "ไม่เอา",
  "ไม่เปลี่ยน",
]);

/** User confirmed they want to change birthdate (first or final step). */
export function isBirthdateFlowConfirmYes(text) {
  const t = normText(text);
  if (!t) return false;
  const lt = t.toLowerCase();
  if (CONFIRM_YES.has(t) || CONFIRM_YES.has(lt)) return true;
  return false;
}

export function isBirthdateFlowConfirmNo(text) {
  const t = normText(text);
  if (!t) return false;
  if (CONFIRM_NO.has(t)) return true;
  if (/^ยังไม่/i.test(t)) return true;
  return false;
}

/**
 * Soft-detect: natural Thai about birth / wrong date / change — not exact command only.
 * Excludes pure date-like strings (handled by scan / paywall routing).
 */
export function isBirthdateChangeCandidateText(text) {
  const t = normText(text);
  if (!t) return false;
  if (isBirthdateChangeIntentPhrase(t)) return true;

  const shorts = new Set(["เกิด", "วันเกิด", "ปีเกิด"]);
  if (shorts.has(t)) return true;

  if (
    /(เปลี่ยน|แก้|ขอแก้|อัปเดต|อัพเดต|ใช้).{0,24}(วันเกิด|ปีเกิด)/i.test(t)
  ) {
    return true;
  }
  if (/(วันเกิด|ปีเกิด).{0,24}(ใหม่|ผิด|ไม่ถูก|เปลี่ยน|แก้)/i.test(t)) {
    return true;
  }
  if (
    /(ใช้วันเกิดใหม่|แก้ปีเกิด|วันเกิดไม่ถูก|ขอแก้วันเกิด|ขอเปลี่ยนวันเกิด)/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/(แก้|เปลี่ยน).{0,8}(ปีเกิด|วันเกิด)/i.test(t)) return true;
  if (/ปีเกิด.{0,12}(ผิด|แก้)/i.test(t)) return true;

  return false;
}

export function pickBirthdateFirstConfirmQuestion(userId = "") {
  const s = String(userId || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return FIRST_CONFIRM_QUESTIONS[h % FIRST_CONFIRM_QUESTIONS.length];
}

export function pickBirthdateAskDateLine(userId = "") {
  const s = String(userId || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33 + s.charCodeAt(i)) >>> 0;
  }
  return ASK_DATE_LINES[h % ASK_DATE_LINES.length];
}

const FINAL_CONFIRM_BODIES = [
  (echo) =>
    `ขอทวนอีกครั้งนะครับ ใช้วันเกิด ${echo} ใช่ไหมครับ\n\nถ้าถูก พิมพ์ ใช่ ได้เลยครับ`,
  (echo) =>
    `เดี๋ยวผมใช้วันเกิด ${echo} นะครับ ถ้าถูก พิมพ์ ใช่ ได้เลยครับ`,
];

/**
 * Last step before saveBirthdate: deterministic copy that echoes `echo` (user’s CE/BE style preserved).
 */
export function pickBirthdateFinalConfirmText(userId = "", echo = "") {
  const e = String(echo || "").trim();
  const s = String(userId || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 41 + s.charCodeAt(i)) >>> 0;
  }
  return FINAL_CONFIRM_BODIES[h % FINAL_CONFIRM_BODIES.length](e);
}

export const BIRTHDATE_CHANGE_INVALID_FORMAT_TEXT =
  "วันเกิดรูปแบบนี้ยังไม่ถูกครับ ลองส่งใหม่เป็นแบบ 19/08/1985 หรือ 19/08/2528 ได้เลยครับ";

/**
 * Echo string for user-visible confirmations — preserves input style (slashes vs dashes, CE vs BE year).
 * @param {{ ok: true, originalInput: string }} parsed
 */
export function buildBirthdateEchoForUser(parsed) {
  if (!parsed?.ok) return "";
  return String(parsed.originalInput || "").trim();
}
