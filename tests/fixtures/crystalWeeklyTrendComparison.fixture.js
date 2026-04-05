/**
 * Pre-built Phase 7 weekly summaries for trend tests (week-over-week).
 */
import { buildCrystalWeeklyQualityReview } from "../../src/utils/crystalWeeklyQualityReview.util.js";
import {
  CRYSTAL_WEEKLY_ROWS_FALLBACK_HEAVY_WEEK,
  CRYSTAL_WEEKLY_ROWS_HARD_MISMATCH_WEEK,
  CRYSTAL_WEEKLY_ROWS_HEALTHY_WEEK,
  CRYSTAL_WEEKLY_ROWS_SOFT_DRIFT_WEEK,
  CRYSTAL_WEEKLY_ROWS_THAI_HEAVY_CRYSTAL_STABLE,
  CRYSTAL_WEEKLY_ROWS_WEAK_PROTECT_DRIFT_WEEK,
  WEEKLY_WINDOW,
} from "./crystalWeeklyQualityRows.fixture.js";

const W_PREV = {
  ...WEEKLY_WINDOW,
  windowStart: "2026-03-17T00:00:00.000Z",
  windowEnd: "2026-03-24T00:00:00.000Z",
};

const W_CURR = {
  ...WEEKLY_WINDOW,
  windowStart: "2026-03-24T00:00:00.000Z",
  windowEnd: "2026-03-31T00:00:00.000Z",
};

export const TREND_SUMMARY_PREV_HEALTHY = buildCrystalWeeklyQualityReview(
  CRYSTAL_WEEKLY_ROWS_HEALTHY_WEEK,
  W_PREV,
);

export const TREND_SUMMARY_CURR_HEALTHY = buildCrystalWeeklyQualityReview(
  CRYSTAL_WEEKLY_ROWS_HEALTHY_WEEK,
  W_CURR,
);

export const TREND_SUMMARY_CURR_SOFT_DRIFT = buildCrystalWeeklyQualityReview(
  CRYSTAL_WEEKLY_ROWS_SOFT_DRIFT_WEEK,
  W_CURR,
);

export const TREND_SUMMARY_CURR_FALLBACK_HEAVY = buildCrystalWeeklyQualityReview(
  CRYSTAL_WEEKLY_ROWS_FALLBACK_HEAVY_WEEK,
  W_CURR,
);

export const TREND_SUMMARY_CURR_HARD_MISMATCH = buildCrystalWeeklyQualityReview(
  CRYSTAL_WEEKLY_ROWS_HARD_MISMATCH_WEEK,
  W_CURR,
);

export const TREND_SUMMARY_PREV_THAI_HEAVY = buildCrystalWeeklyQualityReview(
  CRYSTAL_WEEKLY_ROWS_THAI_HEAVY_CRYSTAL_STABLE,
  W_PREV,
);

export const TREND_SUMMARY_CURR_THAI_HEAVY = buildCrystalWeeklyQualityReview(
  CRYSTAL_WEEKLY_ROWS_THAI_HEAVY_CRYSTAL_STABLE,
  W_CURR,
);

export const TREND_SUMMARY_CURR_WEAK_PROTECT = buildCrystalWeeklyQualityReview(
  CRYSTAL_WEEKLY_ROWS_WEAK_PROTECT_DRIFT_WEEK,
  W_CURR,
);

/** Half of crystal rows lose crystal-specific flag vs healthy week (investigate: specific rate drop). */
const crystalAligned = (overrides = {}) => ({
  routingWordingAlignmentStatus: "aligned",
  routingWordingMismatchType: "none",
  isCrystalRoutingCase: true,
  routingObjectFamily: "crystal",
  visibleWordingCrystalSpecific: true,
  visibleWordingDecisionSource: "db_crystal",
  visibleWordingFallbackLevel: 0,
  crystalRoutingRuleId: "crystal_rg_money_work",
  crystalRoutingStrategy: "early_exit",
  ...overrides,
});

export const CRYSTAL_ROWS_SPECIFIC_DROP_CURR = [
  ...Array.from({ length: 40 }, () => crystalAligned({ visibleWordingCrystalSpecific: true })),
  ...Array.from({ length: 40 }, () =>
    crystalAligned({
      visibleWordingCrystalSpecific: false,
      visibleWordingDecisionSource: "db_crystal",
    }),
  ),
];

export const TREND_SUMMARY_CURR_CRYSTAL_SPECIFIC_DROP = buildCrystalWeeklyQualityReview(
  CRYSTAL_ROWS_SPECIFIC_DROP_CURR,
  W_CURR,
);
