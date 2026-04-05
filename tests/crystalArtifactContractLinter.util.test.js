import test from "node:test";
import assert from "node:assert/strict";
import {
  LINTER_VERSION,
  LINTER_REVIEW_PACK_VERSION,
  artifactSchemas,
  buildCrystalArtifactContractLinter,
  buildCrystalArtifactContractMap,
  renderCrystalArtifactContractLinterMarkdown,
} from "../src/utils/crystalArtifactContractLinter.util.js";
import { buildCrystalArtifactManifest } from "../src/utils/crystalArtifactManifest.util.js";
import { buildCrystalCapabilityMaturityRoadmapPack } from "../src/utils/crystalCapabilityMaturityRoadmapPack.util.js";
import { buildCrystalOperatingSystemPack } from "../src/utils/crystalOperatingSystemPack.util.js";
import {
  OS_INPUT_STRONG_STACK,
  OS_INPUT_THAI_HEAVY,
} from "./fixtures/crystalOperatingSystemPack.fixture.js";

test("healthy contract case -> strong readiness", () => {
  const r = buildCrystalArtifactContractLinter(OS_INPUT_STRONG_STACK());
  assert.equal(r.contractReadinessStatus, "strong");
  assert.equal(r.hardFailures.length, 0);
});

test("missing required field case -> hard failure on capability", () => {
  const base = OS_INPUT_STRONG_STACK();
  const cap = buildCrystalCapabilityMaturityRoadmapPack({
    annualOperatingReviewPack: base.annualOperatingReviewPack,
    generatedAt: base.generatedAt,
  });
  const bad = { ...cap };
  delete bad.domainAssessments;
  const r = buildCrystalArtifactContractLinter({
    ...base,
    capabilityMaturityRoadmapPack: bad,
  });
  assert.ok(r.hardFailures.some((f) => f.artifactId === "capability_maturity_roadmap_pack"));
  assert.equal(r.contractReadinessStatus, "weak");
});

test("missing version field case -> missing_version on manifest", () => {
  const base = OS_INPUT_STRONG_STACK();
  const man = buildCrystalArtifactManifest(base);
  const bad = { ...man, reviewPackVersion: undefined };
  const r = buildCrystalArtifactContractLinter({
    ...base,
    artifactManifest: bad,
  });
  const c = r.contractChecks.find((x) => x.artifactId === "artifact_manifest");
  assert.equal(c?.versionStatus, "missing_version");
  assert.ok(r.hardFailures.length >= 1);
});

test("unexpected field drift case -> warnings", () => {
  const base = OS_INPUT_STRONG_STACK();
  const os = buildCrystalOperatingSystemPack(base);
  const drift = { ...os, _driftProbe: true };
  const r = buildCrystalArtifactContractLinter({
    ...base,
    operatingSystemPack: drift,
  });
  assert.ok(r.warnings.some((w) => w.unexpectedFields.includes("_driftProbe")));
});

test("hard vs soft failures classified correctly", () => {
  const r = buildCrystalArtifactContractLinter({});
  const hardIds = new Set(r.hardFailures.map((f) => f.artifactId));
  assert.ok(!hardIds.has("annual_operating_review_pack"));
  for (const f of r.softFailures) {
    assert.equal(f.artifactId, "annual_operating_review_pack");
  }
});

test("schema guard result shape stable", () => {
  const r = buildCrystalArtifactContractLinter(OS_INPUT_STRONG_STACK());
  for (const s of r.schemaGuardResults) {
    assert.ok("artifactId" in s);
    assert.ok("parseOk" in s);
    assert.ok("shapeOk" in s);
    assert.ok("versionStatus" in s);
  }
});

test("artifact schema rows present", () => {
  assert.ok(artifactSchemas.length >= 7);
  assert.ok(artifactSchemas.some((a) => a.contractKind === "external_or_future"));
});

test("external / future artifact handled correctly", () => {
  const r = buildCrystalArtifactContractLinter(OS_INPUT_STRONG_STACK());
  const ext = r.schemaGuardResults.find((s) => s.artifactId === "multi_year_history_external");
  assert.ok(ext);
  assert.equal(ext.versionStatus, "not_applicable");
});

test("linterVersion present", () => {
  const r = buildCrystalArtifactContractLinter({});
  assert.equal(r.linterVersion, LINTER_VERSION);
});

test("reviewPackVersion present", () => {
  const r = buildCrystalArtifactContractLinter({});
  assert.equal(r.reviewPackVersion, LINTER_REVIEW_PACK_VERSION);
});

test("contract map export", () => {
  const m = buildCrystalArtifactContractMap();
  assert.ok(m.requiredFieldsByArtifact.artifact_manifest);
  assert.ok(Array.isArray(m.knownKeySets.artifact_manifest));
});

test("markdown renders", () => {
  const md = renderCrystalArtifactContractLinterMarkdown(buildCrystalArtifactContractLinter(OS_INPUT_STRONG_STACK()));
  assert.ok(md.includes("contract_artifact_manifest"));
});

test("Thai-heavy inputs do not break linter", () => {
  const r = buildCrystalArtifactContractLinter(OS_INPUT_THAI_HEAVY());
  assert.ok(r.contractChecks.length >= 6);
});
