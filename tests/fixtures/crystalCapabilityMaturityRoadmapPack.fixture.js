/**
 * Capability maturity + roadmap fixtures (Phase 15).
 * Reuses annual fixtures via `buildCrystalAnnualOperatingReviewPack`.
 */

import { buildCrystalAnnualOperatingReviewPack } from "../../src/utils/crystalAnnualOperatingReviewPack.util.js";
import {
  CRYSTAL_ANNUAL_INPUT_ESCALATE_HARD_CLUSTERS,
  CRYSTAL_ANNUAL_INPUT_EXCELLENT,
  CRYSTAL_ANNUAL_INPUT_GOOD_SOFT_DRIFT,
  CRYSTAL_ANNUAL_INPUT_THAI_HEAVY_STABLE,
  CRYSTAL_ANNUAL_INPUT_WATCH_RECURRING_GENERIC,
} from "./crystalAnnualOperatingReviewPack.fixture.js";

const AT = { generatedAt: "2027-01-05T12:00:00.000Z" };

function wrapAnnual(annualInput) {
  const annual = buildCrystalAnnualOperatingReviewPack({ ...annualInput, ...AT });
  return {
    assessmentWindowStart: annual.yearWindowStart,
    assessmentWindowEnd: annual.yearWindowEnd,
    ...AT,
    annualOperatingReviewPack: annual,
  };
}

/** Stable / scalable — excellent year evidence. */
export const MATURITY_INPUT_STABLE_SCALABLE = wrapAnnual(CRYSTAL_ANNUAL_INPUT_EXCELLENT);

/** Emerging — good soft drift year. */
export const MATURITY_INPUT_EMERGING_IMPROVING = wrapAnnual(CRYSTAL_ANNUAL_INPUT_GOOD_SOFT_DRIFT);

/** Wording / DB gap — recurring generic fallback annual. */
export const MATURITY_INPUT_WORDING_DB_GAP = wrapAnnual(CRYSTAL_ANNUAL_INPUT_WATCH_RECURRING_GENERIC);

/** Routing / release drift — escalate annual. */
export const MATURITY_INPUT_ROUTING_RELEASE_HEAVY = wrapAnnual(CRYSTAL_ANNUAL_INPUT_ESCALATE_HARD_CLUSTERS);

/** Thai-heavy crystal-stable annual. */
export const MATURITY_INPUT_THAI_HEAVY_STABLE = wrapAnnual(CRYSTAL_ANNUAL_INPUT_THAI_HEAVY_STABLE);

/** Evidence snapshot: telemetry-rich label but wording fragile (no full annual). */
export const MATURITY_INPUT_SNAPSHOT_WORDING_FRAGILE = {
  assessmentWindowStart: "2026-01-01T00:00:00.000Z",
  assessmentWindowEnd: "2026-12-31T23:59:59.999Z",
  ...AT,
  evidenceSnapshot: {
    annualStatus: "watch",
    annualScoreBand: "watch",
    overallAnnualQualityScore: 58,
    alignedRate: 0.8,
    hardMismatchRate: 0.03,
    softMismatchRate: 0.09,
    genericFallbackRate: 0.1,
    crystalSpecificSurfaceRate: 0.62,
    weakProtectDefaultRate: 0.14,
    hardMismatchClusterCountMax: 1,
    recurringAnomalyCountAnnual: 8,
    topRecurringAnomalyCodes: ["wording_category_drift"],
    topRecurringMismatchTypes: ["soft_mismatch_elevated"],
    quarterlyStatuses: ["watch", "watch", "healthy", "healthy"],
    halfYearStatuses: ["watch", "investigate"],
    usageDropMonths: 2,
    multiPeriodFallbackHeavy: false,
    releaseSignals: [{ windowLabel: "2026-08-01", note: "copy batch" }],
    roadmapSignals: ["increase_digest_coverage"],
  },
};
