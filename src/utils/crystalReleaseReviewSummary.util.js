/**
 * Pure release-review classifier on top of `aggregateCrystalRoutingDashboardSummary` output.
 * Not wired into deploy/runtime; for scripts, bots, and manual review.
 *
 * @module crystalReleaseReviewSummary.util
 */
import { ROUTING_WORDING_MISMATCH_TYPE } from "./crystalRoutingWordingMetrics.util.js";

/** @typedef {import("./crystalRoutingDashboardSummary.util.js").CrystalRoutingDashboardSummary} CrystalRoutingDashboardSummary */

export const CRYSTAL_RELEASE_REVIEW_VERSION = "1";

/**
 * Template defaults — **calibrate per environment**; tests may override.
 * @typedef {Object} CrystalReleaseThresholds
 * @property {number} hardMismatchRateRollback
 * @property {number} objectFamilyMismatchRateRollback
 * @property {number} categoryMismatchRateRollback
 * @property {number} softMismatchRateWatch
 * @property {number} fallbackHeavyRateInvestigate
 * @property {number} genericFallbackRateInvestigate
 * @property {number} crystalSpecificSurfaceRateMinWatch — below triggers watch
 * @property {number} crystalSpecificSurfaceRateMinRollback — at/below triggers rollback_candidate
 * @property {number} weakProtectDefaultRateWatch
 * @property {number} [deltaHardRateRollback] — vs baseline when baseline present
 * @property {number} [deltaSoftRateWatch] — vs baseline when baseline present
 */

export const DEFAULT_RELEASE_THRESHOLDS = {
  hardMismatchRateRollback: 0.1,
  objectFamilyMismatchRateRollback: 0.02,
  categoryMismatchRateRollback: 0.02,
  softMismatchRateWatch: 0.2,
  fallbackHeavyRateInvestigate: 0.15,
  genericFallbackRateInvestigate: 0.3,
  crystalSpecificSurfaceRateMinWatch: 0.5,
  crystalSpecificSurfaceRateMinRollback: 0.3,
  weakProtectDefaultRateWatch: 0.4,
  deltaHardRateRollback: 0.05,
  deltaSoftRateWatch: 0.12,
};

const STATUS = {
  PASS: "pass",
  WATCH: "watch",
  INVESTIGATE: "investigate",
  ROLLBACK_CANDIDATE: "rollback_candidate",
};

/**
 * @typedef {Object} CrystalReleaseReviewSummary
 * @property {string} releaseReviewVersion
 * @property {"pass"|"watch"|"investigate"|"rollback_candidate"} releaseGateStatus
 * @property {string[]} reasons — machine-readable codes
 * @property {string[]} topRisks — short human-readable bullets
 * @property {string} recommendedAction
 * @property {Record<string, number|string|boolean|null>} metricSnapshot
 */

/**
 * @param {{ mismatchType: string, count: number }[]} top
 * @param {string} type
 */
function mismatchCount(top, type) {
  const t = Array.isArray(top) ? top : [];
  const row = t.find((x) => x.mismatchType === type);
  return row ? row.count : 0;
}

/**
 * @param {CrystalRoutingDashboardSummary} summary
 * @param {CrystalReleaseThresholds} t
 * @param {CrystalRoutingDashboardSummary|null} baseline
 */
function evaluateStatus(summary, t, baseline) {
  const reasons = [];
  const risks = [];
  const denom = summary.totalCrystalRoutingCases;

  if (denom === 0) {
    return {
      releaseGateStatus: STATUS.WATCH,
      reasons: ["insufficient_crystal_sample"],
      topRisks: ["No crystal routing rows in sample; cannot judge wording/routing health."],
      recommendedAction:
        "If deploy touched crystal paths, widen the log window or filter to crystal scans only.",
    };
  }

  const hardRate = summary.hardMismatchCount / denom;
  const softRate = summary.softMismatchCount / denom;
  const ofmRate =
    mismatchCount(summary.topMismatchTypes, ROUTING_WORDING_MISMATCH_TYPE.OBJECT_FAMILY_MISMATCH) /
    denom;
  const catRate =
    mismatchCount(summary.topMismatchTypes, ROUTING_WORDING_MISMATCH_TYPE.CATEGORY_MISMATCH) / denom;
  const spec = summary.crystalSpecificSurfaceRate;
  const fbHeavy = summary.fallbackHeavyRate;
  const genFb = summary.genericFallbackRate;
  const wp = summary.weakProtectDefaultRate;

  let deltaHard = 0;
  let deltaSoft = 0;
  if (baseline && baseline.totalCrystalRoutingCases > 0) {
    const bd = baseline.totalCrystalRoutingCases;
    deltaHard = hardRate - baseline.hardMismatchCount / bd;
    deltaSoft = softRate - baseline.softMismatchCount / bd;
  }

  const dhCrit = t.deltaHardRateRollback ?? 0.05;
  const dsWatch = t.deltaSoftRateWatch ?? 0.12;

  /** rollback tier */
  if (hardRate >= t.hardMismatchRateRollback) {
    reasons.push("hard_mismatch_rate");
    risks.push(`Hard mismatch rate ${(hardRate * 100).toFixed(1)}%.`);
  }
  if (ofmRate >= t.objectFamilyMismatchRateRollback) {
    reasons.push("object_family_mismatch_rate");
    risks.push(`Object-family mismatch rate ${(ofmRate * 100).toFixed(1)}%.`);
  }
  if (catRate >= t.categoryMismatchRateRollback) {
    reasons.push("category_mismatch_rate");
    risks.push(`Category mismatch rate ${(catRate * 100).toFixed(1)}%.`);
  }
  if (spec <= t.crystalSpecificSurfaceRateMinRollback) {
    reasons.push("crystal_specific_surface_collapse");
    risks.push(
      `Crystal-specific surface rate ${(spec * 100).toFixed(1)}% at/below rollback floor.`,
    );
  }
  if (baseline && baseline.totalCrystalRoutingCases > 0 && deltaHard >= dhCrit) {
    reasons.push("delta_hard_mismatch_rate_vs_baseline");
    risks.push(`Hard mismatch rate up vs baseline (Δ≈${deltaHard.toFixed(3)}).`);
  }

  if (reasons.length > 0) {
    return {
      releaseGateStatus: STATUS.ROLLBACK_CANDIDATE,
      reasons: [...new Set(reasons)],
      topRisks: risks,
      recommendedAction:
        "Treat as rollback candidate: validate against deploy scope, sample payloads, then decide rollback vs hotfix.",
    };
  }

  /** investigate tier */
  if (fbHeavy >= t.fallbackHeavyRateInvestigate || genFb >= t.genericFallbackRateInvestigate) {
    const r = [];
    if (fbHeavy >= t.fallbackHeavyRateInvestigate) r.push("fallback_heavy_rate");
    if (genFb >= t.genericFallbackRateInvestigate) r.push("generic_fallback_rate");
    return {
      releaseGateStatus: STATUS.INVESTIGATE,
      reasons: r,
      topRisks: [
        fbHeavy >= t.fallbackHeavyRateInvestigate
          ? `Fallback-heavy rate ${(fbHeavy * 100).toFixed(1)}%.`
          : "",
        genFb >= t.genericFallbackRateInvestigate
          ? `Generic code-bank fallback rate ${(genFb * 100).toFixed(1)}%.`
          : "",
      ].filter(Boolean),
      recommendedAction:
        "Investigate DB/template coverage and wording path; confirm infra vs logic before rollback.",
    };
  }

  /** watch tier */
  const watchReasons = [];
  const watchRisks = [];
  if (softRate >= t.softMismatchRateWatch) {
    watchReasons.push("soft_mismatch_rate");
    watchRisks.push(`Soft mismatch rate ${(softRate * 100).toFixed(1)}%.`);
  }
  if (spec < t.crystalSpecificSurfaceRateMinWatch) {
    watchReasons.push("crystal_specific_surface_low");
    watchRisks.push(`Crystal-specific surface rate ${(spec * 100).toFixed(1)}% (below watch floor).`);
  }
  if (wp >= t.weakProtectDefaultRateWatch) {
    watchReasons.push("weak_protect_default_share");
    watchRisks.push(`Weak-protect default rule share ${(wp * 100).toFixed(1)}%.`);
  }
  if (baseline && baseline.totalCrystalRoutingCases > 0 && deltaSoft >= dsWatch) {
    watchReasons.push("delta_soft_mismatch_rate_vs_baseline");
    watchRisks.push(`Soft mismatch rate up vs baseline (Δ≈${deltaSoft.toFixed(3)}).`);
  }

  if (watchReasons.length > 0) {
    return {
      releaseGateStatus: STATUS.WATCH,
      reasons: watchReasons,
      topRisks: watchRisks,
      recommendedAction:
        "Monitor next window; compare to baseline; sample a few scans if signal is noisy.",
    };
  }

  return {
    releaseGateStatus: STATUS.PASS,
    reasons: ["within_thresholds"],
    topRisks: [],
    recommendedAction: "No crystal routing/wording red signals in this aggregate; keep routine monitoring.",
  };
}

/**
 * @param {{
 *   summary: CrystalRoutingDashboardSummary,
 *   baselineSummary?: CrystalRoutingDashboardSummary | null,
 *   thresholds?: Partial<CrystalReleaseThresholds>,
 * }} input
 * @returns {CrystalReleaseReviewSummary}
 */
export function buildCrystalReleaseReviewSummary(input) {
  const summary = input.summary;
  const baseline = input.baselineSummary ?? null;
  const t = { ...DEFAULT_RELEASE_THRESHOLDS, ...input.thresholds };

  const out = evaluateStatus(summary, t, baseline);
  const denom = summary.totalCrystalRoutingCases;

  const metricSnapshot = {
    totalCrystalRoutingCases: denom,
    notApplicableCount: summary.notApplicableCount,
    hardMismatchRate: denom > 0 ? summary.hardMismatchCount / denom : null,
    softMismatchRate: denom > 0 ? summary.softMismatchCount / denom : null,
    crystalSpecificSurfaceRate: summary.crystalSpecificSurfaceRate,
    genericFallbackRate: summary.genericFallbackRate,
    fallbackHeavyRate: summary.fallbackHeavyRate,
    weakProtectDefaultRate: summary.weakProtectDefaultRate,
    alignedRate: denom > 0 ? summary.alignedCount / denom : null,
  };

  return {
    releaseReviewVersion: CRYSTAL_RELEASE_REVIEW_VERSION,
    releaseGateStatus: out.releaseGateStatus,
    reasons: out.reasons,
    topRisks: out.topRisks,
    recommendedAction: out.recommendedAction,
    metricSnapshot,
  };
}
