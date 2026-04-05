import test from "node:test";
import assert from "node:assert/strict";
import {
  ANNUAL_REVIEW_PACK_VERSION,
  buildCrystalAnnualOperatingReviewPack,
  buildCrystalAnnualExecutiveSummary,
  buildCrystalAnnualOperatingSummary,
  buildCrystalAnnualOperatingFocusAreas,
  renderCrystalAnnualOperatingReviewPackMarkdown,
} from "../src/utils/crystalAnnualOperatingReviewPack.util.js";
import {
  CRYSTAL_ANNUAL_INPUT_ESCALATE_HARD_CLUSTERS,
  CRYSTAL_ANNUAL_INPUT_EXCELLENT,
  CRYSTAL_ANNUAL_INPUT_GOOD_SOFT_DRIFT,
  CRYSTAL_ANNUAL_INPUT_INVESTIGATE_WEAK_PROTECT,
  CRYSTAL_ANNUAL_INPUT_THAI_HEAVY_STABLE,
  CRYSTAL_ANNUAL_INPUT_WATCH_RECURRING_GENERIC,
} from "./fixtures/crystalAnnualOperatingReviewPack.fixture.js";

const OPTS = { generatedAt: "2027-01-05T12:00:00.000Z" };

test("table-driven: annual score band + ops status", () => {
  const cases = [
    { input: CRYSTAL_ANNUAL_INPUT_EXCELLENT, expectBand: "excellent", expectStatus: "healthy" },
    { input: CRYSTAL_ANNUAL_INPUT_GOOD_SOFT_DRIFT, expectBand: "good", expectStatus: "watch" },
    { input: CRYSTAL_ANNUAL_INPUT_WATCH_RECURRING_GENERIC, expectBand: "watch", expectStatus: "watch" },
    { input: CRYSTAL_ANNUAL_INPUT_INVESTIGATE_WEAK_PROTECT, expectBand: "watch", expectStatus: "investigate" },
    { input: CRYSTAL_ANNUAL_INPUT_ESCALATE_HARD_CLUSTERS, expectBand: "risk", expectStatus: "escalate" },
  ];
  for (const c of cases) {
    const p = buildCrystalAnnualOperatingReviewPack({ ...c.input, ...OPTS });
    assert.equal(p.annualScoreBand, c.expectBand);
    assert.equal(p.annualStatus, c.expectStatus);
  }
});

test("executive summary: required fields", () => {
  const p = buildCrystalAnnualOperatingReviewPack({ ...CRYSTAL_ANNUAL_INPUT_EXCELLENT, ...OPTS });
  const ex = p.executiveSummary;
  assert.ok(ex.executiveSummaryHeadline.length > 5);
  assert.ok(ex.executiveSummaryBody.length > 10);
  assert.equal(ex.top3Wins.length, 3);
  assert.equal(ex.top3Risks.length, 3);
  assert.equal(ex.top3NextActions.length, 3);
  assert.ok(ex.methodNote.includes("nested") || ex.methodNote.includes("rollups"));
});

test("operating summary: required fields", () => {
  const p = buildCrystalAnnualOperatingReviewPack({ ...CRYSTAL_ANNUAL_INPUT_GOOD_SOFT_DRIFT, ...OPTS });
  const o = p.operatingSummary;
  assert.ok(o.operatingSummaryHeadline.length > 5);
  assert.ok(o.operatingSummaryBody.length > 10);
  assert.equal(o.topRecurringOperationalPatterns.length, 3);
  assert.equal(o.topOperatingConcerns.length, 3);
  assert.equal(o.topOperatingNextActions.length, 3);
  assert.ok(o.methodNote.includes("semantics"));
});

test("buildCrystalAnnualExecutiveSummary is deterministic", () => {
  const p = buildCrystalAnnualOperatingReviewPack({ ...CRYSTAL_ANNUAL_INPUT_EXCELLENT, ...OPTS });
  assert.deepEqual(buildCrystalAnnualExecutiveSummary(p), buildCrystalAnnualExecutiveSummary(p));
});

test("KPI pack: headline + operatingImpactSignals", () => {
  const p = buildCrystalAnnualOperatingReviewPack({ ...CRYSTAL_ANNUAL_INPUT_WATCH_RECURRING_GENERIC, ...OPTS });
  const labels = p.annualKpiPack.headlineKpis.map((r) => r.label).join(" ");
  assert.match(labels, /Overall annual quality score/i);
  assert.match(labels, /Aligned rate/i);
  assert.match(labels, /Hard mismatch rate/i);
  assert.ok(p.annualKpiPack.operatingImpactSignals.length >= 5);
});

test("recurring anomaly grouping: watch generic year", () => {
  const p = buildCrystalAnnualOperatingReviewPack({ ...CRYSTAL_ANNUAL_INPUT_WATCH_RECURRING_GENERIC, ...OPTS });
  const row = p.topRecurringAnomalies.find((r) => r.anomalyCode === "generic_codebank_fallback_drift");
  assert.ok(row);
  assert.equal(row.monthsAffected, 12);
});

test("non-crystal / Thai-heavy annual slice", () => {
  const p = buildCrystalAnnualOperatingReviewPack({ ...CRYSTAL_ANNUAL_INPUT_THAI_HEAVY_STABLE, ...OPTS });
  assert.equal(p.annualKpis.totalCrystalCases, 90 * 12);
  assert.ok(p.recommendations.some((r) => /non-crystal|crystal-slice|interpret/i.test(r)));
});

test("output shape + reviewPackVersion", () => {
  const p = buildCrystalAnnualOperatingReviewPack({ ...CRYSTAL_ANNUAL_INPUT_EXCELLENT, ...OPTS });
  assert.equal(p.reviewPackVersion, ANNUAL_REVIEW_PACK_VERSION);
  for (const k of [
    "yearWindowStart",
    "yearWindowEnd",
    "monthsIncluded",
    "quartersIncluded",
    "halfYearsIncluded",
    "annualStatus",
    "overallAnnualQualityScore",
    "annualScoreBand",
    "annualKpis",
    "monthlyStatusDistribution",
    "quarterlyStatusDistribution",
    "halfYearStatusDistribution",
    "executiveSummary",
    "operatingSummary",
    "annualKpiPack",
    "methodNote",
  ]) {
    assert.ok(k in p, `missing ${k}`);
  }
});

test("renderCrystalAnnualOperatingReviewPackMarkdown: key sections", () => {
  const p = buildCrystalAnnualOperatingReviewPack({ ...CRYSTAL_ANNUAL_INPUT_INVESTIGATE_WEAK_PROTECT, ...OPTS });
  const md = renderCrystalAnnualOperatingReviewPackMarkdown(p);
  for (const h of [
    "## A. Header",
    "## B. Executive summary",
    "## C. Annual KPI summary",
    "## D. Period distribution summary",
    "## E. Recurring anomaly digest",
    "## F. Operating risk calls",
    "## G. Recommended strategic focus areas",
    "## H. Operating summary",
    "## I. Appendix",
  ]) {
    assert.ok(md.includes(h), `missing ${h}`);
  }
});

test("buildCrystalAnnualOperatingFocusAreas", () => {
  const p = buildCrystalAnnualOperatingReviewPack({ ...CRYSTAL_ANNUAL_INPUT_ESCALATE_HARD_CLUSTERS, ...OPTS });
  const areas = buildCrystalAnnualOperatingFocusAreas(p);
  assert.ok(areas.length >= 5);
});
