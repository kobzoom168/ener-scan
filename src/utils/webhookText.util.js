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
  pendingVerifyReminderText,
  pendingVerifyBlockScanText,
  pendingVerifyPaymentAgainText,
  idlePostScanText,
} from "./replyCopy.util.js";
import { loadActiveScanOffer } from "../services/scanOffer.loader.js";
import { resolveScanOfferAccessContext } from "../services/scanOfferAccess.resolver.js";
import {
  buildApprovedIntroReply,
  buildScanOfferReply,
} from "../services/scanOffer.copy.js";
import {
  findPackageByKey,
  getDefaultPackage,
  listActivePackages,
  parsePackageSelectionFromText,
} from "../services/scanOffer.packages.js";
import { isLoosePayIntentExact } from "./stateMicroIntent.util.js";
import { isBirthdateChangeCandidateText } from "./birthdateChangeFlow.util.js";

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

export {
  formatBangkokDateTime,
  formatBangkokDate,
  formatBangkokTime,
  BANGKOK_TIME_ZONE,
  TH_LOCALE,
} from "./dateTime.util.js";

/**
 * Thai-friendly date + time in Asia/Bangkok (พ.ศ.), e.g. 23/03/2569 15:45 น.
 * ISO strings from DB are parsed as UTC instant then displayed in local TZ.
 */
export function formatThaiPaidUntilForLine(isoOrDate) {
  const d =
    isoOrDate instanceof Date
      ? isoOrDate
      : new Date(String(isoOrDate || ""));
  if (!Number.isFinite(d.getTime())) return "ไม่ระบุ";
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
    "เอเนอร์สแกน",
    "ตอนนี้ส่งมาหลายรูปพร้อมกันนะ",
    "ขอทีละรูป พอ 1 รูปต่อครั้ง",
    "",
    "ถ้ามีหลายชิ้น แยกส่งมาได้เลยครับ",
  ].join("\n");
}

export function buildMultipleObjectsText() {
  return [
    "เอเนอร์สแกน",
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
    "พระเครื่อง",
    "เครื่องราง",
    "คริสตัล / หิน",
    "วัตถุสายพลังแบบชิ้นเดียว",
    "",
    "ลองส่งภาพใหม่ที่ตรงแบบนี้ได้เลยครับ",
  ].join("\n");
}

export function buildDuplicateImageText() {
  return [
    "เอเนอร์สแกน",
    "ระบบพบว่ารูปนี้เคยถูกสแกนแล้ว",
    "กรุณาส่งภาพใหม่ของวัตถุครับ",
  ].join("\n");
}

/** Primary + alternates for non-scan reply gateway (duplicate suppression). */
export function getDuplicateImageReplyCandidates() {
  return [
    buildDuplicateImageText(),
    "รูปนี้เคยสแกนไปแล้วนะ ลองส่งภาพวัตถุใหม่ได้เลยครับ",
    "ซ้ำกับที่เคยส่งมาแล้ว ขอเป็นภาพใหม่ของชิ้นนั้นนะครับ",
  ];
}

export function getMultipleObjectsReplyCandidates() {
  return [
    buildMultipleObjectsText(),
    "ในภาพมีหลายชิ้นอยู่นะครับ ขอถ่ายทีละชิ้นต่อรูป แล้วส่งมาใหม่ได้เลย",
    "ขอวัตถุชิ้นเดียวในเฟรมนะครับ แยกชิ้นแล้วถ่ายทีละรูปได้เลย",
  ];
}

export function getUnclearImageReplyCandidates() {
  return [
    buildUnclearImageText(),
    "ภาพยังไม่ชัดพอนะครับ ลองถ่ายใหม่ให้เห็นชิ้นง่าย ๆ ทีละชิ้น",
    "ยังอ่านชิ้นในภาพไม่ชัด ลองถ่ายใกล้ ๆ ทีละชิ้นต่อรูปนะครับ",
  ];
}

export function getUnsupportedObjectReplyCandidates() {
  return [
    buildUnsupportedObjectText(),
    "แบบนี้ยังไม่รับนะ ลองส่งพระ เครื่องราง หรือหินทีละชิ้นต่อรูป",
    "ยังไม่รับประเภทนี้ ขอเป็นวัตถุสายพลังชิ้นเดียวต่อรูปนะครับ",
  ];
}

export function getMultiImageInRequestReplyCandidates() {
  const primary = buildMultiImageInRequestText();
  return [
    primary,
    "ส่งทีละรูปนะครับ ถ้ามีหลายชิ้นแยกส่งมาได้เลย",
    "ตอนนี้รับทีละรูปอย่างเดียว ลองส่งใหม่ทีละภาพครับ",
  ];
}

export function buildRateLimitText(retryAfterSec = 0) {
  return [
    "เอเนอร์สแกน",
    "ใช้งานถี่ไปนิดนึง",
    retryAfterSec > 0
      ? `ขอรออีก ${retryAfterSec} วินาที แล้วค่อยสแกนใหม่ครับ`
      : "ขอรอสักครู่ แล้วค่อยสแกนใหม่ครับ",
  ].join("\n");
}

export function buildCooldownText(remainingSec = 0) {
  return [
    "เอเนอร์สแกน",
    remainingSec > 0
      ? `กรุณารออีก ${remainingSec} วินาทีก่อนสแกนใหม่`
      : "กรุณารอสักครู่ก่อนสแกนใหม่",
    "เพื่อให้ระบบอ่านพลังได้เสถียรมากขึ้นครับ",
  ].join("\n");
}

export function getRateLimitReplyCandidates(retryAfterSec = 0) {
  return [
    buildRateLimitText(retryAfterSec),
    "ใช้งานถี่ไปหน่อย ขอพักแป๊บแล้วค่อยสแกนใหม่นะครับ",
  ];
}

export function getCooldownReplyCandidates(remainingSec = 0) {
  return [
    buildCooldownText(remainingSec),
    "ระบบขอเว้นระยะนิดนึงก่อนสแกนรอบถัดไปนะครับ",
  ];
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

/**
 * ข้อความหลักสำหรับชำระเงิน (ไม่ใส่ URL — QR ส่งแยกเป็น image message)
 * @param {{ paymentRef?: string|null, paidPackage?: { priceThb: number, scanCount: number, windowHours: number }|null }} [opts]
 */
export function buildPaymentQrIntroText({ paymentRef, paidPackage = null } = {}) {
  const offer = loadActiveScanOffer();
  const pkg = paidPackage || getDefaultPackage(offer);
  const priceThb = pkg?.priceThb ?? offer.paidPriceThb;
  const scanCount = pkg?.scanCount ?? offer.paidScanCount;
  const windowHours = pkg?.windowHours ?? offer.paidWindowHours;
  const base = [
    "สิทธิ์สแกนฟรีของคุณครบแล้วครับ",
    "",
    "ถ้าจะสแกนต่อในรอบนี้",
    `แพ็กนี้ ${priceThb} บาท ใช้ได้ ${scanCount} ครั้ง ภายใน ${windowHours} ชม. หลังอนุมัติ`,
    "",
    "สแกนคิวอาร์ด้านล่าง โอนแล้วแนบสลิปไว้ในแชตนี้ได้เลยครับ",
    "เดี๋ยวมีคนตรวจแล้วเปิดสิทธิ์ให้ครับ",
    "",
    "พออนุมัติแล้ว เดี๋ยวผมแจ้งต่อในแชตนี้เลยครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

/** Single paid offer — short alternate (no multi-package menu). */
export function buildSingleOfferPaywallAltText(offer = loadActiveScanOffer()) {
  const pkg = getDefaultPackage(offer);
  if (!pkg) {
    return "ตอนนี้ยังไม่เปิดแพ็กชำระเงิน กรุณาลองใหม่ภายหลังครับ";
  }
  return [
    `เปิดสิทธิ์เพิ่ม ${pkg.priceThb} บาท สแกนได้ ${pkg.scanCount} ครั้ง ภายใน ${pkg.windowHours} ชม. หลังอนุมัติ`,
    "พร้อมเมื่อไหร่ บอกว่าจ่ายเงิน หรือ ปลดล็อก มาก็ได้ครับ",
  ].join("\n");
}

/** @deprecated Use buildSingleOfferPaywallAltText — kept for call sites. */
export function buildPackageSelectionPromptFromOffer(offer = loadActiveScanOffer()) {
  return buildSingleOfferPaywallAltText(offer);
}

/** Active package price tokens for short paywall lines (sorted asc, unique). */
export function formatPaywallPriceTokensForLine(offer = loadActiveScanOffer()) {
  const pkgs = listActivePackages(offer);
  if (!pkgs.length) return "";
  const prices = [
    ...new Set(
      pkgs
        .map((p) => Number(p.priceThb))
        .filter((n) => Number.isFinite(n)),
    ),
  ].sort((a, b) => a - b);
  return prices.map(String).join(" หรือ ");
}

/** หลังผู้ใช้ยืนยันจะเปิดสิทธิ์ (แพ็กเดียวจาก config) */
export function buildPaymentPackageSelectedAck(paidPackage) {
  const p = paidPackage || getDefaultPackage(loadActiveScanOffer());
  if (!p) return buildSingleOfferPaywallAltText();
  return [
    `โอเคครับ ยึดแพ็กนี้นะครับ ${p.priceThb} บาท ใช้สแกนเพิ่มได้ ${p.scanCount} ครั้ง ภายใน ${p.windowHours} ชั่วโมงหลังอนุมัติ`,
    "",
    "เดี๋ยวผมส่งรายละเอียดกับคิวอาร์ให้ครับ ขอคิวชำระบอกผมได้เลยครับ",
  ].join("\n");
}

/** Deterministic slot from LINE user id (stable per user). */
function slotFromUserId(userId, modulo) {
  const s = String(userId || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return modulo > 0 ? h % modulo : 0;
}

/** Single paid offer — gentle nudge to pay. */
export function buildPackageAlreadySelectedContinueHuman(paidPackage) {
  const p = paidPackage || getDefaultPackage(loadActiveScanOffer());
  if (!p) {
    return "พร้อมเมื่อไหร่ แจ้งว่าจ่ายเงินมาก็ได้ครับ";
  }
  return [
    `ตกลงครับ แพ็ก ${p.priceThb} บาท`,
    "พร้อมโอนเมื่อไหร่ แจ้งผมได้เลยครับ",
  ].join("\n");
}

/**
 * State-safe paywall guidance — single paid offer (no package choice).
 * @param {"unexpected" | "birthdate_deferred" | "pay_intent_no_package"} guidanceReason
 */
export function buildPaywallHumanGuidanceText({
  offer = loadActiveScanOffer(),
  userId = "",
  guidanceReason = "unexpected",
} = {}) {
  const pkg = getDefaultPackage(offer);
  const price = pkg?.priceThb ?? offer.paidPriceThb;
  if (guidanceReason === "birthdate_deferred") {
    return `เดี๋ยววันเกิดค่อยใช้ตอนสแกนครับ ตอนนี้จะเปิดสิทธิ์ แจ้งผมได้เลยครับ`;
  }
  if (guidanceReason === "pay_intent_no_package") {
    const lines = [
      `ถ้าพร้อมเปิดสิทธิ์ ${price} บาท บอกว่าจ่ายเงินมาก็ได้ครับ`,
      `ตอนนี้รอคิวชำระอยู่ครับ แจ้งว่าจ่ายเงินมาได้เลยครับ`,
    ];
    return lines[slotFromUserId(userId, lines.length)];
  }
  const soft = [
    `ถ้าจะใช้ต่อ แจ้งผมได้เลยครับ`,
    `พร้อมเมื่อไหร่บอกได้ครับ`,
  ];
  return soft[slotFromUserId(userId, soft.length)];
}

/** Pay intent outside paywall gate (e.g. idle) — still single offer. */
export function buildPaymentPayIntentNoPackageHumanText({
  offer = loadActiveScanOffer(),
  userId = "",
} = {}) {
  const alt = buildSingleOfferPaywallAltText(offer);
  const lines = [
    "ตอนนี้ยังไม่ได้อยู่ในขั้นตอนชำระเงินครับ ถ้าฟรีหมดแล้ว จะมีข้อความบอกแพ็กให้",
    "หรือถ้าอยู่ช่วงชำระเงินอยู่แล้ว แจ้งว่าจ่ายเงินตามที่บอทบอกได้เลยครับ",
  ];
  const head = lines[slotFromUserId(userId, lines.length)];
  return `${head}\n\n${alt}`;
}

export function isPackageSelectionTokenText(text, offer = loadActiveScanOffer()) {
  return Boolean(parsePackageSelectionFromText(text, offer));
}

/**
 * Waiting for birthdate: payment/package/menu must not steal the turn — one short human line.
 */
/**
 * @param {string} userId
 * @param {{ tier?: "full" | "short" | "micro" }} [opts]
 */
export async function buildWaitingBirthdateDateFirstGuidanceMessages(userId, opts = {}) {
  const tier = opts.tier || "full";
  if (tier === "micro") {
    return ["ขอวันเกิดหน่อยครับ"];
  }
  if (tier === "short") {
    return ["ผมรอวันเกิดอยู่ครับ เช่น 19/08/2528"];
  }
  const lines = [
    "ขอวันเกิดที่ใช้ในระบบหน่อยครับ อ่านแบบ 19/08/2528 นะครับ",
    "รอวันเกิดอยู่ครับ เช่น 19-08-2528 บอกผมได้เลยครับ",
  ];
  const primary = lines[slotFromUserId(userId, lines.length)];
  return [primary];
}

/**
 * Short deterministic errors for waiting_birthdate (avoid repeating long format lessons).
 * @param {"full" | "short" | "micro"} tier
 * @param {"invalid_format" | "invalid_date" | "out_of_range"} reason
 */
export function buildDeterministicBirthdateErrorText(
  tier = "full",
  reason = "invalid_format",
) {
  const r = String(reason || "invalid_format");
  if (tier === "micro") {
    return "ลองบอกวันเกิดอีกครั้งได้เลยครับ";
  }
  if (tier === "short") {
    if (r === "out_of_range") return "วันเกิดอยู่นอกช่วงที่ใช้ได้ครับ ลองปีอื่นดูนะครับ";
    if (r === "invalid_date") return "วันที่ไม่ตรงปฏิทินครับ ลองใหม่อีกครั้ง";
    return "รูปแบบยังไม่ตรงครับ ลองเช่น 19/08/2528";
  }
  if (r === "out_of_range") {
    return "วันเกิดนี้ยังใช้ในระบบไม่ได้ครับ ลองปีอื่นที่อยู่ในช่วงที่รองรับ";
  }
  if (r === "invalid_date") {
    return "วันที่ไม่ตรงกับปฏิทินครับ ลองบอกใหม่อีกครั้งนะครับ";
  }
  return "ยังอ่านวันเกิดไม่ได้ครับ ลองแบบ 19/08/2528 หรือ 19082528";
}

/** Deterministic awaiting_slip text guard (persona may still vary alternates). */
export function buildAwaitingSlipDeterministicGuidanceText({ paymentRef } = {}) {
  const base = [
    "ถ้าโอนแล้ว แนบสลิปไว้ในแชตนี้ได้เลยครับ",
    "เดี๋ยวมีคนตรวจแล้วเปิดสิทธิ์ให้ครับ",
    "",
    "อยากดูคิวอาร์อีกครั้ง แจ้งว่าจ่ายเงินมาก็ได้ครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

export function buildPendingVerifyHumanGuidanceText({ paymentRef } = {}) {
  const base = [
    "ได้รับสลิปแล้วครับ ตอนนี้กำลังตรวจสอบให้อยู่นะครับ",
    "พอมีผล เดี๋ยวผมแจ้งต่อในแชตนี้เลยครับ",
    "",
    "ถ้ายังไม่ได้แนบสลิป รูปสลิปแนบในแชตนี้ได้เลยครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

export function buildPaidActiveScanReadyHumanText(userId) {
  const variants = [
    ["ตอนนี้คุณพร้อมสแกนแล้วครับ", "ส่งรูปวัตถุ 1 รูปในแชตนี้ได้เลย"].join(
      "\n\n",
    ),
    ["พร้อมสแกนแล้วครับ", "ส่งรูปมา 1 รูป เดี๋ยวผมอ่านให้"].join("\n\n"),
  ];
  return variants[slotFromUserId(userId, variants.length)];
}

export function buildPaymentQrSlipText() {
  return "โอนแล้วส่งสลิปในแชตนี้ได้เลยครับ";
}

/**
 * @param {{ usedScans?: number, freeLimit?: number, userId?: string, decision?: object }} opts
 * `userId` enables non-repetitive paywall wording (persona). Without userId, uses scan-offer template pool.
 */
export async function buildPaymentRequiredText({
  usedScans,
  freeLimit = 3,
  userId = null,
  decision = null,
} = {}) {
  if (userId) return paywallText(userId);

  const offer = loadActiveScanOffer();
  const quota = Number.isFinite(Number(freeLimit))
    ? Number(freeLimit)
    : offer.freeQuotaPerDay;
  const used =
    decision?.usedScans != null && Number.isFinite(Number(decision.usedScans))
      ? Number(decision.usedScans)
      : usedScans != null && Number.isFinite(Number(usedScans))
        ? Number(usedScans)
        : quota;
  const ctx = resolveScanOfferAccessContext({
    offer,
    freeUsedToday: Math.min(used, quota),
    paidUntil: decision?.paidUntil ?? null,
    paidRemainingScans: decision?.paidRemainingScans ?? 0,
    now: new Date(),
  });
  const gate = {
    allowed: false,
    reason: "payment_required",
  };
  const built = buildScanOfferReply({
    offer,
    accessContext: ctx,
    gate,
    userId: null,
  });
  return built.primaryText;
}

export function buildNoHistoryText() {
  return "ยังไม่มีประวัติการสแกนครับ";
}

export function buildNoStatsText() {
  return "ยังไม่มีสถิติการสแกนครับ";
}

/** Deterministic idle copy — routing owns when this applies; persona may only vary alternates. */
export function buildIdleDeterministicPrimaryText() {
  return "ส่งรูปมาได้เลย\nผมจะดูให้ทีละชิ้น";
}

export async function buildIdleText(userId = null) {
  if (!String(userId || "").trim()) {
    return buildIdleDeterministicPrimaryText();
  }
  return idlePostScanText(userId);
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
    "ตอนนี้รายการนี้อยู่ระหว่างชำระเงิน / ตรวจสอบสลิปครับ",
    "",
    "ถ้าโอนแล้ว แนบสลิปในแชตนี้ได้เลยครับ",
    "เดี๋ยวตรวจให้ก่อนเปิดสิทธิ์สแกนครับ",
  ].join("\n");
}

export function buildSystemErrorText() {
  return "ขออภัยครับ ติดขัดชั่วคราว ลองส่งใหม่อีกครั้งได้เลยครับ";
}

export function isPaymentCommand(text, lowerText) {
  const t = String(text || "").trim();
  const lt = String(lowerText || t.toLowerCase()).trim();

  if (lt === "payment" || t === "จ่ายเงิน" || t === "ปลดล็อก") return true;
  return isLoosePayIntentExact(t);
}

function displayAmountThb(amount, fallbackThb) {
  const n = Number(amount);
  const fb = Number(fallbackThb);
  if (Number.isFinite(n) && n > 0) return n;
  if (Number.isFinite(fb) && fb > 0) return fb;
  return 1;
}

/** ข้อความยาวหลังคำสั่ง payment / จ่ายเงิน (ใช้คู่กับรูป QR แยกข้อความ) */
export function buildPaymentCommandIntroText({
  amount = null,
  paidPackage = null,
} = {}) {
  const offer = loadActiveScanOffer();
  const pkg = paidPackage || getDefaultPackage(offer);
  const thb = displayAmountThb(amount, pkg?.priceThb ?? offer.paidPriceThb);
  const cnt = pkg?.scanCount ?? offer.paidScanCount;
  const hrs = pkg?.windowHours ?? offer.paidWindowHours;
  return [
    "วิธีชำระเงิน (พร้อมเพย์ + สลิป)",
    "",
    `โอน ${thb} บาท แล้วส่งสลิป 1 รูปในแชทนี้ แอดมินตรวจก่อนเปิดสิทธิ์`,
    `พออนุมัติแล้ว จะได้สแกนต่อได้ ${cnt} ครั้ง ภายใน ${hrs} ชั่วโมง`,
  ].join("\n");
}

/** ข้อความสั้นหลังรูป QR — ให้ส่งสลิปกลับมา */
export function buildPaymentSlipFollowUpText() {
  return "โอนแล้วส่งรูปสลิปในแชทนี้ เดี๋ยวแอดมินตรวจให้ครับ";
}

/** ข้อความเดียว (fallback เมื่อส่งรูป QR ไม่ได้ / LINE error) — ไม่ใส่ลิงก์ QR */
export function buildPaymentInstructionText({
  paymentId = null,
  amount = null,
  currency = "THB",
  paymentRef = null,
  paidPackage = null,
} = {}) {
  const offer = loadActiveScanOffer();
  const pkg = paidPackage || getDefaultPackage(offer);
  const thb = displayAmountThb(amount, pkg?.priceThb ?? offer.paidPriceThb);
  return [
    buildPaymentQrIntroText({ paymentRef, paidPackage: pkg }),
    "",
    "ตอนนี้ยังโหลดรูปคิวอาร์ในแชตไม่ได้ชั่วคราว ลองแจ้งว่าจ่ายเงินอีกครั้งภายหลัง หรือติดต่อเราได้ครับ",
  ].join("\n");
}

/** @deprecated Prefer replyPaymentInstructions + image; kept for rare text-only fallback */
export function buildManualPaymentRequestText({ paymentRef } = {}) {
  return [
    buildPaymentQrIntroText({ paymentRef }),
    "",
    "แจ้งว่าจ่ายเงิน เพื่อดูคิวอาร์และวิธีชำระเงินอีกครั้ง",
  ].join("\n");
}

/** slip image accepted: now waiting for admin verification. */
export function buildSlipReceivedText({ paymentRef } = {}) {
  const base = [
    "รับสลิปแล้วครับ",
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
    "ไม่ต้องส่งคำสั่งจ่ายเงินซ้ำในตอนนี้นะครับ",
    "รอผลตรวจก่อนนะ อนุมัติหรือปฏิเสธ เดี๋ยวแจ้งในแชตนี้ให้ครับ",
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
  paidPlanCode = null,
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
      untilRaw ? formatThaiPaidUntilForLine(untilRaw) : "ไม่ระบุ"
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
    untilLine = `ใช้ได้ถึง: ${expiryFromLine || "ไม่ระบุ"}`;
  }

  const offer = loadActiveScanOffer();
  const introPkg = paidPlanCode
    ? findPackageByKey(offer, paidPlanCode)
    : null;
  const introShape = introPkg
    ? {
        priceThb: introPkg.priceThb,
        scanCount: introPkg.scanCount,
        windowHours: introPkg.windowHours,
      }
    : null;

  const lines = [
    lineUserId
      ? (
          await buildApprovedIntroReply({
            offer,
            userId: lineUserId,
            introPackage: introShape,
          })
        ).primaryText
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
    "แอดมินปฏิเสธสลิปนี้ครับ รายการชำระเงินเดิมจบแล้ว ระบบจะไม่ใช้สลิปนี้ต่อ",
    "",
  ];
  if (r) {
    lines.push("รายละเอียดจากแอดมิน:", r, "");
  }
  lines.push(
    "เริ่มขั้นตอนชำระใหม่ได้แบบนี้",
    "ส่งรูปสแกนอีกครั้ง (ตอนที่บอทขอชำระ) หรือ",
    "แจ้งว่า จ่ายเงิน หรือ ปลดล็อก เพื่อดูคิวอาร์อีกครั้ง",
    "",
    "แล้วโอนตามยอด แนบสลิปใหม่ในแชทนี้ได้เลยครับ"
  );
  return lines.join("\n");
}

/** Commands that may still run while slip is pending_verify (menu, history, etc.). */
export function allowsUtilityCommandsDuringPendingVerify(text, lowerText) {
  const t = String(text || "").trim();
  const lt = String(lowerText || t.toLowerCase()).trim();

  if (isHistoryCommand(t, lt) || isStatsCommand(t, lt)) return true;
  if (t === "สแกนพลังงาน") return true;
  if (isBirthdateChangeCandidateText(t)) return true;
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

/** User typed text while waiting for slip — deterministic state-safe copy (routing owns flow). */
export async function buildAwaitingSlipReminderText({ userId, paymentRef } = {}) {
  void userId;
  return buildAwaitingSlipDeterministicGuidanceText({ paymentRef });
}

// --- Micro-intent / menu fatigue (deterministic reply families) ---

/** First full paywall explanation (single offer) — used on unclear tier full. */
export function buildPaywallFullOfferIntroText(offer = loadActiveScanOffer()) {
  const pkg = getDefaultPackage(offer);
  const price = pkg?.priceThb ?? offer.paidPriceThb;
  const scanCount = pkg?.scanCount ?? offer.paidScanCount;
  const hours = pkg?.windowHours ?? offer.paidWindowHours;
  return [
    "วันนี้สิทธิ์ฟรีครบแล้วครับ",
    "",
    "พรุ่งนี้ยังมีฟรีต่อได้อีกครับ ถ้ายังไม่รีบค่อยมาใหม่ก็ได้",
    "",
    "ถ้าอยากสแกนต่อวันนี้",
    `เปิดสิทธิ์เพิ่มได้ ${price} บาท`,
    `สแกนได้ ${scanCount} ครั้ง ภายใน ${hours} ชั่วโมงหลังอนุมัติ`,
    "",
    "พร้อมเมื่อไหร่ บอกว่าจ่ายเงิน หรือ ปลดล็อก มาก็ได้ครับ",
  ].join("\n");
}

/**
 * Short acknowledgement ladder while still on paywall (same-state ack; no routing change).
 * @param {number} ackStreak consecutive ack turns in this state (>=1)
 */
export function buildPaywallAckContinueText({
  offer = loadActiveScanOffer(),
  userId = "",
  ackStreak = 1,
} = {}) {
  void offer;
  const n = Math.max(1, Number(ackStreak) || 1);
  if (n >= 3) {
    const pure = ["รับทราบครับ", "ได้ครับ", "โอเคครับ"];
    return pure[slotFromUserId(userId, pure.length)];
  }
  if (n === 2) {
    const v = ["โอเคครับ ยังไม่รีบก็ได้ครับ", "รับทราบครับ"];
    return v[slotFromUserId(userId, v.length)];
  }
  const v = [
    "ได้ครับ",
    "โอเคครับ ถ้าจะเปิดสิทธิ์ต่อเมื่อไหร่ แจ้งผมได้เลยครับ",
  ];
  return v[slotFromUserId(userId, v.length)];
}

/**
 * Single-offer paywall fatigue (tier × branch). No multi-package wording.
 * @param {"full" | "short" | "micro"} tier
 * @param {"wait_tomorrow" | "date_wrong" | "ack" | "unclear"} branch
 * @param {number} [ackStreak] when branch ack — ladder from buildPaywallAckContinueText
 */
export function buildPaywallFatiguePromptText({
  offer = loadActiveScanOffer(),
  userId = "",
  tier = "full",
  branch = "unclear",
  ackStreak = 1,
} = {}) {
  const pkg = getDefaultPackage(offer);
  const price = pkg?.priceThb ?? offer.paidPriceThb;
  const scanCount = pkg?.scanCount ?? offer.paidScanCount;
  const hours = pkg?.windowHours ?? offer.paidWindowHours;
  const freeQ = offer.freeQuotaPerDay;

  if (branch === "ack") {
    return buildPaywallAckContinueText({ offer, userId, ackStreak });
  }

  if (branch === "wait_tomorrow") {
    if (tier === "micro") {
      return "โอเคครับ พรุ่งนี้มีฟรีใหม่อีกครับ หรือจะเปิดวันนี้ บอกว่าจ่ายเงินมาก็ได้ครับ";
    }
    if (tier === "short") {
      return `รอพรุ่งนี้ได้เลยครับ ฟรีจะกลับมา ${freeQ} ครั้ง ถ้าจะใช้ต่อวันนี้ เปิดเพิ่ม ${price} บาท แจ้งว่าจ่ายเงินมาก็ได้ครับ`;
    }
    return [
      "วันนี้สิทธิ์ฟรีครบแล้วครับ",
      "ถ้าสะดวก รอพรุ่งนี้แล้วค่อยสแกนต่อได้เลย",
      "",
      "แต่ถ้าต้องการใช้ต่อทันที",
      `เปิดสิทธิ์เพิ่ม ${price} บาท สแกนได้ ${scanCount} ครั้ง ภายใน ${hours} ชม. หลังอนุมัติ`,
      "",
      "พร้อมเมื่อไหร่ บอกว่าจ่ายเงินมาก็ได้ครับ",
    ].join("\n");
  }
  if (branch === "date_wrong") {
    if (tier === "micro") {
      return "เดี๋ยวค่อยใส่วันเกิดตอนสแกนครับ ตอนนี้จะเปิดสิทธิ์ แจ้งว่าจ่ายเงินมาก็ได้ครับ";
    }
    return `เดี๋ยววันเกิดค่อยใช้ตอนสแกนครับ ตอนนี้ถ้าจะเปิดสิทธิ์ ${price} บาท แจ้งว่าจ่ายเงินมาก็ได้ครับ`;
  }
  if (tier === "micro") {
    return `ฟรีวันนี้ครบแล้วครับ จะต่อวันนี้ บอกว่าจ่ายเงินมาก็ได้ครับ`;
  }
  if (tier === "short") {
    return `ตอนนี้สิทธิ์ฟรีของวันนี้ครบแล้วครับ ถ้าต้องการใช้ต่อ เปิดเพิ่มได้ ${price} บาท / ${scanCount} ครั้ง / ${hours} ชม. พร้อมเมื่อไหร่แจ้งว่าจ่ายเงินมาก็ได้ครับ`;
  }
  return buildPaywallFullOfferIntroText(offer);
}

/**
 * Maps paywall branch + tier → replyType label for observability.
 * @param {"wait_tomorrow" | "date_wrong" | "ack" | "unclear"} branch
 * @param {"full" | "short" | "micro"} tier
 */
export function resolvePaywallPromptReplyType(branch, tier) {
  if (branch === "wait_tomorrow") return "single_offer_paywall_wait_tomorrow";
  if (branch === "date_wrong") return "single_offer_paywall_date_wrong_state";
  if (branch === "ack") {
    if (tier === "full") return "single_offer_paywall_ack_full";
    if (tier === "short") return "single_offer_paywall_ack_short";
    return "single_offer_paywall_ack_micro";
  }
  if (tier === "full") return "single_offer_paywall_unclear_full";
  if (tier === "short") return "single_offer_paywall_unclear_short";
  return "single_offer_paywall_unclear_micro";
}

/** @deprecated Single-package flow — no cheaper tier; hesitation = gentle pay nudge. */
export function buildPaymentPackageSelectedHesitationText(
  paidPackage,
  offer = loadActiveScanOffer(),
) {
  void paidPackage;
  void offer;
  return "ถ้าพร้อมโอน แจ้งว่าจ่ายเงินมาก็ได้ครับ";
}

export function buildPaymentPackageSelectedGentleRemindText() {
  return "ถ้าพร้อมโอน แจ้งว่าจ่ายเงินมาก็ได้ครับ";
}

export function buildPaymentPackageSelectedUnclearText({ tier = "short" } = {}) {
  if (tier === "micro") {
    return "พร้อมเมื่อไหร่ แจ้งว่าจ่ายเงินมาก็ได้ครับ";
  }
  if (tier === "short") {
    return "ถ้าพร้อมเปิดสิทธิ์ บอกว่าจ่ายเงินมาก็ได้ครับ";
  }
  return "ตอนนี้อยู่ช่วงรอเปิดสิทธิ์ครับ แจ้งว่าจ่ายเงินมาก็ได้ครับ";
}

export function buildAwaitingSlipStatusHintText({ paymentRef } = {}) {
  const base =
    "ตอนนี้ผมรอสลิปอยู่ครับ แนบรูปสลิปโอนในแชตนี้ได้เลยครับ";
  return appendPaymentRefLine(base, paymentRef);
}

/**
 * @param {"full" | "short" | "micro"} tier
 * @param {"default" | "status"} kind
 */
export function buildAwaitingSlipFatigueGuidanceText({
  paymentRef,
  tier = "full",
  kind = "default",
} = {}) {
  if (kind === "status") {
    return buildAwaitingSlipStatusHintText({ paymentRef });
  }
  if (tier === "micro") {
    return appendPaymentRefLine(
      "รอสลิปอยู่ครับ แนบในแชตนี้ได้เลยครับ",
      paymentRef,
    );
  }
  if (tier === "short") {
    return appendPaymentRefLine(
      "ตอนนี้ผมรอสลิปอยู่ครับ แนบรูปสลิปในแชตนี้ได้เลยครับ",
      paymentRef,
    );
  }
  return buildAwaitingSlipDeterministicGuidanceText({ paymentRef });
}

export function buildPendingVerifyStatusShortText({ paymentRef } = {}) {
  const base = "ตอนนี้กำลังตรวจสอบสลิปให้อยู่นะครับ พอมีผลจะแจ้งในแชตนี้ทันที";
  return appendPaymentRefLine(base, paymentRef);
}

export function buildPendingVerifyGentleRemindText({ paymentRef } = {}) {
  const base = "รอตรวจสลิปอยู่ครับ เดี๋ยวแจ้งในแชตนี้ให้";
  return appendPaymentRefLine(base, paymentRef);
}

/**
 * awaiting_slip: short ack ladder (does not repeat full slip menu every turn).
 * @param {number} ackStreak consecutive ack turns in awaiting_slip
 */
export function buildAwaitingSlipAckContinueText({
  userId = "",
  ackStreak = 1,
  paymentRef,
} = {}) {
  const n = Math.max(1, Number(ackStreak) || 1);
  if (n >= 3) {
    const b = ["รับทราบครับ", "ได้ครับ", "โอเคครับ"];
    return appendPaymentRefLine(b[slotFromUserId(userId, b.length)], paymentRef);
  }
  if (n === 2) {
    const b = ["โอเคครับ ยังไม่รีบก็ได้ครับ", "รับทราบครับ"];
    return appendPaymentRefLine(b[slotFromUserId(userId, b.length)], paymentRef);
  }
  const v = [
    "ได้ครับ",
    "ถ้าโอนแล้ว แนบสลิปไว้ในแชตนี้ได้เลยครับ เดี๋ยวตรวจให้ต่อครับ",
  ];
  return appendPaymentRefLine(v[slotFromUserId(userId, v.length)], paymentRef);
}

/**
 * pending_verify: reassurance ack ladder (not “pay again”).
 * @param {number} ackStreak consecutive ack turns in pending_verify
 */
export function buildPendingVerifyAckContinueText({
  userId = "",
  ackStreak = 1,
  paymentRef,
} = {}) {
  const n = Math.max(1, Number(ackStreak) || 1);
  if (n >= 3) {
    const b = ["รับทราบครับ", "ได้ครับ", "โอเคครับ"];
    return appendPaymentRefLine(b[slotFromUserId(userId, b.length)], paymentRef);
  }
  if (n === 2) {
    const b = [
      "โอเคครับ รอแป๊บนึงนะครับ",
      "รับทราบครับ กำลังเช็กให้อยู่นะครับ",
    ];
    return appendPaymentRefLine(b[slotFromUserId(userId, b.length)], paymentRef);
  }
  const base = "ตอนนี้รับสลิปแล้วครับ กำลังเช็กให้อยู่นะครับ";
  return appendPaymentRefLine(base, paymentRef);
}

export function buildWaitingBirthdatePaymentDeferredRedirectText() {
  return "เรื่องชำระค่อยทำทีหลังได้ครับ ตอนนี้ขอวันเกิดก่อนนะครับ เช่น 19/08/2528";
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