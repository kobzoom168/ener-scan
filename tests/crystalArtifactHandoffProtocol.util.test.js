import test from "node:test";
import assert from "node:assert/strict";
import {
  HANDOFF_PROTOCOL_VERSION,
  HANDOFF_REVIEW_PACK_VERSION,
  buildCrystalArtifactHandoffProtocol,
  buildCrystalArtifactHandoffProtocolTable,
  renderCrystalArtifactHandoffProtocolMarkdown,
} from "../src/utils/crystalArtifactHandoffProtocol.util.js";

test("low-impact doc-only case", () => {
  const h = buildCrystalArtifactHandoffProtocol({});
  const row = h.artifactHandoffRows.find((r) => r.rowId === "monthly_scorecard__doc_only_change");
  assert.equal(row?.changeType, "doc_only_change");
  assert.equal(row?.consumerImpactLevel, "low");
});

test("contract change case", () => {
  const h = buildCrystalArtifactHandoffProtocol({});
  const row = h.artifactHandoffRows.find((r) => r.rowId === "monthly_scorecard__contract_change");
  assert.equal(row?.changeType, "contract_change");
  assert.ok(row?.requiredArtifactsToUpdate.some((p) => p.includes("crystalMonthlyScorecard")));
});

test("compatibility-impacting case", () => {
  const h = buildCrystalArtifactHandoffProtocol({});
  const row = h.artifactHandoffRows.find((r) => r.changeType === "compatibility_change");
  assert.equal(row?.artifactId, "annual_operating_review_pack");
  assert.equal(row?.consumerImpactLevel, "high");
});

test("missing owner / reviewer case", () => {
  const h = buildCrystalArtifactHandoffProtocol({});
  const row = h.artifactHandoffRows.find((r) => r.artifactId === "telemetry_diagnostics_inputs");
  assert.ok(row?.communicationSteps.some((s) => /unclear|DRI|owner/i.test(s)));
});

test("notification rules present", () => {
  const h = buildCrystalArtifactHandoffProtocol({});
  assert.ok(h.requiredNotifications.length >= 1);
  assert.ok(h.changeCommunicationRules.some((r) => r.ruleId === "notify_on_contract_bump"));
});

test("approval rules present", () => {
  const h = buildCrystalArtifactHandoffProtocol({});
  assert.ok(h.requiredApprovals.some((a) => a.changeType === "contract_change"));
});

test("row shape stable", () => {
  const h = buildCrystalArtifactHandoffProtocol({});
  for (const r of h.artifactHandoffRows) {
    for (const k of [
      "artifactId",
      "changeType",
      "whoMustBeInformed",
      "whoMustReview",
      "whoMustApprove",
      "consumerImpactLevel",
      "requiredArtifactsToUpdate",
      "communicationSteps",
      "rollbackHint",
    ]) {
      assert.ok(k in r);
    }
  }
});

test("handoffProtocolVersion present", () => {
  const h = buildCrystalArtifactHandoffProtocol({});
  assert.equal(h.handoffProtocolVersion, HANDOFF_PROTOCOL_VERSION);
});

test("reviewPackVersion present", () => {
  const h = buildCrystalArtifactHandoffProtocol({});
  assert.equal(h.reviewPackVersion, HANDOFF_REVIEW_PACK_VERSION);
});

test("markdown renders", () => {
  const md = renderCrystalArtifactHandoffProtocolMarkdown(buildCrystalArtifactHandoffProtocol({}));
  assert.ok(md.includes("handoff"));
});

test("change types cover required set", () => {
  const h = buildCrystalArtifactHandoffProtocol({});
  const types = new Set(h.changeTypes.map((c) => c.type));
  for (const t of [
    "contract_change",
    "schema_change",
    "compatibility_change",
    "lifecycle_change",
    "ownership_change",
    "ci_change",
    "doc_only_change",
  ]) {
    assert.ok(types.has(t));
  }
});

test("table export", () => {
  const t = buildCrystalArtifactHandoffProtocolTable();
  assert.ok(Array.isArray(t.rowIds));
});
