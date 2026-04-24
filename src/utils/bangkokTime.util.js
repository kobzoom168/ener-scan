/** Thailand observes ICT (UTC+7) year-round; no DST. */

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Calendar date key YYYY-MM-DD in Asia/Bangkok (explicit; does not use process.env.TZ).
 * @param {Date} [d]
 * @returns {string}
 */
export function getBangkokDateKey(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("getBangkokDateKey: invalid date");
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  /** @type {Record<string, string>} */
  const by = Object.create(null);
  for (const p of parts) {
    if (p.type !== "literal") by[p.type] = p.value;
  }
  const y = by.year;
  const m = by.month;
  const day = by.day;
  if (!y || !m || !day) {
    throw new Error("getBangkokDateKey: missing Intl parts");
  }
  return `${y}-${m}-${day}`;
}

/**
 * UTC instant when the Bangkok wall-clock reads YYYY-MM-DD 00:00:00.000.
 * @param {string} dateKey YYYY-MM-DD (Bangkok calendar day)
 * @returns {Date}
 */
export function utcInstantForBangkokCalendarMidnight(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || "").trim());
  if (!m) throw new Error(`utcInstantForBangkokCalendarMidnight: bad dateKey "${dateKey}"`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    throw new Error(`utcInstantForBangkokCalendarMidnight: bad dateKey "${dateKey}"`);
  }
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0) - BANGKOK_OFFSET_MS);
}

/**
 * [start, end) UTC range for one Bangkok calendar day (Bangkok 00:00 inclusive → next day 00:00 exclusive).
 * @param {string} dateKey YYYY-MM-DD in Bangkok
 * @returns {{ start: Date, end: Date, startIso: string, endIso: string }}
 */
export function getBangkokDayUtcRangeExclusiveEnd(dateKey) {
  const start = utcInstantForBangkokCalendarMidnight(dateKey);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

/**
 * UTC range for the Bangkok calendar day that contains `now`.
 * @param {Date} [now]
 * @returns {{ dateKey: string, start: Date, end: Date, startIso: string, endIso: string }}
 */
export function getBangkokDayContainingInstantUtcRange(now = new Date()) {
  const dateKey = getBangkokDateKey(now);
  const { start, end, startIso, endIso } = getBangkokDayUtcRangeExclusiveEnd(dateKey);
  return { dateKey, start, end, startIso, endIso };
}

/**
 * Next Asia/Bangkok calendar midnight strictly after the start of the Bangkok day containing `now`
 * (i.e. start of the next Bangkok day = 00:00 Bangkok on the following local date).
 * @param {Date} [now]
 * @returns {Date}
 */
export function computeNextBangkokMidnightAfter(now = new Date()) {
  const { start } = getBangkokDayContainingInstantUtcRange(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}
