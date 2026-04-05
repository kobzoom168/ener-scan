/**
 * CI-friendly artifact manifest for the crystal review stack (offline descriptor only).
 * Phase 17.1 — repo reality; does **not** change generators or routing/wording/mismatch semantics.
 *
 * @module crystalArtifactManifest.util
 */

import { buildCrystalOperatingSystemPack } from "./crystalOperatingSystemPack.util.js";
import { buildCrystalReviewAutomationPack } from "./crystalReviewAutomationPack.util.js";

export const ARTIFACT_MANIFEST_VERSION = "1.0";
export const ARTIFACT_MANIFEST_PACK_VERSION = "1";

/** @typedef {"manual"|"semi_automated"|"automatable"|"ready"} ArtifactRunStatus */
/** @typedef {"implicit"|"documented"|"machine_readable"} ContractStatus */
/** @typedef {"core"|"rolling_review"|"annual"|"capability"|"control_plane"|"meta"|"external_or_future"} ArtifactCategory */

/**
 * Base rows — paths relative to repo root. Status fields overridden by {@link applyDynamicStatus}.
 */
function baseArtifacts() {
  return [
    {
      artifactId: "telemetry_diagnostics_inputs",
      title: "Telemetry + visible wording inputs",
      category: /** @type {ArtifactCategory} */ ("core"),
      inputs: ["Report payload / scan pipeline", "docs/crystal-routing-telemetry-mapping.md"],
      outputs: ["KPI-ready fields for monthly scorecard inputs", "Visible wording correlation signals"],
      dependsOn: [],
      scriptPath: null,
      utilPath: "src/utils/visibleWordingTelemetry.util.js (representative; report layer spans multiple modules)",
      status: /** @type {ArtifactRunStatus} */ ("semi_automated"),
      contractStatus: /** @type {ContractStatus} */ ("documented"),
      knownGaps: ["No single CLI for raw production extract — ops provide rollups."],
      nextUpgrade: "Pin export schema notes beside monthly JSON in git.",
    },
    {
      artifactId: "mismatch_metrics_artifact",
      title: "Routing vs visible wording mismatch metrics",
      category: "core",
      inputs: ["docs/crystal-routing-wording-mismatch-metrics.md", "Report payload metrics"],
      outputs: ["Mismatch-type rollups consumed by monthly → annual packs"],
      dependsOn: ["telemetry_diagnostics_inputs"],
      scriptPath: null,
      utilPath: "src/utils/crystalRoutingWordingMetrics.util.js",
      status: "semi_automated",
      contractStatus: "documented",
      knownGaps: ["Taxonomy semantics owned by product docs — manifest does not redefine them."],
      nextUpgrade: "Keep util tests aligned with docs when taxonomy rows change.",
    },
    {
      artifactId: "monthly_scorecard",
      title: "Monthly scorecard",
      category: "rolling_review",
      inputs: ["Month rollup JSON"],
      outputs: ["buildCrystalMonthlyScorecard JSON"],
      dependsOn: ["mismatch_metrics_artifact"],
      scriptPath: "scripts/ops/generateCrystalMonthlyScorecard.mjs",
      utilPath: "src/utils/crystalMonthlyScorecard.util.js",
      status: "ready",
      contractStatus: "machine_readable",
      knownGaps: ["Requires upstream monthly rollup file."],
      nextUpgrade: "Add `--help` contract line to script header (already partially present).",
    },
    {
      artifactId: "weekly_quality_review",
      title: "Weekly quality review",
      category: "rolling_review",
      inputs: ["Weekly rollup JSON"],
      outputs: ["Weekly review pack JSON"],
      dependsOn: ["telemetry_diagnostics_inputs"],
      scriptPath: "scripts/ops/generateCrystalWeeklyQualityReview.mjs",
      utilPath: "src/utils/crystalWeeklyQualityReview.util.js",
      status: "semi_automated",
      contractStatus: "machine_readable",
      knownGaps: ["Not always wired before annual — optional in chain."],
      nextUpgrade: "Reference weekly JSON paths in OS-pack input when used.",
    },
    {
      artifactId: "weekly_trend_comparison",
      title: "Weekly trend comparison",
      category: "rolling_review",
      inputs: ["Weekly inputs"],
      outputs: ["Trend comparison JSON"],
      dependsOn: ["telemetry_diagnostics_inputs"],
      scriptPath: "scripts/ops/generateCrystalWeeklyTrendComparison.mjs",
      utilPath: "src/utils/crystalWeeklyTrendComparison.util.js",
      status: "semi_automated",
      contractStatus: "machine_readable",
      knownGaps: ["Optional branch in pipeline."],
      nextUpgrade: "Same as weekly quality — document when run.",
    },
    {
      artifactId: "quarterly_review_pack",
      title: "Quarterly review pack",
      category: "rolling_review",
      inputs: ["Quarter months JSON"],
      outputs: ["buildCrystalQuarterlyReviewPack JSON"],
      dependsOn: ["monthly_scorecard"],
      scriptPath: "scripts/ops/generateCrystalQuarterlyReviewPack.mjs",
      utilPath: "src/utils/crystalQuarterlyReviewPack.util.js",
      status: "ready",
      contractStatus: "machine_readable",
      knownGaps: [],
      nextUpgrade: "List quarter window in export filename convention.",
    },
    {
      artifactId: "half_year_business_review_pack",
      title: "Half-year business review pack",
      category: "rolling_review",
      inputs: ["Half-year structured months"],
      outputs: ["buildCrystalHalfYearBusinessReviewPack JSON"],
      dependsOn: ["quarterly_review_pack"],
      scriptPath: "scripts/ops/generateCrystalHalfYearBusinessReviewPack.mjs",
      utilPath: "src/utils/crystalHalfYearBusinessReviewPack.util.js",
      status: "ready",
      contractStatus: "machine_readable",
      knownGaps: ["Annual build typically needs two half-years — confirm calendar completeness."],
      nextUpgrade: "Validate month count in CI when wiring.",
    },
    {
      artifactId: "annual_operating_review_pack",
      title: "Annual operating review pack",
      category: "annual",
      inputs: ["halfYears or months + yearWindow*", "optional releaseSignals"],
      outputs: ["buildCrystalAnnualOperatingReviewPack JSON"],
      dependsOn: ["half_year_business_review_pack"],
      scriptPath: "scripts/ops/generateCrystalAnnualOperatingReviewPack.mjs",
      utilPath: "src/utils/crystalAnnualOperatingReviewPack.util.js",
      status: "manual",
      contractStatus: "machine_readable",
      knownGaps: ["Status becomes ready only when inputs exist — often manual assembly."],
      nextUpgrade: "Export releaseSignals for linkage in OS pack.",
    },
    {
      artifactId: "capability_maturity_roadmap_pack",
      title: "Capability maturity + roadmap pack",
      category: "capability",
      inputs: ["annualOperatingReviewPack or generator inputs", "optional evidenceSnapshot"],
      outputs: ["buildCrystalCapabilityMaturityRoadmapPack JSON"],
      dependsOn: ["annual_operating_review_pack"],
      scriptPath: "scripts/ops/generateCrystalCapabilityMaturityRoadmapPack.mjs",
      utilPath: "src/utils/crystalCapabilityMaturityRoadmapPack.util.js",
      status: "manual",
      contractStatus: "machine_readable",
      knownGaps: ["Snapshot-only path weakens domains."],
      nextUpgrade: "Always pass embedded annual JSON when possible.",
    },
    {
      artifactId: "operating_system_pack",
      title: "Operating system (unified review stack) pack",
      category: "control_plane",
      inputs: ["Annual + capability JSON or composite generator input"],
      outputs: ["buildCrystalOperatingSystemPack JSON / markdown"],
      dependsOn: ["capability_maturity_roadmap_pack"],
      scriptPath: "scripts/ops/generateCrystalOperatingSystemPack.mjs",
      utilPath: "src/utils/crystalOperatingSystemPack.util.js",
      status: "manual",
      contractStatus: "machine_readable",
      knownGaps: ["Control map is template-quality — not certification."],
      nextUpgrade: "Attach lower-layer refs in input JSON.",
    },
    {
      artifactId: "review_automation_pack",
      title: "Review automation + pipeline spec pack",
      category: "control_plane",
      inputs: ["Same as OS pack input", "optional operatingSystemPack"],
      outputs: ["buildCrystalReviewAutomationPack JSON / markdown"],
      dependsOn: ["operating_system_pack"],
      scriptPath: "scripts/ops/generateCrystalReviewAutomationPack.mjs",
      utilPath: "src/utils/crystalReviewAutomationPack.util.js",
      status: "ready",
      contractStatus: "machine_readable",
      knownGaps: ["Does not execute pipeline — describes it."],
      nextUpgrade: "Optionally pin OS pack as embedded input for reproducibility.",
    },
    {
      artifactId: "artifact_manifest_pack",
      title: "CI-friendly artifact manifest (this pack)",
      category: "meta",
      inputs: ["Optional operatingSystemPack / reviewAutomationPack passthrough", "or raw composite JSON"],
      outputs: ["Artifact manifest JSON for CI/tooling"],
      dependsOn: ["review_automation_pack"],
      scriptPath: "scripts/ops/generateCrystalArtifactManifest.mjs",
      utilPath: "src/utils/crystalArtifactManifest.util.js",
      status: "ready",
      contractStatus: "machine_readable",
      knownGaps: ["Descriptor only — no enforcement."],
      nextUpgrade: "Have CI diff `docs/ops/tables/crystal-artifact-manifest.json` on PR when contract changes.",
    },
    {
      artifactId: "multi_year_history_external",
      title: "Multi-year / long-horizon history",
      category: "external_or_future",
      inputs: ["External digests only"],
      outputs: ["Not generated by repo utils today"],
      dependsOn: [],
      scriptPath: null,
      utilPath: null,
      status: "manual",
      contractStatus: "implicit",
      knownGaps: ["No buildCrystalMultiYearHistoryPack in repo — do not assume artifact exists."],
      nextUpgrade: "If a util lands later, add row + edges; until then keep category external_or_future.",
    },
  ];
}

/**
 * Topological order for core linear path (CI-friendly list).
 */
/** Exported for tests / CI snapshots — recommended run order (not strict topological). */
export const CRYSTAL_ARTIFACT_GENERATION_ORDER = [
  "telemetry_diagnostics_inputs",
  "mismatch_metrics_artifact",
  "monthly_scorecard",
  "weekly_quality_review",
  "weekly_trend_comparison",
  "quarterly_review_pack",
  "half_year_business_review_pack",
  "annual_operating_review_pack",
  "capability_maturity_roadmap_pack",
  "operating_system_pack",
  "review_automation_pack",
  "artifact_manifest_pack",
  "multi_year_history_external",
];

/** @param {object} osPack */
function applyDynamicStatus(artifacts, osPack) {
  const hasAnnual = !!osPack.annualPackPresent;
  const hasCap = !!osPack.capabilityPackPresent;
  return artifacts.map((a) => {
    const next = { ...a };
    if (a.artifactId === "annual_operating_review_pack") {
      next.status = hasAnnual ? "ready" : "manual";
    }
    if (a.artifactId === "capability_maturity_roadmap_pack") {
      next.status = hasCap ? "ready" : "manual";
    }
    if (a.artifactId === "operating_system_pack") {
      next.status = hasAnnual && hasCap ? "ready" : "semi_automated";
    }
    return next;
  });
}

/**
 * @param {typeof baseArtifacts} artifacts
 */
function buildDependencyGraph(artifacts) {
  /** @type {{ fromArtifactId: string, toArtifactId: string, relationship: string }[]} */
  const edges = [];
  for (const a of artifacts) {
    for (const d of a.dependsOn || []) {
      edges.push({
        fromArtifactId: d,
        toArtifactId: a.artifactId,
        relationship: "depends_on",
      });
    }
  }
  return { edges, nodeIds: artifacts.map((x) => x.artifactId) };
}

/**
 * @param {typeof baseArtifacts} artifacts
 */
function buildArtifactStatuses(artifacts) {
  /** @type {Record<string, ArtifactRunStatus>} */
  const out = {};
  for (const a of artifacts) out[a.artifactId] = a.status;
  return out;
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalArtifactManifest(inputs, options = {}) {
  const raw = inputs || {};
  const generatedAt = raw.generatedAt != null ? String(raw.generatedAt) : options.generatedAt != null
    ? String(options.generatedAt)
    : new Date().toISOString();

  const osPack =
    raw.operatingSystemPack && typeof raw.operatingSystemPack === "object"
      ? raw.operatingSystemPack
      : buildCrystalOperatingSystemPack(raw, { ...options, generatedAt });

  const autoPack =
    raw.reviewAutomationPack && typeof raw.reviewAutomationPack === "object"
      ? raw.reviewAutomationPack
      : buildCrystalReviewAutomationPack({ ...raw, operatingSystemPack: osPack }, { ...options, generatedAt });

  let artifacts = applyDynamicStatus(baseArtifacts(), osPack);
  const dependencyGraph = buildDependencyGraph(artifacts);
  const artifactStatuses = buildArtifactStatuses(artifacts);

  const manualArtifactsRemaining = artifacts
    .filter((a) => a.status === "manual")
    .map((a) => `${a.artifactId}: ${a.title}`);

  const readyN = artifacts.filter((a) => a.status === "ready").length;
  const manualN = artifacts.filter((a) => a.status === "manual").length;

  /** @type {"weak"|"partial"|"strong"} */
  let ciReadinessStatus = "weak";
  if (readyN >= 6 && manualN <= 3) ciReadinessStatus = "strong";
  else if (readyN >= 3 || osPack.annualPackPresent) ciReadinessStatus = "partial";

  const ciReadinessSummary =
    ciReadinessStatus === "strong"
      ? "Most generator artifacts are `ready` or `semi_automated`; CI can pin JSON outputs and diff manifests."
      : ciReadinessStatus === "partial"
        ? "Core utils exist but annual/capability/OS inputs are often assembled manually — treat CI as advisory."
        : "Inputs are incomplete — manifest is documentation-only until exports exist.";

  const artifactContracts = [
    {
      contractId: "monthly_scorecard_v1",
      artifactId: "monthly_scorecard",
      producerUtil: "src/utils/crystalMonthlyScorecard.util.js",
      docPath: "docs/ops/crystal-monthly-scorecard.md",
      kind: "machine_readable",
    },
    {
      contractId: "annual_operating_review_v1",
      artifactId: "annual_operating_review_pack",
      producerUtil: "src/utils/crystalAnnualOperatingReviewPack.util.js",
      docPath: "docs/ops/crystal-annual-operating-review-pack.md",
      kind: "machine_readable",
    },
    {
      contractId: "capability_maturity_v1",
      artifactId: "capability_maturity_roadmap_pack",
      producerUtil: "src/utils/crystalCapabilityMaturityRoadmapPack.util.js",
      docPath: "docs/ops/crystal-capability-maturity-roadmap-pack.md",
      kind: "machine_readable",
    },
    {
      contractId: "operating_system_v1",
      artifactId: "operating_system_pack",
      producerUtil: "src/utils/crystalOperatingSystemPack.util.js",
      docPath: "docs/ops/crystal-operating-system-pack.md",
      kind: "machine_readable",
    },
    {
      contractId: "review_automation_v1",
      artifactId: "review_automation_pack",
      producerUtil: "src/utils/crystalReviewAutomationPack.util.js",
      docPath: "docs/ops/crystal-review-automation-pack.md",
      kind: "machine_readable",
    },
    {
      contractId: "artifact_manifest_v1",
      artifactId: "artifact_manifest_pack",
      producerUtil: "src/utils/crystalArtifactManifest.util.js",
      docPath: "docs/ops/crystal-artifact-manifest.md",
      kind: "machine_readable",
    },
  ];

  const recommendedManifestUpgrades = [
    ...(osPack.recommendedSystemImprovements || []).slice(0, 4),
    "Store `docs/ops/tables/crystal-artifact-manifest.json` next to CI and fail job if drift vs `buildCrystalArtifactManifest` output.",
    "Add job that runs `node scripts/ops/generateCrystalArtifactManifest.mjs --format json` and compares to committed table JSON.",
    `Automation pack alignment: generationOrder from automation = [${autoPack.generationOrder.join(", ")}]`,
  ];

  return {
    manifestVersion: ARTIFACT_MANIFEST_VERSION,
    reviewPackVersion: ARTIFACT_MANIFEST_PACK_VERSION,
    generatedAt,
    artifacts,
    generationOrder: [...CRYSTAL_ARTIFACT_GENERATION_ORDER],
    dependencyGraph,
    artifactContracts,
    artifactStatuses,
    ciReadinessStatus,
    ciReadinessSummary,
    manualArtifactsRemaining,
    recommendedManifestUpgrades,
    automationPackRef: {
      reviewAutomationPackVersion: autoPack.reviewPackVersion,
      operatingSystemPackVersion: osPack.reviewPackVersion,
    },
    methodNote:
      "Artifact manifest describes the crystal review stack in-repo — it does not execute generators or change routing/wording/mismatch behavior.",
  };
}

/**
 * @param {ReturnType<typeof buildCrystalArtifactManifest>} manifest
 */
export function renderCrystalArtifactManifestMarkdown(manifest) {
  const w = (s) => (s == null ? "" : String(s));
  const lines = [];
  lines.push("# Crystal artifact manifest (CI-friendly)");
  lines.push("");
  lines.push(`- **manifestVersion:** \`${w(manifest.manifestVersion)}\``);
  lines.push(`- **reviewPackVersion:** \`${w(manifest.reviewPackVersion)}\``);
  lines.push(`- **generatedAt:** ${w(manifest.generatedAt)}`);
  lines.push(`- **CI readiness:** \`${w(manifest.ciReadinessStatus)}\``);
  lines.push("");
  lines.push(`> ${w(manifest.methodNote)}`);
  lines.push("");
  lines.push("## CI readiness");
  lines.push("");
  lines.push(w(manifest.ciReadinessSummary));
  lines.push("");
  lines.push("## Generation order");
  lines.push("");
  lines.push(manifest.generationOrder.map((id) => `\`${id}\``).join(" → "));
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push("| ID | Category | Status | Script | Util |");
  lines.push("|----|----------|--------|--------|------|");
  for (const a of manifest.artifacts) {
    const sc = a.scriptPath ? `\`${a.scriptPath}\`` : "—";
    const ut = a.utilPath ? `\`${a.utilPath}\`` : "—";
    lines.push(`| \`${a.artifactId}\` | ${a.category} | \`${a.status}\` | ${sc} | ${ut} |`);
  }
  lines.push("");
  lines.push("## Dependency graph (edges)");
  lines.push("");
  for (const e of manifest.dependencyGraph.edges) {
    lines.push(`- \`${e.fromArtifactId}\` → \`${e.toArtifactId}\` (${e.relationship})`);
  }
  lines.push("");
  lines.push("## Manual artifacts remaining");
  for (const m of manifest.manualArtifactsRemaining || []) lines.push(`- ${m}`);
  lines.push("");
  lines.push("## Recommended manifest upgrades");
  for (const u of manifest.recommendedManifestUpgrades || []) lines.push(`- ${u}`);
  lines.push("");
  lines.push("## Contracts");
  for (const c of manifest.artifactContracts || []) {
    lines.push(`- **${c.contractId}** (${c.artifactId}): ${c.producerUtil} — ${c.docPath}`);
  }
  lines.push("");
  return lines.join("\n");
}
