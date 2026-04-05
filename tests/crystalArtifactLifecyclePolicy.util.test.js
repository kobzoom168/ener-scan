import test from "node:test";
import assert from "node:assert/strict";
import {
  LIFECYCLE_POLICY_VERSION,
  LIFECYCLE_REVIEW_PACK_VERSION,
  buildCrystalArtifactLifecyclePolicy,
  buildCrystalArtifactLifecyclePolicyTable,
  renderCrystalArtifactLifecyclePolicyMarkdown,
} from "../src/utils/crystalArtifactLifecyclePolicy.util.js";
import { OS_INPUT_STRONG_STACK } from "./fixtures/crystalOperatingSystemPack.fixture.js";

test("active artifact case", () => {
  const p = buildCrystalArtifactLifecyclePolicy(OS_INPUT_STRONG_STACK());
  const row = p.artifactLifecycleRows.find((r) => r.artifactId === "monthly_scorecard");
  assert.equal(row?.currentLifecycleState, "active");
});

test("transitional artifact case", () => {
  const p = buildCrystalArtifactLifecyclePolicy(OS_INPUT_STRONG_STACK());
  const ext = p.artifactLifecycleRows.find((r) => r.artifactId === "multi_year_history_external");
  assert.equal(ext?.currentLifecycleState, "transitional");
  const meta = p.artifactLifecycleRows.find((r) => r.artifactId === "artifact_ci_spec");
  assert.equal(meta?.currentLifecycleState, "transitional");
});

test("deprecated artifact case", () => {
  const p = buildCrystalArtifactLifecyclePolicy({});
  const row = p.artifactLifecycleRows.find((r) => r.artifactId === "operating_system_pack.layers_field");
  assert.equal(row?.currentLifecycleState, "deprecated");
});

test("retired artifact case", () => {
  const p = buildCrystalArtifactLifecyclePolicy({});
  const row = p.artifactLifecycleRows.find((r) => r.artifactId === "policy_illustration_retired_row");
  assert.equal(row?.currentLifecycleState, "retired");
  assert.ok(String(row?.stateReason).includes("Illustrative"));
});

test("promotion rule case", () => {
  const p = buildCrystalArtifactLifecyclePolicy({});
  const pr = p.promotionRules.find((r) => r.ruleId === "promote_transitional_to_active");
  assert.ok(pr);
  assert.ok(Array.isArray(pr.triggerConditions));
});

test("deprecation rule case", () => {
  const p = buildCrystalArtifactLifecyclePolicy({});
  const dr = p.deprecationRules.find((r) => r.ruleId === "deprecate_with_replacement");
  assert.ok(dr?.summary);
  assert.ok(Array.isArray(dr.requiredChecks));
});

test("backward compatibility rule presence", () => {
  const p = buildCrystalArtifactLifecyclePolicy({});
  assert.ok(p.backwardCompatibilityRules.length >= 1);
  const b = p.backwardCompatibilityRules.find((x) => x.ruleId === "additive_default");
  assert.ok(b?.rollbackHint);
});

test("lifecycle row shape stable", () => {
  const p = buildCrystalArtifactLifecyclePolicy({});
  for (const r of p.artifactLifecycleRows) {
    for (const k of [
      "artifactId",
      "title",
      "currentLifecycleState",
      "stateReason",
      "dependsOn",
      "consumedBy",
      "backwardCompatibilityExpectation",
      "deprecationRisk",
      "promotionCriteria",
      "retirementCriteria",
      "recommendedNextAction",
    ]) {
      assert.ok(k in r);
    }
    assert.ok(Array.isArray(r.dependsOn));
    assert.ok(Array.isArray(r.consumedBy));
  }
});

test("external / future artifact handled correctly", () => {
  const p = buildCrystalArtifactLifecyclePolicy({});
  const row = p.artifactLifecycleRows.find((r) => r.artifactId === "multi_year_history_external");
  assert.ok(row?.stateReason.includes("external") || row?.stateReason.includes("governed"));
});

test("lifecyclePolicyVersion present", () => {
  const p = buildCrystalArtifactLifecyclePolicy({});
  assert.equal(p.lifecyclePolicyVersion, LIFECYCLE_POLICY_VERSION);
});

test("reviewPackVersion present", () => {
  const p = buildCrystalArtifactLifecyclePolicy({});
  assert.equal(p.reviewPackVersion, LIFECYCLE_REVIEW_PACK_VERSION);
});

test("legacy weekly trend row", () => {
  const p = buildCrystalArtifactLifecyclePolicy({});
  const row = p.artifactLifecycleRows.find((r) => r.artifactId === "weekly_trend_comparison");
  assert.equal(row?.currentLifecycleState, "legacy");
});

test("markdown renders", () => {
  const md = renderCrystalArtifactLifecyclePolicyMarkdown(buildCrystalArtifactLifecyclePolicy({}));
  assert.ok(md.includes("lifecycle policy"));
});

test("lifecycle policy table export", () => {
  const t = buildCrystalArtifactLifecyclePolicyTable();
  assert.equal(t.lifecyclePolicyVersion, LIFECYCLE_POLICY_VERSION);
  assert.ok(t.artifactIds.includes("multi_year_history_external"));
});
