/**
 * Minimal CI job spec + validation check catalog for the crystal artifact review stack.
 * Phase 17.2 — descriptive only; does not change generators, routing, wording, or mismatch semantics.
 *
 * Optional **render smoke** calls public `build*` + `render*` functions with the same `inputs`
 * to set `assessment` — it does not mutate artifact behavior.
 *
 * @module crystalArtifactCiValidation.util
 */

import { buildCrystalArtifactManifest, renderCrystalArtifactManifestMarkdown } from "./crystalArtifactManifest.util.js";
import { buildCrystalOperatingSystemPack, renderCrystalOperatingSystemPackMarkdown } from "./crystalOperatingSystemPack.util.js";
import { buildCrystalReviewAutomationPack, renderCrystalReviewAutomationPackMarkdown } from "./crystalReviewAutomationPack.util.js";

export const CI_SPEC_VERSION = "1.0";
export const CI_SPEC_REVIEW_PACK_VERSION = "1";

/** @typedef {"hard"|"soft"} CheckSeverity */
/** @typedef {"pass"|"warn"|"fail"|"unknown"} CheckAssessment */

/**
 * @param {{ fromArtifactId: string, toArtifactId: string }[]} edges
 */
function dependencyGraphHasCycle(edges) {
  /** @type {Map<string, string[]>} */
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.fromArtifactId)) adj.set(e.fromArtifactId, []);
    adj.get(e.fromArtifactId).push(e.toArtifactId);
  }
  const visiting = new Set();
  const visited = new Set();
  function dfs(n) {
    if (visiting.has(n)) return true;
    if (visited.has(n)) return false;
    visiting.add(n);
    for (const w of adj.get(n) || []) {
      if (dfs(w)) return true;
    }
    visiting.delete(n);
    visited.add(n);
    return false;
  }
  for (const n of adj.keys()) {
    if (dfs(n)) return true;
  }
  return false;
}

/**
 * @param {string[]} order
 * @param {string[]} nodeIds
 */
function generationOrderCoversNodes(order, nodeIds) {
  if (!nodeIds.length) return false;
  const s = new Set(order);
  for (const id of nodeIds) {
    if (!s.has(id)) return false;
  }
  return true;
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} options
 * @returns {CheckAssessment}
 */
function runRenderSmoke(inputs, options) {
  const ctx = inputs?.ciValidationContext || {};
  if (ctx.forceRenderFailure === true) return "fail";
  if (ctx.skipRenderSmoke === true) return "unknown";
  try {
    const manifest = buildCrystalArtifactManifest(inputs, options);
    renderCrystalArtifactManifestMarkdown(manifest);
    const os = buildCrystalOperatingSystemPack(inputs, options);
    renderCrystalOperatingSystemPackMarkdown(os);
    const auto = buildCrystalReviewAutomationPack({ ...inputs, operatingSystemPack: os }, options);
    renderCrystalReviewAutomationPackMarkdown(auto);
    return "pass";
  } catch {
    return "fail";
  }
}

/** Exported for tests — minimal CI job order. */
export const CI_SPEC_JOB_ORDER = [
  "validate_artifact_manifest",
  "validate_required_artifacts_present",
  "validate_generation_order",
  "validate_dependency_graph",
  "validate_machine_readable_contracts",
  "validate_pack_renderability",
  "report_manual_followups",
];

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalArtifactCiSpec(inputs = {}, options = {}) {
  const manifest = inputs.artifactManifest && typeof inputs.artifactManifest === "object"
    ? inputs.artifactManifest
    : buildCrystalArtifactManifest(inputs, options);

  const edges = manifest.dependencyGraph?.edges || [];
  const nodeIds = manifest.dependencyGraph?.nodeIds || [];
  const cycle = dependencyGraphHasCycle(edges);
  const orderOk = generationOrderCoversNodes(manifest.generationOrder || [], nodeIds);
  const renderAssessment = runRenderSmoke(inputs, options);

  const annualManual = manifest.artifactStatuses?.annual_operating_review_pack === "manual";
  const extManual = manifest.artifacts.some((a) => a.artifactId === "multi_year_history_external" && a.status === "manual");

  /** @type {{ checkId: string, title: string, scope: string, severity: CheckSeverity, summary: string, expectedCondition: string, failureMeaning: string, recommendedAction: string, assessment: CheckAssessment, jobId: string }[]} */
  const validationChecks = [
    {
      jobId: "validate_artifact_manifest",
      checkId: "manifest_utils_export_present",
      title: "Artifact manifest util + table path documented",
      scope: "artifact_manifest_pack",
      severity: "hard",
      summary: "Repo contains `crystalArtifactManifest.util.js` and docs describe `docs/ops/tables/crystal-artifact-manifest.json`.",
      expectedCondition: "CI can run `node scripts/ops/generateCrystalArtifactManifest.mjs --format json`.",
      failureMeaning: "Manifest layer missing or broken — downstream CI cannot name artifacts.",
      recommendedAction: "Restore util, script, and committed table JSON.",
      assessment: manifest.artifacts.some((a) => a.artifactId === "artifact_manifest_pack") ? "pass" : "fail",
    },
    {
      jobId: "validate_artifact_manifest",
      checkId: "manifest_generation_non_empty",
      title: "buildCrystalArtifactManifest returns structured manifest",
      scope: "artifact_manifest_pack",
      severity: "hard",
      summary: "Manifest builder yields artifacts, generationOrder, dependencyGraph.",
      expectedCondition: "`artifacts.length` > 0 and `generationOrder` is non-empty.",
      failureMeaning: "Manifest builder failed or returned empty — CI has nothing to validate.",
      recommendedAction: "Fix inputs or manifest util regression.",
      assessment: manifest.artifacts.length > 0 && manifest.generationOrder.length > 0 ? "pass" : "fail",
    },
    {
      jobId: "validate_required_artifacts_present",
      checkId: "core_util_paths_declared",
      title: "Core pack utils declared on manifest rows",
      scope: "annual_capability_os_automation",
      severity: "soft",
      summary: "Annual, capability, OS, automation artifacts list utilPath / scriptPath where applicable.",
      expectedCondition: "Rows for annual, capability, OS, automation have non-null utilPath.",
      failureMeaning: "Cannot locate generator entrypoints from manifest alone.",
      recommendedAction: "Patch manifest rows in `crystalArtifactManifest.util.js`.",
      assessment: ["annual_operating_review_pack", "capability_maturity_roadmap_pack", "operating_system_pack", "review_automation_pack"].every((id) =>
        manifest.artifacts.find((a) => a.artifactId === id)?.utilPath,
      )
        ? "pass"
        : "fail",
    },
    {
      jobId: "validate_required_artifacts_present",
      checkId: "annual_pack_ready_when_inputs_exist",
      title: "Annual artifact status reflects inputs",
      scope: "annual_operating_review_pack",
      severity: "soft",
      summary: "When year inputs exist, annual row should be `ready` not stuck `manual` in assessment.",
      expectedCondition: "If `annualPackPresent` in underlying OS context, annual artifact status is `ready`.",
      failureMeaning: "Annual export missing — OS/capability chain is incomplete.",
      recommendedAction: "Run `generateCrystalAnnualOperatingReviewPack.mjs` with complete months/half-years.",
      assessment: annualManual ? "warn" : "pass",
    },
    {
      jobId: "validate_generation_order",
      checkId: "generation_order_covers_all_nodes",
      title: "Generation order lists every artifact id",
      scope: "artifact_manifest_pack",
      severity: "hard",
      summary: "generationOrder includes all dependencyGraph.nodeIds.",
      expectedCondition: "No orphan artifact id outside generation order list.",
      failureMeaning: "CI cannot enforce a total order for tooling.",
      recommendedAction: "Align `CRYSTAL_ARTIFACT_GENERATION_ORDER` with `nodeIds`.",
      assessment: orderOk ? "pass" : "fail",
    },
    {
      jobId: "validate_dependency_graph",
      checkId: "dependency_graph_acyclic",
      title: "Dependency graph has no cycles",
      scope: "artifact_manifest_pack",
      severity: "hard",
      summary: "Directed edges among artifacts must be acyclic.",
      expectedCondition: "DFS finds no cycle.",
      failureMeaning: "Artifact dependencies contradict — cannot run generators safely.",
      recommendedAction: "Fix dependsOn edges in manifest util.",
      assessment: cycle ? "fail" : "pass",
    },
    {
      jobId: "validate_machine_readable_contracts",
      checkId: "contracts_list_core_packs",
      title: "Machine-readable contracts cover key packs",
      scope: "docs_and_utils",
      severity: "soft",
      summary: "artifactContracts includes monthly, annual, capability, OS, automation, manifest entries.",
      expectedCondition: "At least 6 contract rows.",
      failureMeaning: "Docs/util linkage not enumerated for CI drift checks.",
      recommendedAction: "Extend `artifactContracts` in manifest util.",
      assessment: (manifest.artifactContracts || []).length >= 6 ? "pass" : "warn",
    },
    {
      jobId: "validate_pack_renderability",
      checkId: "markdown_render_smoke",
      title: "Pack markdown render smoke (OS + automation + manifest)",
      scope: "render_functions",
      severity: "hard",
      summary: "Public render* functions succeed on current inputs (optional smoke).",
      expectedCondition: "No throw from renderCrystal*Markdown when smoke enabled.",
      failureMeaning: "Pack output broken — CI markdown artifact job would fail.",
      recommendedAction: "Fix throw in util or pass valid fixture inputs in CI.",
      assessment: renderAssessment === "unknown" ? "warn" : renderAssessment === "pass" ? "pass" : "fail",
    },
    {
      jobId: "report_manual_followups",
      checkId: "manual_external_multi_year_acknowledged",
      title: "External / future artifacts flagged",
      scope: "external_or_future",
      severity: "soft",
      summary: "multi_year history remains external — not treated as automated.",
      expectedCondition: "Category `external_or_future` row exists with manual status.",
      failureMeaning: "Team might assume history pack exists in-repo.",
      recommendedAction: "Keep manifest row until a util ships.",
      assessment: extManual ? "pass" : "warn",
    },
  ];

  const jobs = CI_SPEC_JOB_ORDER.map((jobId) => {
    const titles = {
      validate_artifact_manifest: "Validate artifact manifest structure",
      validate_required_artifacts_present: "Validate required artifact rows",
      validate_generation_order: "Validate generation order consistency",
      validate_dependency_graph: "Validate dependency graph shape",
      validate_machine_readable_contracts: "Validate machine-readable contracts list",
      validate_pack_renderability: "Validate pack markdown render smoke",
      report_manual_followups: "Report manual follow-ups",
    };
    const desc = {
      validate_artifact_manifest: "Runs structural checks on `buildCrystalArtifactManifest` output (or pre-supplied manifest).",
      validate_required_artifacts_present: "Ensures core pack rows declare util paths and annual readiness is coherent.",
      validate_generation_order: "Ensures generation order covers all node ids.",
      validate_dependency_graph: "Ensures DAG (no cycles).",
      validate_machine_readable_contracts: "Ensures contract table lists key packs for doc/util drift tooling.",
      validate_pack_renderability: "Optional smoke: render markdown for manifest, OS, automation packs.",
      report_manual_followups: "Surfaces manual artifacts and external rows — never fail-hard by default.",
    };
    return {
      jobId,
      title: titles[jobId],
      description: desc[jobId],
      checkIds: validationChecks.filter((c) => c.jobId === jobId).map((c) => c.checkId),
    };
  });

  const failHardChecks = validationChecks.filter((c) => c.severity === "hard");
  const failSoftChecks = validationChecks.filter((c) => c.severity === "soft");

  const manualFollowups = [
    ...(manifest.manualArtifactsRemaining || []).map((m) => `Manual artifact: ${m}`),
    "Rolling inputs (weekly/monthly/quarterly JSON) are still assembled outside this spec unless refs are attached.",
    "Release `releaseSignals` on annual JSON remains an ops discipline — not enforced here.",
  ];

  const hardFailCount = failHardChecks.filter((c) => c.assessment === "fail").length;
  const softWarnCount = failSoftChecks.filter((c) => c.assessment === "warn" || c.assessment === "fail").length;

  /** @type {"weak"|"partial"|"strong"} */
  let ciReadinessStatus = manifest.ciReadinessStatus || "weak";
  if (hardFailCount > 0) ciReadinessStatus = "weak";
  else if (softWarnCount > 0 && ciReadinessStatus === "strong") ciReadinessStatus = "partial";

  const ciReadinessSummary =
    hardFailCount > 0
      ? `${hardFailCount} hard-severity check(s) failed — fix before claiming CI-ready artifact stack.`
      : softWarnCount > 0
        ? `${softWarnCount} soft check(s) warn — pipeline usable with manual follow-ups.`
        : manifest.ciReadinessSummary || "See manifest CI readiness.";

  const artifactCoverageSummary = `Manifest enumerates ${manifest.artifacts.length} artifacts; CI spec attaches ${validationChecks.length} validation checks across ${jobs.length} jobs.`;

  const recommendedNextCiUpgrades = [
    ...(manifest.recommendedManifestUpgrades || []).slice(0, 3),
    "Add a CI step: `node --test tests/crystalArtifactCiValidation.util.test.js` (or full ops subset).",
    "Diff `docs/ops/tables/crystal-artifact-manifest.json` against `generateCrystalArtifactManifest` in PRs.",
    "Gate merge on zero hard-check failures only — allow soft warnings with label `artifact-review-stack:soft-fail-ok`.",
  ];

  return {
    ciSpecVersion: CI_SPEC_VERSION,
    reviewPackVersion: CI_SPEC_REVIEW_PACK_VERSION,
    generatedAt: manifest.generatedAt ?? options.generatedAt ?? new Date().toISOString(),
    jobs,
    jobOrder: [...CI_SPEC_JOB_ORDER],
    validationChecks,
    failHardChecks,
    failSoftChecks,
    manualFollowups,
    artifactCoverageSummary,
    ciReadinessStatus,
    ciReadinessSummary,
    recommendedNextCiUpgrades,
    manifestRef: {
      manifestVersion: manifest.manifestVersion,
      reviewPackVersion: manifest.reviewPackVersion,
    },
    methodNote:
      "CI spec is a minimal validation catalog — it does not start servers, run production queries, or change routing/wording/mismatch semantics.",
  };
}

/**
 * @param {ReturnType<typeof buildCrystalArtifactCiSpec>} spec
 */
export function renderCrystalArtifactCiSpecMarkdown(spec) {
  const w = (s) => (s == null ? "" : String(s));
  const lines = [];
  lines.push("# Crystal artifact CI spec (minimal)");
  lines.push("");
  lines.push(`- **ciSpecVersion:** \`${w(spec.ciSpecVersion)}\``);
  lines.push(`- **reviewPackVersion:** \`${w(spec.reviewPackVersion)}\``);
  lines.push(`- **CI readiness:** \`${w(spec.ciReadinessStatus)}\``);
  lines.push("");
  lines.push(`> ${w(spec.methodNote)}`);
  lines.push("");
  lines.push("## Job order");
  lines.push("");
  lines.push(spec.jobOrder.map((j) => `\`${j}\``).join(" → "));
  lines.push("");
  lines.push("## Jobs");
  lines.push("");
  for (const j of spec.jobs) {
    lines.push(`### ${j.title} (\`${j.jobId}\`)`);
    lines.push("");
    lines.push(w(j.description));
    lines.push("");
    lines.push(`Checks: ${j.checkIds.map((c) => `\`${c}\``).join(", ")}`);
    lines.push("");
  }
  lines.push("## Validation checks");
  lines.push("");
  for (const c of spec.validationChecks) {
    lines.push(`#### ${c.title} (\`${c.checkId}\`)`);
    lines.push(`- **Scope:** ${c.scope}`);
    lines.push(`- **Severity:** \`${c.severity}\``);
    lines.push(`- **Assessment:** \`${c.assessment}\``);
    lines.push(`- **Summary:** ${c.summary}`);
    lines.push(`- **Expected:** ${c.expectedCondition}`);
    lines.push(`- **If failed:** ${c.failureMeaning}`);
    lines.push(`- **Action:** ${c.recommendedAction}`);
    lines.push("");
  }
  lines.push("## Fail-hard checks");
  for (const c of spec.failHardChecks) lines.push(`- \`${c.checkId}\` — ${c.assessment}`);
  lines.push("");
  lines.push("## Fail-soft checks");
  for (const c of spec.failSoftChecks) lines.push(`- \`${c.checkId}\` — ${c.assessment}`);
  lines.push("");
  lines.push("## Manual follow-ups");
  for (const m of spec.manualFollowups) lines.push(`- ${m}`);
  lines.push("");
  lines.push("## CI readiness");
  lines.push("");
  lines.push(w(spec.ciReadinessSummary));
  lines.push("");
  lines.push("## Recommended next CI upgrades");
  for (const u of spec.recommendedNextCiUpgrades) lines.push(`- ${u}`);
  lines.push("");
  return lines.join("\n");
}
