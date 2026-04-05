/**
 * Artifact lifecycle policy + deprecation discipline (offline descriptors only).
 * Phase 17.5 — repo reality; does **not** change generators, routing, wording, or mismatch semantics.
 *
 * @module crystalArtifactLifecyclePolicy.util
 */

import { buildCrystalArtifactManifest } from "./crystalArtifactManifest.util.js";
import { buildCrystalArtifactCompatibilityMatrix } from "./crystalArtifactCompatibilityMatrix.util.js";
import { buildCrystalArtifactContractLinter } from "./crystalArtifactContractLinter.util.js";
import { buildCrystalArtifactCiSpec } from "./crystalArtifactCiValidation.util.js";

export const LIFECYCLE_POLICY_VERSION = "1.0";
export const LIFECYCLE_REVIEW_PACK_VERSION = "1";

export const RECOMMENDED_LIFECYCLE_ACTIONS = [
  "Keep `docs/ops/tables/*.json` regenerated when pack versions change.",
  "Treat `multi_year_history_external` as not-governed-in-repo until a util lands.",
  "Migrate new code from `layers` to `reviewLayers` on OS pack consumers.",
  "Use promotionRules before declaring meta artifacts (CI spec, matrix, lifecycle) as fully active.",
];

/** @typedef {"active"|"legacy"|"transitional"|"deprecated"|"retired"} LifecycleState */

/**
 * @param {{ edges: { fromArtifactId: string, toArtifactId: string }[] }} graph
 * @returns {{ consumedBy: Record<string, string[]>, producersFor: Record<string, string[]> }}
 */
function invertGraph(graph) {
  /** @type {Record<string, string[]>} */
  const consumedBy = {};
  /** @type {Record<string, string[]>} */
  const producersFor = {};
  for (const e of graph.edges || []) {
    if (!consumedBy[e.fromArtifactId]) consumedBy[e.fromArtifactId] = [];
    consumedBy[e.fromArtifactId].push(e.toArtifactId);
    if (!producersFor[e.toArtifactId]) producersFor[e.toArtifactId] = [];
    producersFor[e.toArtifactId].push(e.fromArtifactId);
  }
  return { consumedBy, producersFor };
}

/**
 * Default lifecycle classification from manifest category + known meta artifacts.
 * @param {string} artifactId
 * @param {string} category
 * @returns {LifecycleState}
 */
function defaultStateForManifestArtifact(artifactId, category) {
  if (artifactId === "multi_year_history_external") return "transitional";
  if (artifactId === "weekly_trend_comparison") return "legacy";
  if (artifactId === "weekly_quality_review") return "transitional";
  if (category === "external_or_future") return "transitional";
  return "active";
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalArtifactLifecyclePolicy(inputs = {}, options = {}) {
  const manifest = buildCrystalArtifactManifest(inputs, options);
  const matrix = buildCrystalArtifactCompatibilityMatrix(inputs, options);
  const linter = buildCrystalArtifactContractLinter(inputs, options);
  const ciSpec = buildCrystalArtifactCiSpec(inputs, options);

  const { consumedBy } = invertGraph(manifest.dependencyGraph);

  const artifactLifecycleStates = [
    {
      state: "active",
      summary: "Default for supported generators and meta packs in the current crystal review stack.",
    },
    {
      state: "legacy",
      summary: "Still in repo and supported, but not on the primary critical path or superseded by a clearer contract elsewhere.",
    },
    {
      state: "transitional",
      summary: "External/future, optional branches, or Phase 17 meta tooling still stabilizing adoption.",
    },
    {
      state: "deprecated",
      summary: "Replacement or migration path is defined; new work should not target the deprecated surface.",
    },
    {
      state: "retired",
      summary: "Removed or no longer produced; only archival references — **no in-repo generator is retired today** except illustrative policy rows.",
    },
  ];

  const manifestRows = manifest.artifacts.map((a) => {
    const state = defaultStateForManifestArtifact(a.artifactId, a.category);
    const deps = a.dependsOn || [];
    const cons = consumedBy[a.artifactId] || [];
    return {
      artifactId: a.artifactId,
      title: a.title,
      currentLifecycleState: /** @type {LifecycleState} */ (state),
      stateReason:
        a.artifactId === "multi_year_history_external"
          ? "external_or_future — not governed in-repo; no `buildCrystalMultiYearHistoryPack` util (manifest knownGaps)."
          : a.artifactId === "weekly_trend_comparison"
            ? "Optional rolling util — thinner branch vs quarterly/annual critical path (manifest: optional)."
            : a.artifactId === "weekly_quality_review"
              ? "Optional rolling branch — manifest notes not always wired before annual."
              : "Listed in artifact manifest with script + util; primary stack member.",
      dependsOn: deps,
      consumedBy: cons,
      backwardCompatibilityExpectation:
        "semver-style `reviewPackVersion` / contract docs; extend fields additively unless docs announce breaking semver.",
      deprecationRisk: a.artifactId === "annual_operating_review_pack" || a.artifactId === "capability_maturity_roadmap_pack" ? "medium" : "low",
      promotionCriteria: "Generator JSON present + manifest status `ready` or `semi_automated` for the window being reviewed.",
      retirementCriteria: "No critical downstream consumers and replacement artifact ships with migration + compatibility matrix row `upgrade_needed` cleared.",
      recommendedNextAction:
        a.artifactId === "multi_year_history_external"
          ? "Treat as reference-only; do not block releases on external digests."
          : "Keep committed JSON + regenerate after KPI/taxonomy doc changes.",
    };
  });

  const metaRows = [
    {
      artifactId: "artifact_ci_spec",
      title: "Minimal CI job spec (crystal artifacts)",
      currentLifecycleState: /** @type {LifecycleState} */ ("transitional"),
      stateReason: "Phase 17.2 meta — adoption varies; descriptor only until CI pins table JSON.",
      dependsOn: ["artifact_manifest_pack"],
      consumedBy: [],
      backwardCompatibilityExpectation: "Bump `ciSpecVersion` / `reviewPackVersion` together with committed `docs/ops/tables/crystal-artifact-ci-spec.json`.",
      deprecationRisk: "low",
      promotionCriteria: "CI job diffs generated JSON on PR and team agrees on failure policy.",
      retirementCriteria: "Superseded only if a wider platform job replaces this spec — update manifest + matrix first.",
      recommendedNextAction: "Wire `generateCrystalArtifactCiSpec.mjs` into CI advisory or required check per team policy.",
    },
    {
      artifactId: "artifact_contract_linter",
      title: "Artifact contract linter + schema guard",
      currentLifecycleState: /** @type {LifecycleState} */ ("active"),
      stateReason: "Active guard for top-level keys; blocks accidental silent drift when wired.",
      dependsOn: ["artifact_manifest_pack"],
      consumedBy: [],
      backwardCompatibilityExpectation: "Additive `KNOWN_KEYS` changes; semver bump if removing allowed keys.",
      deprecationRisk: "low",
      promotionCriteria: "Zero hard failures on golden inputs; KNOWN_KEYS aligned with intentional pack fields.",
      retirementCriteria: "Only if replaced by stricter schema validation — not planned in-repo today.",
      recommendedNextAction: "Run linter after manifest or pack top-level field changes.",
    },
    {
      artifactId: "artifact_compatibility_matrix",
      title: "Artifact compatibility matrix + upgrade path spec",
      currentLifecycleState: /** @type {LifecycleState} */ ("transitional"),
      stateReason: "Phase 17.4 — descriptive compatibility; stabilizes as teams rely on upgrade sequence.",
      dependsOn: ["artifact_manifest_pack", "artifact_contract_linter"],
      consumedBy: [],
      backwardCompatibilityExpectation: "Matrix `matrixVersion` bumps are documentation-only; consumers read JSON/markdown exports.",
      deprecationRisk: "low",
      promotionCriteria: "Committed table JSON reviewed alongside manifest on contract PRs.",
      retirementCriteria: "N/A unless folded into a broader platform doc — unlikely short term.",
      recommendedNextAction: "Regenerate `docs/ops/tables/crystal-artifact-compatibility-matrix.json` when pack versions change.",
    },
    {
      artifactId: "artifact_lifecycle_policy",
      title: "Artifact lifecycle policy + deprecation rules (this pack)",
      currentLifecycleState: /** @type {LifecycleState} */ ("transitional"),
      stateReason: "Phase 17.5 — policy text; not a runtime artifact.",
      dependsOn: ["artifact_manifest_pack", "artifact_compatibility_matrix"],
      consumedBy: [],
      backwardCompatibilityExpectation: "Policy semver `lifecyclePolicyVersion` only; no runtime coupling.",
      deprecationRisk: "low",
      promotionCriteria: "Ops agrees on freeze/deprecate vocabulary in PR review.",
      retirementCriteria: "Merged into external GRC tooling — out of scope until requested.",
      recommendedNextAction: "Keep `docs/ops/tables/crystal-artifact-lifecycle-policy.json` in sync on policy edits.",
    },
    {
      artifactId: "operating_system_pack.layers_field",
      title: "OS pack `layers` alias (subset of operating_system_pack JSON)",
      currentLifecycleState: /** @type {LifecycleState} */ ("deprecated"),
      stateReason: "`unifiedReviewStack.layers` deprecated in favor of `reviewLayers` per `crystalOperatingSystemPack.util.js` / docs — parent pack remains **active**.",
      dependsOn: ["reviewLayers canonical field"],
      consumedBy: ["legacy_callers_expecting_layers_key"],
      backwardCompatibilityExpectation: "Alias kept until callers migrate; do not add new dependencies on `layers` alone.",
      deprecationRisk: "medium",
      promotionCriteria: "N/A — migrate consumers to `reviewLayers`.",
      retirementCriteria: "Remove alias after no in-repo callers (search + tests).",
      recommendedNextAction: "Prefer `reviewLayers` in new code and exports.",
    },
    {
      artifactId: "policy_illustration_retired_row",
      title: "Illustrative retired row (not a generator artifact)",
      currentLifecycleState: /** @type {LifecycleState} */ ("retired"),
      stateReason:
        "Illustrative template row only — **no** crystal generator in this repo is retired today; documents `retired` state + retirementRules for future use.",
      dependsOn: [],
      consumedBy: [],
      backwardCompatibilityExpectation: "N/A — placeholder row.",
      deprecationRisk: "low",
      promotionCriteria: "N/A",
      retirementCriteria: "N/A",
      recommendedNextAction: "Ignore for production pipelines; use real artifact rows above.",
    },
  ];

  const artifactLifecycleRows = [...manifestRows, ...metaRows];

  const promotionRules = [
    {
      ruleId: "promote_transitional_to_active",
      title: "Promote transitional meta or optional artifact toward active",
      summary: "Move from transitional when consumers are clear and compatibility matrix shows `compatible` for upstream/downstream links.",
      triggerConditions: [
        "At least one consuming artifact or CI job references the output in a committed path.",
        "Contract linter passes on golden inputs after any field adds.",
      ],
      requiredChecks: [
        "Diff `docs/ops/tables/crystal-artifact-manifest.json` and compatibility matrix table.",
        "Confirm `reviewPackVersion` bumps are documented in ops docs.",
      ],
      communicationRequirements: ["PR description lists semver impact", "Link manifest + matrix rows"],
      compatibilityRequirements: ["No `upgrade_needed` on critical edges in matrix for the promotion scope"],
      rollbackHint: "Revert JSON table commits and restore prior reviewPackVersion tags in docs.",
    },
  ];

  const freezeRules = [
    {
      ruleId: "freeze_when_consumers_clear",
      title: "Freeze contract when downstream consumers exist",
      summary: "After manifest lists dependents and CI/linter consume outputs, avoid silent renames of top-level keys.",
      triggerConditions: ["artifact_manifest_pack dependencyGraph shows inbound edges", "linter references KNOWN_KEYS for the artifact"],
      requiredChecks: ["Run contract linter", "Regenerate CI spec JSON"],
      communicationRequirements: ["Announce freeze in PR when renaming fields"],
      compatibilityRequirements: ["Additive changes only unless semver-major bump"],
      rollbackHint: "Git revert pack util + regenerate tables.",
    },
  ];

  const deprecationRules = [
    {
      ruleId: "deprecate_with_replacement",
      title: "Mark deprecated when replacement + compatibility path exist",
      summary: "Deprecate only after replacement artifact or field is documented and matrix notes migration.",
      triggerConditions: ["Replacement util or field name merged", "Compatibility matrix row documents `upgrade_needed` or conditions"],
      requiredChecks: ["Update ops markdown", "Add deprecationSignals entry", "Search repo for old symbol"],
      communicationRequirements: ["JSDoc @deprecated or docs/ops note", "Changelog entry in PR body"],
      compatibilityRequirements: ["Backward compatibility window per backwardCompatibilityRules"],
      rollbackHint: "Keep alias field until consumers updated — see OS `layers` pattern.",
    },
  ];

  const retirementRules = [
    {
      ruleId: "retire_when_no_critical_consumers",
      title: "Retire only when no critical consumers remain",
      summary: "Remove generator or stop producing JSON only after manifest edges drop and CI stops referencing paths.",
      triggerConditions: ["Zero manifest dependency edges to artifact", "No CI job lists script output as required"],
      requiredChecks: ["Grep + test removal", "Update generationOrder", "Regenerate all ops tables"],
      communicationRequirements: ["Explicit PR titled lifecycle retirement", "Matrix + lifecycle policy rows updated"],
      compatibilityRequirements: ["Archive last JSON snapshot if compliance needs history"],
      rollbackHint: "Restore util from git tag if retirement was premature.",
    },
  ];

  const backwardCompatibilityRules = [
    {
      ruleId: "additive_default",
      title: "Prefer additive JSON fields",
      summary: "New KPIs and narrative fields should be additive; renaming requires semver + docs.",
      triggerConditions: ["Any pack util change touching export shape"],
      requiredChecks: ["Contract linter KNOWN_KEYS", "Fixture tests for crystal packs"],
      communicationRequirements: ["docs/ops update"],
      compatibilityRequirements: ["Downstream matrix row still `compatible` or `compatible_with_conditions`"],
      rollbackHint: "Revert util commit and regenerate JSON.",
    },
    {
      ruleId: "review_pack_version_communication",
      title: "Communicate via reviewPackVersion / schema ids",
      summary: "Each pack exposes `reviewPackVersion` or manifest/linter/ci versions — bump when behavior meaningfully changes.",
      triggerConditions: ["Semantic change to scoring or required inputs"],
      requiredChecks: ["Version constant in util", "Regenerate machine-readable tables"],
      communicationRequirements: ["Compatibility matrix requiredVersionHints"],
      compatibilityRequirements: ["Consumers read version fields before strict equality checks"],
      rollbackHint: "Previous version constants recoverable from git.",
    },
  ];

  const deprecationSignals = [
    {
      signalId: "jsdoc_deprecated_field",
      title: "JSDoc @deprecated on export fields",
      whereToRecord: "`src/utils/crystalOperatingSystemPack.util.js` and related pack utils",
      consumerFacingDocs: "`docs/ops/crystal-operating-system-pack.md` (`layers` vs `reviewLayers`)",
    },
    {
      signalId: "ops_markdown_banner",
      title: "docs/ops banner or section",
      whereToRecord: "Relevant `docs/ops/crystal-*.md` file for the artifact",
      consumerFacingDocs: "Same — human readers; not enforced at runtime",
    },
    {
      signalId: "matrix_upgrade_path",
      title: "Compatibility matrix upgradePaths + breakingChangeRisks",
      whereToRecord: "`crystalArtifactCompatibilityMatrix.util.js` output / generated markdown",
      consumerFacingDocs: "`docs/ops/crystal-artifact-compatibility-matrix.md`",
    },
    {
      signalId: "manifest_known_gaps",
      title: "manifest `knownGaps` / `nextUpgrade`",
      whereToRecord: "`crystalArtifactManifest.util.js` base artifact rows",
      consumerFacingDocs: "Generated manifest markdown",
    },
  ];

  let retirementReadinessStatus = /** @type {"blocked"|"partial"|"ready"} */ ("ready");
  if (linter.contractReadinessStatus === "weak" || manifest.ciReadinessStatus === "weak") retirementReadinessStatus = "blocked";
  else if (matrix.upgradeReadinessStatus === "weak" || ciSpec.ciReadinessStatus === "weak") retirementReadinessStatus = "partial";

  const retirementReadinessSummary =
    retirementReadinessStatus === "ready"
      ? "Linter + manifest + CI spec readiness acceptable — retirement of a real artifact would still require explicit consumer audit (none retired in-repo today)."
      : retirementReadinessStatus === "partial"
        ? "Partial readiness — complete golden inputs and matrix upgrade path before planning any retirement."
        : "Weak contract/manifest readiness — do not retire artifacts until CI/linter/manifest are green for the scope.";

  const recommendedLifecycleActions = [...RECOMMENDED_LIFECYCLE_ACTIONS];

  return {
    lifecyclePolicyVersion: LIFECYCLE_POLICY_VERSION,
    reviewPackVersion: LIFECYCLE_REVIEW_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    artifactLifecycleStates,
    artifactLifecycleRows,
    promotionRules,
    freezeRules,
    deprecationRules,
    retirementRules,
    backwardCompatibilityRules,
    deprecationSignals,
    retirementReadinessStatus,
    retirementReadinessSummary,
    recommendedLifecycleActions,
    contextSnapshot: {
      manifestCiReadiness: manifest.ciReadinessStatus,
      contractReadiness: linter.contractReadinessStatus,
      matrixUpgradeReadiness: matrix.upgradeReadinessStatus,
      ciSpecReadiness: ciSpec.ciReadinessStatus,
    },
    methodNote:
      "Lifecycle policy describes discipline for the crystal artifact stack — it does not enforce runtime behavior or change routing/wording/mismatch semantics.",
  };
}

/**
 * Slim committed JSON (subset for CI/diff).
 */
export function buildCrystalArtifactLifecyclePolicyTable() {
  return {
    lifecyclePolicyVersion: LIFECYCLE_POLICY_VERSION,
    reviewPackVersion: LIFECYCLE_REVIEW_PACK_VERSION,
    artifactLifecycleStates: ["active", "legacy", "transitional", "deprecated", "retired"],
    artifactIds: [
      "telemetry_diagnostics_inputs",
      "artifact_manifest_pack",
      "artifact_ci_spec",
      "artifact_contract_linter",
      "artifact_compatibility_matrix",
      "artifact_lifecycle_policy",
      "multi_year_history_external",
    ],
    recommendedLifecycleActions: [...RECOMMENDED_LIFECYCLE_ACTIONS],
  };
}

/**
 * @param {ReturnType<typeof buildCrystalArtifactLifecyclePolicy>} policy
 */
export function renderCrystalArtifactLifecyclePolicyMarkdown(policy) {
  const w = (s) => (s == null ? "" : String(s));
  const lines = [];
  lines.push("# Crystal artifact lifecycle policy");
  lines.push("");
  lines.push(`- **lifecyclePolicyVersion:** \`${w(policy.lifecyclePolicyVersion)}\``);
  lines.push(`- **reviewPackVersion:** \`${w(policy.reviewPackVersion)}\``);
  lines.push(`- **Retirement readiness:** \`${w(policy.retirementReadinessStatus)}\``);
  lines.push("");
  lines.push(`> ${w(policy.methodNote)}`);
  lines.push("");
  lines.push("## Retirement readiness");
  lines.push("");
  lines.push(w(policy.retirementReadinessSummary));
  lines.push("");
  lines.push("## Lifecycle states");
  for (const s of policy.artifactLifecycleStates) {
    lines.push(`- **${s.state}:** ${s.summary}`);
  }
  lines.push("");
  lines.push("## Artifact rows (excerpt)");
  lines.push("");
  lines.push("| Artifact | State | Risk |");
  lines.push("|----------|-------|------|");
  for (const r of policy.artifactLifecycleRows) {
    lines.push(`| \`${r.artifactId}\` | \`${r.currentLifecycleState}\` | ${r.deprecationRisk} |`);
  }
  lines.push("");
  lines.push("## Recommended actions");
  for (const a of policy.recommendedLifecycleActions) lines.push(`- ${a}`);
  lines.push("");
  return lines.join("\n");
}
