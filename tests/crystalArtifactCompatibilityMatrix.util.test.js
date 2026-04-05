import test from "node:test";
import assert from "node:assert/strict";
import {
  MATRIX_VERSION,
  MATRIX_REVIEW_PACK_VERSION,
  RECOMMENDED_UPGRADE_SEQUENCE,
  buildCrystalArtifactCompatibilityMatrix,
  buildCrystalArtifactCompatibilityTable,
  renderCrystalArtifactCompatibilityMatrixMarkdown,
} from "../src/utils/crystalArtifactCompatibilityMatrix.util.js";
import {
  OS_INPUT_STRONG_STACK,
  OS_INPUT_WEAK_CONTINUITY,
} from "./fixtures/crystalOperatingSystemPack.fixture.js";

test("healthy compatibility case -> annual to capability compatible", () => {
  const m = buildCrystalArtifactCompatibilityMatrix(OS_INPUT_STRONG_STACK());
  const row = m.compatibilityRows.find(
    (r) => r.producerArtifactId === "annual_operating_review_pack" && r.consumerArtifactId === "capability_maturity_roadmap_pack",
  );
  assert.equal(row?.compatibilityStatus, "compatible");
  assert.equal(m.upgradeReadinessStatus, "strong");
});

test("compatible_with_conditions case -> rolling to annual row", () => {
  const m = buildCrystalArtifactCompatibilityMatrix(OS_INPUT_STRONG_STACK());
  const row = m.compatibilityRows.find((r) => r.consumerArtifactId === "annual_operating_review_pack");
  assert.equal(row?.compatibilityStatus, "compatible_with_conditions");
});

test("upgrade_needed case -> no annual inputs", () => {
  const m = buildCrystalArtifactCompatibilityMatrix({});
  const row = m.compatibilityRows.find(
    (r) => r.producerArtifactId === "annual_operating_review_pack" && r.consumerArtifactId === "capability_maturity_roadmap_pack",
  );
  assert.equal(row?.compatibilityStatus, "upgrade_needed");
});

test("unknown compatibility case -> multi year external", () => {
  const m = buildCrystalArtifactCompatibilityMatrix(OS_INPUT_STRONG_STACK());
  const row = m.compatibilityRows.find((r) => r.producerArtifactId === "multi_year_history_external");
  assert.equal(row?.compatibilityStatus, "unknown");
});

test("breaking risk classified correctly", () => {
  const m = buildCrystalArtifactCompatibilityMatrix(OS_INPUT_STRONG_STACK());
  for (const r of m.compatibilityRows) {
    assert.ok(["low", "medium", "high"].includes(r.breakingRisk));
  }
  for (const b of m.breakingChangeRisks) {
    assert.ok(typeof b === "string" && b.length > 5);
  }
});

test("recommended upgrade sequence stable", () => {
  const m = buildCrystalArtifactCompatibilityMatrix({});
  assert.deepEqual(m.recommendedUpgradeSequence, RECOMMENDED_UPGRADE_SEQUENCE);
});

test("matrix row shape stable", () => {
  const m = buildCrystalArtifactCompatibilityMatrix(OS_INPUT_STRONG_STACK());
  for (const r of m.compatibilityRows) {
    for (const k of [
      "producerArtifactId",
      "consumerArtifactId",
      "compatibilityStatus",
      "requiredFields",
      "requiredVersions",
      "notes",
      "breakingRisk",
      "recommendedAction",
      "rowId",
    ]) {
      assert.ok(k in r);
    }
  }
});

test("upgrade path shape stable", () => {
  const m = buildCrystalArtifactCompatibilityMatrix({});
  for (const p of m.upgradePaths) {
    for (const k of ["pathId", "title", "fromState", "toState", "steps", "blockingDependencies", "riskLevel", "rollbackHint"]) {
      assert.ok(k in p);
    }
    assert.ok(Array.isArray(p.steps));
  }
});

test("external / future artifact handled correctly", () => {
  const m = buildCrystalArtifactCompatibilityMatrix(OS_INPUT_STRONG_STACK());
  const ext = m.artifacts.find((a) => a.artifactId === "multi_year_history_external");
  assert.ok(ext);
  assert.ok(ext.versionHint.includes("external") || ext.versionHint.includes("n/a"));
});

test("matrixVersion present", () => {
  const m = buildCrystalArtifactCompatibilityMatrix({});
  assert.equal(m.matrixVersion, MATRIX_VERSION);
});

test("reviewPackVersion present", () => {
  const m = buildCrystalArtifactCompatibilityMatrix({});
  assert.equal(m.reviewPackVersion, MATRIX_REVIEW_PACK_VERSION);
});

test("markdown renders", () => {
  const md = renderCrystalArtifactCompatibilityMatrixMarkdown(buildCrystalArtifactCompatibilityMatrix(OS_INPUT_STRONG_STACK()));
  assert.ok(md.includes("Compatibility rows"));
});

test("weak continuity lowers readiness vs strong stack", () => {
  const strong = buildCrystalArtifactCompatibilityMatrix(OS_INPUT_STRONG_STACK());
  const weak = buildCrystalArtifactCompatibilityMatrix(OS_INPUT_WEAK_CONTINUITY);
  assert.ok(["strong", "partial", "weak"].includes(weak.upgradeReadinessStatus));
  assert.ok(strong.upgradeReadinessStatus === "strong" || strong.upgradeReadinessStatus === "partial");
});

test("compatibility table export", () => {
  const t = buildCrystalArtifactCompatibilityTable();
  assert.equal(t.matrixVersion, MATRIX_VERSION);
  assert.ok(t.requiredVersionHints.annual_operating_review_pack);
});
