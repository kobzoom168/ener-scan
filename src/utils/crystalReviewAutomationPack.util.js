/**
 * Crystal review automation + artifact pipeline spec (offline).
 * Composes **existing** packs only — does not change annual, capability, or OS pack behavior.
 * Phase 17.0 — repo reality (`docs/ops/crystal-review-automation-pack.md`).
 *
 * @module crystalReviewAutomationPack.util
 */

import { buildCrystalOperatingSystemPack } from "./crystalOperatingSystemPack.util.js";

export const REVIEW_AUTOMATION_PACK_VERSION = "1";

/** @typedef {"manual"|"semi_automated"|"automatable"|"ready"} StageStatus */

function str(x, def = "") {
  if (x == null) return def;
  return String(x).trim();
}

/**
 * @param {object} osPack
 * @param {object} raw
 */
function buildStages(osPack, raw) {
  const hasAnnual = !!osPack.annualPackPresent;
  const hasCap = !!osPack.capabilityPackPresent;
  const hasRefs =
    raw.weeklyReviewSummaryRefs ||
    raw.monthlyScorecardSummaryRefs ||
    raw.quarterlyReviewSummaryRefs;
  const hasMulti = raw.multiYearHistoryPackReference != null || raw.multiYearHistoryPack != null;

  /** @type {StageStatus} */
  const rolling = hasRefs ? "semi_automated" : "manual";

  return [
    {
      stageId: "telemetry_diagnostics_inputs",
      title: "Telemetry + visible wording inputs",
      inputs: ["Report payload signals", "docs/crystal-routing-telemetry-mapping.md", "Visible wording utils/tests"],
      outputs: ["Rollup-friendly KPI fields", "Diagnostics for copy surfaces"],
      dependsOn: [],
      status: /** @type {StageStatus} */ ("semi_automated"),
      knownFailureModes: ["Generator/version skew between months", "Non-crystal volume dominates slice"],
      nextUpgrade: "Record script name + commit in monthly JSON metadata when available.",
    },
    {
      stageId: "mismatch_metrics_layer",
      title: "Mismatch metrics (routing vs wording)",
      inputs: ["docs/crystal-routing-wording-mismatch-metrics.md", "crystalRoutingWordingMetrics util output"],
      outputs: ["Mismatch-type counts feeding monthly → annual"],
      dependsOn: ["telemetry_diagnostics_inputs"],
      status: "semi_automated",
      knownFailureModes: ["Taxonomy drift vs docs — do not relabel in packs"],
      nextUpgrade: "Keep monthly exports aligned with taxonomy doc versions.",
    },
    {
      stageId: "rolling_review_generators",
      title: "Weekly / monthly / quarterly / half-year generators",
      inputs: ["Month rollups", "Optional weeklyReviewSummaryRefs / monthlyScorecardSummaryRefs / quarterlyReviewSummaryRefs"],
      outputs: ["buildCrystalMonthlyScorecard", "buildCrystalQuarterlyReviewPack", "Half-year / weekly utils"],
      dependsOn: ["mismatch_metrics_layer"],
      status: rolling,
      knownFailureModes: ["Manual file stitching if refs omitted", "Missing months in year window"],
      nextUpgrade: "Attach refs in OS-pack input or store sibling JSON paths.",
    },
    {
      stageId: "annual_operating_review_pack",
      title: "Annual operating review pack",
      inputs: ["halfYears or months + yearWindow*", "optional releaseSignals"],
      outputs: ["buildCrystalAnnualOperatingReviewPack JSON"],
      dependsOn: ["rolling_review_generators"],
      status: hasAnnual ? "ready" : "manual",
      knownFailureModes: ["Incomplete year window", "No releaseSignals → weak release linkage in OS pack"],
      nextUpgrade: "Export annual JSON after monthly chain is complete.",
    },
    {
      stageId: "capability_maturity_roadmap_pack",
      title: "Capability maturity + roadmap pack",
      inputs: ["annualOperatingReviewPack (preferred)", "evidenceSnapshot (weaker)"],
      outputs: ["buildCrystalCapabilityMaturityRoadmapPack JSON"],
      dependsOn: ["annual_operating_review_pack"],
      status: hasCap ? "ready" : "manual",
      knownFailureModes: ["Snapshot-only capability → weaker domains"],
      nextUpgrade: "Regenerate from embedded annual JSON whenever KPIs change.",
    },
    {
      stageId: "operating_system_pack",
      title: "Operating system (unified review stack) pack",
      inputs: ["annual + capability JSON (or generator inputs)"],
      outputs: ["buildCrystalOperatingSystemPack JSON / markdown"],
      dependsOn: ["capability_maturity_roadmap_pack"],
      status: hasAnnual && hasCap ? "ready" : "semi_automated",
      knownFailureModes: ["Partial inputs → partial continuity status"],
      nextUpgrade: "Run after annual + capability exports for full control map.",
    },
    {
      stageId: "optional_historical_external",
      title: "Optional historical / multi-year (external)",
      inputs: ["multiYearHistoryPackReference (passthrough)"],
      outputs: ["Not generated in-repo"],
      dependsOn: [],
      status: hasMulti ? "manual" : "manual",
      knownFailureModes: ["Treating reference as computed pack — not supported"],
      nextUpgrade: "If a multi-year util is added later, reclassify this stage.",
    },
  ];
}

/**
 * @param {ReturnType<typeof buildStages>} stages
 */
function buildDependencies(stages) {
  /** @type {{ fromStageId: string, toStageId: string, relationship: string }[]} */
  const edges = [];
  for (const s of stages) {
    for (const d of s.dependsOn || []) {
      edges.push({ fromStageId: d, toStageId: s.stageId, relationship: "prerequisite" });
    }
  }
  return edges;
}

function buildContracts() {
  return [
    {
      contractId: "monthly_scorecard_json",
      description: "Output shape from buildCrystalMonthlyScorecard",
      producerUtil: "src/utils/crystalMonthlyScorecard.util.js",
      consumerDoc: "docs/ops/crystal-monthly-scorecard.md",
    },
    {
      contractId: "annual_operating_review_json",
      description: "Annual pack JSON",
      producerUtil: "src/utils/crystalAnnualOperatingReviewPack.util.js",
      consumerDoc: "docs/ops/crystal-annual-operating-review-pack.md",
    },
    {
      contractId: "capability_maturity_json",
      description: "Capability + roadmap pack JSON",
      producerUtil: "src/utils/crystalCapabilityMaturityRoadmapPack.util.js",
      consumerDoc: "docs/ops/crystal-capability-maturity-roadmap-pack.md",
    },
    {
      contractId: "operating_system_json",
      description: "Unified review stack + controls",
      producerUtil: "src/utils/crystalOperatingSystemPack.util.js",
      consumerDoc: "docs/ops/crystal-operating-system-pack.md",
    },
  ];
}

function pad3(a, filler) {
  const out = [...(a || [])];
  while (out.length < 3) out.push(filler);
  return out.slice(0, 3);
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalReviewAutomationPack(inputs, options = {}) {
  const raw = inputs || {};
  const generatedAt = str(raw.generatedAt || options.generatedAt || new Date().toISOString());

  const osPack =
    raw.operatingSystemPack && typeof raw.operatingSystemPack === "object"
      ? raw.operatingSystemPack
      : buildCrystalOperatingSystemPack(raw, { ...options, generatedAt });

  const stages = buildStages(osPack, raw);
  const artifactDependencies = buildDependencies(stages);
  const artifactContracts = buildContracts();
  const generationOrder = stages.map((s) => s.stageId);

  const manualStepsRemaining = stages.filter((s) => s.status === "manual").map((s) => `${s.stageId}: ${s.title}`);

  const readyN = stages.filter((s) => s.status === "ready").length;
  const manualN = stages.filter((s) => s.status === "manual").length;

  /** @type {"weak"|"partial"|"strong"} */
  let automationReadinessStatus = "weak";
  if (readyN >= 3 && manualN <= 2) automationReadinessStatus = "strong";
  else if (readyN >= 1 || osPack.annualPackPresent) automationReadinessStatus = "partial";

  const automationReadinessSummary =
    automationReadinessStatus === "strong"
      ? "Annual, capability, and OS pack stages are exercisable from repo utils — remaining gaps are mostly manual stitching."
      : automationReadinessStatus === "partial"
        ? "Some stages are ready (offline JSON), but rolling inputs and optional history remain manual or external."
        : "Pipeline is mostly manual until annual/capability JSON exports exist.";

  const automationGaps = [];
  if (!osPack.annualPackPresent) automationGaps.push("No annual JSON path in this input — annual stage stays manual.");
  if (!osPack.capabilityPackPresent) automationGaps.push("Capability stage not satisfied — run capability util after annual.");
  if (
    !raw.monthlyScorecardSummaryRefs &&
    !raw.quarterlyReviewSummaryRefs &&
    !raw.weeklyReviewSummaryRefs
  ) {
    automationGaps.push("No lower-layer refs — rolling review stage treated as manual stitch.");
  }
  if (!raw.multiYearHistoryPackReference && !raw.multiYearHistoryPack) {
    automationGaps.push("Multi-year history not in-repo — optional stage stays external/manual.");
  }
  automationGaps.push("No single CI job wires all generators — orchestration is human today.");

  const recommendedPipelineUpgrades = [
    ...(osPack.recommendedSystemImprovements || []).slice(0, 5),
    "Add a thin npm script that runs monthly → annual → capability → OS in order with pinned inputs.",
    "Store export metadata (generator name, git SHA) beside JSON for audit.",
  ];

  const pack = {
    reviewPackVersion: REVIEW_AUTOMATION_PACK_VERSION,
    generatedAt,
    assessmentWindowStart: osPack.assessmentWindowStart,
    assessmentWindowEnd: osPack.assessmentWindowEnd,
    operatingSystemPackVersion: osPack.reviewPackVersion,
    artifactPipelineStages: stages,
    artifactDependencies,
    artifactContracts,
    generationOrder,
    automationReadinessStatus,
    automationReadinessSummary,
    manualStepsRemaining,
    automationGaps,
    recommendedPipelineUpgrades,
    executiveSummary: {},
    operatingSummary: {},
    pipelineSummary: {},
    methodNote:
      "Automation pack is a **spec + readiness map** over existing scripts — it does not execute the pipeline or change routing/wording/mismatch semantics.",
  };

  pack.executiveSummary = {
    executiveSummaryHeadline: `Crystal review artifact pipeline — readiness **${automationReadinessStatus}** (${readyN} ready stages).`,
    executiveSummaryBody: [
      `Operating system pack v${osPack.reviewPackVersion} is the control-plane view; this pack adds generation order and dependency map.`,
      `Manual-heavy stages: **${manualN}**.`,
    ].join(" "),
    top3Strengths: pad3(
      [
        "Repo has deterministic utils for monthly → annual → capability → OS (offline).",
        ...(osPack.evidenceStrengths || []).slice(0, 2),
      ],
      "Generators are pure and test-covered.",
    ),
    top3Risks: pad3(
      [...(osPack.evidenceBreakpoints || []).slice(0, 2), ...automationGaps.slice(0, 2)],
      "Orchestration is not a single command yet.",
    ),
    top3RecommendedMoves: pad3(recommendedPipelineUpgrades, "Script the export order in ops runbooks."),
    methodNote: "Derived from OS pack + stage table — not live CI status.",
  };

  pack.operatingSummary = {
    operatingSummaryHeadline: `Operating view: **${generationOrder.length}** stages; **${manualStepsRemaining.length}** manual labels.`,
    operatingSummaryBody: [
      "Stages reflect actual util names in this repo — no fictional phases.",
      "Optional historical remains manual until a util exists.",
    ].join(" "),
    topOperationalStrengths: pad3(
      ["Annual + capability + OS packs compose without code changes to lower layers."],
      "JSON-in / JSON-out discipline.",
    ),
    topOperationalGaps: pad3(automationGaps, "Add refs for rolling layers."),
    topOperationalNextActions: pad3(recommendedPipelineUpgrades, "Document export folder layout."),
    methodNote: "Same evidence spine as operating system pack.",
  };

  pack.pipelineSummary = {
    pipelineSummaryHeadline: "Pipeline: telemetry → mismatch → rolling → annual → capability → OS map (+ optional external history).",
    pipelineSummaryBody: `Generation order: \`${generationOrder.join(" → ")}\`.`,
    top3PipelineHighlights: pad3(
      stages.filter((s) => s.status === "ready").map((s) => `${s.stageId}: ${s.title}`),
      "Run annual util after months are complete.",
    ),
    top3AutomationGaps: pad3(automationGaps, "CI wiring"),
    top3RecommendedUpgrades: pad3(recommendedPipelineUpgrades, "Versioned exports"),
    methodNote: "Status per stage is heuristic from input + OS pack presence.",
  };

  return pack;
}

/**
 * @param {object} pack
 */
export function renderCrystalReviewAutomationPackMarkdown(pack) {
  const w = (s) => (s == null ? "" : String(s));
  const ex = pack.executiveSummary || {};
  const op = pack.operatingSummary || {};
  const pl = pack.pipelineSummary || {};

  const lines = [];
  lines.push("# Crystal review automation + artifact pipeline pack");
  lines.push("");
  lines.push(`- **Generated at:** ${w(pack.generatedAt)}`);
  lines.push(`- **Pack version:** \`${w(pack.reviewPackVersion)}\``);
  lines.push(`- **OS pack version ref:** \`${w(pack.operatingSystemPackVersion)}\``);
  lines.push(`- **Automation readiness:** \`${w(pack.automationReadinessStatus)}\``);
  lines.push("");
  lines.push(`> ${w(pack.methodNote)}`);
  lines.push("");

  lines.push("## Executive summary");
  lines.push("");
  lines.push(w(ex.executiveSummaryHeadline));
  lines.push("");
  lines.push(w(ex.executiveSummaryBody));
  lines.push("");
  for (const t of ex.top3Strengths || []) lines.push(`- **Strength:** ${t}`);
  for (const t of ex.top3Risks || []) lines.push(`- **Risk:** ${t}`);
  for (const t of ex.top3RecommendedMoves || []) lines.push(`- **Move:** ${t}`);
  lines.push("");
  lines.push(`> ${w(ex.methodNote)}`);
  lines.push("");

  lines.push("## Pipeline stages");
  lines.push("");
  lines.push("| Stage | Status | Depends on |");
  lines.push("|-------|--------|------------|");
  for (const s of pack.artifactPipelineStages || []) {
    const dep = (s.dependsOn || []).join(", ") || "—";
    lines.push(`| ${s.title} | \`${s.status}\` | ${dep} |`);
  }
  lines.push("");

  lines.push("## Generation order");
  lines.push("");
  lines.push(pack.generationOrder?.join(" → ") || "");
  lines.push("");

  lines.push("## Artifact dependencies");
  lines.push("");
  for (const e of pack.artifactDependencies || []) {
    lines.push(`- \`${e.fromStageId}\` → \`${e.toStageId}\` (${e.relationship})`);
  }
  lines.push("");

  lines.push("## Contracts (repo reality)");
  lines.push("");
  for (const c of pack.artifactContracts || []) {
    lines.push(`- **${c.contractId}:** ${c.description} — \`${c.producerUtil}\``);
  }
  lines.push("");

  lines.push("## Automation readiness");
  lines.push("");
  lines.push(w(pack.automationReadinessSummary));
  lines.push("");

  lines.push("## Manual steps remaining");
  for (const m of pack.manualStepsRemaining || []) lines.push(`- ${m}`);
  lines.push("");

  lines.push("## Automation gaps");
  for (const g of pack.automationGaps || []) lines.push(`- ${g}`);
  lines.push("");

  lines.push("## Recommended pipeline upgrades");
  for (const g of pack.recommendedPipelineUpgrades || []) lines.push(`- ${g}`);
  lines.push("");

  lines.push("## Operating summary");
  lines.push("");
  lines.push(w(op.operatingSummaryHeadline));
  lines.push("");
  lines.push(w(op.operatingSummaryBody));
  lines.push("");
  for (const t of op.topOperationalStrengths || []) lines.push(`- **Ops:** ${t}`);
  for (const t of op.topOperationalGaps || []) lines.push(`- **Gap:** ${t}`);
  for (const t of op.topOperationalNextActions || []) lines.push(`- **Next:** ${t}`);
  lines.push("");

  lines.push("## Pipeline summary");
  lines.push("");
  lines.push(w(pl.pipelineSummaryHeadline));
  lines.push("");
  lines.push(w(pl.pipelineSummaryBody));
  lines.push("");
  for (const t of pl.top3PipelineHighlights || []) lines.push(`- **Highlight:** ${t}`);
  for (const t of pl.top3AutomationGaps || []) lines.push(`- **Gap:** ${t}`);
  for (const t of pl.top3RecommendedUpgrades || []) lines.push(`- **Upgrade:** ${t}`);
  lines.push("");
  lines.push(`> ${w(pl.methodNote)}`);
  lines.push("");

  return lines.join("\n");
}
