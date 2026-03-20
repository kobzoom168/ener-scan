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
  const used = Number(usedScans || 0);
  const limit = Number(freeLimit || 3);

  return [
    "🔍 Ener Scan",
    "",
    `คุณใช้สิทธิ์สแกนฟรีครบ ${limit} ครั้งแล้ว (ใช้ไป ${used} ครั้ง)`,
    "หากต้องการสแกนต่อ สามารถปลดล็อกการใช้งาน Ener Scan ได้ 24 ชั่วโมง",
    "ภายใน 24 ชั่วโมงนี้ คุณสแกนได้ไม่จำกัดจำนวนครั้ง ด้วยแพ็กเกจ 99 บาท",
    "",
    "พิมพ์: payment",
    "เพื่อดูวิธีชำระเงินและรหัสอ้างอิงครับ",
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
  const ref = paymentId ? String(paymentId).trim() : null;
  const amountNum = amount != null ? Number(amount) : null;
  const hasAmount = amountNum !== null && !Number.isNaN(amountNum) && amountNum > 0;
  const amountLine =
    hasAmount && currency
      ? `จำนวน ${amountNum} ${String(currency).trim()}`
      : "จำนวนตามที่แอดมินแจ้ง";

  const refLine = ref ? `   รหัสอ้างอิง: ${ref}` : "";
  const amountLineOnly =
    hasAmount && currency ? `   ${amountLine}` : ref ? "   จำนวนตามที่แอดมินแจ้ง" : "";

  const lines = [
    "💳 วิธีชำระเงินเพื่อปลดล็อก Ener Scan",
    "",
    "ปลดล็อกการใช้งาน Ener Scan ได้ 24 ชั่วโมงหลังชำระเงิน",
    "ภายใน 24 ชั่วโมงนี้ คุณสามารถสแกนได้ไม่จำกัดจำนวนครั้ง",
    "",
    "ขั้นตอน",
    "1) โอนเงินตามช่องทางที่แอดมินแจ้ง",
    refLine,
    amountLineOnly,
    "2) ส่งสลิป/หลักฐานการโอน พร้อมรหัสอ้างอิงนี้ให้แอดมิน",
    "3) รอแอดมินยืนยัน แล้วกลับมาสแกนได้ไม่จำกัดภายใน 24 ชั่วโมง",
  ].filter(Boolean);

  return lines.join("\n");
}

/** MVP: user hit payment gate on scan image — ask for QR payment + slip photo. */
export function buildManualPaymentRequestText() {
  return [
    "💳 ต้องชำระเงินก่อนจึงจะสแกนต่อได้ครับ",
    "",
    "ขั้นตอน (แบบง่าย)",
    "1) สแกน QR PromptPay / โอนเงินตามที่แจ้ง",
    "2) ส่งภาพสลิปโอนเงินมาในแชทนี้ (ส่งเป็นรูป 1 รูป)",
    "",
    "หมายเหตุ: ระบบยังไม่อ่าน OCR จากสลิป — การส่งรูปสลิปถือเป็นหลักฐานเบื้องต้นเท่านั้น",
    "",
    "หลังส่งสลิปแล้ว ระบบจะปลดล็อกให้สแกนต่อชั่วคราว",
    "จากนั้นกรุณาส่งรูปวัตถุที่ต้องการสแกนอีกครั้งครับ",
    "",
    "พิมพ์ payment เพื่อดูข้อความชำระเงินแบบเต็มได้ครับ",
  ].join("\n");
}

/** MVP: slip image accepted, in-memory unlock applied. */
export function buildSlipReceivedText() {
  return [
    "✅ รับสลิปแล้วครับ",
    "",
    "ปลดล็อกให้สแกนต่อได้แล้ว (ชั่วคราว 24 ชั่วโมง ตามการตั้งค่า MVP)",
    "กรุณาส่งรูปวัตถุที่ต้องการสแกนอีกครั้ง (1 ชิ้น / 1 รูป) ได้เลยครับ",
  ].join("\n");
}

/** User typed text while waiting for slip. */
export function buildAwaitingSlipReminderText() {
  return [
    "⏳ กำลังรอรูปสลิปโอนเงินครับ",
    "",
    "กรุณาส่งภาพสลิปเป็นรูป 1 รูปในแชทนี้",
    "",
    "พิมพ์ payment หากต้องการดูวิธีชำระเงินอีกครั้ง",
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