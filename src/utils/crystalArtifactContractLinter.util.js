/**
 * Minimal artifact contract linter + schema guard (offline).
 * Phase 17.3 — checks **shape** and **version fields** only; no full JSON Schema platform.
 * Does not change generators, routing, wording, or mismatch semantics.
 *
 * @module crystalArtifactContractLinter.util
 */

import { buildCrystalArtifactManifest } from "./crystalArtifactManifest.util.js";
import { buildCrystalAnnualOperatingReviewPack } from "./crystalAnnualOperatingReviewPack.util.js";
import { buildCrystalCapabilityMaturityRoadmapPack } from "./crystalCapabilityMaturityRoadmapPack.util.js";
import { buildCrystalOperatingSystemPack } from "./crystalOperatingSystemPack.util.js";
import { buildCrystalReviewAutomationPack } from "./crystalReviewAutomationPack.util.js";
import { buildCrystalArtifactCiSpec } from "./crystalArtifactCiValidation.util.js";

export const LINTER_VERSION = "1.0";
export const LINTER_REVIEW_PACK_VERSION = "1";

/** Known top-level keys for drift warnings (repo snapshot — extend when packs add fields). */
const KNOWN_KEYS = {
  artifact_manifest: new Set([
    "manifestVersion",
    "reviewPackVersion",
    "generatedAt",
    "artifacts",
    "generationOrder",
    "dependencyGraph",
    "artifactContracts",
    "artifactStatuses",
    "ciReadinessStatus",
    "ciReadinessSummary",
    "manualArtifactsRemaining",
    "recommendedManifestUpgrades",
    "automationPackRef",
    "methodNote",
  ]),
  annual_operating_review_pack: new Set([
    "reviewPackVersion",
    "yearWindowStart",
    "yearWindowEnd",
    "generatedAt",
    "monthsIncluded",
    "quartersIncluded",
    "halfYearsIncluded",
    "annualStatus",
    "overallAnnualQualityScore",
    "annualScoreBand",
    "annualKpis",
    "monthlyStatusDistribution",
    "quarterlyStatusDistribution",
    "halfYearStatusDistribution",
    "monthlyScoreDistribution",
    "quarterlyScoreDistribution",
    "halfYearScoreDistribution",
    "topRecurringAnomalies",
    "topRecurringMismatchTypes",
    "topRecurringRoutingRuleIds",
    "topRecurringDecisionSources",
    "topOperatingRiskAreas",
    "usageDropMonths",
    "multiPeriodFallbackHeavy",
    "watchEscalateHalfYearPattern",
    "halfYearRecaps",
    "quarterRecaps",
    "monthByMonthRecap",
    "releaseSignalsInput",
    "focusAreasNextYear",
    "executiveSummary",
    "operatingSummary",
    "recommendations",
    "annualKpiPack",
    "methodNote",
  ]),
  capability_maturity_roadmap_pack: new Set([
    "reviewPackVersion",
    "assessmentWindowStart",
    "assessmentWindowEnd",
    "generatedAt",
    "overallMaturityLevel",
    "overallMaturityBand",
    "domainAssessments",
    "strengths",
    "gaps",
    "evidenceBackedRisks",
    "operatingRoadmap",
    "roadmapPriorities",
    "quickWins",
    "foundationInvestments",
    "scaleUpInvestments",
    "executiveSummary",
    "operatingSummary",
    "roadmapSummary",
    "recommendations",
    "evidenceSourceNote",
    "multiYearHistoryPackReference",
    "methodNote",
  ]),
  operating_system_pack: new Set([
    "reviewPackVersion",
    "generatedAt",
    "assessmentWindowStart",
    "assessmentWindowEnd",
    "annualOperatingReviewPackVersion",
    "capabilityMaturityRoadmapPackVersion",
    "annualPackPresent",
    "capabilityPackPresent",
    "reviewLayers",
    "unifiedReviewStack",
    "operatingControlMap",
    "recommendedSystemImprovements",
    "evidenceContinuityStatus",
    "evidenceContinuitySummary",
    "evidenceBreakpoints",
    "evidenceStrengths",
    "evidenceUpgradeSuggestions",
    "releaseReviewLinkageStatus",
    "roadmapLinkageStatus",
    "linkageStrengths",
    "linkageGaps",
    "recommendedLinkageUpgrades",
    "optionalLayerReferences",
    "docReferences",
    "executiveSummary",
    "operatingSummary",
    "systemSummary",
    "methodNote",
  ]),
  review_automation_pack: new Set([
    "reviewPackVersion",
    "generatedAt",
    "assessmentWindowStart",
    "assessmentWindowEnd",
    "operatingSystemPackVersion",
    "artifactPipelineStages",
    "artifactDependencies",
    "artifactContracts",
    "generationOrder",
    "automationReadinessStatus",
    "automationReadinessSummary",
    "manualStepsRemaining",
    "automationGaps",
    "recommendedPipelineUpgrades",
    "executiveSummary",
    "operatingSummary",
    "pipelineSummary",
    "methodNote",
  ]),
  artifact_ci_spec: new Set([
    "ciSpecVersion",
    "reviewPackVersion",
    "generatedAt",
    "jobs",
    "jobOrder",
    "validationChecks",
    "failHardChecks",
    "failSoftChecks",
    "manualFollowups",
    "artifactCoverageSummary",
    "ciReadinessStatus",
    "ciReadinessSummary",
    "recommendedNextCiUpgrades",
    "manifestRef",
    "methodNote",
  ]),
};

/** @type {Record<string, string[]>} */
export const requiredFieldsByArtifact = {
  artifact_manifest: ["manifestVersion", "reviewPackVersion", "artifacts", "generationOrder", "dependencyGraph"],
  annual_operating_review_pack: [
    "reviewPackVersion",
    "yearWindowStart",
    "yearWindowEnd",
    "annualStatus",
    "annualKpis",
    "executiveSummary",
    "operatingSummary",
  ],
  capability_maturity_roadmap_pack: [
    "reviewPackVersion",
    "overallMaturityLevel",
    "domainAssessments",
    "executiveSummary",
    "operatingRoadmap",
  ],
  operating_system_pack: [
    "reviewPackVersion",
    "reviewLayers",
    "operatingControlMap",
    "executiveSummary",
    "evidenceContinuityStatus",
  ],
  review_automation_pack: ["reviewPackVersion", "artifactPipelineStages", "generationOrder", "executiveSummary"],
  artifact_ci_spec: ["ciSpecVersion", "reviewPackVersion", "validationChecks", "jobs", "jobOrder"],
};

/** Version / schema id fields per artifact (machine-readable contract anchors). */
export const versionFields = {
  artifact_manifest: ["manifestVersion", "reviewPackVersion"],
  annual_operating_review_pack: ["reviewPackVersion"],
  capability_maturity_roadmap_pack: ["reviewPackVersion"],
  operating_system_pack: ["reviewPackVersion"],
  review_automation_pack: ["reviewPackVersion"],
  artifact_ci_spec: ["ciSpecVersion", "reviewPackVersion"],
  multi_year_history_external: [],
};

/**
 * Minimal schema rows for docs/CI — not a JSON Schema.
 * @type {{ artifactId: string, title: string, contractKind: string, notes: string }[]}
 */
export const artifactSchemas = [
  {
    artifactId: "artifact_manifest",
    title: "Artifact manifest",
    contractKind: "machine_json",
    notes: "Output of buildCrystalArtifactManifest; lists artifacts and dependency graph.",
  },
  {
    artifactId: "annual_operating_review_pack",
    title: "Annual operating review pack",
    contractKind: "machine_json",
    notes: "Output of buildCrystalAnnualOperatingReviewPack.",
  },
  {
    artifactId: "capability_maturity_roadmap_pack",
    title: "Capability maturity roadmap pack",
    contractKind: "machine_json",
    notes: "Output of buildCrystalCapabilityMaturityRoadmapPack.",
  },
  {
    artifactId: "operating_system_pack",
    title: "Operating system pack",
    contractKind: "machine_json",
    notes: "Output of buildCrystalOperatingSystemPack.",
  },
  {
    artifactId: "review_automation_pack",
    title: "Review automation pack",
    contractKind: "machine_json",
    notes: "Output of buildCrystalReviewAutomationPack.",
  },
  {
    artifactId: "artifact_ci_spec",
    title: "Artifact CI validation spec",
    contractKind: "machine_json",
    notes: "Output of buildCrystalArtifactCiSpec.",
  },
  {
    artifactId: "multi_year_history_external",
    title: "Multi-year history",
    contractKind: "external_or_future",
    notes: "No in-repo util — do not lint object shape; listed for coverage only.",
  },
];

/**
 * @param {object} obj
 * @param {string[]} keys
 */
function missingKeys(obj, keys) {
  if (!obj || typeof obj !== "object") return keys.slice();
  return keys.filter((k) => !(k in obj));
}

/**
 * @param {object} obj
 * @param {Set<string>} known
 */
function unexpectedKeys(obj, known) {
  if (!obj || typeof obj !== "object") return [];
  return Object.keys(obj).filter((k) => !known.has(k));
}

/**
 * @param {string[]} versionFieldNames
 * @param {object} obj
 */
function versionStatus(versionFieldNames, obj) {
  if (!versionFieldNames.length) return "not_applicable";
  if (!obj) return "missing_object";
  const missing = versionFieldNames.filter((k) => !(k in obj) || obj[k] == null || obj[k] === "");
  if (missing.length) return "missing_version";
  return "ok";
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} options
 */
function resolvePackObjects(inputs, options) {
  const raw = inputs || {};
  const generatedAt = raw.generatedAt ?? options.generatedAt ?? new Date().toISOString();
  const opt = { ...options, generatedAt };

  const annual =
    raw.annualOperatingReviewPack && typeof raw.annualOperatingReviewPack === "object"
      ? raw.annualOperatingReviewPack
      : Array.isArray(raw.halfYears) || Array.isArray(raw.months)
        ? buildCrystalAnnualOperatingReviewPack(
            {
              yearWindowStart: raw.yearWindowStart,
              yearWindowEnd: raw.yearWindowEnd,
              halfYears: raw.halfYears,
              months: raw.months,
              generatedAt,
              releaseSignals: raw.releaseSignals,
            },
            opt,
          )
        : null;

  const capability =
    raw.capabilityMaturityRoadmapPack && typeof raw.capabilityMaturityRoadmapPack === "object"
      ? raw.capabilityMaturityRoadmapPack
      : buildCrystalCapabilityMaturityRoadmapPack(
          {
            assessmentWindowStart: raw.assessmentWindowStart,
            assessmentWindowEnd: raw.assessmentWindowEnd,
            yearWindowStart: raw.yearWindowStart ?? annual?.yearWindowStart,
            yearWindowEnd: raw.yearWindowEnd ?? annual?.yearWindowEnd,
            halfYears: raw.halfYears,
            months: raw.months,
            generatedAt,
            annualOperatingReviewPack: annual ?? undefined,
            evidenceSnapshot: raw.evidenceSnapshot,
            multiYearHistoryPack: raw.multiYearHistoryPack ?? raw.multiYearHistoryPackReference,
            releaseSignals: raw.releaseSignals,
          },
          opt,
        );

  const os =
    raw.operatingSystemPack && typeof raw.operatingSystemPack === "object"
      ? raw.operatingSystemPack
      : buildCrystalOperatingSystemPack(raw, opt);

  const automation =
    raw.reviewAutomationPack && typeof raw.reviewAutomationPack === "object"
      ? raw.reviewAutomationPack
      : buildCrystalReviewAutomationPack({ ...raw, operatingSystemPack: os }, opt);

  const manifest =
    raw.artifactManifest && typeof raw.artifactManifest === "object"
      ? raw.artifactManifest
      : buildCrystalArtifactManifest(raw, opt);

  const ciSpec =
    raw.artifactCiSpec && typeof raw.artifactCiSpec === "object"
      ? raw.artifactCiSpec
      : buildCrystalArtifactCiSpec(raw, opt);

  return {
    artifact_manifest: manifest,
    annual_operating_review_pack: annual,
    capability_maturity_roadmap_pack: capability,
    operating_system_pack: os,
    review_automation_pack: automation,
    artifact_ci_spec: ciSpec,
  };
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalArtifactContractLinter(inputs = {}, options = {}) {
  const raw = inputs || {};
  const packs = resolvePackObjects(raw, options);

  /** @type {typeof artifactSchemas[0] & { parseOk?: boolean }[]} */
  const schemaGuardResults = [];
  /** @type {object[]} */
  const contractChecks = [];

  const specs = [
    { artifactId: "artifact_manifest", obj: packs.artifact_manifest, severityMissing: "hard", external: false },
    {
      artifactId: "annual_operating_review_pack",
      obj: packs.annual_operating_review_pack,
      severityMissing: "soft",
      external: false,
    },
    { artifactId: "capability_maturity_roadmap_pack", obj: packs.capability_maturity_roadmap_pack, severityMissing: "hard", external: false },
    { artifactId: "operating_system_pack", obj: packs.operating_system_pack, severityMissing: "hard", external: false },
    { artifactId: "review_automation_pack", obj: packs.review_automation_pack, severityMissing: "hard", external: false },
    { artifactId: "artifact_ci_spec", obj: packs.artifact_ci_spec, severityMissing: "hard", external: false },
  ];

  for (const sp of specs) {
    const required = requiredFieldsByArtifact[sp.artifactId] || [];
    const known = KNOWN_KEYS[sp.artifactId] || new Set();
    const vf = versionFields[sp.artifactId] || [];

    if (sp.external) continue;

    const obj = sp.obj;
    const parseOk = obj != null && typeof obj === "object";
    const miss = parseOk ? missingKeys(obj, required) : required;
    const unexp = parseOk ? unexpectedKeys(obj, known) : [];
    const vs = versionStatus(vf, obj);

    schemaGuardResults.push({
      artifactId: sp.artifactId,
      parseOk,
      shapeOk: miss.length === 0,
      unexpectedFieldCount: unexp.length,
      versionStatus: vs,
    });

    /** @type {"hard"|"soft"} */
    let severity = "hard";
    if (miss.length === 0 && unexp.length > 0) severity = "soft";
    if (miss.length > 0 && sp.severityMissing === "soft") severity = "soft";
    if (miss.length > 0 && sp.severityMissing === "hard") severity = "hard";
    if (vs === "missing_version" && sp.severityMissing === "soft") severity = "soft";
    if (vs === "missing_version" && sp.severityMissing === "hard") severity = "hard";

    const checkId = `contract_${sp.artifactId}`;
    contractChecks.push({
      checkId,
      artifactId: sp.artifactId,
      severity,
      summary: parseOk
        ? `Validated top-level contract for ${sp.artifactId}.`
        : `Artifact object missing — cannot lint ${sp.artifactId}.`,
      expectedFields: required,
      missingFields: miss,
      unexpectedFields: unexp,
      versionStatus: vs,
      recommendedAction:
        miss.length > 0
          ? `Restore required fields: ${miss.join(", ")}.`
          : unexp.length > 0
            ? `Review new keys (possible drift): ${unexp.slice(0, 8).join(", ")}${unexp.length > 8 ? "…" : ""}.`
            : vs !== "ok" && vs !== "not_applicable"
              ? "Restore version fields for machine-readable contract stability."
              : "No contract action required.",
    });
  }

  schemaGuardResults.push({
    artifactId: "multi_year_history_external",
    parseOk: true,
    shapeOk: true,
    unexpectedFieldCount: 0,
    versionStatus: "not_applicable",
    note: "external_or_future — no in-repo pack object to lint.",
  });

  const hardFailures = contractChecks.filter((c) => {
    const sp = specs.find((s) => s.artifactId === c.artifactId);
    return (
      sp?.severityMissing === "hard" &&
      (c.missingFields.length > 0 || c.versionStatus === "missing_version")
    );
  });

  const softFailures = contractChecks.filter((c) => {
    const sp = specs.find((s) => s.artifactId === c.artifactId);
    const softTier = sp?.severityMissing === "soft";
    return (
      softTier &&
      (c.missingFields.length > 0 || c.versionStatus === "missing_version")
    );
  });

  const warnings = contractChecks.filter((c) => c.unexpectedFields.length > 0 && c.missingFields.length === 0 && c.versionStatus === "ok");

  const hardMissing = contractChecks.filter((c) => {
    const sp = specs.find((s) => s.artifactId === c.artifactId);
    return sp && sp.severityMissing === "hard" && c.missingFields.length > 0;
  });
  const versionProblemsHard = contractChecks.filter((c) => {
    const sp = specs.find((s) => s.artifactId === c.artifactId);
    return sp && sp.severityMissing === "hard" && c.versionStatus === "missing_version";
  });

  /** @type {"weak"|"partial"|"strong"} */
  let contractReadinessStatus = "strong";
  if (hardMissing.length > 0 || versionProblemsHard.length > 0) contractReadinessStatus = "weak";
  else if (softFailures.length > 0 || warnings.length > 0) contractReadinessStatus = "partial";

  const contractReadinessSummary =
    contractReadinessStatus === "strong"
      ? "Required fields and version anchors present for resolved machine JSON artifacts."
      : contractReadinessStatus === "weak"
        ? "Hard contract failure: missing required fields or version ids on a core pack."
        : "Soft issues only — optional annual absent, drift keys, or advisory version gaps.";

  const recommendedSchemaUpgrades = [
    "Extend KNOWN_KEYS in crystalArtifactContractLinter.util.js when packs legitimately add top-level fields.",
    "Pin golden JSON fixtures in tests for each pack and diff on PR.",
    "Keep reviewPackVersion / manifestVersion / ciSpecVersion monotonic in changelog when semantics change.",
  ];

  return {
    linterVersion: LINTER_VERSION,
    reviewPackVersion: LINTER_REVIEW_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    artifactSchemas,
    requiredFieldsByArtifact,
    versionFields,
    contractChecks,
    schemaGuardResults,
    hardFailures,
    softFailures,
    warnings,
    contractReadinessStatus,
    contractReadinessSummary,
    recommendedSchemaUpgrades,
    methodNote:
      "Contract linter uses static allowlists — update KNOWN_KEYS when adding fields intentionally. Does not validate nested schemas.",
  };
}

/**
 * @param {ReturnType<typeof buildCrystalArtifactContractLinter>} report
 */
/**
 * Machine-readable contract map for CI (no live pack objects).
 */
export function buildCrystalArtifactContractMap() {
  return {
    linterVersion: LINTER_VERSION,
    reviewPackVersion: LINTER_REVIEW_PACK_VERSION,
    requiredFieldsByArtifact,
    versionFields,
    artifactSchemas,
    knownKeySets: Object.fromEntries(Object.entries(KNOWN_KEYS).map(([k, v]) => [k, [...v]])),
  };
}

/**
 * @param {ReturnType<typeof buildCrystalArtifactContractLinter>} report
 */
export function renderCrystalArtifactContractLinterMarkdown(report) {
  const w = (s) => (s == null ? "" : String(s));
  const lines = [];
  lines.push("# Crystal artifact contract linter report");
  lines.push("");
  lines.push(`- **linterVersion:** \`${w(report.linterVersion)}\``);
  lines.push(`- **reviewPackVersion:** \`${w(report.reviewPackVersion)}\``);
  lines.push(`- **contractReadiness:** \`${w(report.contractReadinessStatus)}\``);
  lines.push("");
  lines.push(`> ${w(report.methodNote)}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(w(report.contractReadinessSummary));
  lines.push("");
  lines.push("## Schema guard results");
  for (const s of report.schemaGuardResults) {
    const n = s.unexpectedFieldCount != null ? s.unexpectedFieldCount : 0;
    const note = "note" in s && s.note ? ` — ${s.note}` : "";
    lines.push(`- **${s.artifactId}:** parseOk=${s.parseOk} shapeOk=${s.shapeOk} unexpected=${n} version=${s.versionStatus}${note}`);
  }
  lines.push("");
  lines.push("## Contract checks");
  for (const c of report.contractChecks) {
    lines.push(`### ${c.checkId}`);
    lines.push(`- **Severity:** ${c.severity}`);
    lines.push(`- **Missing:** ${c.missingFields.join(", ") || "—"}`);
    lines.push(`- **Unexpected:** ${c.unexpectedFields.join(", ") || "—"}`);
    lines.push(`- **Version:** ${c.versionStatus}`);
    lines.push(`- **Action:** ${c.recommendedAction}`);
    lines.push("");
  }
  return lines.join("\n");
}
