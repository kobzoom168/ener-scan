import test from "node:test";
import assert from "node:assert/strict";
import {
  RUNBOOK_VERSION,
  RUNBOOK_REVIEW_PACK_VERSION,
  buildCrystalReleaseGovernanceRunbook,
  buildCrystalReleaseGovernanceRunbookTable,
  renderCrystalReleaseGovernanceRunbookMarkdown,
} from "../src/utils/crystalReleaseGovernanceRunbook.util.js";

test("healthy release case", () => {
  const r = buildCrystalReleaseGovernanceRunbook({});
  assert.ok(["ready", "partial", "blocked"].includes(r.runbookReadinessStatus));
  assert.ok(r.preReleaseChecks.length >= 2);
});

test("rollback candidate case", () => {
  const r = buildCrystalReleaseGovernanceRunbook({});
  assert.ok(r.rollbackRules.some((x) => x.ruleId === "rollback_util_commit"));
});

test("hotfix candidate case", () => {
  const r = buildCrystalReleaseGovernanceRunbook({});
  assert.ok(r.hotfixRules.some((x) => x.ruleId === "hotfix_minimal_diff"));
});

test("ownership escalation case", () => {
  const r = buildCrystalReleaseGovernanceRunbook({});
  assert.ok(r.ownerEscalationMap.some((m) => m.situation.includes("Unclear")));
});

test("pre/post checks present", () => {
  const r = buildCrystalReleaseGovernanceRunbook({});
  assert.ok(r.preReleaseChecks.length >= 1);
  assert.ok(r.postDeployChecks.length >= 1);
});

test("drift response rules present", () => {
  const r = buildCrystalReleaseGovernanceRunbook({});
  assert.ok(r.driftResponseRules.some((d) => d.ruleId === "mismatch_spike"));
  assert.ok(r.driftResponseRules.some((d) => d.ruleId === "contract_schema_drift"));
});

test("output shape stable", () => {
  const r = buildCrystalReleaseGovernanceRunbook({});
  assert.ok(Array.isArray(r.releaseGovernanceRules));
  assert.ok(typeof r.runbookReadinessSummary === "string");
});

test("runbookVersion present", () => {
  const r = buildCrystalReleaseGovernanceRunbook({});
  assert.equal(r.runbookVersion, RUNBOOK_VERSION);
});

test("reviewPackVersion present", () => {
  const r = buildCrystalReleaseGovernanceRunbook({});
  assert.equal(r.reviewPackVersion, RUNBOOK_REVIEW_PACK_VERSION);
});

test("markdown renders", () => {
  const md = renderCrystalReleaseGovernanceRunbookMarkdown(buildCrystalReleaseGovernanceRunbook({}));
  assert.ok(md.includes("Pre-release"));
});

test("table export", () => {
  const t = buildCrystalReleaseGovernanceRunbookTable();
  assert.ok(t.preReleaseCheckIds.includes("regen_ops_tables"));
});
