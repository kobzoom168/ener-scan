/**
 * Artifact compatibility matrix + minimal upgrade path spec (offline).
 * Phase 17.4 — describes producer/consumer contracts; does not rewrite generators or
 * routing/wording/mismatch semantics.
 *
 * @module crystalArtifactCompatibilityMatrix.util
 */

import { ANNUAL_REVIEW_PACK_VERSION } from "./crystalAnnualOperatingReviewPack.util.js";
import { MATURITY_REVIEW_PACK_VERSION } from "./crystalCapabilityMaturityRoadmapPack.util.js";
import { OS_REVIEW_PACK_VERSION } from "./crystalOperatingSystemPack.util.js";
import { REVIEW_AUTOMATION_PACK_VERSION } from "./crystalReviewAutomationPack.util.js";
import { ARTIFACT_MANIFEST_VERSION, ARTIFACT_MANIFEST_PACK_VERSION, buildCrystalArtifactManifest } from "./crystalArtifactManifest.util.js";
import { CI_SPEC_VERSION, CI_SPEC_REVIEW_PACK_VERSION } from "./crystalArtifactCiValidation.util.js";
import { LINTER_VERSION, LINTER_REVIEW_PACK_VERSION, buildCrystalArtifactContractLinter, requiredFieldsByArtifact, versionFields } from "./crystalArtifactContractLinter.util.js";
import { buildCrystalOperatingSystemPack } from "./crystalOperatingSystemPack.util.js";
import { buildCrystalCapabilityMaturityRoadmapPack } from "./crystalCapabilityMaturityRoadmapPack.util.js";
import { buildCrystalArtifactCiSpec } from "./crystalArtifactCiValidation.util.js";

export const MATRIX_VERSION = "1.0";
export const MATRIX_REVIEW_PACK_VERSION = "1";

/** @typedef {"compatible"|"compatible_with_conditions"|"upgrade_needed"|"unknown"} CompatibilityStatus */

/**
 * @param {object} os
 * @param {object|null} cap
 * @returns {CompatibilityStatus}
 */
function assessAnnualToCapability(os, cap) {
  if (!cap) return "unknown";
  if (!os?.annualPackPresent) return "upgrade_needed";
  const note = String(cap.evidenceSourceNote || "");
  if (note.includes("Built from embedded or generated annual operating review pack")) return "compatible";
  return "compatible_with_conditions";
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} options
 */
function buildBaseCompatibilityRows(os, cap) {
  const rows = [
    {
      producerArtifactId: "rolling_review_chain",
      consumerArtifactId: "annual_operating_review_pack",
      compatibilityStatus: /** @type {CompatibilityStatus} */ ("compatible_with_conditions"),
      requiredFields: ["halfYears or months covering yearWindow", "monthly rollup JSON per util contract"],
      requiredVersions: [`annual reviewPackVersion: ${ANNUAL_REVIEW_PACK_VERSION}`],
      notes: "Annual aggregates monthly/quarterly/half-year outputs — completeness is an ops contract.",
      breakingRisk: "medium",
      recommendedAction: "Regenerate annual after any monthly KPI definition change.",
    },
    {
      producerArtifactId: "annual_operating_review_pack",
      consumerArtifactId: "capability_maturity_roadmap_pack",
      compatibilityStatus: assessAnnualToCapability(os, cap),
      requiredFields: ["annualOperatingReviewPack JSON OR evidenceSnapshot (weaker)"],
      requiredVersions: [
        `annual: ${ANNUAL_REVIEW_PACK_VERSION}`,
        `capability: ${MATURITY_REVIEW_PACK_VERSION}`,
      ],
      notes: "Capability reads annual KPIs; snapshot-only path weakens domain scores.",
      breakingRisk: "medium",
      recommendedAction: "Embed annual JSON when bumping capability contract.",
    },
    {
      producerArtifactId: "capability_maturity_roadmap_pack",
      consumerArtifactId: "operating_system_pack",
      compatibilityStatus: os?.capabilityPackPresent ? "compatible" : "compatible_with_conditions",
      requiredFields: ["capability JSON + annual context for OS pack"],
      requiredVersions: [`os: ${OS_REVIEW_PACK_VERSION}`, `capability: ${MATURITY_REVIEW_PACK_VERSION}`],
      notes: "OS pack maps layers from both annual and capability outputs.",
      breakingRisk: "low",
      recommendedAction: "Regenerate OS after capability or annual semver bumps.",
    },
    {
      producerArtifactId: "operating_system_pack",
      consumerArtifactId: "review_automation_pack",
      compatibilityStatus: "compatible",
      requiredFields: ["same composite inputs or embedded operatingSystemPack"],
      requiredVersions: [`automation: ${REVIEW_AUTOMATION_PACK_VERSION}`, `os: ${OS_REVIEW_PACK_VERSION}`],
      notes: "Automation pack wraps OS context — pure descriptor layer.",
      breakingRisk: "low",
      recommendedAction: "Pin OS reviewPackVersion in automation exports.",
    },
    {
      producerArtifactId: "review_automation_pack",
      consumerArtifactId: "artifact_manifest_pack",
      compatibilityStatus: "compatible",
      requiredFields: ["manifest util consumes automation + OS indirectly via shared inputs"],
      requiredVersions: [`manifest: ${ARTIFACT_MANIFEST_PACK_VERSION}`, `manifestSchema: ${ARTIFACT_MANIFEST_VERSION}`],
      notes: "Manifest lists all generator artifacts; versions echoed in automationPackRef.",
      breakingRisk: "low",
      recommendedAction: "Diff committed manifest JSON when automation OS ref changes.",
    },
    {
      producerArtifactId: "artifact_manifest_pack",
      consumerArtifactId: "artifact_ci_spec",
      compatibilityStatus: "compatible",
      requiredFields: ["shared JSON inputs; CI spec embeds manifest context"],
      requiredVersions: [`ciSpec: ${CI_SPEC_VERSION}`, `ciSpec reviewPackVersion: ${CI_SPEC_REVIEW_PACK_VERSION}`],
      notes: "CI spec builder reads manifest for readiness heuristics.",
      breakingRisk: "low",
      recommendedAction: "Run CI spec after manifest table updates.",
    },
    {
      producerArtifactId: "artifact_manifest_pack",
      consumerArtifactId: "artifact_contract_linter",
      compatibilityStatus: "compatible",
      requiredFields: ["manifest JSON shape + same packs resolved from inputs"],
      requiredVersions: [`linter: ${LINTER_VERSION}`, `linter reviewPack: ${LINTER_REVIEW_PACK_VERSION}`],
      notes: "Linter validates top-level keys per static allowlists — not nested schemas.",
      breakingRisk: "low",
      recommendedAction: "Extend KNOWN_KEYS when packs add top-level fields intentionally.",
    },
    {
      producerArtifactId: "multi_year_history_external",
      consumerArtifactId: "capability_maturity_roadmap_pack",
      compatibilityStatus: "unknown",
      requiredFields: [],
      requiredVersions: [],
      notes: "No in-repo multi-year util — reference-only passthrough.",
      breakingRisk: "low",
      recommendedAction: "Do not treat external digests as machine-validated.",
    },
  ];

  return rows.map((r) => ({
    ...r,
    rowId: `${r.producerArtifactId}__${r.consumerArtifactId}`,
  }));
}

function buildUpgradePaths() {
  return [
    {
      pathId: "path_monthly_to_annual",
      title: "Rolling exports → annual JSON",
      fromState: "monthly_scorecard JSON scattered",
      toState: "single annual_operating_review_pack export",
      steps: [
        "Complete monthly rollups for the year window.",
        "Run half-year/quarterly generators as needed.",
        "Run generateCrystalAnnualOperatingReviewPack.mjs with releaseSignals optional.",
      ],
      blockingDependencies: ["Input month files must cover yearWindow"],
      riskLevel: "medium",
      rollbackHint: "Keep prior annual JSON under versioned filename before overwrite.",
    },
    {
      pathId: "path_annual_to_capability_os",
      title: "Annual → capability → OS control plane",
      fromState: "annual only",
      toState: "annual + capability + operating_system_pack",
      steps: [
        "Build capability from embedded annual JSON.",
        "Run OS pack with same inputs.",
        "Attach weekly/monthly refs if continuity matters.",
      ],
      blockingDependencies: ["Capability evidenceSourceNote should show annual reuse"],
      riskLevel: "medium",
      rollbackHint: "Revert to prior capability/OS JSON blobs in git.",
    },
    {
      pathId: "path_control_plane_to_ci",
      title: "Control plane → manifest → CI + linter",
      fromState: "ad-hoc JSON",
      toState: "manifest + CI spec + contract linter green",
      steps: [
        "Regenerate artifact manifest table JSON.",
        "Run CI spec generator.",
        "Run contract linter; update KNOWN_KEYS if intentional drift.",
      ],
      blockingDependencies: ["Zero hard failures in CI spec / linter policy"],
      riskLevel: "low",
      rollbackHint: "Table JSON is committed — revert commit if false positive.",
    },
  ];
}

function buildBreakingChangeRisks() {
  return [
    "Renaming reviewPackVersion fields without updating linter KNOWN_KEYS causes false drift warnings.",
    "Changing annual KPI keys without updating capability extractEvidence() breaks maturity heuristics.",
    "Tightening mismatch taxonomy semantics requires doc + util alignment — matrix does not enforce taxonomy.",
  ];
}

/**
 * Stable recommended order for contract upgrades (not a runtime orchestrator).
 */
export const RECOMMENDED_UPGRADE_SEQUENCE = [
  "telemetry_monthly_rollups",
  "annual_operating_review_pack",
  "capability_maturity_roadmap_pack",
  "operating_system_pack",
  "review_automation_pack",
  "artifact_manifest_pack",
  "artifact_ci_spec",
  "artifact_contract_linter",
];

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalArtifactCompatibilityMatrix(inputs = {}, options = {}) {
  const manifest = buildCrystalArtifactManifest(inputs, options);
  const contract = buildCrystalArtifactContractLinter(inputs, options);
  const os = buildCrystalOperatingSystemPack(inputs, options);
  const cap =
    inputs.capabilityMaturityRoadmapPack && typeof inputs.capabilityMaturityRoadmapPack === "object"
      ? inputs.capabilityMaturityRoadmapPack
      : buildCrystalCapabilityMaturityRoadmapPack(inputs, options);
  const ciSpec = buildCrystalArtifactCiSpec(inputs, options);

  const compatibilityRows = buildBaseCompatibilityRows(os, cap);

  const dependencyCompatibility = {
    source: "artifact_manifest.dependencyGraph.edges",
    edges: manifest.dependencyGraph.edges,
    narrative:
      "Producer → consumer edges follow manifest dependency graph; compatibility rows add semver/field caveats.",
  };

  const requiredVersionHints = {
    annual_operating_review_pack: `reviewPackVersion ${ANNUAL_REVIEW_PACK_VERSION}`,
    capability_maturity_roadmap_pack: `reviewPackVersion ${MATURITY_REVIEW_PACK_VERSION}`,
    operating_system_pack: `reviewPackVersion ${OS_REVIEW_PACK_VERSION}`,
    review_automation_pack: `reviewPackVersion ${REVIEW_AUTOMATION_PACK_VERSION}`,
    artifact_manifest_pack: `manifestVersion ${ARTIFACT_MANIFEST_VERSION}, reviewPackVersion ${ARTIFACT_MANIFEST_PACK_VERSION}`,
    artifact_ci_spec: `ciSpecVersion ${CI_SPEC_VERSION}, reviewPackVersion ${CI_SPEC_REVIEW_PACK_VERSION}`,
    artifact_contract_linter: `linterVersion ${LINTER_VERSION}, reviewPackVersion ${LINTER_REVIEW_PACK_VERSION}`,
  };

  const artifacts = [
    { artifactId: "annual_operating_review_pack", role: "producer", versionHint: requiredVersionHints.annual_operating_review_pack },
    { artifactId: "capability_maturity_roadmap_pack", role: "consumer_producer", versionHint: requiredVersionHints.capability_maturity_roadmap_pack },
    { artifactId: "operating_system_pack", role: "consumer_producer", versionHint: requiredVersionHints.operating_system_pack },
    { artifactId: "review_automation_pack", role: "consumer_producer", versionHint: requiredVersionHints.review_automation_pack },
    { artifactId: "artifact_manifest_pack", role: "meta", versionHint: requiredVersionHints.artifact_manifest_pack },
    { artifactId: "artifact_ci_spec", role: "meta", versionHint: requiredVersionHints.artifact_ci_spec },
    { artifactId: "artifact_contract_linter", role: "validation", versionHint: requiredVersionHints.artifact_contract_linter },
    { artifactId: "multi_year_history_external", role: "external_or_future", versionHint: "n/a (external)" },
  ];

  const upgradePaths = buildUpgradePaths();
  const breakingChangeRisks = buildBreakingChangeRisks();

  /** @type {"strong"|"partial"|"weak"} */
  let upgradeReadinessStatus = "strong";
  if (contract.contractReadinessStatus === "weak" || manifest.ciReadinessStatus === "weak") upgradeReadinessStatus = "weak";
  else if (contract.contractReadinessStatus === "partial" || manifest.ciReadinessStatus === "partial") upgradeReadinessStatus = "partial";

  const upgradeReadinessSummary =
    upgradeReadinessStatus === "strong"
      ? "Contract linter + manifest readiness green — safe to follow recommended upgrade sequence."
      : upgradeReadinessStatus === "partial"
        ? "Partial inputs or soft contract warnings — complete annual/capability chain before relying on matrix for cutover."
        : "Contract or manifest readiness weak — fix hard linter/manifest issues before version bumps.";

  const recommendedUpgradeSequence = [...RECOMMENDED_UPGRADE_SEQUENCE];

  return {
    matrixVersion: MATRIX_VERSION,
    reviewPackVersion: MATRIX_REVIEW_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    artifacts,
    compatibilityRows,
    dependencyCompatibility,
    requiredVersionHints,
    requiredFieldHints: { ...requiredFieldsByArtifact },
    versionFieldHints: { ...versionFields },
    breakingChangeRisks,
    upgradePaths,
    upgradeReadinessStatus,
    upgradeReadinessSummary,
    recommendedUpgradeSequence,
    contextSnapshot: {
      annualPackPresent: os.annualPackPresent,
      capabilityPackPresent: os.capabilityPackPresent,
      manifestCiReadiness: manifest.ciReadinessStatus,
      contractReadiness: contract.contractReadinessStatus,
      ciSpecReadiness: ciSpec.ciReadinessStatus,
    },
    methodNote:
      "Compatibility matrix is descriptive documentation derived from repo utils — it does not enforce runtime coupling or change routing/wording/mismatch behavior.",
  };
}

/**
 * Machine-readable table (no live pack objects beyond optional snapshot).
 */
export function buildCrystalArtifactCompatibilityTable() {
  return {
    matrixVersion: MATRIX_VERSION,
    reviewPackVersion: MATRIX_REVIEW_PACK_VERSION,
    requiredVersionHints: {
      annual_operating_review_pack: `reviewPackVersion ${ANNUAL_REVIEW_PACK_VERSION}`,
      capability_maturity_roadmap_pack: `reviewPackVersion ${MATURITY_REVIEW_PACK_VERSION}`,
      operating_system_pack: `reviewPackVersion ${OS_REVIEW_PACK_VERSION}`,
      review_automation_pack: `reviewPackVersion ${REVIEW_AUTOMATION_PACK_VERSION}`,
      artifact_manifest_pack: `${ARTIFACT_MANIFEST_VERSION} / ${ARTIFACT_MANIFEST_PACK_VERSION}`,
      artifact_ci_spec: `${CI_SPEC_VERSION} / ${CI_SPEC_REVIEW_PACK_VERSION}`,
      artifact_contract_linter: `${LINTER_VERSION} / ${LINTER_REVIEW_PACK_VERSION}`,
    },
    recommendedUpgradeSequence: RECOMMENDED_UPGRADE_SEQUENCE,
  };
}

/**
 * @param {ReturnType<typeof buildCrystalArtifactCompatibilityMatrix>} matrix
 */
export function renderCrystalArtifactCompatibilityMatrixMarkdown(matrix) {
  const w = (s) => (s == null ? "" : String(s));
  const lines = [];
  lines.push("# Crystal artifact compatibility matrix");
  lines.push("");
  lines.push(`- **matrixVersion:** \`${w(matrix.matrixVersion)}\``);
  lines.push(`- **reviewPackVersion:** \`${w(matrix.reviewPackVersion)}\``);
  lines.push(`- **Upgrade readiness:** \`${w(matrix.upgradeReadinessStatus)}\``);
  lines.push("");
  lines.push(`> ${w(matrix.methodNote)}`);
  lines.push("");
  lines.push("## Upgrade readiness");
  lines.push("");
  lines.push(w(matrix.upgradeReadinessSummary));
  lines.push("");
  lines.push("## Recommended upgrade sequence");
  for (const s of matrix.recommendedUpgradeSequence) lines.push(`- ${s}`);
  lines.push("");
  lines.push("## Compatibility rows");
  lines.push("");
  lines.push("| Producer | Consumer | Status | Risk |");
  lines.push("|----------|----------|--------|------|");
  for (const r of matrix.compatibilityRows) {
    lines.push(
      `| ${r.producerArtifactId} | ${r.consumerArtifactId} | \`${r.compatibilityStatus}\` | ${r.breakingRisk} |`,
    );
  }
  lines.push("");
  lines.push("## Breaking change risks");
  for (const b of matrix.breakingChangeRisks) lines.push(`- ${b}`);
  lines.push("");
  lines.push("## Upgrade paths");
  for (const p of matrix.upgradePaths) {
    lines.push(`### ${p.title} (\`${p.pathId}\`)`);
    lines.push(`- **From:** ${p.fromState}`);
    lines.push(`- **To:** ${p.toState}`);
    lines.push(`- **Risk:** ${p.riskLevel}`);
    lines.push(`- **Rollback:** ${p.rollbackHint}`);
    lines.push("");
  }
  return lines.join("\n");
}
