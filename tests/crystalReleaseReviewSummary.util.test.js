import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCrystalReleaseReviewSummary,
  CRYSTAL_RELEASE_REVIEW_VERSION,
  DEFAULT_RELEASE_THRESHOLDS,
} from "../src/utils/crystalReleaseReviewSummary.util.js";
import { aggregateCrystalRoutingDashboardSummary } from "../src/utils/crystalRoutingDashboardSummary.util.js";
import {
  RELEASE_REVIEW_ROWS_HEALTHY,
  SUMMARY_FALLBACK_SPIKE,
  SUMMARY_HEALTHY,
  SUMMARY_OBJECT_FAMILY_SPIKE,
  SUMMARY_SOFT_DRIFT,
  SUMMARY_THAI_HEAVY,
  SUMMARY_WEAK_PROTECT_DRIFT,
} from "./fixtures/crystalReleaseReviewCases.fixture.js";

const STABLE_KEYS = [
  "releaseReviewVersion",
  "releaseGateStatus",
  "reasons",
  "topRisks",
  "recommendedAction",
  "metricSnapshot",
];

test("buildCrystalReleaseReviewSummary: pass for healthy aligned-heavy sample", () => {
  const r = buildCrystalReleaseReviewSummary({ summary: SUMMARY_HEALTHY });
  assert.equal(r.releaseGateStatus, "pass");
  assert.ok(r.reasons.includes("within_thresholds"));
});

test("buildCrystalReleaseReviewSummary: watch for soft mismatch increase only", () => {
  const r = buildCrystalReleaseReviewSummary({ summary: SUMMARY_SOFT_DRIFT });
  assert.equal(r.releaseGateStatus, "watch");
  assert.ok(r.reasons.includes("soft_mismatch_rate"));
});

test("buildCrystalReleaseReviewSummary: investigate for fallback-heavy spike", () => {
  const r = buildCrystalReleaseReviewSummary({ summary: SUMMARY_FALLBACK_SPIKE });
  assert.equal(r.releaseGateStatus, "investigate");
  assert.ok(r.reasons.includes("fallback_heavy_rate"));
});

test("buildCrystalReleaseReviewSummary: rollback_candidate for object-family mismatch spike", () => {
  const r = buildCrystalReleaseReviewSummary({ summary: SUMMARY_OBJECT_FAMILY_SPIKE });
  assert.equal(r.releaseGateStatus, "rollback_candidate");
  assert.ok(r.reasons.includes("object_family_mismatch_rate"));
});

test("buildCrystalReleaseReviewSummary: thai-heavy traffic does not inflate crystal risk", () => {
  const r = buildCrystalReleaseReviewSummary({ summary: SUMMARY_THAI_HEAVY });
  assert.equal(r.releaseGateStatus, "pass");
  assert.equal(r.metricSnapshot.totalCrystalRoutingCases, 25);
});

test("buildCrystalReleaseReviewSummary: weak-protect default drift → watch", () => {
  const r = buildCrystalReleaseReviewSummary({ summary: SUMMARY_WEAK_PROTECT_DRIFT });
  assert.equal(r.releaseGateStatus, "watch");
  assert.ok(r.reasons.includes("weak_protect_default_share"));
});

test("buildCrystalReleaseReviewSummary: zero crystal sample → watch insufficient data", () => {
  const empty = aggregateCrystalRoutingDashboardSummary(
    Array.from({ length: 20 }, () => ({
      routingWordingAlignmentStatus: "not_applicable",
      routingWordingMismatchType: "not_applicable",
      isCrystalRoutingCase: false,
      routingObjectFamily: "thai_amulet",
    })),
  );
  const r = buildCrystalReleaseReviewSummary({ summary: empty });
  assert.equal(r.releaseGateStatus, "watch");
  assert.ok(r.reasons.includes("insufficient_crystal_sample"));
});

test("buildCrystalReleaseReviewSummary: baseline delta hard triggers rollback", () => {
  const baseline = SUMMARY_HEALTHY;
  const worse = aggregateCrystalRoutingDashboardSummary([
    ...RELEASE_REVIEW_ROWS_HEALTHY.slice(0, 60),
    ...Array.from({ length: 20 }, () => ({
      routingWordingAlignmentStatus: "hard_mismatch",
      routingWordingMismatchType: "category_mismatch",
      isCrystalRoutingCase: true,
      routingObjectFamily: "crystal",
      visibleWordingCrystalSpecific: true,
      visibleWordingDecisionSource: "db_crystal",
      crystalRoutingRuleId: "crystal_rg_resolver_protect",
    })),
  ]);
  const r = buildCrystalReleaseReviewSummary({
    summary: worse,
    baselineSummary: baseline,
    thresholds: {
      ...DEFAULT_RELEASE_THRESHOLDS,
      hardMismatchRateRollback: 0.5,
      deltaHardRateRollback: 0.15,
    },
  });
  assert.equal(r.releaseGateStatus, "rollback_candidate");
  assert.ok(r.reasons.includes("delta_hard_mismatch_rate_vs_baseline"));
});

test("buildCrystalReleaseReviewSummary: output shape stable", () => {
  const r = buildCrystalReleaseReviewSummary({ summary: SUMMARY_HEALTHY });
  for (const k of STABLE_KEYS) {
    assert.ok(k in r, `missing ${k}`);
  }
  assert.equal(r.releaseReviewVersion, CRYSTAL_RELEASE_REVIEW_VERSION);
  assert.ok(r.metricSnapshot && typeof r.metricSnapshot === "object");
});
