import test from "node:test";
import assert from "node:assert/strict";
import {
  OWNERSHIP_MODEL_VERSION,
  OWNERSHIP_REVIEW_PACK_VERSION,
  buildCrystalArtifactOwnershipModel,
  buildCrystalArtifactOwnershipModelTable,
  renderCrystalArtifactOwnershipModelMarkdown,
} from "../src/utils/crystalArtifactOwnershipModel.util.js";
import { OS_INPUT_STRONG_STACK } from "./fixtures/crystalOperatingSystemPack.fixture.js";

test("clear ownership case", () => {
  const m = buildCrystalArtifactOwnershipModel(OS_INPUT_STRONG_STACK());
  const row = m.artifactOwnershipRows.find((r) => r.artifactId === "monthly_scorecard");
  assert.equal(row?.ownershipStatus, "clear");
  const linter = m.artifactOwnershipRows.find((r) => r.artifactId === "artifact_contract_linter");
  assert.equal(linter?.ownershipStatus, "clear");
});

test("partial ownership case", () => {
  const m = buildCrystalArtifactOwnershipModel({});
  const annual = m.artifactOwnershipRows.find((r) => r.artifactId === "annual_operating_review_pack");
  assert.equal(annual?.ownershipStatus, "partial");
});

test("unowned artifact case", () => {
  const m = buildCrystalArtifactOwnershipModel({});
  assert.ok(m.unownedArtifacts.includes("multi_year_history_external"));
  const row = m.artifactOwnershipRows.find((r) => r.artifactId === "multi_year_history_external");
  assert.equal(row?.ownershipStatus, "unowned");
});

test("approval path present case", () => {
  const m = buildCrystalArtifactOwnershipModel({});
  assert.ok(m.approvalPaths.some((p) => p.pathId === "approve_contract_util_change"));
  assert.ok(m.approvalPaths.some((p) => String(p.approves).includes("crystal_repo_engineering")));
});

test("escalation path present case", () => {
  const m = buildCrystalArtifactOwnershipModel({});
  assert.ok(m.escalationPaths.some((e) => e.pathId === "escalate_unclear_ownership"));
  assert.ok(m.escalationPaths.some((e) => e.escalatesTo === "artifact_stack_platform_owner"));
});

test("owner coverage status computed correctly", () => {
  const m = buildCrystalArtifactOwnershipModel({});
  assert.ok(["strong", "partial", "weak"].includes(m.ownerCoverageStatus));
  if (m.unownedArtifacts.length > 0) assert.equal(m.ownerCoverageStatus, "weak");
});

test("ownership row shape stable", () => {
  const m = buildCrystalArtifactOwnershipModel({});
  for (const r of m.artifactOwnershipRows) {
    for (const k of [
      "artifactId",
      "title",
      "primaryOwnerRole",
      "secondaryOwnerRoles",
      "reviewerRoles",
      "approvalRole",
      "escalationRole",
      "responsibilityAreas",
      "ownershipStatus",
      "knownGaps",
      "recommendedNextAction",
    ]) {
      assert.ok(k in r);
    }
    assert.ok(Array.isArray(r.secondaryOwnerRoles));
    assert.ok(Array.isArray(r.reviewerRoles));
    assert.ok(Array.isArray(r.responsibilityAreas));
    assert.ok(Array.isArray(r.knownGaps));
  }
});

test("review responsibility map shape stable", () => {
  const m = buildCrystalArtifactOwnershipModel({});
  assert.equal(m.reviewResponsibilityMap.length, 9);
  for (const x of m.reviewResponsibilityMap) {
    for (const k of [
      "responsibilityId",
      "title",
      "ownerRole",
      "backupRole",
      "appliesToArtifacts",
      "failureModeIfMissing",
      "recommendedGuardrail",
    ]) {
      assert.ok(k in x);
    }
    assert.ok(Array.isArray(x.appliesToArtifacts));
  }
});

test("external / future artifact handled correctly", () => {
  const m = buildCrystalArtifactOwnershipModel({});
  const row = m.artifactOwnershipRows.find((r) => r.artifactId === "multi_year_history_external");
  assert.ok(row?.knownGaps.some((g) => /external|generator|repo/i.test(g)));
});

test("ownershipModelVersion present", () => {
  const m = buildCrystalArtifactOwnershipModel({});
  assert.equal(m.ownershipModelVersion, OWNERSHIP_MODEL_VERSION);
});

test("reviewPackVersion present", () => {
  const m = buildCrystalArtifactOwnershipModel({});
  assert.equal(m.reviewPackVersion, OWNERSHIP_REVIEW_PACK_VERSION);
});

test("markdown renders", () => {
  const md = renderCrystalArtifactOwnershipModelMarkdown(buildCrystalArtifactOwnershipModel({}));
  assert.ok(md.includes("ownership model"));
});

test("ownership model table export", () => {
  const t = buildCrystalArtifactOwnershipModelTable();
  assert.equal(t.ownershipModelVersion, OWNERSHIP_MODEL_VERSION);
  assert.ok(Array.isArray(t.responsibilityIds));
});
