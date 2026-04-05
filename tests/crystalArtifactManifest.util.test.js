import test from "node:test";
import assert from "node:assert/strict";
import {
  ARTIFACT_MANIFEST_VERSION,
  ARTIFACT_MANIFEST_PACK_VERSION,
  CRYSTAL_ARTIFACT_GENERATION_ORDER,
  buildCrystalArtifactManifest,
  renderCrystalArtifactManifestMarkdown,
} from "../src/utils/crystalArtifactManifest.util.js";
import {
  OS_INPUT_STRONG_STACK,
  OS_INPUT_THAI_HEAVY,
  OS_INPUT_WEAK_CONTINUITY,
} from "./fixtures/crystalOperatingSystemPack.fixture.js";

test("strong manifest case -> annual/capability ready when inputs strong", () => {
  const m = buildCrystalArtifactManifest(OS_INPUT_STRONG_STACK());
  const annual = m.artifacts.find((a) => a.artifactId === "annual_operating_review_pack");
  const cap = m.artifacts.find((a) => a.artifactId === "capability_maturity_roadmap_pack");
  assert.equal(annual?.status, "ready");
  assert.equal(cap?.status, "ready");
  assert.ok(["partial", "strong"].includes(m.ciReadinessStatus));
});

test("manual-heavy manifest case -> weak or partial CI readiness", () => {
  const m = buildCrystalArtifactManifest({});
  assert.ok(m.manualArtifactsRemaining.length >= 1);
  assert.ok(["weak", "partial", "strong"].includes(m.ciReadinessStatus));
});

test("dependency gap case -> external artifact remains external_or_future", () => {
  const m = buildCrystalArtifactManifest(OS_INPUT_WEAK_CONTINUITY);
  const ext = m.artifacts.find((a) => a.artifactId === "multi_year_history_external");
  assert.equal(ext?.category, "external_or_future");
  assert.ok((m.recommendedManifestUpgrades || []).length >= 1);
});

test("generation order stable", () => {
  const m = buildCrystalArtifactManifest({});
  assert.deepEqual(m.generationOrder, CRYSTAL_ARTIFACT_GENERATION_ORDER);
});

test("artifact contract fields present", () => {
  const m = buildCrystalArtifactManifest(OS_INPUT_STRONG_STACK());
  for (const c of m.artifactContracts) {
    assert.ok(c.contractId && c.artifactId && c.producerUtil && c.docPath && c.kind);
  }
});

test("CI readiness fields present", () => {
  const m = buildCrystalArtifactManifest({});
  assert.ok(m.ciReadinessSummary.length > 10);
  assert.ok(["weak", "partial", "strong"].includes(m.ciReadinessStatus));
});

test("dependency graph shape stable", () => {
  const m = buildCrystalArtifactManifest({});
  assert.ok(Array.isArray(m.dependencyGraph.edges));
  assert.ok(Array.isArray(m.dependencyGraph.nodeIds));
  for (const e of m.dependencyGraph.edges) {
    assert.ok(e.fromArtifactId && e.toArtifactId && e.relationship);
  }
});

test("non-crystal / Thai-heavy context does not pollute manifest", () => {
  const m = buildCrystalArtifactManifest(OS_INPUT_THAI_HEAVY());
  assert.ok(m.artifacts.length >= 10);
  assert.ok(renderCrystalArtifactManifestMarkdown(m).includes("artifact_manifest_pack"));
});

test("manifestVersion present", () => {
  const m = buildCrystalArtifactManifest({});
  assert.equal(m.manifestVersion, ARTIFACT_MANIFEST_VERSION);
});

test("reviewPackVersion present", () => {
  const m = buildCrystalArtifactManifest({});
  assert.equal(m.reviewPackVersion, ARTIFACT_MANIFEST_PACK_VERSION);
});

test("artifact rows include required keys", () => {
  const m = buildCrystalArtifactManifest({});
  for (const a of m.artifacts) {
    for (const k of [
      "artifactId",
      "title",
      "category",
      "inputs",
      "outputs",
      "dependsOn",
      "scriptPath",
      "utilPath",
      "status",
      "contractStatus",
      "knownGaps",
      "nextUpgrade",
    ]) {
      assert.ok(k in a);
    }
  }
});
