/**
 * Monthly rollup fixtures for crystal scorecard (Phase 10).
 * Rates are 0..1 for the crystal slice; optional fields mirror Phase 9 rollup contract.
 */

export const CRYSTAL_MONTHLY_WINDOW = {
  monthWindowStart: "2026-03-01T00:00:00.000Z",
  monthWindowEnd: "2026-03-31T23:59:59.999Z",
  generatedAt: "2026-04-02T12:00:00.000Z",
};

/** Strong month — template score in excellent band. */
export const CRYSTAL_MONTHLY_ROLLUP_EXCELLENT_MONTH = {
  ...CRYSTAL_MONTHLY_WINDOW,
  rollupVersion: "fixture-1",
  totalCrystalCases: 5200,
  notApplicableRowCount: 400,
  alignedRate: 0.93,
  softMismatchRate: 0.015,
  hardMismatchRate: 0.003,
  crystalSpecificSurfaceRate: 0.91,
  genericFallbackRate: 0.03,
  fallbackHeavyRate: 0.015,
  weakProtectDefaultRate: 0.008,
  recurringAnomalyCount: 0,
  hardMismatchClusterCount: 0,
  genericFallbackClusterCount: 0,
  objectFamilyMismatchClusterCount: 0,
  categoryMismatchClusterCount: 0,
  crystalSpecificUsageDropFlag: false,
  trendStableWeeks: 4,
  trendWatchWeeks: 0,
  trendInvestigateWeeks: 0,
  trendEscalateWeeks: 0,
  topRoutingRuleShare: 0.34,
  topWordingSourceShare: 0.28,
};

/** Good month with soft drift — good band. */
export const CRYSTAL_MONTHLY_ROLLUP_GOOD_SOFT_DRIFT_MONTH = {
  ...CRYSTAL_MONTHLY_WINDOW,
  totalCrystalCases: 4800,
  notApplicableRowCount: 600,
  alignedRate: 0.84,
  softMismatchRate: 0.065,
  hardMismatchRate: 0.012,
  crystalSpecificSurfaceRate: 0.8,
  genericFallbackRate: 0.09,
  fallbackHeavyRate: 0.06,
  weakProtectDefaultRate: 0.1,
  recurringAnomalyCount: 1,
  hardMismatchClusterCount: 0,
  genericFallbackClusterCount: 0,
  trendStableWeeks: 2,
  trendWatchWeeks: 1,
  trendInvestigateWeeks: 0,
  trendEscalateWeeks: 0,
};

/** Watch band — recurring generic fallback signals. */
export const CRYSTAL_MONTHLY_ROLLUP_WATCH_GENERIC_FALLBACK_RECURRING = {
  ...CRYSTAL_MONTHLY_WINDOW,
  totalCrystalCases: 4000,
  alignedRate: 0.8,
  softMismatchRate: 0.04,
  hardMismatchRate: 0.022,
  crystalSpecificSurfaceRate: 0.76,
  genericFallbackRate: 0.14,
  fallbackHeavyRate: 0.09,
  weakProtectDefaultRate: 0.12,
  recurringAnomalyCount: 3,
  hardMismatchClusterCount: 0,
  genericFallbackClusterCount: 2,
  trendStableWeeks: 2,
  trendWatchWeeks: 1,
  trendInvestigateWeeks: 0,
  trendEscalateWeeks: 0,
};

/** Risk band — hard mismatch clusters + escalation weeks. */
export const CRYSTAL_MONTHLY_ROLLUP_RISK_HARD_MISMATCH_CLUSTERS = {
  ...CRYSTAL_MONTHLY_WINDOW,
  totalCrystalCases: 3500,
  alignedRate: 0.55,
  softMismatchRate: 0.12,
  hardMismatchRate: 0.11,
  crystalSpecificSurfaceRate: 0.5,
  genericFallbackRate: 0.15,
  fallbackHeavyRate: 0.2,
  weakProtectDefaultRate: 0.22,
  recurringAnomalyCount: 5,
  hardMismatchClusterCount: 3,
  genericFallbackClusterCount: 1,
  objectFamilyMismatchClusterCount: 2,
  categoryMismatchClusterCount: 1,
  trendEscalateWeeks: 2,
  trendStableWeeks: 0,
};

/** Crystal-specific usage decline — watch band, drop flag on. */
export const CRYSTAL_MONTHLY_ROLLUP_CRYSTAL_SPECIFIC_DECLINE = {
  ...CRYSTAL_MONTHLY_WINDOW,
  totalCrystalCases: 3000,
  alignedRate: 0.86,
  softMismatchRate: 0.035,
  hardMismatchRate: 0.018,
  crystalSpecificSurfaceRate: 0.62,
  genericFallbackRate: 0.1,
  fallbackHeavyRate: 0.08,
  weakProtectDefaultRate: 0.1,
  recurringAnomalyCount: 1,
  crystalSpecificUsageDropFlag: true,
  trendStableWeeks: 2,
};

/** Thai-heavy export — crystal slice stable; non-crystal rows are informational only. */
export const CRYSTAL_MONTHLY_ROLLUP_THAI_HEAVY_CRYSTAL_STABLE = {
  ...CRYSTAL_MONTHLY_WINDOW,
  totalCrystalCases: 80,
  notApplicableRowCount: 12000,
  alignedRate: 0.9,
  softMismatchRate: 0.02,
  hardMismatchRate: 0.01,
  crystalSpecificSurfaceRate: 0.88,
  genericFallbackRate: 0.05,
  fallbackHeavyRate: 0.03,
  weakProtectDefaultRate: 0.05,
  recurringAnomalyCount: 0,
  trendStableWeeks: 3,
};
