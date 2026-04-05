import test from "node:test";
import assert from "node:assert/strict";
import {
  OS_REVIEW_PACK_VERSION,
  buildCrystalOperatingSystemPack,
  buildCrystalUnifiedReviewStack,
  buildCrystalOperatingControlMap,
  renderCrystalOperatingSystemPackMarkdown,
} from "../src/utils/crystalOperatingSystemPack.util.js";
import {
  OS_INPUT_STRONG_STACK,
  OS_INPUT_THAI_HEAVY,
  OS_INPUT_WEAK_CONTINUITY,
  OS_INPUT_WEAK_RELEASE_LINKAGE,
} from "./fixtures/crystalOperatingSystemPack.fixture.js";

test("strong stack case -> linkage and continuity high", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_STRONG_STACK());
  assert.equal(p.evidenceContinuityStatus, "strong");
  assert.equal(p.releaseReviewLinkageStatus, "strong");
  assert.equal(p.roadmapLinkageStatus, "strong");
  const strong = (p.operatingControlMap || []).filter((c) => c.status === "strong").length;
  assert.ok(strong >= 4, `expected several strong controls, got ${strong}`);
});

test("evidence continuity weak case -> breakpoints detected", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_WEAK_CONTINUITY);
  assert.ok(["weak", "partial"].includes(p.evidenceContinuityStatus));
  assert.ok((p.evidenceBreakpoints || []).length >= 1);
});

test("release linkage weak case -> not strong", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_WEAK_RELEASE_LINKAGE());
  assert.notEqual(p.releaseReviewLinkageStatus, "strong");
  assert.equal(p.releaseReviewLinkageStatus, "partial");
});

test("executive summary fields present", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_STRONG_STACK());
  const ex = p.executiveSummary;
  assert.ok(ex.executiveSummaryHeadline.length > 5);
  assert.ok(ex.executiveSummaryBody.length > 10);
  assert.equal(ex.top3Strengths.length, 3);
  assert.equal(ex.top3Risks.length, 3);
  assert.equal(ex.top3RecommendedMoves.length, 3);
});

test("operating summary fields present", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_WEAK_RELEASE_LINKAGE());
  const o = p.operatingSummary;
  assert.ok(o.operatingSummaryHeadline.length > 5);
  assert.equal(o.topOperationalStrengths.length, 3);
  assert.equal(o.topOperationalGaps.length, 3);
  assert.equal(o.topOperationalNextActions.length, 3);
});

test("system summary fields present", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_STRONG_STACK());
  const s = p.systemSummary;
  assert.ok(s.systemSummaryHeadline.length > 5);
  assert.ok(s.systemSummaryBody.length > 10);
  assert.equal(s.top3UnifiedStackHighlights.length, 3);
  assert.equal(s.top3ControlGaps.length, 3);
  assert.equal(s.top3LinkageUpgrades.length, 3);
});

test("layer map shape stable", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_STRONG_STACK());
  const stack = buildCrystalUnifiedReviewStack(p);
  assert.ok(Array.isArray(stack.layers));
  assert.equal(stack.layers.length, 8);
  for (const l of stack.layers) {
    for (const k of [
      "layerId",
      "layerTitle",
      "role",
      "primaryInputs",
      "primaryOutputs",
      "primaryQuestionsAnswered",
      "consumers",
      "currentStatus",
      "knownGaps",
    ]) {
      assert.ok(k in l);
    }
  }
});

test("control map shape stable", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_STRONG_STACK());
  const m = buildCrystalOperatingControlMap(p);
  assert.equal(m.controls.length, 8);
  for (const c of m.controls) {
    for (const k of ["controlId", "controlTitle", "status", "summary", "evidence", "gaps", "nextUpgrade"]) {
      assert.ok(k in c);
    }
    assert.ok(["missing", "partial", "working", "strong"].includes(c.status));
  }
});

test("non-crystal / Thai-heavy context does not pollute system pack", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_THAI_HEAVY());
  assert.equal(p.annualPackPresent, true);
  assert.equal(p.capabilityPackPresent, true);
  assert.ok(p.executiveSummary.executiveSummaryBody.length > 0);
});

test("reviewPackVersion present", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_WEAK_RELEASE_LINKAGE());
  assert.equal(p.reviewPackVersion, OS_REVIEW_PACK_VERSION);
});

test("markdown: required sections", () => {
  const md = renderCrystalOperatingSystemPackMarkdown(buildCrystalOperatingSystemPack(OS_INPUT_STRONG_STACK()));
  for (const s of [
    "## Header",
    "## Executive summary",
    "## Unified review stack overview",
    "## Operating control map",
    "## Evidence continuity",
    "## Release / review / roadmap linkage",
    "## Recommended system improvements",
    "## Appendix",
  ]) {
    assert.ok(md.includes(s), `missing section: ${s}`);
  }
});

test("table-driven: capability helpers mirror pack fields", () => {
  const p = buildCrystalOperatingSystemPack(OS_INPUT_STRONG_STACK());
  assert.deepEqual(buildCrystalUnifiedReviewStack(p), p.unifiedReviewStack);
  assert.deepEqual(buildCrystalOperatingControlMap(p).controls, p.operatingControlMap);
});
