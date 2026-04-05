/**
 * Release governance + runbook consolidation (offline descriptors only).
 * Phase 17.8 — repo reality; does **not** change generators, routing, wording, or mismatch semantics.
 *
 * @module crystalReleaseGovernanceRunbook.util
 */

import { buildCrystalArtifactManifest } from "./crystalArtifactManifest.util.js";
import { buildCrystalArtifactCiSpec } from "./crystalArtifactCiValidation.util.js";
import { buildCrystalArtifactContractLinter } from "./crystalArtifactContractLinter.util.js";
import { buildCrystalArtifactLifecyclePolicy } from "./crystalArtifactLifecyclePolicy.util.js";
import { buildCrystalArtifactOwnershipModel } from "./crystalArtifactOwnershipModel.util.js";
import { buildCrystalArtifactHandoffProtocol } from "./crystalArtifactHandoffProtocol.util.js";

export const RUNBOOK_VERSION = "1.0";
export const RUNBOOK_REVIEW_PACK_VERSION = "1";

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalReleaseGovernanceRunbook(inputs = {}, options = {}) {
  const manifest = buildCrystalArtifactManifest(inputs, options);
  const ciSpec = buildCrystalArtifactCiSpec(inputs, options);
  const linter = buildCrystalArtifactContractLinter(inputs, options);
  const lifecycle = buildCrystalArtifactLifecyclePolicy(inputs, options);
  const ownership = buildCrystalArtifactOwnershipModel(inputs, options);
  const handoff = buildCrystalArtifactHandoffProtocol(inputs, options);

  const releaseGovernanceRules = [
    {
      ruleId: "gate_on_manifest_and_linter",
      title: "Pre-merge gate for artifact stack changes",
      body: "Zero hard failures from contract linter policy; manifest JSON regenerated when artifact list or edges change.",
    },
    {
      ruleId: "gate_on_ci_spec_hard_checks",
      title: "CI spec alignment",
      body: "Treat CI spec hard checks as merge blockers when team enables that policy; soft warnings allowed with label per CI spec.",
    },
    {
      ruleId: "lifecycle_on_deprecation",
      title: "Deprecation requires dual signal",
      body: "Pair JSDoc/@deprecated or util note with docs/ops + lifecycle policy row update.",
    },
  ];

  const preReleaseChecks = [
    { checkId: "regen_ops_tables", description: "Run generate scripts for manifest, CI spec, compatibility matrix, lifecycle, ownership, handoff where touched.", ownerRole: "crystal_repo_engineering" },
    { checkId: "node_test_crystal_subset", description: "Run `node --test` on crystal util tests relevant to changed files.", ownerRole: "crystal_repo_engineering" },
    { checkId: "diff_committed_json", description: "Verify `docs/ops/tables/*.json` match generator output.", ownerRole: "artifact_stack_platform_owner" },
    { checkId: "handoff_row_review", description: "Map PR to a handoff row changeType + consumerImpactLevel.", ownerRole: "artifact_stack_platform_owner" },
  ];

  const postDeployChecks = [
    { checkId: "post_verify_json_consumed", description: "If consumers use committed JSON in another system, verify they pulled new semver.", ownerRole: "ops_analytics_inputs" },
    { checkId: "post_smoke_annual_path", description: "Optional: regenerate annual → capability → OS from fixture to spot regressions.", ownerRole: "crystal_repo_engineering" },
    { checkId: "post_review_automation_md", description: "Spot-check automation pack markdown export for generation order drift.", ownerRole: "crystal_repo_engineering" },
  ];

  const driftResponseRules = [
    {
      ruleId: "mismatch_spike",
      title: "Mismatch spike (routing vs wording)",
      detect: "Mismatch metrics jump vs prior month or taxonomy doc",
      response: "Pair product (taxonomy) + telemetry owner + engineering; docs-first for taxonomy, util second.",
      escalateTo: "product_review_crystal + telemetry_diagnostics_owner",
    },
    {
      ruleId: "contract_schema_drift",
      title: "Contract/schema drift",
      detect: "Linter warns on unexpected top-level keys or CI soft fail",
      response: "Either extend KNOWN_KEYS in same PR as intentional field add, or revert accidental export shape change.",
      escalateTo: "artifact_stack_platform_owner",
    },
    {
      ruleId: "artifact_incompatibility",
      title: "Artifact incompatibility (matrix upgrade_needed)",
      detect: "Compatibility matrix row shows upgrade_needed for annual→capability",
      response: "Rebuild capability from embedded annual JSON; avoid snapshot-only if annual exists.",
      escalateTo: "product_review_crystal",
    },
    {
      ruleId: "missing_owner",
      title: "Missing owner for touched artifact",
      detect: "Ownership model marks unclear/unowned",
      response: "PR must name interim DRI in description; follow ownership escalation map.",
      escalateTo: "artifact_stack_platform_owner",
    },
  ];

  const rollbackRules = [
    {
      ruleId: "rollback_util_commit",
      title: "Rollback generator change",
      steps: ["git revert offending util commit", "Regenerate all affected ops tables from clean state", "Re-run crystal tests"],
      when: "contract_change broke downstream JSON consumers",
    },
    {
      ruleId: "rollback_tables_only",
      title: "Rollback committed JSON only",
      steps: ["Revert docs/ops/tables/*.json commit", "Keep util if behavior still correct but export was wrong"],
      when: "Bad table commit without util change",
    },
  ];

  const hotfixRules = [
    {
      ruleId: "hotfix_minimal_diff",
      title: "Hotfix path",
      steps: ["Smallest possible util or KNOWN_KEYS change", "Same PR: tests + table regen", "Post-deploy: spot-check one downstream pack"],
      when: "Production or ops blocked on false linter fail or single key typo",
    },
    {
      ruleId: "hotfix_no_taxonomy_in_util",
      title: "Hotfix must not silently change mismatch taxonomy",
      steps: ["If taxonomy involved, require docs PR linkage — not only util"],
      when: "Spike attributed to taxonomy vs code ambiguity",
    },
  ];

  const ownerEscalationMap = [
    { situation: "Unclear artifact owner", primary: "artifact_stack_platform_owner", backup: "product_review_crystal" },
    { situation: "Unowned external artifact consumed in narrative", primary: "product_review_crystal", backup: "artifact_stack_platform_owner" },
    { situation: "CI hard vs soft policy dispute", primary: "artifact_stack_platform_owner", backup: "crystal_repo_engineering" },
    { situation: "Routing/wording mismatch semantics", primary: "product_review_crystal", backup: "telemetry_diagnostics_owner" },
  ];

  /** @type {"ready"|"partial"|"blocked"} */
  let runbookReadinessStatus = "ready";
  if (manifest.ciReadinessStatus === "weak" || linter.contractReadinessStatus === "weak") runbookReadinessStatus = "blocked";
  else if (
    ciSpec.ciReadinessStatus === "partial" ||
    lifecycle.retirementReadinessStatus === "partial" ||
    ownership.ownerCoverageStatus !== "strong" ||
    handoff.handoffReadinessStatus !== "strong"
  ) {
    runbookReadinessStatus = "partial";
  }

  const runbookReadinessSummary =
    runbookReadinessStatus === "ready"
      ? "Manifest, linter, and handoff signals support a standard pre/post release checklist."
      : runbookReadinessStatus === "partial"
        ? "Some readiness signals are partial — treat runbook as advisory until CI/ownership gaps close."
        : "Weak contract or manifest readiness — do not treat release gate as green without fixing hard failures first.";

  const recommendedGovernanceUpgrades = [
    "Require `npm test` or crystal subset in CI for PRs touching `src/utils/crystal*.util.js`.",
    "Pin `docs/ops/tables` diff in PR template for artifact stack changes.",
    "Add optional scheduled job: regenerate tables and fail on drift.",
  ];

  return {
    runbookVersion: RUNBOOK_VERSION,
    reviewPackVersion: RUNBOOK_REVIEW_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    releaseGovernanceRules,
    preReleaseChecks,
    postDeployChecks,
    driftResponseRules,
    rollbackRules,
    hotfixRules,
    ownerEscalationMap,
    runbookReadinessStatus,
    runbookReadinessSummary,
    recommendedGovernanceUpgrades,
    contextSnapshot: {
      manifestCiReadiness: manifest.ciReadinessStatus,
      ciSpecReadiness: ciSpec.ciReadinessStatus,
      contractReadiness: linter.contractReadinessStatus,
      lifecycleRetirementReadiness: lifecycle.retirementReadinessStatus,
      ownerCoverageStatus: ownership.ownerCoverageStatus,
      handoffReadinessStatus: handoff.handoffReadinessStatus,
    },
    methodNote:
      "Runbook consolidates existing Phase 17 docs — it does not start deploy pipelines or change routing/wording/mismatch behavior.",
  };
}

export function buildCrystalReleaseGovernanceRunbookTable() {
  const r = buildCrystalReleaseGovernanceRunbook();
  return {
    runbookVersion: RUNBOOK_VERSION,
    reviewPackVersion: RUNBOOK_REVIEW_PACK_VERSION,
    runbookReadinessStatus: r.runbookReadinessStatus,
    preReleaseCheckIds: r.preReleaseChecks.map((c) => c.checkId),
    driftRuleIds: r.driftResponseRules.map((d) => d.ruleId),
  };
}

/**
 * @param {ReturnType<typeof buildCrystalReleaseGovernanceRunbook>} runbook
 */
export function renderCrystalReleaseGovernanceRunbookMarkdown(runbook) {
  const w = (s) => (s == null ? "" : String(s));
  const lines = [];
  lines.push("# Crystal release governance runbook");
  lines.push("");
  lines.push(`- **runbookVersion:** \`${w(runbook.runbookVersion)}\``);
  lines.push(`- **Readiness:** \`${w(runbook.runbookReadinessStatus)}\``);
  lines.push("");
  lines.push(`> ${w(runbook.methodNote)}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(w(runbook.runbookReadinessSummary));
  lines.push("");
  lines.push("## Pre-release checks");
  for (const c of runbook.preReleaseChecks) lines.push(`- **${c.checkId}:** ${c.description}`);
  lines.push("");
  lines.push("## Post-deploy checks");
  for (const c of runbook.postDeployChecks) lines.push(`- **${c.checkId}:** ${c.description}`);
  lines.push("");
  return lines.join("\n");
}
