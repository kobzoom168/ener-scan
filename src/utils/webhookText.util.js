import { parseBirthdateInput, looksLikeBirthdateInput } from "./birthdateParse.util.js";
import {
  waitingBirthdateInitial,
  waitingBirthdateGuidance,
  waitingBirthdateInitialMessages,
  waitingBirthdateGuidanceMessages,
  waitingBirthdateInvalidFormat,
  waitingBirthdateImageReminder,
  waitingBirthdateImageReminderMessages,
  birthdateErrorMessages,
  paywallText,
  awaitingSlipReminderText,
  pendingVerifyReminderText,
  pendingVerifyBlockScanText,
  pendingVerifyPaymentAgainText,
  approvedIntroLine,
} from "./replyCopy.util.js";

/** Backward-compatible alias for `looksLikeBirthdateInput`. */
export { looksLikeBirthdateInput as isBirthdateLikeInput };

/** @deprecated use `isLeapYear` from `birthdateParse.util.js` */
export { isLeapYear, daysInMonth } from "./birthdateParse.util.js";

export function isValidBirthdate(text) {
  return parseBirthdateInput(text).ok === true;
}

/**
 * Normalizes a valid birthdate to DD/MM/YYYY (CE). If parsing fails, returns trimmed input (legacy behavior).
 */
export function normalizeBirthdateForScan(text) {
  const parsed = parseBirthdateInput(text);
  if (parsed.ok) return parsed.normalizedDisplay;
  return String(text || "").trim();
}

export function toBase64(buffer) {
  return buffer.toString("base64");
}

export function formatBangkokDateTime(time) {
  return new Date(time).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Thai-friendly date + time in Asia/Bangkok (พ.ศ.), e.g. 23/03/2569 15:45 น.
 * ISO strings from DB are parsed as UTC instant then displayed in local TZ.
 */
export function formatThaiPaidUntilForLine(isoOrDate) {
  const d =
    isoOrDate instanceof Date
      ? isoOrDate
      : new Date(String(isoOrDate || ""));
  if (!Number.isFinite(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("day").padStart(2, "0");
  const month = get("month").padStart(2, "0");
  const year = get("year");
  const hour = get("hour").padStart(2, "0");
  const minute = get("minute").padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute} น.`;
}

export function formatHistory(history) {
  return history
    .slice(0, 5)
    .map((h, i) => {
      const formatted = formatBangkokDateTime(h.time);

      const mainEnergy =
        h.mainEnergy && h.mainEnergy !== "-" ? ` | ${h.mainEnergy}` : "";

      const score =
        h.energyScore && h.energyScore !== "-"
          ? ` | ${h.energyScore}/10`
          : "";

      return `${i + 1}. ${formatted}${mainEnergy}${score}`;
    })
    .join("\n");
}

/** @param {string} userId LINE user id (pattern-based copy). */
export async function buildStartInstructionText(userId) {
  return waitingBirthdateInitial(userId);
}

/** 1–3 short messages; last includes birthdate example (for reply + push sequence). */
export async function buildStartInstructionMessages(userId) {
  return waitingBirthdateInitialMessages(userId);
}

/** 1–3 short messages; last includes birthdate example. */
export async function buildWaitingBirthdateGuidanceMessages(userId) {
  return waitingBirthdateGuidanceMessages(userId);
}

export function buildMultiImageInRequestText() {
  return [
    "🔍 Ener Scan",
    "",
    "ตอนนี้ส่งมาหลายรูปพร้อมกันนะ",
    "ขอทีละรูปพอ — 1 รูปต่อครั้ง",
    "",
    "ถ้ามีหลายชิ้น แยกส่งมาได้เลยครับ",
  ].join("\n");
}

export function buildMultipleObjectsText() {
  return [
    "🔍 Ener Scan",
    "",
    "ในภาพมีมากกว่า 1 ชิ้นนะ",
    "ขอถ่ายวัตถุชิ้นเดียวต่อรูป",
    "",
    "แล้วส่งมาใหม่อีกครั้งครับ",
  ].join("\n");
}

export function buildUnclearImageText() {
  return [
    "ภาพยังไม่ค่อยชัดนะ",
    "ลองถ่ายใหม่ให้เห็นวัตถุชัด ๆ",
    "ทีละชิ้นต่อรูปครับ",
  ].join("\n");
}

export function buildUnsupportedObjectText() {
  return [
    "ประเภทนี้ผมยังไม่รับนะครับ",
    "",
    "พอรับได้ตอนนี้ เช่น",
    "• พระเครื่อง",
    "• เครื่องราง",
    "• คริสตัล / หิน",
    "• วัตถุสายพลังแบบชิ้นเดียว",
    "",
    "ลองส่งภาพใหม่ที่ตรงแบบนี้ได้เลยครับ",
  ].join("\n");
}

export function buildDuplicateImageText() {
  return [
    "🔍 Ener Scan",
    "",
    "ระบบพบว่ารูปนี้เคยถูกสแกนแล้ว",
    "กรุณาส่งภาพใหม่ของวัตถุครับ",
  ].join("\n");
}

export function buildRateLimitText(retryAfterSec = 0) {
  return [
    "🔍 Ener Scan",
    "",
    "ใช้งานถี่ไปนิดนึง",
    retryAfterSec > 0
      ? `ขอรออีก ${retryAfterSec} วินาที แล้วค่อยสแกนใหม่ครับ`
      : "ขอรอสักครู่ แล้วค่อยสแกนใหม่ครับ",
  ].join("\n");
}

export function buildCooldownText(remainingSec = 0) {
  return [
    "🔍 Ener Scan",
    "",
    remainingSec > 0
      ? `กรุณารออีก ${remainingSec} วินาทีก่อนสแกนใหม่`
      : "กรุณารอสักครู่ก่อนสแกนใหม่",
    "เพื่อให้ระบบอ่านพลังได้เสถียรมากขึ้นครับ",
  ].join("\n");
}

/** บรรทัดเดียวสำหรับอ้างอิงรายการชำระเงิน (แชร์กับแอดมินได้) */
export function formatPaymentRefLine(paymentRef) {
  const r = String(paymentRef || "").trim();
  if (!r) return "";
  return `รหัสรายการ: ${r}`;
}

function appendPaymentRefLine(bodyText, paymentRef) {
  const line = formatPaymentRefLine(paymentRef);
  if (!line) return String(bodyText || "").trim();
  return `${String(bodyText || "").trim()}\n\n${line}`;
}

/** ข้อความหลักสำหรับชำระเงิน (ไม่ใส่ URL — QR ส่งแยกเป็น image message) */
export function buildPaymentQrIntroText({ paymentRef } = {}) {
  const base = [
    "🔒 สิทธิ์สแกนฟรีของคุณครบแล้วครับ",
    "",
    "จะสแกนต่อได้แบบนี้",
    "แพ็กเกจนี้ราคา 99 บาท",
    "ใช้ได้ 10 ครั้ง (ภายใน 24 ชม. หลังอนุมัติ)",
    "",
    "ทำตามนี้ได้เลย",
    "1. สแกน QR ด้านล่าง",
    "2. โอนแล้วส่งสลิปในแชตนี้",
    "3. เดี๋ยวมีคนตรวจแล้วเปิดสิทธิ์ให้",
    "",
    "พออนุมัติแล้ว จะมีข้อความแจ้งในแชตนี้ให้ครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

export function buildPaymentQrSlipText() {
  return "โอนแล้วส่งสลิปในแชตนี้ได้เลยครับ";
}

/**
 * @param {{ usedScans?: number, freeLimit?: number, userId?: string }} opts
 * `userId` enables non-repetitive paywall wording; limits unchanged at gate.
 */
export async function buildPaymentRequiredText({
  usedScans = 0,
  freeLimit = 3,
  userId = null,
} = {}) {
  void usedScans;
  void freeLimit;
  if (userId) return paywallText(userId);
  return [
    "สิทธิ์สแกนฟรีของคุณครบแล้วครับ",
    "",
    "พิมพ์ payment เพื่อดู QR และวิธีชำระเงินได้เลยครับ",
  ].join("\n");
}

export function buildNoHistoryText() {
  return "ยังไม่มีประวัติการสแกนครับ";
}

export function buildNoStatsText() {
  return "ยังไม่มีสถิติการสแกนครับ";
}

export function buildIdleText() {
  return "ส่งรูปวัตถุมาได้เลยครับ\nถ่ายทีละชิ้นต่อรูปนะ";
}

export async function buildInvalidBirthdateText(userId) {
  return waitingBirthdateInvalidFormat(userId);
}

/** User is expected to type birthdate next (after image accepted). */
export async function buildWaitingBirthdateGuidanceText(userId) {
  return waitingBirthdateGuidance(userId);
}

/** Second image while still waiting for birthdate (do not start a new scan). */
export async function buildWaitingBirthdateImageReminderText(userId) {
  return waitingBirthdateImageReminder(userId);
}

/** 1–3 persona bubbles for second-image reminder. */
export async function buildWaitingBirthdateImageReminderMessages(userId) {
  return waitingBirthdateImageReminderMessages(userId);
}

/** Persona bubbles for birthdate validation errors (`invalid_format` | `invalid_date` | `out_of_range`). */
export async function buildBirthdateErrorMessages(userId, reason) {
  return birthdateErrorMessages(userId, reason);
}

export function isMainMenuAlias(text, lowerText) {
  const t = String(text || "").trim();
  const lt = String(lowerText || t.toLowerCase()).trim();
  const menuAliases = new Set([
    "เมนู",
    "เมนูหลัก",
    "menu",
    "help",
    "start",
    "เริ่ม",
    "วิธีใช้งาน",
    "วิธีใช้",
  ]);
  return menuAliases.has(t) || menuAliases.has(lt);
}

export function isScanIntentLikeText(text, lowerText) {
  const t = String(text || "").trim();
  const lt = String(lowerText || t.toLowerCase()).trim();
  if (lt === "สแกนพลังงาน") return true;
  return /สแกน|อ่านพลัง|ดูให้หน่อย|ดูพลัง|อ่านให้|scan/i.test(t);
}

/** Keywords that must not steal routing while waiting for birthdate. */
export function isBlockedIntentDuringWaitingBirthdate(text, lowerText) {
  return (
    isPaymentCommand(text, lowerText) ||
    isHistoryCommand(text, lowerText) ||
    isStatsCommand(text, lowerText) ||
    isMainMenuAlias(text, lowerText) ||
    isScanIntentLikeText(text, lowerText)
  );
}

/** Payment / slip in progress (text guard when not utility command). */
export function buildPaymentFlowLockedGuidanceText() {
  return [
    "ตอนนี้รายการนี้อยู่ระหว่างการชำระเงิน / ตรวจสอบสลิปครับ",
    "",
    "หากโอนแล้ว สามารถส่งสลิปในแชตนี้ได้เลย",
    "เราจะตรวจให้ก่อนเปิดสิทธิ์สแกนครับ",
  ].join("\n");
}

export function buildSystemErrorText() {
  return "ขออภัยครับ ติดขัดชั่วคราว ลองส่งใหม่อีกครั้งได้เลยครับ";
}

export function isPaymentCommand(text, lowerText) {
  const t = String(text || "").trim();
  const lt = String(lowerText || t.toLowerCase()).trim();

  return lt === "payment" || t === "จ่ายเงิน" || t === "ปลดล็อก";
}

const DEFAULT_PAYMENT_THB = 99;

function displayAmountThb(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PAYMENT_THB;
}

/** ข้อความยาวหลังคำสั่ง payment / จ่ายเงิน (ใช้คู่กับรูป QR แยกข้อความ) */
export function buildPaymentCommandIntroText({ amount = DEFAULT_PAYMENT_THB } = {}) {
  const thb = displayAmountThb(amount);
  return [
    "💳 วิธีชำระเงิน (พร้อมเพย์ + สลิป)",
    "",
    `โอน ${thb} บาท แล้วส่งสลิป 1 รูปในแชทนี้ — แอดมินตรวจก่อนเปิดสิทธิ์`,
    "พออนุมัติแล้ว จะได้สิทธิ์สแกนตามแพ็กเกจ (เช่น 10 ครั้ง / 24 ชม.)",
  ].join("\n");
}

/** ข้อความสั้นหลังรูป QR — ให้ส่งสลิปกลับมา */
export function buildPaymentSlipFollowUpText() {
  return "📎 โอนแล้วส่งรูปสลิปในแชทนี้ เดี๋ยวแอดมินตรวจให้ครับ";
}

/** ข้อความเดียว (fallback เมื่อส่งรูป QR ไม่ได้ / LINE error) — ไม่ใส่ลิงก์ QR */
export function buildPaymentInstructionText({
  paymentId = null,
  amount = null,
  currency = "THB",
  paymentRef = null,
} = {}) {
  const thb = displayAmountThb(amount);
  return [
    buildPaymentQrIntroText({ paymentRef }).replace(
      "แพ็กเกจนี้ราคา 99 บาท",
      `แพ็กเกจนี้ราคา ${thb} บาท`,
    ),
    "",
    "⚠️ ตอนนี้ยังโหลดรูป QR ในแชตไม่ได้ชั่วคราว — ลองพิมพ์ payment อีกครั้งภายหลัง หรือติดต่อเราได้ครับ",
  ].join("\n");
}

/** @deprecated Prefer replyPaymentInstructions + image; kept for rare text-only fallback */
export function buildManualPaymentRequestText({ paymentRef } = {}) {
  return [
    buildPaymentQrIntroText({ paymentRef }),
    "",
    "พิมพ์: payment เพื่อดู QR และวิธีชำระเงินอีกครั้ง",
  ].join("\n");
}

/** slip image accepted: now waiting for admin verification. */
export function buildSlipReceivedText({ paymentRef } = {}) {
  const base = [
    "✅ รับสลิปแล้วครับ",
    "",
    "กำลังรอตรวจสอบ",
    "ยังไม่ต้องส่งซ้ำนะ",
    "",
    "ตอนนี้ยังสแกนต่อไม่ได้",
    "พออนุมัติแล้ว เดี๋ยวแจ้งในแชตนี้ให้ครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

/** User typed non-command text while payment row is pending_verify (reduce repeat nudges). */
export function buildPendingVerifyReminderText({ paymentRef } = {}) {
  const base = buildPaymentFlowLockedGuidanceText();
  return appendPaymentRefLine(base, paymentRef);
}

/** User sent another image while slip is already pending_verify (block scan / duplicate slip). */
export function buildPendingVerifyBlockScanText({ paymentRef } = {}) {
  const base = [
    "รับสลิปแล้วครับ",
    "กำลังรอตรวจอยู่",
    "",
    "ตอนนี้ยังสแกนต่อไม่ได้",
    "พออนุมัติแล้ว เดี๋ยวแจ้งในแชตนี้ให้ครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

/** User typed payment / จ่ายเงิน / ปลดล็อก while already pending_verify. */
export function buildPendingVerifyPaymentCommandText({ paymentRef } = {}) {
  const base = [
    "ตอนนี้มีสลิปรอตรวจอยู่แล้วครับ",
    "",
    "ไม่ต้องพิมพ์ payment ซ้ำในตอนนี้",
    "รอผลตรวจก่อนนะ — อนุมัติหรือปฏิเสธ เดี๋ยวแจ้งในแชตนี้ให้ครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

/**
 * LINE push after admin approved slip.
 * Prefer `paidRemainingScans` + `paidUntil` (ISO) from entitlement — no hardcoded scan counts.
 * Legacy: `paidRemainingLine` + `paidUntilLine` still supported if numeric fields absent.
 *
 * @param {{
 *   paidRemainingScans?: number | null,
 *   paidUntil?: string | null,
 *   paidRemainingLine?: string,
 *   paidUntilLine?: string,
 *   paymentRef?: string | null,
 * }} [opts]
 */
export async function buildPaymentApprovedText({
  paidRemainingScans = null,
  paidUntil = null,
  paidRemainingLine = "",
  paidUntilLine = "",
  paymentRef = null,
  lineUserId = null,
} = {}) {
  const scansNum =
    paidRemainingScans != null && paidRemainingScans !== ""
      ? Number(paidRemainingScans)
      : NaN;
  const hasScans = Number.isFinite(scansNum);
  const untilRaw = String(paidUntil || "").trim();

  let scanLine;
  let untilLine;

  if (hasScans) {
    if (scansNum >= 999999) {
      scanLine =
        "สแกนได้ไม่จำกัดจำนวนครั้ง (ในช่วงที่สิทธิ์ยังใช้ได้)";
    } else {
      scanLine = `สแกนได้อีก ${scansNum} ครั้ง`;
    }
    untilLine = `ใช้ได้ถึง: ${
      untilRaw ? formatThaiPaidUntilForLine(untilRaw) : "—"
    }`;
  } else {
    const pr = String(paidRemainingLine || "").trim();
    const expiryFromLine = String(paidUntilLine || "")
      .replace(/^\s*หมดอายุ:\s*/i, "")
      .replace(/^\s*ใช้ได้ถึง:\s*/i, "")
      .trim();

    if (pr.includes("ไม่จำกัด")) {
      scanLine =
        "สแกนได้ไม่จำกัดจำนวนครั้ง (ในช่วงที่สิทธิ์ยังใช้ได้)";
    } else {
      const m = pr.match(/สแกนได้อีก\s+(\d+)\s+ครั้ง/);
      scanLine = m
        ? `สแกนได้อีก ${m[1]} ครั้ง`
        : pr || "สแกนได้ตามสิทธิ์ที่เปิดให้";
    }
    untilLine = `ใช้ได้ถึง: ${expiryFromLine || "—"}`;
  }

  const lines = [
    lineUserId
      ? await approvedIntroLine(lineUserId)
      : "แอดมินอนุมัติสลิปแล้ว ระบบเปิดสิทธิ์ให้แล้วครับ",
  ];
  const refLine = formatPaymentRefLine(paymentRef);
  if (refLine) lines.push("", refLine);
  lines.push(
    "",
    scanLine,
    untilLine,
    "",
    "ส่งรูปมาสแกนต่อได้เลยครับ",
  );
  return lines.join("\n");
}

/**
 * LINE push after admin rejected slip.
 * @param {{ reason?: string | null }} [opts] Optional short reason from admin (stored in DB).
 */
export function buildPaymentRejectedText({ reason = null } = {}) {
  const r = String(reason ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 400);
  const lines = [
    "แอดมินปฏิเสธสลิปนี้ครับ — รายการชำระเงินเดิมจบแล้ว ระบบจะไม่ใช้สลิปนี้ต่อ",
    "",
  ];
  if (r) {
    lines.push("รายละเอียดจากแอดมิน:", `• ${r}`, "");
  }
  lines.push(
    "เริ่มขั้นตอนชำระใหม่ได้แบบนี้",
    "• ส่งรูปสแกนอีกครั้ง (ตอนที่บอทขอชำระ) หรือ",
    "• พิมพ์ payment / จ่ายเงิน / ปลดล็อก เพื่อดู QR อีกครั้ง",
    "",
    "แล้วโอนตามยอด ส่งสลิปใหม่ในแชทนี้ได้เลย"
  );
  return lines.join("\n");
}

/** Commands that may still run while slip is pending_verify (menu, history, etc.). */
export function allowsUtilityCommandsDuringPendingVerify(text, lowerText) {
  const t = String(text || "").trim();
  const lt = String(lowerText || t.toLowerCase()).trim();

  if (isHistoryCommand(t, lt) || isStatsCommand(t, lt)) return true;
  if (t === "เปลี่ยนวันเกิด" || t === "สแกนพลังงาน") return true;
  if (t === "วิธีใช้" || t === "วิธีใช้งาน") return true;

  const menu = new Set([
    "เมนู",
    "เมนูหลัก",
    "menu",
    "help",
    "start",
    "เริ่ม",
    "วิธีใช้งาน",
    "วิธีใช้",
  ]);
  return menu.has(t) || menu.has(lt);
}

/** User typed text while waiting for slip. */
export async function buildAwaitingSlipReminderText({ userId, paymentRef } = {}) {
  if (!userId) {
    const base = [
      "รอสลิปอยู่ครับ",
      "",
      "โอนแล้วส่งสลิป 1 รูปในแชตนี้ได้เลย",
      "ตรวจก่อนแล้วค่อยเปิดสิทธิ์ — พออนุมัติแล้วค่อยสแกนต่อได้ครับ",
    ].join("\n");
    return appendPaymentRefLine(base, paymentRef);
  }
  return awaitingSlipReminderText(userId, paymentRef);
}

export function isHistoryCommand(text, lowerText) {
  return lowerText === "history" || text === "ประวัติ";
}

export function isStatsCommand(text, lowerText) {
  return lowerText === "stats" || text === "สถิติ";
}

export function groupImageEventCountByUser(events = []) {
  const map = new Map();

  for (const event of events) {
    if (event?.type !== "message") continue;
    if (event?.message?.type !== "image") continue;

    const userId = event?.source?.userId;
    if (!userId) continue;

    map.set(userId, (map.get(userId) || 0) + 1);
  }

  return map;
}