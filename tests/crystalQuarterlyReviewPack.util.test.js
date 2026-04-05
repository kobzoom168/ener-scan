import test from "node:test";
import assert from "node:assert/strict";
import {
  REVIEW_PACK_VERSION,
  buildCrystalQuarterlyReviewPack,
  buildCrystalQuarterlyExecutiveSummary,
  buildCrystalQuarterlyFocusAreas,
  renderCrystalQuarterlyReviewPackMarkdown,
} from "../src/utils/crystalQuarterlyReviewPack.util.js";
import {
  CRYSTAL_QUARTER_INPUT_ESCALATE_HARD_CLUSTERS,
  CRYSTAL_QUARTER_INPUT_EXCELLENT,
  CRYSTAL_QUARTER_INPUT_GOOD_SOFT_DRIFT,
  CRYSTAL_QUARTER_INPUT_INVESTIGATE_WEAK_PROTECT,
  CRYSTAL_QUARTER_INPUT_THAI_HEAVY_STABLE,
  CRYSTAL_QUARTER_INPUT_WATCH_RECURRING_GENERIC,
} from "./fixtures/crystalQuarterlyReviewPack.fixture.js";

const OPTS = { generatedAt: "2026-04-05T10:00:00.000Z" };

test("table-driven: quarter score band + ops status", () => {
  const cases = [
    { input: CRYSTAL_QUARTER_INPUT_EXCELLENT, expectBand: "excellent", expectStatus: "healthy" },
    { input: CRYSTAL_QUARTER_INPUT_GOOD_SOFT_DRIFT, expectBand: "good", expectStatus: "watch" },
    { input: CRYSTAL_QUARTER_INPUT_WATCH_RECURRING_GENERIC, expectBand: "watch", expectStatus: "watch" },
    { input: CRYSTAL_QUARTER_INPUT_INVESTIGATE_WEAK_PROTECT, expectBand: "watch", expectStatus: "investigate" },
    { input: CRYSTAL_QUARTER_INPUT_ESCALATE_HARD_CLUSTERS, expectBand: "risk", expectStatus: "escalate" },
  ];
  for (const c of cases) {
    const p = buildCrystalQuarterlyReviewPack({ ...c.input, ...OPTS });
    assert.equal(p.quarterScoreBand, c.expectBand, `${c.expectBand} band`);
    assert.equal(p.quarterlyStatus, c.expectStatus, `${c.expectStatus} status`);
  }
});

test("executive summary: required fields populated", () => {
  const p = buildCrystalQuarterlyReviewPack({ ...CRYSTAL_QUARTER_INPUT_EXCELLENT, ...OPTS });
  const ex = p.executiveSummary;
  assert.ok(ex.executiveSummaryHeadline.length > 10);
  assert.ok(ex.executiveSummaryBody.length > 20);
  assert.equal(ex.top3Wins.length, 3);
  assert.equal(ex.top3Risks.length, 3);
  assert.equal(ex.top3NextActions.length, 3);
  assert.ok(ex.methodNote.includes("aggregated scorecards"));
});

test("buildCrystalQuarterlyExecutiveSummary is deterministic for same pack", () => {
  const p = buildCrystalQuarterlyReviewPack({ ...CRYSTAL_QUARTER_INPUT_GOOD_SOFT_DRIFT, ...OPTS });
  const a = buildCrystalQuarterlyExecutiveSummary(p);
  const b = buildCrystalQuarterlyExecutiveSummary(p);
  assert.deepEqual(a, b);
});

test("KPI pack: headline KPI labels present", () => {
  const p = buildCrystalQuarterlyReviewPack({ ...CRYSTAL_QUARTER_INPUT_WATCH_RECURRING_GENERIC, ...OPTS });
  const labels = p.quarterlyKpiPack.headlineKpis.map((r) => r.label).join(" ");
  assert.match(labels, /Overall quarter quality score/i);
  assert.match(labels, /Aligned rate/i);
  assert.match(labels, /Hard mismatch rate/i);
  assert.match(labels, /Crystal-specific surface rate/i);
  assert.match(labels, /Generic fallback rate/i);
  assert.ok(p.quarterlyKpiPack.recurringSignals.length >= 1);
  assert.ok(p.quarterlyKpiPack.recommendedFocusAreas.length >= 1);
});

test("recurring anomaly grouping: stable codes across months", () => {
  const p = buildCrystalQuarterlyReviewPack({ ...CRYSTAL_QUARTER_INPUT_WATCH_RECURRING_GENERIC, ...OPTS });
  const row = p.topRecurringAnomalies.find((r) => r.anomalyCode === "generic_codebank_fallback_drift");
  assert.ok(row);
  assert.equal(row.monthsAffected, 3);
  assert.equal(row.severity, "medium");
});

test("non-crystal / Thai-heavy inputs do not distort crystal KPIs", () => {
  const p = buildCrystalQuarterlyReviewPack({ ...CRYSTAL_QUARTER_INPUT_THAI_HEAVY_STABLE, ...OPTS });
  assert.equal(p.quarterlyKpis.totalCrystalCases, 90 * 3);
  assert.ok(p.recommendations.some((r) => /non-crystal|crystal-only|interpret/i.test(r)));
  assert.equal(p.quarterlyStatus, "healthy");
});

test("output shape stable + reviewPackVersion", () => {
  const p = buildCrystalQuarterlyReviewPack({ ...CRYSTAL_QUARTER_INPUT_EXCELLENT, ...OPTS });
  assert.equal(p.reviewPackVersion, REVIEW_PACK_VERSION);
  for (const k of [
    "quarterWindowStart",
    "quarterWindowEnd",
    "monthsIncluded",
    "quarterlyStatus",
    "overallQuarterQualityScore",
    "quarterScoreBand",
    "quarterlyKpis",
    "monthlyStatusDistribution",
    "monthlyScoreDistribution",
    "topRecurringAnomalies",
    "topRecurringMismatchTypes",
    "topRecurringRoutingRuleIds",
    "topRecurringDecisionSources",
    "recurringRiskAreas",
    "usageDropMonths",
    "focusAreasNextQuarter",
    "executiveSummary",
    "recommendations",
    "quarterlyKpiPack",
    "methodNote",
  ]) {
    assert.ok(k in p, `missing ${k}`);
  }
});

test("renderCrystalQuarterlyReviewPackMarkdown: required sections", () => {
  const p = buildCrystalQuarterlyReviewPack({ ...CRYSTAL_QUARTER_INPUT_INVESTIGATE_WEAK_PROTECT, ...OPTS });
  const md = renderCrystalQuarterlyReviewPackMarkdown(p);
  for (const h of [
    "## A. Header",
    "## B. Executive summary",
    "### Top 3 wins",
    "## C. Quarterly KPI summary",
    "## D. Monthly distribution summary",
    "## E. Recurring anomaly digest",
    "## F. Risk calls",
    "## G. Recommended focus areas",
    "## H. Appendix",
  ]) {
    assert.ok(md.includes(h), `missing ${h}`);
  }
});

test("buildCrystalQuarterlyFocusAreas returns ordered list", () => {
  const p = buildCrystalQuarterlyReviewPack({ ...CRYSTAL_QUARTER_INPUT_ESCALATE_HARD_CLUSTERS, ...OPTS });
  const areas = buildCrystalQuarterlyFocusAreas(p);
  assert.ok(areas.length >= 4);
  assert.ok(areas[0].toLowerCase().includes("prioritize") || areas[0].toLowerCase().includes("inspect"));
});
