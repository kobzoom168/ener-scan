/**
 * Scan offer access: structured context for copy layer (PR2) + shared gate math (PR1).
 * Does not generate user-facing wording.
 */

import { computeNextBangkokMidnightAfter } from "../utils/bangkokTime.util.js";

/**
 * @param {string|null|undefined} paidUntil
 * @param {number} paidRemainingScans
 * @param {Date} now
 */
export function computePaidActive(paidUntil, paidRemainingScans, now = new Date()) {
  const nowMs = now.getTime();
  const paidUntilMs = paidUntil ? Date.parse(String(paidUntil)) : NaN;
  return (
    Number.isFinite(paidUntilMs) &&
    paidUntilMs > nowMs &&
    paidRemainingScans > 0
  );
}

/**
 * Next Asia/Bangkok calendar midnight (same convention as free daily quota; not server TZ).
 * @param {Date} now
 */
export function computeNextLocalMidnightAfter(now = new Date()) {
  return computeNextBangkokMidnightAfter(now);
}

/**
 * Short Thai label for PR1 (placeholder for PR2 copy builder).
 * @param {Date} nextResetAt
 */
export function formatNextResetLabelThai(nextResetAt) {
  const d = nextResetAt instanceof Date ? nextResetAt : new Date(nextResetAt);
  if (!Number.isFinite(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `พรุ่งนี้เวลา ${hh}:${mm} น. (รีเซ็ตโควตฟรี)`;
}

/**
 * Same branching order as `checkScanAccess` (paid first, then free, else paywall).
 *
 * @param {object} opts
 * @param {number} opts.freeUsedToday
 * @param {number} opts.freeQuotaPerDay
 * @param {string|null|undefined} opts.paidUntil
 * @param {number} opts.paidRemainingScans
 * @param {Date} [opts.now]
 */
export function decideScanGate({
  freeUsedToday,
  freeQuotaPerDay,
  paidUntil,
  paidRemainingScans,
  now = new Date(),
}) {
  const used = Number.isFinite(freeUsedToday) ? freeUsedToday : 0;
  const quota = Number.isFinite(freeQuotaPerDay) ? freeQuotaPerDay : 1;
  const paidRem = Number.isFinite(paidRemainingScans) ? paidRemainingScans : 0;

  const freeRemainingToday = Math.max(0, quota - used);
  const paidActive = computePaidActive(paidUntil, paidRem, now);

  if (paidActive) {
    return {
      allowed: true,
      reason: "paid",
      remaining: paidRem,
      usedScans: used,
      freeScansLimit: quota,
      freeScansRemaining: freeRemainingToday,
      paidUntil: paidUntil ? String(paidUntil) : null,
    };
  }

  if (used < quota) {
    return {
      allowed: true,
      reason: "free",
      remaining: freeRemainingToday,
      usedScans: used,
      freeScansLimit: quota,
      freeScansRemaining: freeRemainingToday,
      paidUntil: paidUntil ? String(paidUntil) : null,
    };
  }

  return {
    allowed: false,
    reason: "payment_required",
    remaining: 0,
    usedScans: used,
    freeScansLimit: quota,
    freeScansRemaining: 0,
    paidUntil: paidUntil ? String(paidUntil) : null,
  };
}

/**
 * @typedef {Object} ScanOfferAccessContext
 * @property {"free_available"|"free_quota_low"|"free_quota_exhausted"|"paid_active"|"paid_quota_exhausted"} scenario
 * @property {number} freeQuotaPerDay
 * @property {number} freeUsedToday
 * @property {number} freeRemainingToday
 * @property {Date} nextResetAt
 * @property {string} nextResetLabel
 * @property {number} paidPriceThb
 * @property {number} paidScanCount
 * @property {number} paidWindowHours
 * @property {string} offerLabel
 * @property {string} offerConfigVersion
 * @property {string|null} paidUntil
 * @property {number} paidRemainingScans
 * @property {boolean} paidActive
 */

/**
 * @param {object} opts
 * @param {import("./scanOffer.loader.js").NormalizedScanOffer} opts.offer
 * @param {number} opts.freeUsedToday
 * @param {string|null|undefined} opts.paidUntil
 * @param {number} opts.paidRemainingScans
 * @param {Date} [opts.now]
 * @returns {ScanOfferAccessContext}
 */
export function resolveScanOfferAccessContext({
  offer,
  freeUsedToday,
  paidUntil,
  paidRemainingScans,
  now = new Date(),
}) {
  const used = Number.isFinite(freeUsedToday) ? freeUsedToday : 0;
  const freeQuotaPerDay = offer.freeQuotaPerDay;
  const freeRemainingToday = Math.max(
    0,
    freeQuotaPerDay - used,
  );

  const nowMs = now.getTime();
  const paidRem = Number.isFinite(paidRemainingScans) ? paidRemainingScans : 0;
  const paidUntilMs = paidUntil ? Date.parse(String(paidUntil)) : NaN;
  const paidActive = computePaidActive(paidUntil, paidRem, now);

  /** @type {ScanOfferAccessContext["scenario"]} */
  let scenario;
  if (paidActive) {
    scenario = "paid_active";
  } else if (freeRemainingToday > 0) {
    scenario =
      freeQuotaPerDay > 1 && freeRemainingToday === 1
        ? "free_quota_low"
        : "free_available";
  } else if (
    paidUntil &&
    (paidRem === 0 ||
      (Number.isFinite(paidUntilMs) && paidUntilMs <= nowMs))
  ) {
    scenario = "paid_quota_exhausted";
  } else {
    scenario = "free_quota_exhausted";
  }

  const nextResetAt = computeNextLocalMidnightAfter(now);
  const nextResetLabel = formatNextResetLabelThai(nextResetAt);

  return {
    scenario,
    freeQuotaPerDay,
    freeUsedToday: used,
    freeRemainingToday,
    nextResetAt,
    nextResetLabel,
    paidPriceThb: offer.paidPriceThb,
    paidScanCount: offer.paidScanCount,
    paidWindowHours: offer.paidWindowHours,
    offerLabel: offer.label,
    offerConfigVersion: offer.configVersion,
    paidUntil: paidUntil ? String(paidUntil) : null,
    paidRemainingScans: paidRem,
    paidActive,
  };
}
