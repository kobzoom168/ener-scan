/**
 * Thai LINE-friendly birthdate parsing: CE/BE years, multiple separators,
 * calendar validation, and UX-oriented detection (looksLike vs unrelated text).
 *
 * BE (พ.ศ.): 4-digit years ≥ 2400 are converted to CE with −543 (e.g. 2538 → 1995).
 */

const MIN_CE_YEAR = 1900;
/** BE year corresponding to MIN_CE_YEAR (1900 + 543). */
const MIN_BE_YEAR = 2443;

function getCurrentYearBangkok() {
  const y = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(new Date());
  return Number(y);
}

export function isLeapYear(yearCE) {
  const y = Number(yearCE);
  return y % 400 === 0 || (y % 4 === 0 && y % 100 !== 0);
}

/** @param {number} month 1-12 @param {number} yearCE */
export function daysInMonth(month, yearCE) {
  const m = Number(month);
  const y = Number(yearCE);
  const monthDays = [
    31,
    isLeapYear(y) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return monthDays[m - 1] ?? 0;
}

/**
 * True if the message looks like someone tried to type a date (digits + separators),
 * and not unrelated Thai/plain text.
 */
export function looksLikeBirthdateInput(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  // Unrelated Thai prose / keywords — not treated as a date attempt.
  if (/[\u0E00-\u0E7F]/.test(raw)) return false;

  const digits = (raw.match(/\d/g) || []).length;
  if (digits < 4) return false;

  if (/[/.-]/.test(raw)) return true;

  if (/\d+\s+\d+\s+\d+/.test(raw)) return true;

  const compact = raw.replace(/\s/g, "");
  if (/^\d{6,8}$/.test(compact)) return true;

  return false;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** @returns {object} Parsed birthdate or failure object with `reason`. */
export function parseBirthdateInput(text) {
  const originalInput = String(text ?? "").trim();
  if (!originalInput) {
    return { ok: false, reason: "invalid_format", originalInput };
  }

  const currentYear = getCurrentYearBangkok();
  const maxCEYear = currentYear;
  const maxBEYear = currentYear + 543;

  let day;
  let month;
  let yearRaw;

  const spaceMatch = originalInput.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/);
  if (spaceMatch) {
    day = Number(spaceMatch[1]);
    month = Number(spaceMatch[2]);
    yearRaw = spaceMatch[3];
  } else {
    const delimMatch = originalInput.match(
      /^(\d{1,2})\s*([/.-])\s*(\d{1,2})\s*\2\s*(\d{4})$/
    );
    if (delimMatch) {
      day = Number(delimMatch[1]);
      month = Number(delimMatch[3]);
      yearRaw = delimMatch[4];
    } else {
      return { ok: false, reason: "invalid_format", originalInput };
    }
  }

  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    yearRaw.length !== 4
  ) {
    return { ok: false, reason: "invalid_format", originalInput };
  }

  const yearNum = Number(yearRaw);
  if (!Number.isInteger(yearNum)) {
    return { ok: false, reason: "invalid_format", originalInput };
  }

  let yearCE;

  if (yearNum >= 2400) {
    if (yearNum < MIN_BE_YEAR || yearNum > maxBEYear) {
      return { ok: false, reason: "out_of_range", originalInput };
    }
    yearCE = yearNum - 543;
  } else {
    yearCE = yearNum;
    if (yearCE < MIN_CE_YEAR || yearCE > maxCEYear) {
      return { ok: false, reason: "out_of_range", originalInput };
    }
  }

  if (month < 1 || month > 12) {
    return { ok: false, reason: "invalid_date", originalInput };
  }

  const maxDay = daysInMonth(month, yearCE);
  if (day < 1 || day > maxDay) {
    return { ok: false, reason: "invalid_date", originalInput };
  }

  const yearBE = yearCE + 543;
  const normalizedDisplay = `${pad2(day)}/${pad2(month)}/${yearCE}`;
  const normalizedDisplayBE = `${pad2(day)}/${pad2(month)}/${yearBE}`;
  const isoDate = `${yearCE}-${pad2(month)}-${pad2(day)}`;

  return {
    ok: true,
    day,
    month,
    yearCE,
    yearBE,
    normalizedDisplay,
    normalizedDisplayBE,
    isoDate,
    originalInput,
  };
}
