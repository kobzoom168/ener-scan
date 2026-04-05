import test from "node:test";
import assert from "node:assert/strict";
import {
  HALF_YEAR_REVIEW_PACK_VERSION,
  buildCrystalHalfYearBusinessReviewPack,
  buildCrystalHalfYearBusinessSummary,
  buildCrystalHalfYearExecutiveSummary,
  buildCrystalHalfYearBusinessFocusAreas,
  renderCrystalHalfYearBusinessReviewPackMarkdown,
} from "../src/utils/crystalHalfYearBusinessReviewPack.util.js";
import {
  CRYSTAL_HALF_YEAR_INPUT_ESCALATE_HARD_CLUSTERS,
  CRYSTAL_HALF_YEAR_INPUT_EXCELLENT,
  CRYSTAL_HALF_YEAR_INPUT_GOOD_SOFT_DRIFT,
  CRYSTAL_HALF_YEAR_INPUT_INVESTIGATE_WEAK_PROTECT,
  CRYSTAL_HALF_YEAR_INPUT_THAI_HEAVY_STABLE,
  CRYSTAL_HALF_YEAR_INPUT_WATCH_RECURRING_GENERIC,
} from "./fixtures/crystalHalfYearBusinessReviewPack.fixture.js";

const OPTS = { generatedAt: "2026-07-02T12:00:00.000Z" };

test("table-driven: half-year score band + ops status", () => {
  const cases = [
    { input: CRYSTAL_HALF_YEAR_INPUT_EXCELLENT, expectBand: "excellent", expectStatus: "healthy" },
    { input: CRYSTAL_HALF_YEAR_INPUT_GOOD_SOFT_DRIFT, expectBand: "good", expectStatus: "watch" },
    { input: CRYSTAL_HALF_YEAR_INPUT_WATCH_RECURRING_GENERIC, expectBand: "watch", expectStatus: "watch" },
    { input: CRYSTAL_HALF_YEAR_INPUT_INVESTIGATE_WEAK_PROTECT, expectBand: "watch", expectStatus: "investigate" },
    { input: CRYSTAL_HALF_YEAR_INPUT_ESCALATE_HARD_CLUSTERS, expectBand: "risk", expectStatus: "escalate" },
  ];
  for (const c of cases) {
    const p = buildCrystalHalfYearBusinessReviewPack({ ...c.input, ...OPTS });
    assert.equal(p.halfYearScoreBand, c.expectBand, `band ${c.expectBand}`);
    assert.equal(p.halfYearStatus, c.expectStatus, `status ${c.expectStatus}`);
  }
});

test("executive summary: required fields", () => {
  const p = buildCrystalHalfYearBusinessReviewPack({ ...CRYSTAL_HALF_YEAR_INPUT_EXCELLENT, ...OPTS });
  const ex = p.executiveSummary;
  assert.ok(ex.executiveSummaryHeadline.length > 5);
  assert.ok(ex.executiveSummaryBody.length > 10);
  assert.equal(ex.top3Wins.length, 3);
  assert.equal(ex.top3Risks.length, 3);
  assert.equal(ex.top3NextActions.length, 3);
  assert.ok(ex.methodNote.includes("rollups"));
});

test("business summary: required fields", () => {
  const p = buildCrystalHalfYearBusinessReviewPack({ ...CRYSTAL_HALF_YEAR_INPUT_GOOD_SOFT_DRIFT, ...OPTS });
  const b = p.businessSummary;
  assert.ok(b.businessSummaryHeadline.length > 5);
  assert.ok(b.businessSummaryBody.length > 10);
  assert.equal(b.top3Wins.length, 3);
  assert.equal(b.top3BusinessRisks.length, 3);
  assert.equal(b.top3StrategicNextActions.length, 3);
  assert.ok(b.methodNote.includes("semantics"));
});

test("buildCrystalHalfYearBusinessSummary is deterministic", () => {
  const p = buildCrystalHalfYearBusinessReviewPack({ ...CRYSTAL_HALF_YEAR_INPUT_EXCELLENT, ...OPTS });
  assert.deepEqual(buildCrystalHalfYearBusinessSummary(p), buildCrystalHalfYearBusinessSummary(p));
});

test("KPI pack: headline + businessImpactSignals", () => {
  const p = buildCrystalHalfYearBusinessReviewPack({ ...CRYSTAL_HALF_YEAR_INPUT_WATCH_RECURRING_GENERIC, ...OPTS });
  const labels = p.halfYearKpiPack.headlineKpis.map((r) => r.label).join(" ");
  assert.match(labels, /Overall half-year quality score/i);
  assert.match(labels, /Aligned rate/i);
  assert.match(labels, /Hard mismatch rate/i);
  assert.match(labels, /Crystal-specific surface rate/i);
  assert.match(labels, /Generic fallback rate/i);
  assert.ok(p.halfYearKpiPack.businessImpactSignals.length >= 3);
});

test("recurring anomaly grouping stable for half-year", () => {
  const p = buildCrystalHalfYearBusinessReviewPack({ ...CRYSTAL_HALF_YEAR_INPUT_WATCH_RECURRING_GENERIC, ...OPTS });
  const row = p.topRecurringAnomalies.find((r) => r.anomalyCode === "generic_codebank_fallback_drift");
  assert.ok(row);
  assert.equal(row.monthsAffected, 6);
});

test("non-crystal / Thai-heavy does not distort crystal slice", () => {
  const p = buildCrystalHalfYearBusinessReviewPack({ ...CRYSTAL_HALF_YEAR_INPUT_THAI_HEAVY_STABLE, ...OPTS });
  assert.equal(p.halfYearKpis.totalCrystalCases, 90 * 6);
  assert.ok(p.recommendations.some((r) => /non-crystal|crystal-only|interpret/i.test(r)));
});

test("output shape + reviewPackVersion", () => {
  const p = buildCrystalHalfYearBusinessReviewPack({ ...CRYSTAL_HALF_YEAR_INPUT_EXCELLENT, ...OPTS });
  assert.equal(p.reviewPackVersion, HALF_YEAR_REVIEW_PACK_VERSION);
  for (const k of [
    "halfYearWindowStart",
    "halfYearWindowEnd",
    "monthsIncluded",
    "quartersIncluded",
    "halfYearStatus",
    "overallHalfYearQualityScore",
    "halfYearScoreBand",
    "halfYearKpis",
    "monthlyStatusDistribution",
    "quarterlyStatusDistribution",
    "monthlyScoreDistribution",
    "quarterlyScoreDistribution",
    "topRecurringAnomalies",
    "topRecurringMismatchTypes",
    "topRecurringRoutingRuleIds",
    "topRecurringDecisionSources",
    "topBusinessRiskAreas",
    "focusAreasNextHalf",
    "executiveSummary",
    "businessSummary",
    "recommendations",
    "halfYearKpiPack",
    "methodNote",
  ]) {
    assert.ok(k in p, `missing ${k}`);
  }
});

test("renderCrystalHalfYearBusinessReviewPackMarkdown: sections A–H", () => {
  const p = buildCrystalHalfYearBusinessReviewPack({ ...CRYSTAL_HALF_YEAR_INPUT_INVESTIGATE_WEAK_PROTECT, ...OPTS });
  const md = renderCrystalHalfYearBusinessReviewPackMarkdown(p);
  for (const h of [
    "## A. Header",
    "## B. Executive summary",
    "### Business summary (product / leadership)",
    "## C. Half-year KPI summary",
    "## D. Quarter and month distribution summary",
    "## E. Recurring anomaly digest",
    "## F. Business risk calls",
    "## G. Recommended strategic focus areas",
    "## H. Appendix",
  ]) {
    assert.ok(md.includes(h), `missing ${h}`);
  }
});

test("buildCrystalHalfYearBusinessFocusAreas", () => {
  const p = buildCrystalHalfYearBusinessReviewPack({ ...CRYSTAL_HALF_YEAR_INPUT_ESCALATE_HARD_CLUSTERS, ...OPTS });
  const areas = buildCrystalHalfYearBusinessFocusAreas(p);
  assert.ok(areas.length >= 5);
});
