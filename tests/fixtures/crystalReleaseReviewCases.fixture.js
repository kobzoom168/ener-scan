/**
 * Row sets for release-review scenarios (shape matches `routingWordingMetrics` / dashboard rows).
 * Aggregated in tests via `aggregateCrystalRoutingDashboardSummary`.
 */
import { aggregateCrystalRoutingDashboardSummary } from "../../src/utils/crystalRoutingDashboardSummary.util.js";

/** @returns {import("../../src/utils/crystalRoutingDashboardSummary.util.js").CrystalRoutingDashboardRow} */
function crystalAligned(overrides = {}) {
  return {
    routingWordingAlignmentStatus: "aligned",
    routingWordingMismatchType: "none",
    routingWordingMismatchSeverity: "none",
    isCrystalRoutingCase: true,
    routingObjectFamily: "crystal",
    visibleWordingCrystalSpecific: true,
    visibleWordingDecisionSource: "db_crystal",
    visibleWordingFallbackLevel: 0,
    crystalRoutingRuleId: "crystal_rg_money_work",
    crystalRoutingStrategy: "early_exit",
    ...overrides,
  };
}

/** Soft drift: 70% aligned, 30% soft (specificity-only; keeps genericFallbackRate at 0 for isolated soft signal). */
export const RELEASE_REVIEW_ROWS_SOFT_DRIFT_ONLY = [
  ...Array.from({ length: 70 }, () => crystalAligned()),
  ...Array.from({ length: 30 }, () =>
    crystalAligned({
      routingWordingAlignmentStatus: "soft_mismatch",
      routingWordingMismatchType: "crystal_specificity_mismatch",
      routingWordingMismatchSeverity: "low",
      visibleWordingCrystalSpecific: true,
      visibleWordingDecisionSource: "db_crystal",
    }),
  ),
];

/** Investigate: fallback-heavy spike (20% of crystal rows). */
export const RELEASE_REVIEW_ROWS_FALLBACK_HEAVY_SPIKE = [
  ...Array.from({ length: 80 }, () => crystalAligned()),
  ...Array.from({ length: 20 }, () =>
    crystalAligned({
      routingWordingAlignmentStatus: "soft_mismatch",
      routingWordingMismatchType: "fallback_overuse",
      visibleWordingDecisionSource: "db_crystal",
      isFallbackHeavy: true,
      visibleWordingFallbackLevel: 2,
      crystalRoutingRuleId: "crystal_rg_spiritual_growth",
    }),
  ),
];

/** Rollback candidate: object-family mismatch cluster. */
export const RELEASE_REVIEW_ROWS_OBJECT_FAMILY_SPIKE = [
  ...Array.from({ length: 60 }, () => crystalAligned()),
  ...Array.from({ length: 40 }, () =>
    crystalAligned({
      routingWordingAlignmentStatus: "hard_mismatch",
      routingWordingMismatchType: "object_family_mismatch",
      routingWordingMismatchSeverity: "high",
      visibleWordingObjectFamilyUsed: "thai_amulet",
      visibleWordingCrystalSpecific: false,
      visibleWordingDecisionSource: "db_family",
    }),
  ),
];

/** Thai-heavy traffic: crystal subset should remain pass when healthy. */
export const RELEASE_REVIEW_ROWS_THAI_HEAVY_CRYSTAL_STABLE = [
  ...Array.from({ length: 100 }, () => ({
    routingWordingAlignmentStatus: "not_applicable",
    routingWordingMismatchType: "not_applicable",
    isCrystalRoutingCase: false,
    routingObjectFamily: "thai_amulet",
    visibleWordingCrystalSpecific: false,
    visibleWordingDecisionSource: "db_family",
    crystalRoutingRuleId: null,
  })),
  ...Array.from({ length: 25 }, () => crystalAligned()),
];

/** Weak-protect default drift: high share of default rule among crystal rows. */
export const RELEASE_REVIEW_ROWS_WEAK_PROTECT_DEFAULT_DRIFT = Array.from({ length: 50 }, () =>
  crystalAligned({
    crystalRoutingRuleId: "crystal_rg_weak_protect_default",
    crystalRoutingStrategy: "weak_protect",
  }),
);

/** Healthy: all aligned crystal (n=80). */
export const RELEASE_REVIEW_ROWS_HEALTHY = Array.from({ length: 80 }, () => crystalAligned());

export const SUMMARY_HEALTHY = aggregateCrystalRoutingDashboardSummary(RELEASE_REVIEW_ROWS_HEALTHY);
export const SUMMARY_SOFT_DRIFT = aggregateCrystalRoutingDashboardSummary(RELEASE_REVIEW_ROWS_SOFT_DRIFT_ONLY);
export const SUMMARY_FALLBACK_SPIKE = aggregateCrystalRoutingDashboardSummary(
  RELEASE_REVIEW_ROWS_FALLBACK_HEAVY_SPIKE,
);
export const SUMMARY_OBJECT_FAMILY_SPIKE = aggregateCrystalRoutingDashboardSummary(
  RELEASE_REVIEW_ROWS_OBJECT_FAMILY_SPIKE,
);
export const SUMMARY_THAI_HEAVY = aggregateCrystalRoutingDashboardSummary(
  RELEASE_REVIEW_ROWS_THAI_HEAVY_CRYSTAL_STABLE,
);
export const SUMMARY_WEAK_PROTECT_DRIFT = aggregateCrystalRoutingDashboardSummary(
  RELEASE_REVIEW_ROWS_WEAK_PROTECT_DEFAULT_DRIFT,
);
