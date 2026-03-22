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
    "หากต้องการสแกนต่อ",
    "แพ็กเกจนี้ราคา 99 บาท",
    "ใช้งานได้ 10 ครั้ง (ภายใน 24 ชม. หลังอนุมัติ)",
    "",
    "วิธีชำระ:",
    "1. สแกน QR ที่ส่งด้านล่าง",
    "2. โอนแล้วส่งสลิปในแชตนี้",
    "3. เดี๋ยวเราตรวจสอบและเปิดสิทธิ์ให้ครับ",
    "",
    "พออนุมัติแล้ว จะมีข้อความแจ้งกลับในแชตนี้อัตโนมัติ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

export function buildPaymentQrSlipText() {
  return "โอนแล้วส่งสลิปในแชตนี้ได้เลยครับ";
}

export function buildPaymentRequiredText({ usedScans = 0, freeLimit = 3 } = {}) {
  return [
    "🔍 Ener Scan",
    "",
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
    `โอน ${thb} บาท แล้วส่งสลิป 1 รูปในแชทนี้ — แอดมินจะตรวจก่อนเปิดสิทธิ์`,
    "หลังอนุมัติสลิปแล้ว จึงจะได้สิทธิ์สแกนตามแพ็กเกจ (เช่น 10 ครั้ง / 24 ชม.)",
  ].join("\n");
}

/** ข้อความสั้นหลังรูป QR — ให้ส่งสลิปกลับมา */
export function buildPaymentSlipFollowUpText() {
  return "📎 หลังโอนแล้ว ส่งรูปสลิปในแชทนี้เพื่อให้แอดมินตรวจครับ";
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
    "✅ ได้รับสลิปของคุณแล้วครับ",
    "",
    "ตอนนี้กำลังรอตรวจสอบรายการ",
    "ยังไม่ต้องส่งสลิปซ้ำก็ได้ครับ",
    "",
    "ระหว่างนี้ยังสแกนต่อไม่ได้",
    "พออนุมัติแล้ว เดี๋ยวแจ้งกลับในแชตนี้ให้อัตโนมัติครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

/** User typed non-command text while payment row is pending_verify (reduce repeat nudges). */
export function buildPendingVerifyReminderText({ paymentRef } = {}) {
  const base = [
    "⏳ สลิปของคุณกำลังรอตรวจสอบอยู่ครับ",
    "",
    "ไม่ต้องส่งสลิปซ้ำหากส่งครบแล้ว",
    "ตอนนี้ยังสแกนต่อไม่ได้ — รอผลอีกสักครู่นะครับ",
    "พออนุมัติแล้ว เดี๋ยวแจ้งกลับในแชตนี้ให้ครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

/** User sent another image while slip is already pending_verify (block scan / duplicate slip). */
export function buildPendingVerifyBlockScanText({ paymentRef } = {}) {
  const base = [
    "เราได้รับสลิปของคุณแล้วครับ",
    "ตอนนี้กำลังรอตรวจสอบรายการอยู่",
    "",
    "ระหว่างนี้ยังสแกนต่อไม่ได้",
    "พออนุมัติแล้ว เดี๋ยวแจ้งในแชตนี้ทันทีครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

/** User typed payment / จ่ายเงิน / ปลดล็อก while already pending_verify. */
export function buildPendingVerifyPaymentCommandText({ paymentRef } = {}) {
  const base = [
    "ตอนนี้มีสลิปรอตรวจอยู่แล้วครับ",
    "",
    "ไม่ต้องพิมพ์ payment ซ้ำในตอนนี้",
    "รอผลตรวจก่อนนะครับ — เมื่ออนุมัติหรือปฏิเสธ จะแจ้งกลับในแชตนี้ให้ครับ",
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
export function buildPaymentApprovedText({
  paidRemainingScans = null,
  paidUntil = null,
  paidRemainingLine = "",
  paidUntilLine = "",
  paymentRef = null,
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
    "✅ แอดมินอนุมัติสลิปแล้ว ระบบเปิดสิทธิ์ให้แล้วครับ",
  ];
  const refLine = formatPaymentRefLine(paymentRef);
  if (refLine) lines.push("", refLine);
  lines.push(
    "",
    scanLine,
    untilLine,
    "",
    "กรุณาส่งรูปเพื่อสแกนต่อได้ครับ",
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
    "กรุณาเริ่มขั้นตอนชำระเงินใหม่ด้วยตัวเอง:",
    "• สแกนรูปที่ต้องการสแกนอีกครั้ง (เมื่อบอทขอชำระเงิน) หรือ",
    "• พิมพ์ payment / จ่ายเงิน / ปลดล็อก เพื่อดู QR อีกครั้ง",
    "",
    "จากนั้นโอนตามยอดและส่งสลิปใหม่ในแชทนี้"
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
export function buildAwaitingSlipReminderText({ paymentRef } = {}) {
  const base = [
    "⏳ รอสลิปอยู่ครับ",
    "",
    "หลังโอนแล้ว ส่งสลิป 1 รูปในแชตนี้ได้เลย",
    "เราจะตรวจให้ก่อนเปิดสิทธิ์ — พออนุมัติแล้วค่อยสแกนต่อได้ครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
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