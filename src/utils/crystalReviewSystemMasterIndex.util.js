/**
 * Crystal review system master index + arc closeout (offline descriptors only).
 * Phase 18 — repo reality; does **not** change generators, routing, wording, or mismatch semantics.
 *
 * @module crystalReviewSystemMasterIndex.util
 */

import { buildCrystalArtifactManifest } from "./crystalArtifactManifest.util.js";

export const MASTER_INDEX_VERSION = "1.0";
export const MASTER_REVIEW_PACK_VERSION = "1";

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalReviewSystemMasterIndex(inputs = {}, options = {}) {
  const manifest = buildCrystalArtifactManifest(inputs, options);

  const artifactIndex = manifest.artifacts.map((a) => ({
    artifactId: a.artifactId,
    title: a.title,
    category: a.category,
    runStatus: a.status,
    contractStatus: a.contractStatus,
    scriptPath: a.scriptPath,
    isOptionalBranch: a.artifactId === "weekly_quality_review" || a.artifactId === "weekly_trend_comparison",
    isExternalOrFuture: a.category === "external_or_future",
  }));

  const reviewLayerIndex = [
    {
      layerId: "telemetry_mismatch",
      title: "Telemetry + mismatch metrics",
      artifactIds: ["telemetry_diagnostics_inputs", "mismatch_metrics_artifact"],
      cadence: "continuous / per report pipeline",
    },
    {
      layerId: "rolling_reviews",
      title: "Weekly / monthly / quarterly / half-year rolling artifacts",
      artifactIds: [
        "weekly_quality_review",
        "weekly_trend_comparison",
        "monthly_scorecard",
        "quarterly_review_pack",
        "half_year_business_review_pack",
      ],
      cadence: "weekly → monthly → quarterly → half-year",
    },
    {
      layerId: "annual_capability_os",
      title: "Annual → capability → operating system",
      artifactIds: ["annual_operating_review_pack", "capability_maturity_roadmap_pack", "operating_system_pack"],
      cadence: "annual window",
    },
    {
      layerId: "automation_meta",
      title: "Automation + manifest",
      artifactIds: ["review_automation_pack", "artifact_manifest_pack"],
      cadence: "per release / CI",
    },
  ];

  const governanceIndex = [
    { id: "manifest", docPath: "docs/ops/crystal-artifact-manifest.md", tablePath: "docs/ops/tables/crystal-artifact-manifest.json", phase: "17.1" },
    { id: "ci_spec", docPath: "docs/ops/crystal-artifact-ci-spec.md", tablePath: "docs/ops/tables/crystal-artifact-ci-spec.json", phase: "17.2" },
    { id: "contract_linter", docPath: "docs/ops/crystal-artifact-contract-linter.md", phase: "17.3" },
    { id: "compatibility_matrix", docPath: "docs/ops/crystal-artifact-compatibility-matrix.md", tablePath: "docs/ops/tables/crystal-artifact-compatibility-matrix.json", phase: "17.4" },
    { id: "lifecycle_policy", docPath: "docs/ops/crystal-artifact-lifecycle-policy.md", tablePath: "docs/ops/tables/crystal-artifact-lifecycle-policy.json", phase: "17.5" },
    { id: "ownership_model", docPath: "docs/ops/crystal-artifact-ownership-model.md", tablePath: "docs/ops/tables/crystal-artifact-ownership-model.json", phase: "17.6" },
    { id: "handoff_protocol", docPath: "docs/ops/crystal-artifact-handoff-protocol.md", tablePath: "docs/ops/tables/crystal-artifact-handoff-protocol.json", phase: "17.7" },
    { id: "release_runbook", docPath: "docs/ops/crystal-release-governance-runbook.md", tablePath: "docs/ops/tables/crystal-release-governance-runbook.json", phase: "17.8" },
  ];

  const automationIndex = [
    { script: "scripts/ops/generateCrystalArtifactManifest.mjs", purpose: "Manifest JSON / markdown" },
    { script: "scripts/ops/generateCrystalArtifactCiSpec.mjs", purpose: "CI spec JSON" },
    { script: "scripts/ops/generateCrystalArtifactCompatibilityMatrix.mjs", purpose: "Compatibility matrix" },
    { script: "scripts/ops/generateCrystalArtifactLifecyclePolicy.mjs", purpose: "Lifecycle policy table" },
    { script: "scripts/ops/generateCrystalArtifactOwnershipModel.mjs", purpose: "Ownership model table" },
    { script: "scripts/ops/generateCrystalArtifactHandoffProtocol.mjs", purpose: "Handoff protocol table" },
    { script: "scripts/ops/generateCrystalReleaseGovernanceRunbook.mjs", purpose: "Release runbook table" },
    { script: "scripts/ops/generateCrystalReviewSystemMasterIndex.mjs", purpose: "Master index table" },
    { script: "scripts/ops/generateCrystalMonthlyScorecard.mjs", purpose: "Monthly scorecard (rolling)" },
    { script: "scripts/ops/generateCrystalAnnualOperatingReviewPack.mjs", purpose: "Annual pack" },
  ];

  const ownershipIndex = {
    docPath: "docs/ops/crystal-artifact-ownership-model.md",
    tablePath: "docs/ops/tables/crystal-artifact-ownership-model.json",
    handoffDocPath: "docs/ops/crystal-artifact-handoff-protocol.md",
    runbookDocPath: "docs/ops/crystal-release-governance-runbook.md",
  };

  const usageGuide = {
    dailyWeekly: "Use weekly quality / trend comparison when rollups exist; optional branches — see manifest knownGaps.",
    monthly: "Monthly scorecard → feeds quarterly → half-year → annual chain.",
    releaseChange: "Follow handoff protocol rows + release governance runbook pre/post checks; regenerate ops tables.",
    roadmapCapability: "Capability maturity roadmap pack from annual or snapshot; OS pack unifies context.",
    debugReportQuality: "Start: telemetry + mismatch metrics → monthly scorecard → annual KPIs; check compatibility matrix for upgrade_needed.",
    onboardingReadOrder: [
      "docs/ops/crystal-artifact-manifest.md",
      "docs/ops/crystal-artifact-compatibility-matrix.md",
      "docs/ops/crystal-artifact-ownership-model.md",
      "docs/ops/crystal-artifact-handoff-protocol.md",
      "docs/ops/crystal-release-governance-runbook.md",
      "docs/ops/crystal-review-system-master-index.md",
    ],
  };

  const optionalArtifacts = artifactIndex.filter((a) => a.isOptionalBranch).map((a) => a.artifactId);

  /** @type {"advisory"|"ci_ready"|"partial"} */
  let currentSystemStatus = "partial";
  if (manifest.ciReadinessStatus === "strong") currentSystemStatus = "ci_ready";
  else if (manifest.ciReadinessStatus === "weak") currentSystemStatus = "advisory";

  const currentSystemStrengths = [
    "Single manifest lists artifacts, edges, and generation order.",
    "Contract linter + CI spec provide machine-readable gates (advisory until CI wired).",
    "Compatibility matrix + lifecycle + ownership + handoff + runbook document cross-cutting rules without changing runtime.",
  ];

  const currentSystemGaps = [
    "multi_year_history_external has no in-repo generator — treat as external.",
    "telemetry_diagnostics_inputs spans modules — DRI may be outside git.",
    "Ops tables require manual regen discipline unless CI drift job is enabled.",
  ];

  const nextNonCrystalWorkRecommendation =
    "Shift focus to product-facing outcomes (report quality, user-visible copy, funnel metrics) while keeping ops table regen on artifact PRs as hygiene.";

  const closeoutSummary =
    "Phase 17–18 delivers a documented crystal review operating system in-repo: manifest through master index, with no change to routing/wording/mismatch semantics. Use this index as the entrypoint for onboarding and release planning.";

  return {
    masterIndexVersion: MASTER_INDEX_VERSION,
    reviewPackVersion: MASTER_REVIEW_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    artifactIndex,
    reviewLayerIndex,
    governanceIndex,
    automationIndex,
    ownershipIndex,
    usageGuide,
    currentSystemStatus,
    currentSystemStrengths,
    currentSystemGaps,
    optionalArtifacts,
    nextNonCrystalWorkRecommendation,
    closeoutSummary,
    contextSnapshot: {
      manifestCiReadiness: manifest.ciReadinessStatus,
      artifactCount: manifest.artifacts.length,
    },
    methodNote:
      "Master index is descriptive documentation — it does not enforce runtime behavior or change routing/wording/mismatch semantics.",
  };
}

export function buildCrystalReviewSystemMasterIndexTable() {
  const m = buildCrystalReviewSystemMasterIndex();
  return {
    masterIndexVersion: MASTER_INDEX_VERSION,
    reviewPackVersion: MASTER_REVIEW_PACK_VERSION,
    currentSystemStatus: m.currentSystemStatus,
    governanceDocPaths: m.governanceIndex.map((g) => g.docPath),
    onboardingReadOrder: m.usageGuide.onboardingReadOrder,
  };
}

/**
 * @param {ReturnType<typeof buildCrystalReviewSystemMasterIndex>} index
 */
export function renderCrystalReviewSystemMasterIndexMarkdown(index) {
  const w = (s) => (s == null ? "" : String(s));
  const lines = [];
  lines.push("# Crystal review system — master index");
  lines.push("");
  lines.push(`- **masterIndexVersion:** \`${w(index.masterIndexVersion)}\``);
  lines.push(`- **System status:** \`${w(index.currentSystemStatus)}\``);
  lines.push("");
  lines.push(`> ${w(index.methodNote)}`);
  lines.push("");
  lines.push("## Closeout");
  lines.push("");
  lines.push(w(index.closeoutSummary));
  lines.push("");
  lines.push("## Onboarding read order");
  for (const p of index.usageGuide.onboardingReadOrder) lines.push(`1. \`${p}\``);
  lines.push("");
  return lines.join("\n");
}

/**
 * Standalone closeout document body (Phase 18).
 * @param {ReturnType<typeof buildCrystalReviewSystemMasterIndex>} index
 */
export function renderCrystalReviewSystemCloseoutMarkdown(index) {
  const w = (s) => (s == null ? "" : String(s));
  const lines = [];
  lines.push("# Crystal review system — arc closeout (Phase 18)");
  lines.push("");
  lines.push(`**masterIndexVersion:** \`${w(index.masterIndexVersion)}\` · **reviewPackVersion:** \`${w(index.reviewPackVersion)}\``);
  lines.push("");
  lines.push("## What shipped");
  lines.push("");
  lines.push("- Artifact manifest → CI spec → contract linter → compatibility matrix → lifecycle policy → ownership → handoff protocol → release runbook → **this index**.");
  lines.push("- All Phase 17 utilities are **descriptive**; they do not change Line routing, visible wording, or mismatch taxonomy semantics.");
  lines.push("");
  lines.push("## Current status");
  lines.push("");
  lines.push(`- **Overall:** ${w(index.currentSystemStatus)}`);
  lines.push("- **Strengths:**");
  for (const s of index.currentSystemStrengths) lines.push(`  - ${s}`);
  lines.push("- **Gaps:**");
  for (const g of index.currentSystemGaps) lines.push(`  - ${g}`);
  lines.push("");
  lines.push("## Next focus");
  lines.push("");
  lines.push(w(index.nextNonCrystalWorkRecommendation));
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(w(index.closeoutSummary));
  lines.push("");
  return lines.join("\n");
}
