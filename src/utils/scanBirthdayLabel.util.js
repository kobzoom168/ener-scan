/**
 * Thai LINE scan display: weekday + short date in Buddhist Era (Bangkok).
 */

import { parseBirthdateInput } from "./birthdateParse.util.js";

const THAI_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/**
 * @param {string|undefined|null} birthdateInput DD/MM/YYYY etc. (see parseBirthdateInput)
 * @returns {string} e.g. "วันจันทร์ 19 ส.ค. 2528" or "" if invalid
 */
export function formatScanBirthdayLabelThai(birthdateInput) {
  const parsed = parseBirthdateInput(String(birthdateInput ?? "").trim());
  if (!parsed?.ok) return "";

  const wd = new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${parsed.isoDate}T12:00:00+07:00`));

  const mon = THAI_MONTH_SHORT[parsed.month - 1] || `${parsed.month}`;
  /** Buddhist Era = ค.ศ. + 543 (always derive from CE year on the parsed date). */
  const yearBE = parsed.yearCE + 543;
  return `${wd} ${parsed.day} ${mon} ${yearBE}`;
}
