/**
 * Artifact handoff protocol + change communication rules (offline descriptors only).
 * Phase 17.7 — repo reality; does **not** change generators, routing, wording, or mismatch semantics.
 *
 * @module crystalArtifactHandoffProtocol.util
 */

import { buildCrystalArtifactManifest } from "./crystalArtifactManifest.util.js";
import { buildCrystalArtifactOwnershipModel } from "./crystalArtifactOwnershipModel.util.js";

export const HANDOFF_PROTOCOL_VERSION = "1.0";
export const HANDOFF_REVIEW_PACK_VERSION = "1";

/** @typedef {"contract_change"|"schema_change"|"compatibility_change"|"lifecycle_change"|"ownership_change"|"ci_change"|"doc_only_change"} HandoffChangeType */

const CHANGE_TYPES = /** @type {{ type: HandoffChangeType, summary: string }[]} */ ([
  { type: "contract_change", summary: "Export JSON shape, KPI fields, or reviewPackVersion on a generator util." },
  { type: "schema_change", summary: "Top-level keys, KNOWN_KEYS, or CI validation expectations." },
  { type: "compatibility_change", summary: "Producer/consumer edges, semver story, or matrix rows." },
  { type: "lifecycle_change", summary: "Deprecate, retire, or change lifecycle state documentation." },
  { type: "ownership_change", summary: "Primary owner / reviewer roles in ownership model." },
  { type: "ci_change", summary: "CI spec jobs, checks, or table JSON for artifact gates." },
  { type: "doc_only_change", summary: "Markdown/docs with no JSON contract impact — still notify if referenced." },
]);

function buildHandoffRows() {
  const eng = "crystal_repo_engineering";
  const product = "product_review_crystal";
  const platform = "artifact_stack_platform_owner";
  const ops = "ops_analytics_inputs";
  const telemetry = "telemetry_diagnostics_owner";

  return [
    {
      rowId: "monthly_scorecard__doc_only_change",
      artifactId: "monthly_scorecard",
      changeType: /** @type {HandoffChangeType} */ ("doc_only_change"),
      whoMustBeInformed: [eng, ops],
      whoMustReview: [eng],
      whoMustApprove: eng,
      consumerImpactLevel: "low",
      requiredArtifactsToUpdate: ["docs/ops/crystal-monthly-scorecard.md (if behavior described)"],
      communicationSteps: ["PR description: doc-only", "Skip manifest table if no JSON change"],
      rollbackHint: "Revert docs commit.",
    },
    {
      rowId: "monthly_scorecard__contract_change",
      artifactId: "monthly_scorecard",
      changeType: "contract_change",
      whoMustBeInformed: [eng, ops, platform],
      whoMustReview: [eng, platform],
      whoMustApprove: eng,
      consumerImpactLevel: "medium",
      requiredArtifactsToUpdate: [
        "src/utils/crystalMonthlyScorecard.util.js",
        "docs/ops/tables/crystal-artifact-manifest.json",
        "tests/crystalMonthlyScorecard.util.test.js",
      ],
      communicationSteps: [
        "Bump reviewPackVersion in util if semantics change",
        "Regenerate manifest + compatibility matrix tables",
        "Note downstream: quarterly_review_pack",
      ],
      rollbackHint: "Revert util + regenerate ops tables from prior commit.",
    },
    {
      rowId: "annual_operating_review_pack__compatibility_change",
      artifactId: "annual_operating_review_pack",
      changeType: "compatibility_change",
      whoMustBeInformed: [product, eng, platform],
      whoMustReview: [product, eng],
      whoMustApprove: product,
      consumerImpactLevel: "high",
      requiredArtifactsToUpdate: [
        "crystalArtifactCompatibilityMatrix.util.js narrative rows",
        "docs/ops/tables/crystal-artifact-compatibility-matrix.json",
        "capability_maturity_roadmap_pack consumers",
      ],
      communicationSteps: [
        "Update matrix annual→capability row",
        "Align lifecycle policy if deprecation involved",
        "Announce in PR: KPI semantics",
      ],
      rollbackHint: "Restore annual util + matrix JSON; rebuild capability from embedded annual.",
    },
    {
      rowId: "multi_year_history_external__ownership_change",
      artifactId: "multi_year_history_external",
      changeType: "ownership_change",
      whoMustBeInformed: [product, platform],
      whoMustReview: [platform],
      whoMustApprove: platform,
      consumerImpactLevel: "low",
      requiredArtifactsToUpdate: ["crystalArtifactOwnershipModel.util.js row", "docs/ops/crystal-artifact-ownership-model.json"],
      communicationSteps: [
        "Mark owner still **unassigned_in_repo** unless util lands — do not fake DRI",
        "If adding generator later: new manifest row first",
      ],
      rollbackHint: "Revert ownership model util + table JSON.",
    },
    {
      rowId: "artifact_contract_linter__schema_change",
      artifactId: "artifact_contract_linter",
      changeType: "schema_change",
      whoMustBeInformed: [eng, platform],
      whoMustReview: [eng, platform],
      whoMustApprove: eng,
      consumerImpactLevel: "medium",
      requiredArtifactsToUpdate: ["KNOWN_KEYS in contract linter util", "docs/ops/tables as needed"],
      communicationSteps: ["Extend keys in same PR as pack field adds", "Run crystalArtifactContractLinter tests"],
      rollbackHint: "Revert KNOWN_KEYS + pack change together.",
    },
    {
      rowId: "artifact_ci_spec__ci_change",
      artifactId: "artifact_ci_spec",
      changeType: "ci_change",
      whoMustBeInformed: [platform, eng],
      whoMustReview: [platform],
      whoMustApprove: platform,
      consumerImpactLevel: "medium",
      requiredArtifactsToUpdate: ["crystalArtifactCiValidation.util.js", "docs/ops/tables/crystal-artifact-ci-spec.json"],
      communicationSteps: ["Document hard vs soft failure policy in PR", "Link manifest readiness"],
      rollbackHint: "Revert CI spec util + committed table JSON.",
    },
    {
      rowId: "artifact_lifecycle_policy__lifecycle_change",
      artifactId: "artifact_lifecycle_policy",
      changeType: "lifecycle_change",
      whoMustBeInformed: [platform, product, eng],
      whoMustReview: [platform, eng],
      whoMustApprove: platform,
      consumerImpactLevel: "low",
      requiredArtifactsToUpdate: ["crystalArtifactLifecyclePolicy.util.js", "docs/ops/tables/crystal-artifact-lifecycle-policy.json"],
      communicationSteps: ["Pair with JSDoc/docs if deprecating a field", "Update deprecationSignals cross-refs"],
      rollbackHint: "Revert lifecycle util + JSON table.",
    },
    {
      rowId: "telemetry_diagnostics_inputs__missing_owner_case",
      artifactId: "telemetry_diagnostics_inputs",
      changeType: "contract_change",
      whoMustBeInformed: [telemetry, eng, platform],
      whoMustReview: [telemetry, eng],
      whoMustApprove: platform,
      consumerImpactLevel: "medium",
      requiredArtifactsToUpdate: ["visible wording / report modules", "ownership model knownGaps"],
      communicationSteps: [
        "**Owner unclear in-repo** — assign DRI in PR description or follow-up ticket",
        "Notify mismatch_metrics_artifact consumers",
      ],
      rollbackHint: "Revert telemetry-related util changes; re-validate mismatch metrics tests.",
    },
  ];
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalArtifactHandoffProtocol(inputs = {}, options = {}) {
  const manifest = buildCrystalArtifactManifest(inputs, options);
  const ownership = buildCrystalArtifactOwnershipModel(inputs, options);

  const artifactHandoffRows = buildHandoffRows().map((r) => ({
    ...r,
    whoMustBeInformed: [...r.whoMustBeInformed],
    whoMustReview: [...r.whoMustReview],
    requiredArtifactsToUpdate: [...r.requiredArtifactsToUpdate],
    communicationSteps: [...r.communicationSteps],
  }));

  const changeCommunicationRules = [
    {
      ruleId: "notify_on_contract_bump",
      summary: "Any reviewPackVersion or export shape change requires manifest + matrix table regeneration.",
      appliesWhen: ["contract_change", "compatibility_change"],
    },
    {
      ruleId: "pair_docs_and_code",
      summary: "docs/ops markdown must match util constants in the same PR when behavior is described.",
      appliesWhen: ["contract_change", "lifecycle_change"],
    },
    {
      ruleId: "consumer_chain_announce",
      summary: "Annual/capability/OS changes: list downstream artifactIds in PR body.",
      appliesWhen: ["compatibility_change", "contract_change"],
    },
  ];

  const requiredNotifications = [
    { trigger: "contract_change on rolling chain", channels: ["PR description", "Regenerated JSON under docs/ops/tables/"] },
    { trigger: "schema_change on linter", channels: ["PR", "Extended KNOWN_KEYS diff visible"] },
    { trigger: "ownership_change", channels: ["PR", "crystal-artifact-ownership-model.json"] },
  ];

  const requiredApprovals = [
    { changeType: "doc_only_change", minApprovers: ["crystal_repo_engineering"], note: "Single reviewer if truly doc-only." },
    { changeType: "contract_change", minApprovers: ["crystal_repo_engineering", "artifact_stack_platform_owner"], note: "Platform for cross-artifact blast radius." },
    { changeType: "compatibility_change", minApprovers: ["product_review_crystal", "crystal_repo_engineering"], note: "Product when KPI semantics move." },
  ];

  const consumerImpactRules = [
    { level: "low", meaning: "No downstream JSON contract change; optional consumers only." },
    { level: "medium", meaning: "Regenerate one or more ops tables; CI may warn." },
    { level: "high", meaning: "Downstream packs (capability/OS) must be rebuilt or compatibility matrix shows upgrade_needed." },
  ];

  /** @type {"strong"|"partial"|"weak"} */
  let handoffReadinessStatus = "strong";
  if (ownership.ownerCoverageStatus === "weak") handoffReadinessStatus = "weak";
  else if (ownership.ownerCoverageStatus === "partial") handoffReadinessStatus = "partial";

  const handoffReadinessSummary =
    handoffReadinessStatus === "strong"
      ? "Ownership coverage acceptable — use handoff rows as PR checklist."
      : handoffReadinessStatus === "partial"
        ? "Some artifacts have partial/unclear owners — explicitly name DRI in PR when touching them."
        : "Unowned/unclear artifacts exist — add human routing in PR description before merging risky changes.";

  const recommendedHandoffUpgrades = [
    "Add PR template snippet linking artifactId + changeType to a handoff row.",
    "Automate `node scripts/ops/generateCrystalArtifactManifest.mjs --write-table` in CI advisory job.",
    "Keep compatibility matrix JSON committed next to contract PRs.",
  ];

  return {
    handoffProtocolVersion: HANDOFF_PROTOCOL_VERSION,
    reviewPackVersion: HANDOFF_REVIEW_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    changeTypes: CHANGE_TYPES,
    artifactHandoffRows,
    changeCommunicationRules,
    requiredNotifications,
    requiredApprovals,
    consumerImpactRules,
    handoffReadinessStatus,
    handoffReadinessSummary,
    recommendedHandoffUpgrades,
    contextSnapshot: {
      manifestCiReadiness: manifest.ciReadinessStatus,
      ownerCoverageStatus: ownership.ownerCoverageStatus,
    },
    methodNote:
      "Handoff protocol is descriptive — it does not enforce CODEOWNERS or change routing/wording/mismatch behavior.",
  };
}

export function buildCrystalArtifactHandoffProtocolTable() {
  const h = buildCrystalArtifactHandoffProtocol();
  return {
    handoffProtocolVersion: HANDOFF_PROTOCOL_VERSION,
    reviewPackVersion: HANDOFF_REVIEW_PACK_VERSION,
    changeTypes: h.changeTypes.map((c) => c.type),
    rowIds: h.artifactHandoffRows.map((r) => r.rowId),
    handoffReadinessStatus: h.handoffReadinessStatus,
  };
}

/**
 * @param {ReturnType<typeof buildCrystalArtifactHandoffProtocol>} protocol
 */
export function renderCrystalArtifactHandoffProtocolMarkdown(protocol) {
  const w = (s) => (s == null ? "" : String(s));
  const lines = [];
  lines.push("# Crystal artifact handoff protocol");
  lines.push("");
  lines.push(`- **handoffProtocolVersion:** \`${w(protocol.handoffProtocolVersion)}\``);
  lines.push(`- **Handoff readiness:** \`${w(protocol.handoffReadinessStatus)}\``);
  lines.push("");
  lines.push(`> ${w(protocol.methodNote)}`);
  lines.push("");
  lines.push("## Readiness");
  lines.push(w(protocol.handoffReadinessSummary));
  lines.push("");
  lines.push("## Handoff rows (excerpt)");
  lines.push("| Row | Artifact | Type | Impact |");
  lines.push("|-----|----------|------|--------|");
  for (const r of protocol.artifactHandoffRows) {
    lines.push(`| \`${r.rowId}\` | \`${r.artifactId}\` | \`${r.changeType}\` | ${r.consumerImpactLevel} |`);
  }
  lines.push("");
  return lines.join("\n");
}
