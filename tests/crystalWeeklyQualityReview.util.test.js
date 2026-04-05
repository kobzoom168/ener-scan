import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCrystalWeeklyQualityReview,
  renderCrystalWeeklyQualityReviewMarkdown,
  WEEKLY_REVIEW_HEURISTIC_DEFAULTS,
} from "../src/utils/crystalWeeklyQualityReview.util.js";
import {
  CRYSTAL_WEEKLY_ROWS_FALLBACK_HEAVY_WEEK,
  CRYSTAL_WEEKLY_ROWS_HARD_MISMATCH_WEEK,
  CRYSTAL_WEEKLY_ROWS_HEALTHY_WEEK,
  CRYSTAL_WEEKLY_ROWS_SOFT_DRIFT_WEEK,
  CRYSTAL_WEEKLY_ROWS_THAI_HEAVY_CRYSTAL_STABLE,
  CRYSTAL_WEEKLY_ROWS_WEAK_PROTECT_DRIFT_WEEK,
  WEEKLY_WINDOW,
} from "./fixtures/crystalWeeklyQualityRows.fixture.js";

const baseOpts = {
  windowStart: WEEKLY_WINDOW.windowStart,
  windowEnd: WEEKLY_WINDOW.windowEnd,
  generatedAt: WEEKLY_WINDOW.generatedAt,
};

test("buildCrystalWeeklyQualityReview: table-driven status", () => {
  const cases = [
    {
      name: "healthy week",
      rows: CRYSTAL_WEEKLY_ROWS_HEALTHY_WEEK,
      expectStatus: "healthy",
    },
    {
      name: "soft-drift week",
      rows: CRYSTAL_WEEKLY_ROWS_SOFT_DRIFT_WEEK,
      expectStatus: "watch",
    },
    {
      name: "fallback-heavy week",
      rows: CRYSTAL_WEEKLY_ROWS_FALLBACK_HEAVY_WEEK,
      expectStatus: "investigate",
    },
    {
      name: "hard mismatch week (object-family)",
      rows: CRYSTAL_WEEKLY_ROWS_HARD_MISMATCH_WEEK,
      expectStatus: "escalate",
    },
    {
      name: "thai-heavy but crystal-stable week",
      rows: CRYSTAL_WEEKLY_ROWS_THAI_HEAVY_CRYSTAL_STABLE,
      expectStatus: "healthy",
    },
    {
      name: "weak-protect-default drift week",
      rows: CRYSTAL_WEEKLY_ROWS_WEAK_PROTECT_DRIFT_WEEK,
      expectStatus: "investigate",
    },
  ];

  for (const c of cases) {
    const s = buildCrystalWeeklyQualityReview(c.rows, baseOpts);
    assert.equal(
      s.reviewStatus,
      c.expectStatus,
      `${c.name}: expected ${c.expectStatus}, got ${s.reviewStatus}`,
    );
  }
});

test("buildCrystalWeeklyQualityReview: non-crystal rows do not inflate crystal rates", () => {
  const s = buildCrystalWeeklyQualityReview(CRYSTAL_WEEKLY_ROWS_THAI_HEAVY_CRYSTAL_STABLE, baseOpts);
  assert.equal(s.totalCrystalCases, 25);
  assert.equal(s.alignedRate, 1);
  assert.equal(s.notApplicableRowCount, 100);
});

test("renderCrystalWeeklyQualityReviewMarkdown: required sections", () => {
  const s = buildCrystalWeeklyQualityReview(CRYSTAL_WEEKLY_ROWS_HEALTHY_WEEK, baseOpts);
  const md = renderCrystalWeeklyQualityReviewMarkdown(s);
  for (const h of [
    "## A. Header",
    "## B. Executive summary",
    "## C. Top findings",
    "## D. Risk calls",
    "## E. Suggested next actions",
    "## F. Appendix",
  ]) {
    assert.ok(md.includes(h), `missing section ${h}`);
  }
  assert.ok(md.includes("Crystal weekly quality review"));
});

test("buildCrystalWeeklyQualityReview: top mismatch and rule ordering deterministic", () => {
  const s = buildCrystalWeeklyQualityReview(CRYSTAL_WEEKLY_ROWS_HARD_MISMATCH_WEEK, baseOpts);
  const tm = s.topMismatchTypes;
  for (let i = 1; i < tm.length; i++) {
    const a = tm[i - 1];
    const b = tm[i];
    assert.ok(
      b.count < a.count || (b.count === a.count && b.mismatchType.localeCompare(a.mismatchType) >= 0),
    );
  }
  const tr = s.topRoutingRuleIds;
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1];
    const b = tr[i];
    assert.ok(b.count < a.count || (b.count === a.count && b.ruleId.localeCompare(a.ruleId) >= 0));
  }
});

test("buildCrystalWeeklyQualityReview: output shape for weekly fields", () => {
  const s = buildCrystalWeeklyQualityReview(CRYSTAL_WEEKLY_ROWS_HEALTHY_WEEK, baseOpts);
  for (const k of [
    "windowStart",
    "windowEnd",
    "generatedAt",
    "totalCrystalCases",
    "alignedRate",
    "softMismatchRate",
    "hardMismatchRate",
    "crystalSpecificSurfaceRate",
    "genericFallbackRate",
    "fallbackHeavyRate",
    "weakProtectDefaultRate",
    "topMismatchTypes",
    "topRoutingRuleIds",
    "topDecisionSources",
    "ruleDistribution",
    "recommendations",
    "reviewStatus",
    "rawAggregateSnapshot",
  ]) {
    assert.ok(k in s, `missing ${k}`);
  }
  assert.equal(s.heuristicNote.includes("Template"), true);
});

test("WEEKLY_REVIEW_HEURISTIC_DEFAULTS: document-only template note", () => {
  assert.ok(typeof WEEKLY_REVIEW_HEURISTIC_DEFAULTS.hardMismatchRateEscalate === "number");
});
