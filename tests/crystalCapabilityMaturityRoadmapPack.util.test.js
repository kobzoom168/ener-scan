import test from "node:test";
import assert from "node:assert/strict";
import {
  MATURITY_REVIEW_PACK_VERSION,
  buildCrystalCapabilityMaturityRoadmapPack,
  buildCrystalCapabilityMaturityAssessment,
  buildCrystalOperatingRoadmap,
  renderCrystalCapabilityMaturityRoadmapPackMarkdown,
} from "../src/utils/crystalCapabilityMaturityRoadmapPack.util.js";
import {
  MATURITY_INPUT_EMERGING_IMPROVING,
  MATURITY_INPUT_ROUTING_RELEASE_HEAVY,
  MATURITY_INPUT_SNAPSHOT_WORDING_FRAGILE,
  MATURITY_INPUT_STABLE_SCALABLE,
  MATURITY_INPUT_THAI_HEAVY_STABLE,
  MATURITY_INPUT_WORDING_DB_GAP,
} from "./fixtures/crystalCapabilityMaturityRoadmapPack.fixture.js";

test("mature annual evidence -> high overall maturity band", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_STABLE_SCALABLE);
  assert.equal(p.overallMaturityBand, "scalable");
  assert.equal(p.overallMaturityLevel, "L4");
});

test("emerging annual -> mid maturity band", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_EMERGING_IMPROVING);
  assert.ok(["emerging", "stable"].includes(p.overallMaturityBand));
  assert.ok(["L2", "L3", "L4"].includes(p.overallMaturityLevel));
});

test("wording/DB recurring concerns -> foundation-style roadmap items", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_WORDING_DB_GAP);
  const text = [
    ...p.foundationInvestments,
    ...p.operatingRoadmap.invest_next_quarter.map((x) => x.title),
  ].join(" ");
  assert.match(text, /fallback|template|DB|crystal/i);
});

test("routing/release drift heavy -> escalate-style risk and routing investment", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_ROUTING_RELEASE_HEAVY);
  assert.ok(p.evidenceBackedRisks.some((r) => /escalate|mismatch|hard/i.test(r)));
  const invest = p.operatingRoadmap.invest_next_quarter.map((x) => x.category).join(" ");
  assert.match(invest, /routing|db|wording|release|telemetry|ops/);
});

test("executive summary fields", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_STABLE_SCALABLE);
  const ex = p.executiveSummary;
  assert.ok(ex.executiveSummaryHeadline.length > 10);
  assert.ok(ex.executiveSummaryBody.length > 5);
  assert.equal(ex.top3Strengths.length, 3);
  assert.equal(ex.top3Risks.length, 3);
  assert.equal(ex.top3RecommendedMoves.length, 3);
});

test("operating summary fields", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_EMERGING_IMPROVING);
  const o = p.operatingSummary;
  assert.ok(o.operatingSummaryHeadline.length > 5);
  assert.equal(o.topOperationalStrengths.length, 3);
  assert.equal(o.topOperationalGaps.length, 3);
  assert.equal(o.topOperationalNextActions.length, 3);
});

test("roadmap summary fields", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_WORDING_DB_GAP);
  const r = p.roadmapSummary;
  assert.ok(r.roadmapSummaryHeadline.length > 5);
  assert.equal(r.top3QuickWins.length, 3);
  assert.equal(r.top3FoundationInvestments.length, 3);
  assert.equal(r.top3ScaleUpInvestments.length, 3);
});

test("domain assessment shape stable", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_STABLE_SCALABLE);
  assert.equal(p.domainAssessments.length, 6);
  for (const d of p.domainAssessments) {
    for (const k of [
      "domainId",
      "domainTitle",
      "maturityLevel",
      "maturityLabel",
      "summary",
      "evidence",
      "keyStrengths",
      "keyGaps",
      "recommendedNextStep",
    ]) {
      assert.ok(k in d);
    }
    assert.ok(/^L[1-4]$/.test(d.maturityLevel));
    assert.ok(["fragile", "emerging", "stable", "scalable"].includes(d.maturityLabel));
  }
});

test("roadmap buckets contain items when gaps exist", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_SNAPSHOT_WORDING_FRAGILE);
  const buckets = p.operatingRoadmap;
  const total =
    buckets.maintain_now.length +
    buckets.stabilize_next.length +
    buckets.invest_next_quarter.length +
    buckets.defer_for_now.length;
  assert.ok(total >= 1);
});

test("non-crystal thai-heavy does not break maturity pack", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_THAI_HEAVY_STABLE);
  assert.equal(p.domainAssessments.length, 6);
  assert.ok(p.executiveSummary.executiveSummaryBody.length > 0);
});

test("reviewPackVersion present", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_STABLE_SCALABLE);
  assert.equal(p.reviewPackVersion, MATURITY_REVIEW_PACK_VERSION);
});

test("buildCrystalCapabilityMaturityAssessment and buildCrystalOperatingRoadmap", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_EMERGING_IMPROVING);
  const a = buildCrystalCapabilityMaturityAssessment(p);
  assert.equal(a.overallMaturityLevel, p.overallMaturityLevel);
  const r = buildCrystalOperatingRoadmap(p);
  assert.ok(Array.isArray(r.maintain_now));
  assert.ok(Array.isArray(r.invest_next_quarter));
});

test("markdown: required sections", () => {
  const p = buildCrystalCapabilityMaturityRoadmapPack(MATURITY_INPUT_STABLE_SCALABLE);
  const md = renderCrystalCapabilityMaturityRoadmapPackMarkdown(p);
  for (const h of [
    "## A. Header",
    "## B. Executive summary",
    "### Operating summary",
    "### Roadmap summary",
    "## C. Capability maturity overview",
    "## D. Domain assessments",
    "## E. Operating roadmap",
    "## F. Operating risk calls",
    "## G. Recommended strategic focus",
    "## H. Appendix",
  ]) {
    assert.ok(md.includes(h), `missing ${h}`);
  }
});
