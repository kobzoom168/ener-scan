import test from "node:test";
import assert from "node:assert/strict";
import {
  CI_SPEC_JOB_ORDER,
  CI_SPEC_VERSION,
  CI_SPEC_REVIEW_PACK_VERSION,
  buildCrystalArtifactCiSpec,
  renderCrystalArtifactCiSpecMarkdown,
} from "../src/utils/crystalArtifactCiValidation.util.js";
import {
  OS_INPUT_STRONG_STACK,
  OS_INPUT_THAI_HEAVY,
  OS_INPUT_WEAK_CONTINUITY,
} from "./fixtures/crystalOperatingSystemPack.fixture.js";

test("healthy CI spec case -> no hard failures when stack inputs strong", () => {
  const spec = buildCrystalArtifactCiSpec(OS_INPUT_STRONG_STACK());
  assert.ok(spec.failHardChecks.every((c) => c.assessment !== "fail"));
  assert.ok(["partial", "strong"].includes(spec.ciReadinessStatus));
});

test("missing artifact case -> hard checks fail", () => {
  const spec = buildCrystalArtifactCiSpec({
    artifactManifest: {
      manifestVersion: "1.0",
      reviewPackVersion: "1",
      generatedAt: "2020-01-01T00:00:00.000Z",
      artifacts: [],
      generationOrder: [],
      dependencyGraph: { edges: [], nodeIds: [] },
      artifactContracts: [],
      artifactStatuses: {},
      manualArtifactsRemaining: [],
      ciReadinessStatus: "weak",
      ciReadinessSummary: "empty",
      recommendedManifestUpgrades: [],
    },
  });
  assert.ok(spec.failHardChecks.some((c) => c.assessment === "fail"));
  assert.equal(spec.ciReadinessStatus, "weak");
});

test("dependency gap case -> manual followups and soft signals", () => {
  const spec = buildCrystalArtifactCiSpec(OS_INPUT_WEAK_CONTINUITY);
  assert.ok(spec.manualFollowups.length >= 1);
  assert.ok(spec.validationChecks.some((c) => c.checkId === "annual_pack_ready_when_inputs_exist"));
});

test("renderability gap case -> hard render check fails", () => {
  const spec = buildCrystalArtifactCiSpec({
    ...OS_INPUT_STRONG_STACK(),
    ciValidationContext: { forceRenderFailure: true },
  });
  const r = spec.validationChecks.find((c) => c.checkId === "markdown_render_smoke");
  assert.equal(r?.assessment, "fail");
});

test("hard vs soft checks classified correctly", () => {
  const spec = buildCrystalArtifactCiSpec(OS_INPUT_STRONG_STACK());
  assert.ok(spec.failHardChecks.length >= 1);
  assert.ok(spec.failSoftChecks.length >= 1);
  assert.ok(spec.failHardChecks.every((c) => c.severity === "hard"));
  assert.ok(spec.failSoftChecks.every((c) => c.severity === "soft"));
});

test("job order stable", () => {
  const spec = buildCrystalArtifactCiSpec({});
  assert.deepEqual(spec.jobOrder, CI_SPEC_JOB_ORDER);
  assert.equal(spec.jobs.length, CI_SPEC_JOB_ORDER.length);
});

test("validation check shape stable", () => {
  const spec = buildCrystalArtifactCiSpec(OS_INPUT_STRONG_STACK());
  for (const c of spec.validationChecks) {
    for (const k of [
      "checkId",
      "title",
      "scope",
      "severity",
      "summary",
      "expectedCondition",
      "failureMeaning",
      "recommendedAction",
      "assessment",
      "jobId",
    ]) {
      assert.ok(k in c);
    }
  }
});

test("manual followups present when expected", () => {
  const spec = buildCrystalArtifactCiSpec(OS_INPUT_STRONG_STACK());
  assert.ok(spec.manualFollowups.some((m) => /manual|rolling|release/i.test(m)));
});

test("ciSpecVersion present", () => {
  const spec = buildCrystalArtifactCiSpec({});
  assert.equal(spec.ciSpecVersion, CI_SPEC_VERSION);
});

test("reviewPackVersion present", () => {
  const spec = buildCrystalArtifactCiSpec({});
  assert.equal(spec.reviewPackVersion, CI_SPEC_REVIEW_PACK_VERSION);
});

test("markdown renders", () => {
  const md = renderCrystalArtifactCiSpecMarkdown(buildCrystalArtifactCiSpec(OS_INPUT_STRONG_STACK()));
  assert.ok(md.includes("validate_artifact_manifest"));
});

test("Thai-heavy input does not break CI spec", () => {
  const spec = buildCrystalArtifactCiSpec(OS_INPUT_THAI_HEAVY());
  assert.ok(spec.validationChecks.length >= 8);
});
