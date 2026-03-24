/**
 * Single source of truth for user-visible dates/times: Asia/Bangkok + th-TH.
 * DB remains UTC/ISO; format only at render boundaries.
 */

export const BANGKOK_TIME_ZONE = "Asia/Bangkok";
export const TH_LOCALE = "th-TH";

/**
 * @param {unknown} value
 * @returns {Date | null}
 */
function parseInstant(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  const d = new Date(/** @type {string | number} */ (value));
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Date + time in Bangkok (for LINE history, stats, report hero, logs).
 * @param {unknown} value ISO string, timestamp, or Date
 * @returns {string}
 */
export function formatBangkokDateTime(value) {
  const d = parseInstant(value);
  if (!d) return "-";
  return new Intl.DateTimeFormat(TH_LOCALE, {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Date only (Bangkok calendar day).
 * @param {unknown} value
 * @returns {string}
 */
export function formatBangkokDate(value) {
  const d = parseInstant(value);
  if (!d) return "-";
  return new Intl.DateTimeFormat(TH_LOCALE, {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(d);
}

/**
 * Time of day only (Bangkok).
 * @param {unknown} value
 * @returns {string}
 */
export function formatBangkokTime(value) {
  const d = parseInstant(value);
  if (!d) return "-";
  return new Intl.DateTimeFormat(TH_LOCALE, {
    timeZone: BANGKOK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
