/**
 * Quarterly review pack input fixtures (Phase 11).
 * Each scenario is a full `CrystalQuarterlyReviewInput` with `months[]` rollups and optional anomaly events.
 */

export const QUARTER_WINDOW_Q1_2026 = {
  quarterWindowStart: "2026-01-01T00:00:00.000Z",
  quarterWindowEnd: "2026-03-31T23:59:59.999Z",
  generatedAt: "2026-04-05T10:00:00.000Z",
};

function month(m, start, end) {
  return { ...m, monthWindowStart: start, monthWindowEnd: end, generatedAt: QUARTER_WINDOW_Q1_2026.generatedAt };
}

const EX_ROLLUP = {
  rollupVersion: "fixture-q-ex",
  totalCrystalCases: 5000,
  notApplicableRowCount: 300,
  alignedRate: 0.92,
  softMismatchRate: 0.018,
  hardMismatchRate: 0.004,
  crystalSpecificSurfaceRate: 0.9,
  genericFallbackRate: 0.032,
  fallbackHeavyRate: 0.016,
  weakProtectDefaultRate: 0.009,
  recurringAnomalyCount: 0,
  hardMismatchClusterCount: 0,
  genericFallbackClusterCount: 0,
  objectFamilyMismatchClusterCount: 0,
  categoryMismatchClusterCount: 0,
  crystalSpecificUsageDropFlag: false,
  trendStableWeeks: 4,
  topRoutingRuleShare: 0.33,
  topWordingSourceShare: 0.29,
};

const GOOD_SOFT = {
  rollupVersion: "fixture-q-good",
  totalCrystalCases: 4800,
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
};

/** Watch monthly rollup: high generic fallback, gfc=1 (avoids investigate branch). */
const WATCH_GEN = {
  rollupVersion: "fixture-q-watch-gen",
  totalCrystalCases: 4000,
  alignedRate: 0.79,
  softMismatchRate: 0.042,
  hardMismatchRate: 0.022,
  crystalSpecificSurfaceRate: 0.75,
  genericFallbackRate: 0.15,
  fallbackHeavyRate: 0.09,
  weakProtectDefaultRate: 0.12,
  recurringAnomalyCount: 2,
  genericFallbackClusterCount: 1,
  trendWatchWeeks: 1,
  trendStableWeeks: 2,
};

/** Recurring weak-protect / fallback-heavy — investigate path (monthly band watch, not risk). */
const INV_WP = {
  rollupVersion: "fixture-q-inv-wp",
  totalCrystalCases: 4200,
  alignedRate: 0.82,
  softMismatchRate: 0.045,
  hardMismatchRate: 0.018,
  crystalSpecificSurfaceRate: 0.78,
  genericFallbackRate: 0.1,
  fallbackHeavyRate: 0.13,
  weakProtectDefaultRate: 0.19,
  recurringAnomalyCount: 2,
  genericFallbackClusterCount: 1,
  trendInvestigateWeeks: 1,
};

const RISK_HARD = {
  rollupVersion: "fixture-q-risk",
  totalCrystalCases: 3000,
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
};

const DECLINE = {
  rollupVersion: "fixture-q-decline",
  totalCrystalCases: 2800,
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

const THAI_STABLE = {
  rollupVersion: "fixture-q-thai",
  totalCrystalCases: 90,
  notApplicableRowCount: 11000,
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

/** Excellent quarter — three strong months. */
export const CRYSTAL_QUARTER_INPUT_EXCELLENT = {
  ...QUARTER_WINDOW_Q1_2026,
  months: [
    { rollup: month(EX_ROLLUP, "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z") },
    { rollup: month(EX_ROLLUP, "2026-02-01T00:00:00.000Z", "2026-02-28T23:59:59.999Z") },
    { rollup: month(EX_ROLLUP, "2026-03-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z") },
  ],
};

/** Good quarter — soft drift, still good band. */
export const CRYSTAL_QUARTER_INPUT_GOOD_SOFT_DRIFT = {
  ...QUARTER_WINDOW_Q1_2026,
  months: [
    { rollup: month(GOOD_SOFT, "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z") },
    { rollup: month(GOOD_SOFT, "2026-02-01T00:00:00.000Z", "2026-02-28T23:59:59.999Z") },
    { rollup: month(GOOD_SOFT, "2026-03-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z") },
  ],
};

/** Watch — recurring generic fallback pressure without gfc≥2 clusters. */
export const CRYSTAL_QUARTER_INPUT_WATCH_RECURRING_GENERIC = {
  ...QUARTER_WINDOW_Q1_2026,
  months: [
    {
      rollup: month(WATCH_GEN, "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z"),
      anomalyEvents: [
        {
          anomalyCode: "generic_codebank_fallback_drift",
          severity: "medium",
          routingRuleId: "crystal_rg_generic_boost",
          decisionSource: "code_bank",
          likelyCause: "Template gap for month slice",
          suggestedNextAction: "Compare against deploy history",
        },
      ],
    },
    {
      rollup: month(WATCH_GEN, "2026-02-01T00:00:00.000Z", "2026-02-28T23:59:59.999Z"),
      anomalyEvents: [
        {
          anomalyCode: "generic_codebank_fallback_drift",
          severity: "medium",
          decisionSource: "code_bank",
        },
      ],
    },
    {
      rollup: month(WATCH_GEN, "2026-03-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z"),
      anomalyEvents: [
        {
          anomalyCode: "generic_codebank_fallback_drift",
          severity: "low",
          decisionSource: "code_bank",
        },
      ],
    },
  ],
};

/** Investigate — recurring weak-protect / fallback-heavy. */
export const CRYSTAL_QUARTER_INPUT_INVESTIGATE_WEAK_PROTECT = {
  ...QUARTER_WINDOW_Q1_2026,
  months: [
    { rollup: month(INV_WP, "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z") },
    { rollup: month(INV_WP, "2026-02-01T00:00:00.000Z", "2026-02-28T23:59:59.999Z") },
    { rollup: month(INV_WP, "2026-03-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z") },
  ],
};

/** Escalate — hard mismatch clusters recurring. */
export const CRYSTAL_QUARTER_INPUT_ESCALATE_HARD_CLUSTERS = {
  ...QUARTER_WINDOW_Q1_2026,
  months: [
    { rollup: month(RISK_HARD, "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z") },
    { rollup: month(RISK_HARD, "2026-02-01T00:00:00.000Z", "2026-02-28T23:59:59.999Z") },
    { rollup: month(RISK_HARD, "2026-03-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z") },
  ],
};

/** Crystal-specific usage decline — two+ months flagged. */
export const CRYSTAL_QUARTER_INPUT_CRYSTAL_DECLINE = {
  ...QUARTER_WINDOW_Q1_2026,
  months: [
    { rollup: month(DECLINE, "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z") },
    { rollup: month(DECLINE, "2026-02-01T00:00:00.000Z", "2026-02-28T23:59:59.999Z") },
    { rollup: month({ ...DECLINE, crystalSpecificUsageDropFlag: false }, "2026-03-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z") },
  ],
};

/** Thai-heavy export; crystal slice stable. */
export const CRYSTAL_QUARTER_INPUT_THAI_HEAVY_STABLE = {
  ...QUARTER_WINDOW_Q1_2026,
  months: [
    { rollup: month(THAI_STABLE, "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z") },
    { rollup: month(THAI_STABLE, "2026-02-01T00:00:00.000Z", "2026-02-28T23:59:59.999Z") },
    { rollup: month(THAI_STABLE, "2026-03-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z") },
  ],
};
