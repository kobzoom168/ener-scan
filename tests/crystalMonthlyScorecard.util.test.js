import test from "node:test";
import assert from "node:assert/strict";
import {
  SCORECARD_VERSION,
  buildCrystalMonthlyScorecard,
  buildCrystalMonthlyKpiPack,
  renderCrystalMonthlyScorecardMarkdown,
} from "../src/utils/crystalMonthlyScorecard.util.js";
import {
  CRYSTAL_MONTHLY_ROLLUP_CRYSTAL_SPECIFIC_DECLINE,
  CRYSTAL_MONTHLY_ROLLUP_EXCELLENT_MONTH,
  CRYSTAL_MONTHLY_ROLLUP_GOOD_SOFT_DRIFT_MONTH,
  CRYSTAL_MONTHLY_ROLLUP_RISK_HARD_MISMATCH_CLUSTERS,
  CRYSTAL_MONTHLY_ROLLUP_THAI_HEAVY_CRYSTAL_STABLE,
  CRYSTAL_MONTHLY_ROLLUP_WATCH_GENERIC_FALLBACK_RECURRING,
} from "./fixtures/crystalMonthlyScorecard.fixture.js";

const FIXED_AT = "2026-04-02T12:00:00.000Z";

test("table-driven: score bands from monthly rollup fixtures", () => {
  const cases = [
    { rollup: CRYSTAL_MONTHLY_ROLLUP_EXCELLENT_MONTH, expectBand: "excellent" },
    { rollup: CRYSTAL_MONTHLY_ROLLUP_GOOD_SOFT_DRIFT_MONTH, expectBand: "good" },
    { rollup: CRYSTAL_MONTHLY_ROLLUP_WATCH_GENERIC_FALLBACK_RECURRING, expectBand: "watch" },
    { rollup: CRYSTAL_MONTHLY_ROLLUP_RISK_HARD_MISMATCH_CLUSTERS, expectBand: "risk" },
  ];
  for (const c of cases) {
    const s = buildCrystalMonthlyScorecard(c.rollup, { generatedAt: FIXED_AT });
    assert.equal(s.scoreBand, c.expectBand, `expected ${c.expectBand}`);
  }
});

test("score drivers: positive and negative lists populated under stress", () => {
  const s = buildCrystalMonthlyScorecard(CRYSTAL_MONTHLY_ROLLUP_RISK_HARD_MISMATCH_CLUSTERS, {
    generatedAt: FIXED_AT,
  });
  assert.ok(s.scoreDriversNegative.length > 0);
  const codesNeg = new Set(s.scoreDriversNegative.map((d) => d.code));
  assert.ok(codesNeg.has("hard_mismatch_rate"));
  assert.ok(codesNeg.has("hard_mismatch_clusters"));
});

test("KPI pack: required headline and supporting labels", () => {
  const s = buildCrystalMonthlyScorecard(CRYSTAL_MONTHLY_ROLLUP_EXCELLENT_MONTH, {
    generatedAt: FIXED_AT,
  });
  const pack = buildCrystalMonthlyKpiPack(s);
  const headlineLabels = pack.headlineKpis.map((r) => r.label).join(" ");
  assert.match(headlineLabels, /Overall quality score/i);
  assert.match(headlineLabels, /Aligned rate/i);
  assert.match(headlineLabels, /Hard mismatch rate/i);
  assert.match(headlineLabels, /Crystal-specific surface rate/i);
  assert.match(headlineLabels, /Generic fallback rate/i);

  const sup = pack.supportingKpis.map((r) => r.label).join(" ");
  assert.match(sup, /Soft mismatch rate/i);
  assert.match(sup, /Fallback-heavy rate/i);
  assert.match(sup, /Weak-protect default rate/i);
  assert.match(sup, /Top routing rule share/i);
  assert.match(sup, /Top wording source share/i);

  assert.equal(pack.riskIndicators.length >= 6, true);
  assert.equal(pack.trendIndicators.length, 4);
  assert.equal(pack.recommendedFocusAreas.length, 4);
});

test("renderCrystalMonthlyScorecardMarkdown: required sections A–F", () => {
  const s = buildCrystalMonthlyScorecard(CRYSTAL_MONTHLY_ROLLUP_GOOD_SOFT_DRIFT_MONTH, {
    generatedAt: FIXED_AT,
  });
  const md = renderCrystalMonthlyScorecardMarkdown(s);
  for (const h of [
    "## A. Header",
    "## B. Executive KPI summary",
    "## C. Strengths",
    "## D. Risks",
    "## E. Recommended focus areas",
    "### What to monitor",
    "## F. KPI pack appendix",
    "### Trend indicators (from rollup)",
    "### Headline KPIs",
    "### Supporting KPIs",
    "### Risk indicators",
  ]) {
    assert.match(md, new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("non-crystal / Thai-heavy export does not distort crystal KPI slice", () => {
  const s = buildCrystalMonthlyScorecard(CRYSTAL_MONTHLY_ROLLUP_THAI_HEAVY_CRYSTAL_STABLE, {
    generatedAt: FIXED_AT,
  });
  assert.equal(s.kpis.totalCrystalCases, 80);
  assert.equal(s.kpis.notApplicableRowCount, 12000);
  assert.equal(s.kpis.alignedRate, 0.9);
  assert.ok(s.recommendations.some((r) => /Thai|non-crystal|warehouse/i.test(r)));
});

test("scorecard output shape is stable and version present", () => {
  const s = buildCrystalMonthlyScorecard(CRYSTAL_MONTHLY_ROLLUP_EXCELLENT_MONTH, {
    generatedAt: FIXED_AT,
  });
  assert.equal(s.scorecardVersion, SCORECARD_VERSION);
  for (const k of [
    "monthWindowStart",
    "monthWindowEnd",
    "generatedAt",
    "monthlyStatus",
    "overallQualityScore",
    "scoreBand",
    "kpis",
    "strengths",
    "risks",
    "topSignals",
    "topAnomalies",
    "recommendations",
    "scoreDriversPositive",
    "scoreDriversNegative",
    "scoreMethodNote",
    "rollupSnapshot",
    "kpiPack",
  ]) {
    assert.ok(k in s, `missing ${k}`);
  }
  assert.ok(s.kpiPack.headlineKpis.length > 0);
});

test("crystal-specific decline month: drop flag surfaces in KPI pack risk indicators", () => {
  const s = buildCrystalMonthlyScorecard(CRYSTAL_MONTHLY_ROLLUP_CRYSTAL_SPECIFIC_DECLINE, {
    generatedAt: FIXED_AT,
  });
  assert.equal(s.kpis.crystalSpecificUsageDropFlag, true);
  const drop = s.kpiPack.riskIndicators.find((r) => /Crystal-specific usage drop/i.test(r.label));
  assert.ok(drop);
  assert.equal(drop.triggered, true);
  assert.equal(s.scoreBand, "watch");
});

test("buildCrystalMonthlyKpiPack is consistent when called on full scorecard", () => {
  const s = buildCrystalMonthlyScorecard(CRYSTAL_MONTHLY_ROLLUP_WATCH_GENERIC_FALLBACK_RECURRING, {
    generatedAt: FIXED_AT,
  });
  const again = buildCrystalMonthlyKpiPack(s);
  assert.deepEqual(again.headlineKpis, s.kpiPack.headlineKpis);
});
