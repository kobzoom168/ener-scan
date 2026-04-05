/**
 * Half-year business review input fixtures (Phase 12).
 * Composes two quarterly slices (see `crystalQuarterlyReviewPack.fixture.js`).
 */

import {
  CRYSTAL_QUARTER_INPUT_CRYSTAL_DECLINE,
  CRYSTAL_QUARTER_INPUT_ESCALATE_HARD_CLUSTERS,
  CRYSTAL_QUARTER_INPUT_EXCELLENT,
  CRYSTAL_QUARTER_INPUT_GOOD_SOFT_DRIFT,
  CRYSTAL_QUARTER_INPUT_INVESTIGATE_WEAK_PROTECT,
  CRYSTAL_QUARTER_INPUT_THAI_HEAVY_STABLE,
  CRYSTAL_QUARTER_INPUT_WATCH_RECURRING_GENERIC,
} from "./crystalQuarterlyReviewPack.fixture.js";

export const HALF_YEAR_WINDOW_H1_2026 = {
  halfYearWindowStart: "2026-01-01T00:00:00.000Z",
  halfYearWindowEnd: "2026-06-30T23:59:59.999Z",
  generatedAt: "2026-07-02T12:00:00.000Z",
};

const Q2_DATES = [
  ["2026-04-01T00:00:00.000Z", "2026-04-30T23:59:59.999Z"],
  ["2026-05-01T00:00:00.000Z", "2026-05-31T23:59:59.999Z"],
  ["2026-06-01T00:00:00.000Z", "2026-06-30T23:59:59.999Z"],
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

function twoQuarters(q1) {
  return {
    quarters: [
      {
        quarterWindowStart: "2026-01-01T00:00:00.000Z",
        quarterWindowEnd: "2026-03-31T23:59:59.999Z",
        months: q1.months,
      },
      {
        quarterWindowStart: "2026-04-01T00:00:00.000Z",
        quarterWindowEnd: "2026-06-30T23:59:59.999Z",
        months: shiftQuarterMonths(q1.months, Q2_DATES),
      },
    ],
  };
}

/** Excellent half-year — two strong quarters. */
export const CRYSTAL_HALF_YEAR_INPUT_EXCELLENT = {
  ...HALF_YEAR_WINDOW_H1_2026,
  ...twoQuarters(CRYSTAL_QUARTER_INPUT_EXCELLENT),
};

/** Good half-year — soft drift both quarters. */
export const CRYSTAL_HALF_YEAR_INPUT_GOOD_SOFT_DRIFT = {
  ...HALF_YEAR_WINDOW_H1_2026,
  ...twoQuarters(CRYSTAL_QUARTER_INPUT_GOOD_SOFT_DRIFT),
};

/** Watch — recurring generic fallback across both quarters. */
export const CRYSTAL_HALF_YEAR_INPUT_WATCH_RECURRING_GENERIC = {
  ...HALF_YEAR_WINDOW_H1_2026,
  ...twoQuarters(CRYSTAL_QUARTER_INPUT_WATCH_RECURRING_GENERIC),
};

/** Investigate — weak-protect / fallback-heavy both quarters. */
export const CRYSTAL_HALF_YEAR_INPUT_INVESTIGATE_WEAK_PROTECT = {
  ...HALF_YEAR_WINDOW_H1_2026,
  ...twoQuarters(CRYSTAL_QUARTER_INPUT_INVESTIGATE_WEAK_PROTECT),
};

/** Escalate — hard mismatch clusters both quarters. */
export const CRYSTAL_HALF_YEAR_INPUT_ESCALATE_HARD_CLUSTERS = {
  ...HALF_YEAR_WINDOW_H1_2026,
  ...twoQuarters(CRYSTAL_QUARTER_INPUT_ESCALATE_HARD_CLUSTERS),
};

/** Crystal-specific decline — two quarters of decline-heavy months (from quarterly decline fixture ×2). */
export const CRYSTAL_HALF_YEAR_INPUT_CRYSTAL_DECLINE = {
  ...HALF_YEAR_WINDOW_H1_2026,
  ...twoQuarters(CRYSTAL_QUARTER_INPUT_CRYSTAL_DECLINE),
};

/** Thai-heavy but crystal-stable — two quarters. */
export const CRYSTAL_HALF_YEAR_INPUT_THAI_HEAVY_STABLE = {
  ...HALF_YEAR_WINDOW_H1_2026,
  ...twoQuarters(CRYSTAL_QUARTER_INPUT_THAI_HEAVY_STABLE),
};
