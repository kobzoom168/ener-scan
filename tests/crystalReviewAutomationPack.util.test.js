import test from "node:test";
import assert from "node:assert/strict";
import {
  REVIEW_AUTOMATION_PACK_VERSION,
  buildCrystalReviewAutomationPack,
  renderCrystalReviewAutomationPackMarkdown,
} from "../src/utils/crystalReviewAutomationPack.util.js";
import {
  OS_INPUT_STRONG_STACK,
  OS_INPUT_THAI_HEAVY,
  OS_INPUT_WEAK_CONTINUITY,
} from "./fixtures/crystalOperatingSystemPack.fixture.js";
import { buildCrystalOperatingSystemPack } from "../src/utils/crystalOperatingSystemPack.util.js";

test("strong pipeline case -> readiness partial or strong", () => {
  const p = buildCrystalReviewAutomationPack(OS_INPUT_STRONG_STACK());
  assert.ok(["partial", "strong"].includes(p.automationReadinessStatus));
  assert.ok(p.artifactPipelineStages.length >= 6);
  assert.ok(p.generationOrder.includes("annual_operating_review_pack"));
});

test("manual-heavy pipeline case -> weak or partial", () => {
  const p = buildCrystalReviewAutomationPack({});
  assert.ok(["weak", "partial"].includes(p.automationReadinessStatus));
  assert.ok((p.manualStepsRemaining || []).length >= 1);
});

test("dependency gap case -> gaps list non-empty", () => {
  const p = buildCrystalReviewAutomationPack(OS_INPUT_WEAK_CONTINUITY);
  assert.ok((p.automationGaps || []).length >= 1);
  assert.ok((p.artifactDependencies || []).length >= 1);
});

test("pre-built OS pack passthrough", () => {
  const os = buildCrystalOperatingSystemPack(OS_INPUT_STRONG_STACK());
  const p = buildCrystalReviewAutomationPack({ operatingSystemPack: os });
  assert.equal(p.operatingSystemPackVersion, os.reviewPackVersion);
});

test("executive summary fields present", () => {
  const p = buildCrystalReviewAutomationPack(OS_INPUT_STRONG_STACK());
  const ex = p.executiveSummary;
  assert.ok(ex.executiveSummaryHeadline.length > 5);
  assert.equal(ex.top3Strengths.length, 3);
  assert.equal(ex.top3Risks.length, 3);
  assert.equal(ex.top3RecommendedMoves.length, 3);
});

test("operating summary fields present", () => {
  const p = buildCrystalReviewAutomationPack(OS_INPUT_STRONG_STACK());
  const o = p.operatingSummary;
  assert.ok(o.operatingSummaryHeadline.length > 5);
  assert.equal(o.topOperationalStrengths.length, 3);
  assert.equal(o.topOperationalGaps.length, 3);
  assert.equal(o.topOperationalNextActions.length, 3);
});

test("pipeline summary fields present", () => {
  const p = buildCrystalReviewAutomationPack(OS_INPUT_STRONG_STACK());
  const pl = p.pipelineSummary;
  assert.ok(pl.pipelineSummaryHeadline.length > 5);
  assert.equal(pl.top3PipelineHighlights.length, 3);
  assert.equal(pl.top3AutomationGaps.length, 3);
  assert.equal(pl.top3RecommendedUpgrades.length, 3);
});

test("stage map shape stable", () => {
  const p = buildCrystalReviewAutomationPack(OS_INPUT_STRONG_STACK());
  for (const s of p.artifactPipelineStages) {
    for (const k of [
      "stageId",
      "title",
      "inputs",
      "outputs",
      "dependsOn",
      "status",
      "knownFailureModes",
      "nextUpgrade",
    ]) {
      assert.ok(k in s);
    }
    assert.ok(["manual", "semi_automated", "automatable", "ready"].includes(s.status));
  }
});

test("dependency map shape stable", () => {
  const p = buildCrystalReviewAutomationPack(OS_INPUT_STRONG_STACK());
  for (const e of p.artifactDependencies) {
    assert.ok(e.fromStageId && e.toStageId && e.relationship);
  }
});

test("non-crystal / Thai-heavy context does not pollute pack", () => {
  const p = buildCrystalReviewAutomationPack(OS_INPUT_THAI_HEAVY());
  assert.ok(p.executiveSummary.executiveSummaryBody.length > 0);
  assert.ok(p.generationOrder.length >= 6);
});

test("reviewPackVersion present", () => {
  const p = buildCrystalReviewAutomationPack({});
  assert.equal(p.reviewPackVersion, REVIEW_AUTOMATION_PACK_VERSION);
});

test("markdown renders key sections", () => {
  const md = renderCrystalReviewAutomationPackMarkdown(buildCrystalReviewAutomationPack(OS_INPUT_STRONG_STACK()));
  assert.ok(md.includes("## Pipeline stages"));
  assert.ok(md.includes("## Generation order"));
});
