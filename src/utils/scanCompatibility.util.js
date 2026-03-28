/**
 * Deterministic scan compatibility from birthdate (rule-based, Bangkok calendar).
 */

import { parseBirthdateInput } from "./birthdateParse.util.js";

/**
 * @param {string} weekdayLong — e.g. from Intl th-TH weekday in Asia/Bangkok
 * @returns {number}
 */
function weekdayBonusTh(weekdayLong) {
  const w = String(weekdayLong);
  if (w.includes("อาทิตย์") || w.includes("จันทร์")) return 10;
  if (w.includes("พุธ") || w.includes("พฤหัส")) return 8;
  return 5;
}

/**
 * @param {string} birthdateString
 * @returns {number} percentage 65–95
 */
export function calculateCompatibilityScore(birthdateString) {
  const parsed = parseBirthdateInput(String(birthdateString || "").trim());
  if (!parsed?.ok) return 70;

  const wd = new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${parsed.isoDate}T12:00:00+07:00`));

  let score = 70 + weekdayBonusTh(wd);
  const month = parsed.month;
  score += month % 2 === 1 ? 5 : 3;

  return Math.min(95, Math.max(65, score));
}

/**
 * @param {string} birthdateString
 * @returns {string} e.g. "83%"
 */
export function calculateCompatibility(birthdateString) {
  return `${calculateCompatibilityScore(birthdateString)}%`;
}

/** Alias for callers that expect a numeric 0–100 percent. */
export function calculateCompatibilityPercentNumber(birthdateString) {
  return calculateCompatibilityScore(birthdateString);
}

/**
 * Age in full years at `asOf` (Bangkok calendar).
 * @param {string} birthdateString
 * @param {Date} [asOf]
 * @returns {number | null}
 */
export function calculateUserAgeFromBirthdate(birthdateString, asOf = new Date()) {
  const parsed = parseBirthdateInput(String(birthdateString || "").trim());
  if (!parsed?.ok) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(asOf);

  const ay = Number(parts.find((p) => p.type === "year")?.value);
  const am = Number(parts.find((p) => p.type === "month")?.value);
  const ad = Number(parts.find((p) => p.type === "day")?.value);
  const [y, mo, d] = parsed.isoDate.split("-").map(Number);

  if (![ay, am, ad, y, mo, d].every((n) => Number.isFinite(n))) return null;

  let age = ay - y;
  if (am < mo || (am === mo && ad < d)) age -= 1;
  return Math.max(0, age);
}
