/**
 * Artifact ownership map + review responsibility model (offline descriptors only).
 * Phase 17.6 — repo reality; does **not** change generators, routing, wording, or mismatch semantics.
 * Roles are **logical** (engineering/product/ops/telemetry) — no org chart in-repo.
 *
 * @module crystalArtifactOwnershipModel.util
 */

import { buildCrystalArtifactManifest } from "./crystalArtifactManifest.util.js";

export const OWNERSHIP_MODEL_VERSION = "1.0";
export const OWNERSHIP_REVIEW_PACK_VERSION = "1";

/** @typedef {"clear"|"partial"|"unclear"|"unowned"} OwnershipStatus */

/**
 * Role labels are repo-local conventions, not HR titles.
 * @param {string} artifactId
 * @param {string} category
 * @returns {{ status: OwnershipStatus, primary: string, secondary: string[], reviewers: string[], approval: string, escalation: string, areas: string[], gaps: string[], next: string }}
 */
function describeOwnership(artifactId, category) {
  const eng = "crystal_repo_engineering";
  const product = "product_review_crystal";
  const ops = "ops_analytics_inputs";
  const telemetry = "telemetry_diagnostics_owner";
  const platform = "artifact_stack_platform_owner";
  const nobody = "unassigned_in_repo";

  if (artifactId === "multi_year_history_external") {
    return {
      status: /** @type {OwnershipStatus} */ ("unowned"),
      primary: nobody,
      secondary: [],
      reviewers: [product],
      approval: product,
      escalation: platform,
      areas: ["external digests only — no generator util"],
      gaps: ["No in-repo owner because artifact is not produced here; compatibility matrix marks unknown."],
      next: "If a util is added, assign primary owner + update manifest row before claiming governance.",
    };
  }

  if (artifactId === "telemetry_diagnostics_inputs") {
    return {
      status: "unclear",
      primary: telemetry,
      secondary: [eng, ops],
      reviewers: [telemetry, eng],
      approval: platform,
      escalation: platform,
      areas: ["report payload wiring", "visible wording correlation", "docs vs code drift"],
      gaps: ["Inputs span multiple modules — no single file owner in manifest."],
      next: "Document primary DRI in team wiki or `docs/ops` PR template; until then treat as shared.",
    };
  }

  if (artifactId === "mismatch_metrics_artifact") {
    return {
      status: "partial",
      primary: eng,
      secondary: [product],
      reviewers: [eng, product],
      approval: eng,
      escalation: platform,
      areas: ["taxonomy alignment with product docs", "util tests"],
      gaps: ["Taxonomy semantics owned by product docs — engineering owns code surface only."],
      next: "Any taxonomy change needs paired doc + test update.",
    };
  }

  if (
    category === "rolling_review" &&
    artifactId !== "weekly_quality_review" &&
    artifactId !== "weekly_trend_comparison"
  ) {
    return {
      status: "clear",
      primary: eng,
      secondary: [ops],
      reviewers: [eng],
      approval: eng,
      escalation: platform,
      areas: ["generator util + script", "fixture JSON"],
      gaps: [],
      next: "Regenerate committed JSON when contract fields change.",
    };
  }

  if (artifactId === "weekly_quality_review" || artifactId === "weekly_trend_comparison") {
    return {
      status: "partial",
      primary: eng,
      secondary: [ops],
      reviewers: [eng, ops],
      approval: eng,
      escalation: platform,
      areas: ["optional rolling branch", "upstream JSON availability"],
      gaps: ["Not always on critical path before annual — reviewers may skip unless flagged."],
      next: "If weekly becomes required, tighten manifest status + CI check list.",
    };
  }

  if (artifactId === "annual_operating_review_pack") {
    return {
      status: "partial",
      primary: product,
      secondary: [eng, ops],
      reviewers: [product, eng],
      approval: product,
      escalation: platform,
      areas: ["KPI semantics", "releaseSignals interpretation", "year window"],
      gaps: ["Manual assembly common — ops + product share accountability."],
      next: "Align annual JSON review in release checklist.",
    };
  }

  if (artifactId === "capability_maturity_roadmap_pack") {
    return {
      status: "partial",
      primary: product,
      secondary: [eng],
      reviewers: [product, eng],
      approval: product,
      escalation: platform,
      areas: ["domain scores", "evidenceSnapshot vs embedded annual"],
      gaps: ["Snapshot-only path weakens output — reviewer must catch in PR."],
      next: "Require embedded annual when possible (see compatibility matrix).",
    };
  }

  if (artifactId === "operating_system_pack") {
    return {
      status: "partial",
      primary: eng,
      secondary: [product, ops],
      reviewers: [eng, product],
      approval: eng,
      escalation: platform,
      areas: ["unified stack JSON", "markdown export", "layers vs reviewLayers migration"],
      gaps: ["Control map is template-quality — not certification."],
      next: "Cross-check OS export with automation pack on contract bumps.",
    };
  }

  if (artifactId === "review_automation_pack") {
    return {
      status: "clear",
      primary: eng,
      secondary: [ops],
      reviewers: [eng],
      approval: eng,
      escalation: platform,
      areas: ["pipeline description", "generation order"],
      gaps: [],
      next: "Keep aligned with manifest generationOrder.",
    };
  }

  if (artifactId === "artifact_manifest_pack") {
    return {
      status: "clear",
      primary: platform,
      secondary: [eng],
      reviewers: [platform, eng],
      approval: platform,
      escalation: platform,
      areas: ["manifest table JSON", "dependency graph accuracy"],
      gaps: [],
      next: "CI diff on `docs/ops/tables/crystal-artifact-manifest.json`.",
    };
  }

  return {
    status: "partial",
    primary: eng,
    secondary: [platform],
    reviewers: [eng],
    approval: eng,
    escalation: platform,
    areas: ["default crystal artifact surface"],
    gaps: ["Fallback row — refine when artifact gains explicit policy."],
    next: "Tie to Phase 17 meta docs for this artifact id.",
  };
}

const META_ARTIFACT_IDS = [
  "artifact_ci_spec",
  "artifact_contract_linter",
  "artifact_compatibility_matrix",
  "artifact_lifecycle_policy",
];

function metaOwnership(artifactId) {
  const platform = "artifact_stack_platform_owner";
  const eng = "crystal_repo_engineering";
  const base = {
    artifactId,
    title:
      artifactId === "artifact_ci_spec"
        ? "Minimal CI job spec (crystal artifacts)"
        : artifactId === "artifact_contract_linter"
          ? "Artifact contract linter + schema guard"
          : artifactId === "artifact_compatibility_matrix"
            ? "Artifact compatibility matrix + upgrade path spec"
            : "Artifact lifecycle policy + deprecation rules",
    primaryOwnerRole: platform,
    secondaryOwnerRoles: [eng],
    reviewerRoles: [platform, eng],
    approvalRole: platform,
    escalationRole: platform,
    responsibilityAreas: ["Phase 17 meta tables", "docs/ops JSON exports", "PR review for contract drift"],
    ownershipStatus: /** @type {OwnershipStatus} */ ("partial"),
    knownGaps: ["Meta artifacts share one logical platform owner in-repo — split only if team structure exists outside repo."],
    recommendedNextAction: "Assign named DRI outside this JSON if org requires; keep tables regenerated on util changes.",
  };
  if (artifactId === "artifact_contract_linter") {
    return {
      ...base,
      ownershipStatus: "clear",
      knownGaps: [],
      recommendedNextAction: "Extend KNOWN_KEYS in same PR as pack field adds.",
    };
  }
  return base;
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalArtifactOwnershipModel(inputs = {}, options = {}) {
  const manifest = buildCrystalArtifactManifest(inputs, options);

  const manifestRows = manifest.artifacts.map((a) => {
    const d = describeOwnership(a.artifactId, a.category);
    return {
      artifactId: a.artifactId,
      title: a.title,
      primaryOwnerRole: d.primary,
      secondaryOwnerRoles: d.secondary,
      reviewerRoles: d.reviewers,
      approvalRole: d.approval,
      escalationRole: d.escalation,
      responsibilityAreas: d.areas,
      ownershipStatus: d.status,
      knownGaps: d.gaps,
      recommendedNextAction: d.next,
    };
  });

  const metaRows = META_ARTIFACT_IDS.map((id) => {
    const m = metaOwnership(id);
    return {
      artifactId: m.artifactId,
      title: m.title,
      primaryOwnerRole: m.primaryOwnerRole,
      secondaryOwnerRoles: m.secondaryOwnerRoles,
      reviewerRoles: m.reviewerRoles,
      approvalRole: m.approvalRole,
      escalationRole: m.escalationRole,
      responsibilityAreas: m.responsibilityAreas,
      ownershipStatus: m.ownershipStatus,
      knownGaps: m.knownGaps,
      recommendedNextAction: m.recommendedNextAction,
    };
  });

  const artifactOwnershipRows = [...manifestRows, ...metaRows];

  const reviewResponsibilityMap = [
    {
      responsibilityId: "contract_ownership",
      title: "Pack JSON contract fields + reviewPackVersion",
      ownerRole: "crystal_repo_engineering",
      backupRole: "artifact_stack_platform_owner",
      appliesToArtifacts: manifest.artifacts.filter((a) => a.scriptPath).map((a) => a.artifactId),
      failureModeIfMissing: "Silent JSON drift vs consumers; CI manifest diff fails without owner follow-up.",
      recommendedGuardrail: "PR checklist: regenerate ops tables + bump version constants together.",
    },
    {
      responsibilityId: "schema_linter_ownership",
      title: "KNOWN_KEYS + top-level schema guard",
      ownerRole: "crystal_repo_engineering",
      backupRole: "artifact_stack_platform_owner",
      appliesToArtifacts: ["artifact_contract_linter", "artifact_manifest_pack"],
      failureModeIfMissing: "False positives or missed drift on intentional field adds.",
      recommendedGuardrail: "Extend KNOWN_KEYS in same PR as util export shape change.",
    },
    {
      responsibilityId: "compatibility_ownership",
      title: "Compatibility matrix rows + upgrade paths",
      ownerRole: "artifact_stack_platform_owner",
      backupRole: "crystal_repo_engineering",
      appliesToArtifacts: ["artifact_compatibility_matrix", "annual_operating_review_pack", "capability_maturity_roadmap_pack"],
      failureModeIfMissing: "Teams bump one pack without sequencing — matrix stays advisory only.",
      recommendedGuardrail: "Review `recommendedUpgradeSequence` when bumping reviewPackVersion on annual/capability.",
    },
    {
      responsibilityId: "lifecycle_deprecation_ownership",
      title: "Lifecycle states + deprecation signals",
      ownerRole: "artifact_stack_platform_owner",
      backupRole: "product_review_crystal",
      appliesToArtifacts: ["artifact_lifecycle_policy", "operating_system_pack"],
      failureModeIfMissing: "Deprecation communicated in JSDoc but not in ops docs.",
      recommendedGuardrail: "Pair util @deprecated with `docs/ops` note (see lifecycle policy deprecationSignals).",
    },
    {
      responsibilityId: "ci_validation_ownership",
      title: "CI spec checks + job wiring",
      ownerRole: "artifact_stack_platform_owner",
      backupRole: "crystal_repo_engineering",
      appliesToArtifacts: ["artifact_ci_spec", "artifact_manifest_pack"],
      failureModeIfMissing: "Hard checks ignored; soft warnings pile up.",
      recommendedGuardrail: "Treat zero hard-fail as merge bar; document soft-fail policy in CI spec.",
    },
    {
      responsibilityId: "telemetry_diagnostics_ownership",
      title: "Telemetry + visible wording diagnostics inputs",
      ownerRole: "telemetry_diagnostics_owner",
      backupRole: "crystal_repo_engineering",
      appliesToArtifacts: ["telemetry_diagnostics_inputs", "mismatch_metrics_artifact"],
      failureModeIfMissing: "Rolling KPIs diverge from report reality.",
      recommendedGuardrail: "Cross-link `docs/crystal-routing-telemetry-mapping.md` changes with util tests.",
    },
    {
      responsibilityId: "annual_review_pack_ownership",
      title: "Annual operating review pack semantics",
      ownerRole: "product_review_crystal",
      backupRole: "ops_analytics_inputs",
      appliesToArtifacts: ["annual_operating_review_pack"],
      failureModeIfMissing: "KPI labels disagree with product intent.",
      recommendedGuardrail: "Product approves annual JSON narrative sections before external sharing.",
    },
    {
      responsibilityId: "capability_roadmap_ownership",
      title: "Capability maturity roadmap pack",
      ownerRole: "product_review_crystal",
      backupRole: "crystal_repo_engineering",
      appliesToArtifacts: ["capability_maturity_roadmap_pack"],
      failureModeIfMissing: "Snapshot-only path ships without review.",
      recommendedGuardrail: "PR rejects snapshot-only when annual JSON is available (team policy).",
    },
    {
      responsibilityId: "operating_system_pack_ownership",
      title: "Operating system unified pack",
      ownerRole: "crystal_repo_engineering",
      backupRole: "product_review_crystal",
      appliesToArtifacts: ["operating_system_pack", "review_automation_pack"],
      failureModeIfMissing: "Layers alias lingers; exports confuse consumers.",
      recommendedGuardrail: "Code review enforces `reviewLayers` for new callers.",
    },
  ];

  const approvalPaths = [
    {
      pathId: "approve_contract_util_change",
      title: "Contract field or reviewPackVersion change on a generator util",
      approves: "crystal_repo_engineering (primary) with artifact_stack_platform_owner for Phase 17 meta cross-cut",
      reviewers: ["crystal_repo_engineering", "artifact_stack_platform_owner"],
      scope: "src/utils/crystal*.util.js + matching docs/ops + tables/*.json",
    },
    {
      pathId: "approve_compatibility_impacting_change",
      title: "Change that alters producer/consumer edges or semver story",
      approves: "artifact_stack_platform_owner",
      reviewers: ["crystal_repo_engineering", "product_review_crystal (if KPI semantics)"],
      scope: "compatibility matrix + manifest dependency graph + annual/capability packs",
    },
    {
      pathId: "approve_deprecation_retirement",
      title: "Deprecation or retirement of an artifact surface",
      approves: "product_review_crystal + artifact_stack_platform_owner (joint for user-visible narrative)",
      reviewers: ["crystal_repo_engineering"],
      scope: "lifecycle policy + JSDoc + docs/ops + removal PR",
    },
  ];

  const escalationPaths = [
    {
      pathId: "escalate_unclear_ownership",
      title: "Ownership unclear for a consumed artifact",
      trigger: "Manifest shows inbound edges but primaryOwnerRole is unclear/unowned",
      escalatesTo: "artifact_stack_platform_owner",
      action: "Assign DRI in team channel; update this model row in follow-up PR.",
    },
    {
      pathId: "escalate_unowned_but_consumed",
      title: "Artifact marked unowned but listed as dependency elsewhere",
      trigger: "e.g. external multi-year referenced in narrative outputs",
      escalatesTo: "product_review_crystal",
      action: "Explicitly label outputs as non-machine-validated; do not block release on external digests.",
    },
    {
      pathId: "escalate_cross_domain_drift",
      title: "Routing/wording/mismatch taxonomy drift",
      trigger: "Mismatch metrics vs product docs disagree",
      escalatesTo: "product_review_crystal with telemetry_diagnostics_owner",
      action: "Docs PR owns taxonomy; engineering owns util — pair-review required (no automatic merge).",
    },
  ];

  const unownedArtifacts = artifactOwnershipRows.filter((r) => r.ownershipStatus === "unowned").map((r) => r.artifactId);

  const responsibilityGaps = [
    ...unownedArtifacts.map((id) => `Artifact \`${id}\` has no in-repo generator owner — treat as external/unowned.`),
    "telemetry_diagnostics_inputs spans modules — primary DRI not named in git (see row knownGaps).",
    "Role strings are logical placeholders until org assigns named owners outside repo.",
  ];

  const clearN = artifactOwnershipRows.filter((r) => r.ownershipStatus === "clear").length;
  const partialN = artifactOwnershipRows.filter((r) => r.ownershipStatus === "partial").length;
  const unclearN = artifactOwnershipRows.filter((r) => r.ownershipStatus === "unclear").length;
  const unownedN = unownedArtifacts.length;

  /** @type {"strong"|"partial"|"weak"} */
  let ownerCoverageStatus = "strong";
  if (unownedN > 0 || unclearN > 2) ownerCoverageStatus = "weak";
  else if (partialN > clearN || unclearN > 0) ownerCoverageStatus = "partial";

  const ownerCoverageSummary =
    ownerCoverageStatus === "strong"
      ? "Most artifacts have clear or strong engineering/platform ownership; external-only row(s) may still be unowned by design."
      : ownerCoverageStatus === "partial"
        ? "Several artifacts are partial/shared — use reviewResponsibilityMap to see who must sign off."
        : "Unclear or unowned rows exist — assign DRIs before expanding consumer surface.";

  const recommendedOwnershipFixes = [
    "Name a single DRI for telemetry_diagnostics_inputs outside repo (wiki/on-call) and link from PR template.",
    "Keep multi_year_history_external unowned until a util exists — do not fake ownership.",
    "For Phase 17 meta artifacts, use platform owner + engineering backup as default RACI-lite.",
    "On drift, follow escalationPaths — do not change routing/wording semantics in this util.",
  ];

  return {
    ownershipModelVersion: OWNERSHIP_MODEL_VERSION,
    reviewPackVersion: OWNERSHIP_REVIEW_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    artifactOwnershipRows,
    reviewResponsibilityMap,
    approvalPaths,
    escalationPaths,
    ownerCoverageStatus,
    ownerCoverageSummary,
    unownedArtifacts,
    responsibilityGaps,
    recommendedOwnershipFixes,
    contextSnapshot: {
      manifestCiReadiness: manifest.ciReadinessStatus,
      artifactCount: manifest.artifacts.length,
      metaArtifactCount: META_ARTIFACT_IDS.length,
    },
    methodNote:
      "Ownership model is descriptive — logical roles only; it does not enforce ACLs or change routing/wording/mismatch behavior.",
  };
}

/**
 * Slim committed JSON for CI/diff.
 */
export function buildCrystalArtifactOwnershipModelTable() {
  const full = buildCrystalArtifactOwnershipModel();
  return {
    ownershipModelVersion: OWNERSHIP_MODEL_VERSION,
    reviewPackVersion: OWNERSHIP_REVIEW_PACK_VERSION,
    unownedArtifacts: full.unownedArtifacts,
    ownerCoverageStatus: full.ownerCoverageStatus,
    recommendedOwnershipFixes: full.recommendedOwnershipFixes,
    responsibilityIds: full.reviewResponsibilityMap.map((r) => r.responsibilityId),
  };
}

/**
 * @param {ReturnType<typeof buildCrystalArtifactOwnershipModel>} model
 */
export function renderCrystalArtifactOwnershipModelMarkdown(model) {
  const w = (s) => (s == null ? "" : String(s));
  const lines = [];
  lines.push("# Crystal artifact ownership model");
  lines.push("");
  lines.push(`- **ownershipModelVersion:** \`${w(model.ownershipModelVersion)}\``);
  lines.push(`- **reviewPackVersion:** \`${w(model.reviewPackVersion)}\``);
  lines.push(`- **Owner coverage:** \`${w(model.ownerCoverageStatus)}\``);
  lines.push("");
  lines.push(`> ${w(model.methodNote)}`);
  lines.push("");
  lines.push("## Owner coverage");
  lines.push("");
  lines.push(w(model.ownerCoverageSummary));
  lines.push("");
  lines.push("## Unowned artifacts");
  lines.push("");
  lines.push(model.unownedArtifacts.length ? model.unownedArtifacts.map((x) => `- \`${x}\``).join("\n") : "—");
  lines.push("");
  lines.push("## Artifact rows (excerpt)");
  lines.push("");
  lines.push("| Artifact | Primary | Status |");
  lines.push("|----------|---------|--------|");
  for (const r of model.artifactOwnershipRows) {
    lines.push(`| \`${r.artifactId}\` | ${r.primaryOwnerRole} | \`${r.ownershipStatus}\` |`);
  }
  lines.push("");
  lines.push("## Approval paths");
  for (const p of model.approvalPaths) {
    lines.push(`- **${p.title}** (\`${p.pathId}\`): ${p.approves}`);
  }
  lines.push("");
  return lines.join("\n");
}
