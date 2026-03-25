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
import {
  isLoosePayIntentExact,
} from "./stateMicroIntent.util.js";

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
    "จะสแกนต่อได้แบบนี้",
    `แพ็กเกจนี้ราคา ${priceThb} บาท`,
    `ใช้ได้ ${scanCount} ครั้ง (ภายใน ${windowHours} ชม. หลังอนุมัติ)`,
    "",
    "ทำตามนี้ได้เลย",
    "1. สแกนคิวอาร์ ด้านล่าง",
    "2. โอนแล้วส่งสลิปในแชตนี้",
    "3. เดี๋ยวมีคนตรวจแล้วเปิดสิทธิ์ให้",
    "",
    "พออนุมัติแล้ว จะมีข้อความแจ้งในแชตนี้ให้ครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

/** ข้อความเลือกแพ็ก (ก่อนพิมพ์ จ่ายเงิน) — ดึงจาก config */
export function buildPackageSelectionPromptFromOffer(offer = loadActiveScanOffer()) {
  const pkgs = listActivePackages(offer);
  if (!pkgs.length) {
    return "ตอนนี้ยังไม่มีแพ็กเกจให้เลือก กรุณาลองใหม่ภายหลังครับ";
  }
  const lines = pkgs
    .map(
      (p, i) =>
        `${i + 1}) ${p.priceThb} บาท ใช้ได้ ${p.scanCount} ครั้ง ภายใน ${p.windowHours} ชั่วโมง`,
    )
    .join("\n\n");
  const tokens = formatPaywallPriceTokensForLine(offer);
  return `เลือกได้ ${pkgs.length} แบบครับ\n\n${lines}\n\nถ้าต้องการอันไหน พิมพ์ ${tokens} ได้เลยครับ`;
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

function paywallPickPackageShortPhrase(offer) {
  const tokens = formatPaywallPriceTokensForLine(offer);
  return tokens || "แพ็กจากเมนู";
}

/** หลังผู้ใช้พิมพ์เลขแพ็ก */
export function buildPaymentPackageSelectedAck(paidPackage) {
  const p = paidPackage;
  if (!p) return buildPackageSelectionPromptFromOffer();
  const line = `แพ็กเกจที่เลือกคือ ${p.priceThb} บาท ใช้ได้ ${p.scanCount} ครั้ง ภายใน ${p.windowHours} ชั่วโมงหลังอนุมัติ`;
  return `${line}\n\nพิมพ์ จ่ายเงิน เมื่อพร้อมโอน จะได้คิวอาร์และขั้นตอนในแชตนี้ครับ`;
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

/** User re-sent the same package token while still on paywall — stay in flow, nudge to pay. */
export function buildPackageAlreadySelectedContinueHuman(paidPackage) {
  const p = paidPackage;
  if (!p) {
    return "เลือกแพ็กไว้แล้วครับ พิมพ์ จ่ายเงิน เมื่อพร้อมโอนได้เลย";
  }
  return [
    `แพ็ก ${p.priceThb} บาทเลือกไว้แล้วครับ`,
    "ถ้าพร้อมโอน พิมพ์ จ่ายเงิน ได้เลยครับ",
  ].join("\n");
}

/**
 * State-safe paywall guidance (Thai, no emoji). `guidanceReason` drives tone, not routing.
 * @param {"unexpected" | "birthdate_deferred" | "pay_intent_no_package"} guidanceReason
 */
export function buildPaywallHumanGuidanceText({
  offer = loadActiveScanOffer(),
  userId = "",
  guidanceReason = "unexpected",
} = {}) {
  const pick = paywallPickPackageShortPhrase(offer);
  if (guidanceReason === "birthdate_deferred") {
    return `เดี๋ยววันเกิดค่อยใช้ตอนสแกนครับ ตอนนี้เลือกแพ็กก่อน พิมพ์ ${pick} ได้เลย`;
  }
  if (guidanceReason === "pay_intent_no_package") {
    const lines = [
      `ถ้ายังไม่เลือกแพ็ก เลือก ${pick} มาก่อนได้ครับ`,
      `ตอนนี้ผมรอเลือกแพ็กอยู่ครับ พิมพ์ ${pick} ได้เลย`,
    ];
    return lines[slotFromUserId(userId, lines.length)];
  }
  const soft = [
    `ตอนนี้ผมรอเลือกแพ็กอยู่ครับ ถ้าจะเปิดสิทธิ์ พิมพ์ ${pick} ได้เลย`,
    `ถ้าสะดวกเปิดสิทธิ์ พิมพ์ ${pick} มาได้เลยครับ`,
  ];
  return soft[slotFromUserId(userId, soft.length)];
}

/** Pay intent without package (generic path / not on paywall gate). */
export function buildPaymentPayIntentNoPackageHumanText({
  offer = loadActiveScanOffer(),
  userId = "",
} = {}) {
  const menu = buildPackageSelectionPromptFromOffer(offer);
  const pick = paywallPickPackageShortPhrase(offer);
  const lines = [
    `ยังไม่ได้เลือกแพ็กครับ เลือก ${pick} ก่อน แล้วค่อยพิมพ์ จ่ายเงิน ได้เลย`,
    `เลือกแพ็กก่อนนะครับ พิมพ์ ${pick} แล้วตามด้วย จ่ายเงิน เมื่อพร้อม`,
  ];
  const head = lines[slotFromUserId(userId, lines.length)];
  return `${head}\n\n${menu}`;
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
    return ["พิมพ์วันเกิดแบบ วัน/เดือน/ปี เช่น 19/08/1985 ได้เลยครับ"];
  }
  if (tier === "short") {
    return ["พิมพ์วันเกิดเป็น DD/MM/YYYY ได้เลยครับ เช่น 19/08/1985"];
  }
  const lines = [
    "ขอวันเกิดก่อนครับ พิมพ์แบบ 19/08/1985 ได้เลย",
    "ตอนนี้ผมรอวันเกิดอยู่ครับ เดี๋ยวได้อ่านต่อให้เลย",
  ];
  const primary = lines[slotFromUserId(userId, lines.length)];
  return [primary];
}

/** Deterministic awaiting_slip text guard (persona may still vary alternates). */
export function buildAwaitingSlipDeterministicGuidanceText({ paymentRef } = {}) {
  const base = [
    "ตอนนี้ผมรอสลิปอยู่ครับ",
    "ส่งรูปสลิปมาในแชตนี้ได้เลย",
    "ถ้าต้องการดูคิวอาร์อีกครั้ง พิมพ์ จ่ายเงิน ได้เลยครับ",
  ].join("\n");
  return appendPaymentRefLine(base, paymentRef);
}

export function buildPendingVerifyHumanGuidanceText({ paymentRef } = {}) {
  const base = [
    "สลิปอยู่ระหว่างให้ทีมตรวจครับ",
    "รอแจ้งผลในแชตนี้ได้เลย",
    "ถ้ายังไม่ได้ส่งสลิป ส่งรูปมาได้เลยครับ",
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
    "ตอนนี้ยังโหลดรูปคิวอาร์ ในแชตไม่ได้ชั่วคราว ลองพิมพ์ จ่ายเงิน อีกครั้งภายหลัง หรือติดต่อเราได้ครับ",
  ].join("\n");
}

/** @deprecated Prefer replyPaymentInstructions + image; kept for rare text-only fallback */
export function buildManualPaymentRequestText({ paymentRef } = {}) {
  return [
    buildPaymentQrIntroText({ paymentRef }),
    "",
    "พิมพ์: จ่ายเงิน เพื่อดูคิวอาร์ และวิธีชำระเงินอีกครั้ง",
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
    "ไม่ต้องพิมพ์ จ่ายเงิน ซ้ำในตอนนี้",
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
    "พิมพ์ จ่ายเงิน หรือ ปลดล็อก เพื่อดูคิวอาร์ อีกครั้ง",
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

/** User typed text while waiting for slip — deterministic state-safe copy (routing owns flow). */
export async function buildAwaitingSlipReminderText({ userId, paymentRef } = {}) {
  void userId;
  return buildAwaitingSlipDeterministicGuidanceText({ paymentRef });
}

// --- Micro-intent / menu fatigue (deterministic reply families) ---

/**
 * @param {"full" | "short" | "micro"} tier
 * @param {"pay_too_early" | "date_wrong" | "ack" | "unclear"} branch
 */
export function buildPaywallFatiguePromptText({
  offer = loadActiveScanOffer(),
  userId = "",
  tier = "full",
  branch = "unclear",
} = {}) {
  const pick = paywallPickPackageShortPhrase(offer);
  if (branch === "pay_too_early") {
    if (tier === "micro") {
      return `เลือกแพ็ก ${pick} ก่อนนะครับ แล้วค่อยสั่งจ่ายเงิน`;
    }
    if (tier === "short") {
      return `ยังต้องเลือกแพ็กก่อนครับ พิมพ์ ${pick} ได้เลย แล้วค่อยสั่งจ่ายเงิน`;
    }
    return `ถ้ายังไม่เลือกแพ็ก เลือก ${pick} มาก่อนได้ครับ แล้วค่อยพิมพ์ จ่ายเงิน หรือ พิมพ์ จ่าย เมื่อพร้อม`;
  }
  if (branch === "date_wrong") {
    return `เดี๋ยววันเกิดค่อยใช้ตอนสแกนครับ ตอนนี้เลือกแพ็กก่อน พิมพ์ ${pick} ได้เลย`;
  }
  if (branch === "ack") {
    if (tier === "micro") return `เอา ${pick} ดีครับ`;
    if (tier === "short") {
      return `ตอนนี้ผมรอเลือกแพ็กอยู่ครับ พิมพ์ ${pick} ได้เลย`;
    }
    return `ตอนนี้ผมรอเลือกแพ็กอยู่ครับ ถ้าจะเปิดสิทธิ์ พิมพ์ ${pick} ได้เลย`;
  }
  if (tier === "micro") return `เอา ${pick} ดีครับ`;
  if (tier === "short") {
    return `ตอนนี้ผมรอเลือกแพ็กอยู่ครับ พิมพ์ ${pick} ได้เลย`;
  }
  return buildPaywallHumanGuidanceText({
    offer,
    userId,
    guidanceReason: "unexpected",
  });
}

/**
 * Maps paywall branch + tier → replyType label for observability.
 * @param {"pay_too_early" | "date_wrong" | "ack" | "unclear"} branch
 * @param {"full" | "short" | "micro"} tier
 */
export function resolvePaywallPromptReplyType(branch, tier) {
  if (branch === "pay_too_early") return "payment_package_prompt_pay_too_early";
  if (branch === "date_wrong") return "payment_package_prompt_date_wrong_state";
  if (branch === "ack") {
    if (tier === "full") return "payment_package_prompt_soft_redirect";
    if (tier === "short") return "payment_package_prompt_short";
    return "payment_package_prompt_micro";
  }
  if (tier === "full") return "payment_package_prompt_full";
  if (tier === "short") return "payment_package_prompt_short";
  return "payment_package_prompt_micro";
}

export function buildPaymentPackageSelectedHesitationText(
  paidPackage,
  offer = loadActiveScanOffer(),
) {
  const p = paidPackage;
  if (!p) return "ถ้าพร้อมโอน พิมพ์ จ่ายเงิน ได้เลยครับ";
  const pkgs = listActivePackages(offer)
    .filter((x) => x && Number.isFinite(Number(x.priceThb)))
    .sort((a, b) => Number(a.priceThb) - Number(b.priceThb));
  const cur = Number(p.priceThb);
  const cheaperTiers = pkgs.filter((x) => Number(x.priceThb) < cur);
  const lighter = cheaperTiers.length ? cheaperTiers[cheaperTiers.length - 1] : null;
  if (lighter) {
    return `ถ้าจะเอาเบากว่านี้ ใช้แพ็ก ${lighter.priceThb} ได้ครับ ตอนนี้ผมตั้งแพ็กนี้ไว้ให้แล้ว`;
  }
  return "แพ็กนี้เบาสุดที่ตั้งให้แล้วครับ ถ้าพร้อมโอน พิมพ์ จ่ายเงิน ได้เลย";
}

export function buildPaymentPackageSelectedGentleRemindText() {
  return "ถ้าพร้อมโอน พิมพ์ จ่ายเงิน ได้เลยครับ";
}

export function buildPaymentPackageSelectedUnclearText({ tier = "short" } = {}) {
  if (tier === "micro") {
    return "พิมพ์ จ่ายเงิน หรือ พิมพ์ จ่าย เมื่อพร้อมโอนได้เลยครับ";
  }
  if (tier === "short") {
    return "ตอนนี้ผมตั้งแพ็กไว้ให้แล้ว ถ้าพร้อมโอน พิมพ์ จ่ายเงิน ได้เลยครับ";
  }
  return "ตอนนี้ผมตั้งแพ็กไว้ให้แล้ว ถ้าพร้อมโอน พิมพ์ จ่ายเงิน หรือ พิมพ์ จ่าย ได้เลยครับ";
}

export function buildAwaitingSlipStatusHintText({ paymentRef } = {}) {
  const base =
    "ตอนนี้ผมรอสลิปอยู่ครับ ส่งรูปสลิปโอนมาในแชตนี้ได้เลย";
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
      "รอสลิปอยู่ครับ ส่งรูปมาในแชตนี้ได้เลย",
      paymentRef,
    );
  }
  if (tier === "short") {
    return appendPaymentRefLine(
      "ตอนนี้ผมรอสลิปอยู่ครับ ส่งรูปสลิปมาในแชตนี้ได้เลย",
      paymentRef,
    );
  }
  return buildAwaitingSlipDeterministicGuidanceText({ paymentRef });
}

export function buildPendingVerifyStatusShortText({ paymentRef } = {}) {
  const base =
    "สลิปอยู่ระหว่างให้ทีมตรวจครับ รอแจ้งผลในแชตนี้ได้เลย ถ้ายังไม่ได้ส่งสลิป ส่งรูปมาได้เลย";
  return appendPaymentRefLine(base, paymentRef);
}

export function buildPendingVerifyGentleRemindText({ paymentRef } = {}) {
  const base = "รอตรวจสลิปอยู่ครับ แจ้งผลในแชตนี้เมื่อมีอัปเดต";
  return appendPaymentRefLine(base, paymentRef);
}

export function buildWaitingBirthdatePaymentDeferredRedirectText() {
  return "เดี๋ยวเรื่องชำระค่อยทำตามขั้นตอนครับ ตอนนี้ขอวันเกิดก่อน พิมพ์แบบ 19/08/1985 ได้เลย";
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