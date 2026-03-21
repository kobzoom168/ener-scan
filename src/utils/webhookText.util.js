import { getPromptPayQrPublicUrl } from "./promptpayQrPublicUrl.util.js";

function normalizeBirthdateText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.]/g, "/")
    .replace(/-/g, "/");
}

function isLeapYear(year) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function getDaysInMonth(month, year) {
  const monthDays = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return monthDays[month - 1] || 0;
}

export function isValidBirthdate(text) {
  const normalized = normalizeBirthdateText(text);
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) return false;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return false;
  }

  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;

  const maxDay = getDaysInMonth(month, year);
  if (day < 1 || day > maxDay) return false;

  return true;
}

export function normalizeBirthdateForScan(text) {
  const normalized = normalizeBirthdateText(text);
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) return normalized;

  const day = String(Number(match[1])).padStart(2, "0");
  const month = String(Number(match[2])).padStart(2, "0");
  const year = match[3];

  return `${day}/${month}/${year}`;
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

export function buildStartInstructionText() {
  return [
    "ได้รับภาพที่ผ่านเงื่อนไขแล้วครับ ✨",
    "",
    "รบกวนพิมพ์วันเกิดของเจ้าของวัตถุ เช่น",
    "14/09/1995",
  ].join("\n");
}

export function buildMultiImageInRequestText() {
  return [
    "🔍 Ener Scan",
    "",
    "ระบบพบว่าคุณส่งมาหลายรูปพร้อมกัน",
    "กรุณาส่งเพียง 1 รูปต่อ 1 ครั้ง",
    "",
    "หากมีหลายชิ้น กรุณาแยกส่งทีละรูปแล้วค่อยสแกนใหม่ครับ",
  ].join("\n");
}

export function buildMultipleObjectsText() {
  return [
    "🔍 Ener Scan",
    "",
    "ระบบพบว่าวัตถุในภาพมีมากกว่า 1 ชิ้น",
    "กรุณาถ่ายวัตถุเพียง 1 ชิ้นต่อ 1 รูป",
    "",
    "แล้วส่งมาใหม่อีกครั้งครับ",
  ].join("\n");
}

export function buildUnclearImageText() {
  return [
    "ภาพยังไม่ชัดเจนพอสำหรับการวิเคราะห์",
    "ลองถ่ายใหม่ให้เห็นวัตถุชัด ๆ",
    "และให้มีเพียง 1 ชิ้นต่อ 1 รูปครับ",
  ].join("\n");
}

export function buildUnsupportedObjectText() {
  return [
    "Ener Scan ยังไม่รองรับภาพประเภทนี้ครับ",
    "",
    "ระบบรองรับเฉพาะ",
    "• พระเครื่อง",
    "• เครื่องราง",
    "• คริสตัล / หิน",
    "• วัตถุสายพลังแบบชิ้นเดี่ยว",
    "",
    "กรุณาส่งภาพใหม่ที่ตรงประเภทอีกครั้งครับ",
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
    "ระบบมีการใช้งานต่อเนื่อง",
    retryAfterSec > 0
      ? `กรุณารออีก ${retryAfterSec} วินาทีก่อนสแกนใหม่`
      : "กรุณารอสักครู่ก่อนสแกนใหม่",
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

export function buildPaymentRequiredText({ usedScans = 0, freeLimit = 3 } = {}) {
  const qrUrl = getPromptPayQrPublicUrl();
  return [
    "🔍 Ener Scan",
    "",
    "คุณใช้สิทธิ์ทดลองครบแล้ว",
    "",
    "✨ แพ็กเกจแนะนำ: โอน 99 บาท → ส่งสลิป → รอแอดมินตรวจ → หลังอนุมัติจึงได้สิทธิ์สแกน 15 ครั้งภายใน 24 ชม.",
    `🔗 QR เพื่อโอน: ${qrUrl}`,
    "ขั้นตอน: โอนตามยอด → ส่งสลิป 1 รูปในแชทนี้ → รอแอดมินตรวจและอนุมัติ",
    "",
    "พิมพ์: payment (ดูวิธีชำระเงิน / QR อีกครั้ง)",
  ].join("\n");
}

export function buildNoHistoryText() {
  return "ยังไม่มีประวัติการสแกนครับ";
}

export function buildNoStatsText() {
  return "ยังไม่มีสถิติการสแกนครับ";
}

export function buildIdleText() {
  return "ส่งรูปวัตถุมาได้เลยครับ\nกรุณาถ่ายวัตถุ 1 ชิ้นต่อ 1 รูป";
}

export function buildInvalidBirthdateText() {
  return ["รูปแบบวันเกิดยังไม่ถูกครับ", "ลองพิมพ์แบบ", "14/09/1995"].join(
    "\n"
  );
}

export function buildSystemErrorText() {
  return "ขออภัยครับ ระบบขัดข้องชั่วคราว ลองส่งใหม่อีกครั้งได้เลยครับ";
}

export function isPaymentCommand(text, lowerText) {
  const t = String(text || "").trim();
  const lt = String(lowerText || t.toLowerCase()).trim();

  return lt === "payment" || t === "จ่ายเงิน" || t === "ปลดล็อก";
}

export function buildPaymentInstructionText({
  paymentId = null,
  amount = null,
  currency = "THB",
} = {}) {
  const qrUrl = getPromptPayQrPublicUrl();
  return [
    "💳 วิธีชำระเงิน (พร้อมเพย์ + สลิป)",
    "",
    "โอน 99 บาท แล้วส่งสลิป 1 รูปในแชทนี้ — แอดมินจะตรวจก่อนเปิดสิทธิ์",
    "หลังอนุมัติสลิปแล้ว จึงจะได้สิทธิ์สแกนตามแพ็กเกจ (เช่น 15 ครั้ง / 24 ชม.)",
    `🔗 QR: ${qrUrl}`,
  ].join("\n");
}

/** MVP: user hit payment gate on scan image — ask for QR payment + slip photo. */
export function buildManualPaymentRequestText() {
  const qrUrl = getPromptPayQrPublicUrl();
  return [
    "🔒 หมดสิทธิ์ทดลองแล้ว ต้องชำระเงินก่อนสแกนต่อ",
    "",
    "ขั้นตอน: โอน 99 บาท → ส่งสลิปในแชทนี้ → รอแอดมินตรวจ → อนุมัติแล้วจึงเปิดสิทธิ์",
    `🔗 QR: ${qrUrl}`,
    "",
    "พิมพ์: payment (ดูวิธีชำระเงิน / QR อีกครั้ง)",
  ].join("\n");
}

/** slip image accepted: now waiting for admin verification. */
export function buildSlipReceivedText() {
  return [
    "✅ ได้รับสลิปของคุณแล้วครับ",
    "",
    "สลิปอยู่ระหว่างให้แอดมินตรวจสอบ",
    "ไม่ต้องส่งสลิปซ้ำ — รอผลจากรายการนี้ได้เลย",
    "ระหว่างนี้ยังสแกนรูปวัตถุต่อไม่ได้ครับ",
    "เมื่อแอดมินอนุมัติแล้ว บอทจะแจ้งข้อความอัตโนมัติในแชทนี้",
  ].join("\n");
}

/** User typed non-command text while payment row is pending_verify (reduce repeat nudges). */
export function buildPendingVerifyReminderText() {
  return [
    "⏳ สลิปของคุณรอแอดมินตรวจอยู่ครับ",
    "",
    "ไม่ต้องส่งสลิปซ้ำหากส่งครบแล้ว",
    "ยังสแกนรูปวัตถุต่อไม่ได้ — รอผลการตรวจก่อน",
    "เมื่ออนุมัติแล้ว บอทจะแจ้งอัตโนมัติในแชทนี้",
  ].join("\n");
}

/** User sent another image while slip is already pending_verify (block scan / duplicate slip). */
export function buildPendingVerifyBlockScanText() {
  return [
    "📷 ระบบได้รับสลิปไปตรวจแล้วครับ",
    "",
    "อย่าส่งรูปสแกนวัตถุในตอนนี้ — รอแอดมินตรวจสลิปก่อน",
    "ไม่ต้องส่งสลิปซ้ำ",
    "เมื่ออนุมัติแล้ว บอทจะแจ้งอัตโนมัติ จากนั้นค่อยส่งรูปเพื่อสแกนต่อ",
  ].join("\n");
}

/** User typed payment / จ่ายเงิน / ปลดล็อก while already pending_verify. */
export function buildPendingVerifyPaymentCommandText() {
  return [
    "คุณมีสลิปรอแอดมินตรวจอยู่แล้วครับ",
    "",
    "ไม่ต้องพิมพ์ payment / จ่ายเงิน / ปลดล็อก ซ้ำในตอนนี้",
    "รอผลตรวจ — เมื่ออนุมัติหรือปฏิเสธ บอทจะแจ้งข้อความอัตโนมัติ",
  ].join("\n");
}

/**
 * LINE push after admin approved slip.
 * @param {{ paidRemainingLine?: string, paidUntilLine?: string }} [opts] Pre-formatted lines (e.g. quota + หมดอายุ).
 */
export function buildPaymentApprovedText({
  paidRemainingLine = "",
  paidUntilLine = "",
} = {}) {
  const lines = [
    "✅ แอดมินอนุมัติสลิปแล้ว ระบบเปิดสิทธิ์ให้แล้วครับ",
    "",
  ];
  if (paidRemainingLine) lines.push(paidRemainingLine);
  if (paidUntilLine) lines.push(paidUntilLine);
  if (paidRemainingLine || paidUntilLine) lines.push("");
  lines.push("กรุณาส่งรูปเพื่อสแกนต่อได้ครับ");
  return lines.join("\n");
}

/** LINE push after admin rejected slip. */
export function buildPaymentRejectedText() {
  return [
    "แอดมินปฏิเสธสลิปนี้ครับ — รายการชำระเงินเดิมจบแล้ว ระบบจะไม่ใช้สลิปนี้ต่อ",
    "",
    "กรุณาเริ่มขั้นตอนชำระเงินใหม่ด้วยตัวเอง:",
    "• สแกนรูปที่ต้องการสแกนอีกครั้ง (เมื่อบอทขอชำระเงิน) หรือ",
    "• พิมพ์ payment / จ่ายเงิน / ปลดล็อก เพื่อดู QR อีกครั้ง",
    "",
    "จากนั้นโอนตามยอดและส่งสลิปใหม่ในแชทนี้",
  ].join("\n");
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
export function buildAwaitingSlipReminderText() {
  return [
    "⏳ รอสลิปอยู่ครับ",
    "",
    "หลังโอนแล้ว กรุณาส่งสลิป 1 รูปในแชทนี้",
    "แอดมินจะตรวจก่อนเปิดสิทธิ์ — อนุมัติแล้วคุณจึงจะสแกนต่อได้",
  ].join("\n");
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