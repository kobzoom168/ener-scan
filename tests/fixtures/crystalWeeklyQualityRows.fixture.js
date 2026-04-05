/**
 * Weekly quality review row sets (same shape as dashboard / weekly input contract).
 * Reuses patterns from release-review fixtures where useful.
 */
import {
  RELEASE_REVIEW_ROWS_FALLBACK_HEAVY_SPIKE,
  RELEASE_REVIEW_ROWS_HEALTHY,
  RELEASE_REVIEW_ROWS_OBJECT_FAMILY_SPIKE,
  RELEASE_REVIEW_ROWS_SOFT_DRIFT_ONLY,
  RELEASE_REVIEW_ROWS_THAI_HEAVY_CRYSTAL_STABLE,
  RELEASE_REVIEW_ROWS_WEAK_PROTECT_DEFAULT_DRIFT,
} from "./crystalReleaseReviewCases.fixture.js";

export const WEEKLY_WINDOW = {
  windowStart: "2026-03-24T00:00:00.000Z",
  windowEnd: "2026-03-31T00:00:00.000Z",
  generatedAt: "2026-03-31T12:00:00.000Z",
};

/** @returns {object} */
export function weeklyPayload(rows, overrides = {}) {
  return {
    rows,
    windowStart: WEEKLY_WINDOW.windowStart,
    windowEnd: WEEKLY_WINDOW.windowEnd,
    generatedAt: WEEKLY_WINDOW.generatedAt,
    ...overrides,
  };
}

export const CRYSTAL_WEEKLY_ROWS_HEALTHY_WEEK = RELEASE_REVIEW_ROWS_HEALTHY;

export const CRYSTAL_WEEKLY_ROWS_SOFT_DRIFT_WEEK = RELEASE_REVIEW_ROWS_SOFT_DRIFT_ONLY;

export const CRYSTAL_WEEKLY_ROWS_FALLBACK_HEAVY_WEEK = RELEASE_REVIEW_ROWS_FALLBACK_HEAVY_SPIKE;

export const CRYSTAL_WEEKLY_ROWS_HARD_MISMATCH_WEEK = RELEASE_REVIEW_ROWS_OBJECT_FAMILY_SPIKE;

export const CRYSTAL_WEEKLY_ROWS_THAI_HEAVY_CRYSTAL_STABLE = RELEASE_REVIEW_ROWS_THAI_HEAVY_CRYSTAL_STABLE;

export const CRYSTAL_WEEKLY_ROWS_WEAK_PROTECT_DRIFT_WEEK = RELEASE_REVIEW_ROWS_WEAK_PROTECT_DEFAULT_DRIFT;
