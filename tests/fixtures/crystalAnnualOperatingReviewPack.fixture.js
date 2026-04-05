/**
 * Annual operating review fixtures (Phase 13).
 * Composes two half-year inputs (see `crystalHalfYearBusinessReviewPack.fixture.js`).
 */

import {
  CRYSTAL_HALF_YEAR_INPUT_EXCELLENT,
  CRYSTAL_HALF_YEAR_INPUT_GOOD_SOFT_DRIFT,
  CRYSTAL_HALF_YEAR_INPUT_INVESTIGATE_WEAK_PROTECT,
  CRYSTAL_HALF_YEAR_INPUT_ESCALATE_HARD_CLUSTERS,
  CRYSTAL_HALF_YEAR_INPUT_WATCH_RECURRING_GENERIC,
  CRYSTAL_HALF_YEAR_INPUT_CRYSTAL_DECLINE,
  CRYSTAL_HALF_YEAR_INPUT_THAI_HEAVY_STABLE,
} from "./crystalHalfYearBusinessReviewPack.fixture.js";

export const YEAR_WINDOW_2026 = {
  yearWindowStart: "2026-01-01T00:00:00.000Z",
  yearWindowEnd: "2026-12-31T23:59:59.999Z",
  generatedAt: "2027-01-05T12:00:00.000Z",
};

const Q3_DATES = [
  ["2026-07-01T00:00:00.000Z", "2026-07-31T23:59:59.999Z"],
  ["2026-08-01T00:00:00.000Z", "2026-08-31T23:59:59.999Z"],
  ["2026-09-01T00:00:00.000Z", "2026-09-30T23:59:59.999Z"],
];

const Q4_DATES = [
  ["2026-10-01T00:00:00.000Z", "2026-10-31T23:59:59.999Z"],
  ["2026-11-01T00:00:00.000Z", "2026-11-30T23:59:59.999Z"],
  ["2026-12-01T00:00:00.000Z", "2026-12-31T23:59:59.999Z"],
];

/**
 * @param {unknown[]} qMonths
 * @param {[string, string][]} dates
 */
function shiftQuarterMonths(qMonths, dates) {
  return qMonths.map((entry, i) => {
    const e = /** @type {{ rollup?: object, anomalyEvents?: unknown[] }} */ (entry);
    const r = e.rollup;
    if (!r) return entry;
    const next = {
      rollup: { ...r, monthWindowStart: dates[i][0], monthWindowEnd: dates[i][1] },
    };
    if (e.anomalyEvents) next.anomalyEvents = e.anomalyEvents;
    return next;
  });
}

/**
 * @param {{ halfYearWindowStart: string, halfYearWindowEnd: string, quarters: { months: unknown[] }[] }} h1HalfYear
 */
function twoHalfYears(h1HalfYear) {
  const [hq1, hq2] = h1HalfYear.quarters;
  return {
    halfYears: [
      {
        halfYearWindowStart: h1HalfYear.halfYearWindowStart,
        halfYearWindowEnd: h1HalfYear.halfYearWindowEnd,
        quarters: h1HalfYear.quarters,
      },
      {
        halfYearWindowStart: "2026-07-01T00:00:00.000Z",
        halfYearWindowEnd: "2026-12-31T23:59:59.999Z",
        quarters: [
          {
            quarterWindowStart: "2026-07-01T00:00:00.000Z",
            quarterWindowEnd: "2026-09-30T23:59:59.999Z",
            months: shiftQuarterMonths(hq1.months, Q3_DATES),
          },
          {
            quarterWindowStart: "2026-10-01T00:00:00.000Z",
            quarterWindowEnd: "2026-12-31T23:59:59.999Z",
            months: shiftQuarterMonths(hq2.months, Q4_DATES),
          },
        ],
      },
    ],
  };
}

/** Excellent year — two excellent half-years. */
export const CRYSTAL_ANNUAL_INPUT_EXCELLENT = {
  ...YEAR_WINDOW_2026,
  ...twoHalfYears(CRYSTAL_HALF_YEAR_INPUT_EXCELLENT),
};

/** Good year — soft drift. */
export const CRYSTAL_ANNUAL_INPUT_GOOD_SOFT_DRIFT = {
  ...YEAR_WINDOW_2026,
  ...twoHalfYears(CRYSTAL_HALF_YEAR_INPUT_GOOD_SOFT_DRIFT),
};

/** Watch — recurring generic fallback. */
export const CRYSTAL_ANNUAL_INPUT_WATCH_RECURRING_GENERIC = {
  ...YEAR_WINDOW_2026,
  ...twoHalfYears(CRYSTAL_HALF_YEAR_INPUT_WATCH_RECURRING_GENERIC),
};

/** Investigate — weak-protect. */
export const CRYSTAL_ANNUAL_INPUT_INVESTIGATE_WEAK_PROTECT = {
  ...YEAR_WINDOW_2026,
  ...twoHalfYears(CRYSTAL_HALF_YEAR_INPUT_INVESTIGATE_WEAK_PROTECT),
};

/** Escalate — hard clusters. */
export const CRYSTAL_ANNUAL_INPUT_ESCALATE_HARD_CLUSTERS = {
  ...YEAR_WINDOW_2026,
  ...twoHalfYears(CRYSTAL_HALF_YEAR_INPUT_ESCALATE_HARD_CLUSTERS),
};

/** Crystal-specific decline year. */
export const CRYSTAL_ANNUAL_INPUT_CRYSTAL_DECLINE = {
  ...YEAR_WINDOW_2026,
  ...twoHalfYears(CRYSTAL_HALF_YEAR_INPUT_CRYSTAL_DECLINE),
};

/** Thai-heavy stable year. */
export const CRYSTAL_ANNUAL_INPUT_THAI_HEAVY_STABLE = {
  ...YEAR_WINDOW_2026,
  ...twoHalfYears(CRYSTAL_HALF_YEAR_INPUT_THAI_HEAVY_STABLE),
};
