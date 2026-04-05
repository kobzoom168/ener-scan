import test from "node:test";
import assert from "node:assert/strict";
import {
  MASTER_INDEX_VERSION,
  MASTER_REVIEW_PACK_VERSION,
  buildCrystalReviewSystemMasterIndex,
  buildCrystalReviewSystemMasterIndexTable,
  renderCrystalReviewSystemMasterIndexMarkdown,
  renderCrystalReviewSystemCloseoutMarkdown,
} from "../src/utils/crystalReviewSystemMasterIndex.util.js";

test("complete index case", () => {
  const m = buildCrystalReviewSystemMasterIndex({});
  assert.ok(m.artifactIndex.length >= 10);
  assert.ok(m.governanceIndex.length >= 8);
});

test("missing optional artifacts case", () => {
  const m = buildCrystalReviewSystemMasterIndex({});
  assert.ok(m.optionalArtifacts.includes("weekly_quality_review"));
  assert.ok(m.optionalArtifacts.includes("weekly_trend_comparison"));
});

test("usage guide present", () => {
  const m = buildCrystalReviewSystemMasterIndex({});
  assert.ok(m.usageGuide.onboardingReadOrder.length >= 3);
  assert.ok(m.usageGuide.debugReportQuality.length > 10);
});

test("current system gaps present", () => {
  const m = buildCrystalReviewSystemMasterIndex({});
  assert.ok(m.currentSystemGaps.length >= 1);
  assert.ok(m.currentSystemGaps.some((g) => /multi_year|external|telemetry/i.test(g)));
});

test("artifact index shape stable", () => {
  const m = buildCrystalReviewSystemMasterIndex({});
  for (const a of m.artifactIndex) {
    assert.ok("artifactId" in a && "category" in a && "isOptionalBranch" in a);
  }
});

test("governance index shape stable", () => {
  const m = buildCrystalReviewSystemMasterIndex({});
  for (const g of m.governanceIndex) {
    assert.ok(g.id && g.docPath && g.phase);
  }
});

test("automation index shape stable", () => {
  const m = buildCrystalReviewSystemMasterIndex({});
  for (const a of m.automationIndex) {
    assert.ok(a.script && a.purpose);
  }
});

test("masterIndexVersion present", () => {
  const m = buildCrystalReviewSystemMasterIndex({});
  assert.equal(m.masterIndexVersion, MASTER_INDEX_VERSION);
});

test("reviewPackVersion present", () => {
  const m = buildCrystalReviewSystemMasterIndex({});
  assert.equal(m.reviewPackVersion, MASTER_REVIEW_PACK_VERSION);
});

test("closeout markdown renders", () => {
  const m = buildCrystalReviewSystemMasterIndex({});
  const md = renderCrystalReviewSystemCloseoutMarkdown(m);
  assert.ok(md.includes("closeout"));
  assert.ok(md.includes(m.closeoutSummary.slice(0, 40)));
});

test("master markdown renders", () => {
  const md = renderCrystalReviewSystemMasterIndexMarkdown(buildCrystalReviewSystemMasterIndex({}));
  assert.ok(md.includes("master index"));
});

test("table export", () => {
  const t = buildCrystalReviewSystemMasterIndexTable();
  assert.ok(t.governanceDocPaths.length >= 1);
});
