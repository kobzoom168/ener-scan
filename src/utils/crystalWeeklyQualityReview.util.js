/**
 * Lightweight weekly crystal routing + visible wording quality review (offline).
 * Template heuristics — **not** production SLOs; calibrate per team (`WEEKLY_REVIEW_HEURISTIC_DEFAULTS`).
 *
 * @module crystalWeeklyQualityReview.util
 */
import { normalizeObjectFamilyForEnergyCopy } from "./energyCategoryResolve.util.js";
import { ROUTING_WORDING_MISMATCH_TYPE } from "./crystalRoutingWordingMetrics.util.js";
import { aggregateCrystalRoutingDashboardSummary } from "./crystalRoutingDashboardSummary.util.js";

/** @typedef {import("./crystalRoutingDashboardSummary.util.js").CrystalRoutingDashboardRow} CrystalRoutingDashboardRow */
/** @typedef {import("./crystalRoutingDashboardSummary.util.js").CrystalRoutingDashboardSummary} CrystalRoutingDashboardSummary */

export const CRYSTAL_WEEKLY_REVIEW_VERSION = "1";

/**
 * Template weekly heuristic thresholds — **calibrate** to your baseline traffic.
 * @typedef {Object} WeeklyReviewHeuristicThresholds
 * @property {number} hardMismatchRateEscalate
 * @property {number} objectFamilyMismatchRateEscalate
 * @property {number} categoryMismatchRateEscalate
 * @property {number} softMismatchRateWatch
 * @property {number} genericFallbackRateWatch
 * @property {number} genericFallbackRateInvestigate
 * @property {number} fallbackHeavyRateInvestigate
 * @property {number} weakProtectDefaultRateInvestigate
 * @property {number} crystalSpecificSurfaceRateInvestigateBelow — flag investigate if rate < this
 */

export const WEEKLY_REVIEW_HEURISTIC_DEFAULTS = {
  hardMismatchRateEscalate: 0.08,
  objectFamilyMismatchRateEscalate: 0.015,
  categoryMismatchRateEscalate: 0.015,
  softMismatchRateWatch: 0.18,
  genericFallbackRateWatch: 0.22,
  genericFallbackRateInvestigate: 0.32,
  fallbackHeavyRateInvestigate: 0.12,
  weakProtectDefaultRateInvestigate: 0.32,
  crystalSpecificSurfaceRateInvestigateBelow: 0.48,
};

function isCrystalRow(row) {
  if (typeof row.isCrystalRoutingCase === "boolean") return row.isCrystalRoutingCase;
  const fam = String(row.routingObjectFamily ?? row.objectFamily ?? "");
  return normalizeObjectFamilyForEnergyCopy(fam) === "crystal";
}

function mismatchCountFromTop(top, type) {
  const t = Array.isArray(top) ? top : [];
  const row = t.find((x) => x.mismatchType === type);
  return row ? row.count : 0;
}

/**
 * @param {CrystalRoutingDashboardRow[]} rows
 * @returns {{ source: string, count: number }[]}
 */
export function aggregateTopDecisionSourcesForCrystalRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  /** @type {Record<string, number>} */
  const counts = {};
  for (const row of list) {
    if (!isCrystalRow(row)) continue;
    const s = String(row.visibleWordingDecisionSource || "").trim() || "(unknown)";
    counts[s] = (counts[s] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

/**
 * @param {CrystalRoutingDashboardSummary} summary
 * @param {CrystalRoutingDashboardSummary|null} baseline
 */
export function buildCrystalWeeklyQualitySignals(summary, baseline) {
  const denom = summary.totalCrystalRoutingCases;
  const bd = baseline && baseline.totalCrystalRoutingCases > 0 ? baseline.totalCrystalRoutingCases : 0;
  const hardRate = denom > 0 ? summary.hardMismatchCount / denom : 0;
  const softRate = denom > 0 ? summary.softMismatchCount / denom : 0;
  const baseHard = bd > 0 ? baseline.hardMismatchCount / bd : 0;
  const baseSoft = bd > 0 ? baseline.softMismatchCount / bd : 0;

  return {
    totalCrystalCases: denom,
    hardMismatchRate: hardRate,
    softMismatchRate: softRate,
    deltaHardMismatchRateVsBaseline: bd > 0 ? hardRate - baseHard : null,
    deltaSoftMismatchRateVsBaseline: bd > 0 ? softRate - baseSoft : null,
    crystalSpecificSurfaceRate: summary.crystalSpecificSurfaceRate,
    genericFallbackRate: summary.genericFallbackRate,
    fallbackHeavyRate: summary.fallbackHeavyRate,
    weakProtectDefaultRate: summary.weakProtectDefaultRate,
  };
}

/**
 * @param {CrystalRoutingDashboardSummary} agg
 * @param {WeeklyReviewHeuristicThresholds} t
 */
function deriveReviewStatus(agg, t) {
  const denom = agg.totalCrystalRoutingCases;
  if (denom === 0) {
    return {
      reviewStatus: "watch",
      monitorItems: ["No crystal rows in window — widen export or check filters."],
      investigateItems: [],
      escalateItems: [],
    };
  }

  const hardR = agg.hardMismatchCount / denom;
  const softR = agg.softMismatchCount / denom;
  const ofm =
    mismatchCountFromTop(agg.topMismatchTypes, ROUTING_WORDING_MISMATCH_TYPE.OBJECT_FAMILY_MISMATCH) /
    denom;
  const cat =
    mismatchCountFromTop(agg.topMismatchTypes, ROUTING_WORDING_MISMATCH_TYPE.CATEGORY_MISMATCH) / denom;

  const monitorItems = [];
  const investigateItems = [];
  const escalateItems = [];

  if (hardR >= t.hardMismatchRateEscalate) {
    escalateItems.push(`Hard mismatch rate ${(hardR * 100).toFixed(1)}% (template threshold).`);
  }
  if (ofm >= t.objectFamilyMismatchRateEscalate) {
    escalateItems.push(`Object-family mismatch rate ${(ofm * 100).toFixed(1)}%.`);
  }
  if (cat >= t.categoryMismatchRateEscalate) {
    escalateItems.push(`Category mismatch rate ${(cat * 100).toFixed(1)}%.`);
  }

  if (escalateItems.length > 0) {
    return { reviewStatus: "escalate", monitorItems, investigateItems, escalateItems };
  }

  if (agg.fallbackHeavyRate >= t.fallbackHeavyRateInvestigate) {
    investigateItems.push(`Fallback-heavy rate ${(agg.fallbackHeavyRate * 100).toFixed(1)}%.`);
  }
  if (agg.weakProtectDefaultRate >= t.weakProtectDefaultRateInvestigate) {
    investigateItems.push(`Weak-protect default share ${(agg.weakProtectDefaultRate * 100).toFixed(1)}%.`);
  }
  if (agg.crystalSpecificSurfaceRate < t.crystalSpecificSurfaceRateInvestigateBelow) {
    investigateItems.push(
      `Crystal-specific surface rate ${(agg.crystalSpecificSurfaceRate * 100).toFixed(1)}% (below template floor).`,
    );
  }
  if (agg.genericFallbackRate >= t.genericFallbackRateInvestigate) {
    investigateItems.push(`Generic code-bank fallback rate ${(agg.genericFallbackRate * 100).toFixed(1)}%.`);
  }

  if (investigateItems.length > 0) {
    return { reviewStatus: "investigate", monitorItems, investigateItems, escalateItems };
  }

  if (
    softR >= t.softMismatchRateWatch ||
    agg.genericFallbackRate >= t.genericFallbackRateWatch
  ) {
    if (softR >= t.softMismatchRateWatch) {
      monitorItems.push(`Soft mismatch rate ${(softR * 100).toFixed(1)}% (elevated vs template watch).`);
    }
    if (agg.genericFallbackRate >= t.genericFallbackRateWatch) {
      monitorItems.push(
        `Generic fallback rate ${(agg.genericFallbackRate * 100).toFixed(1)}% (watch band).`,
      );
    }
    return { reviewStatus: "watch", monitorItems, investigateItems, escalateItems };
  }

  monitorItems.push("Within template healthy band for weekly snapshot.");
  return { reviewStatus: "healthy", monitorItems, investigateItems, escalateItems };
}

function buildRecommendations(statusPack, agg) {
  const rec = [];
  if (statusPack.reviewStatus === "escalate") {
    rec.push("Sample hard-mismatch payloads; verify routing vs wording category/family with ops playbook.");
    rec.push("Review top routing rules and mismatch types for the week.");
  } else if (statusPack.reviewStatus === "investigate") {
    rec.push("Review DB crystal template coverage and fallback depth for hot categories.");
    rec.push("Inspect weak-protect default share vs rule-map / fixtures if elevated.");
    rec.push("Compare code_bank_crystal_first share to prior week export.");
  } else if (statusPack.reviewStatus === "watch") {
    rec.push("Continue monitoring soft mismatch and generic fallback trends next week.");
  } else {
    rec.push("Optional: spot-check a few aligned scans for qualitative UX.");
  }
  if (agg.totalCrystalRoutingCases > 0 && agg.weakProtectDefaultRate > 0.15) {
    rec.push("Inspect weak-protect-default cases if share is trending up week-over-week.");
  }
  return rec;
}

/**
 * @param {CrystalRoutingDashboardRow[]} rows — weekly export rows (see input contract doc)
 * @param {{
 *   windowStart: string,
 *   windowEnd: string,
 *   generatedAt?: string,
 *   baselineAggregate?: CrystalRoutingDashboardSummary | null,
 *   heuristicThresholds?: Partial<WeeklyReviewHeuristicThresholds>,
 * }} options
 */
export function buildCrystalWeeklyQualityReview(rows, options) {
  const windowStart = String(options.windowStart || "").trim();
  const windowEnd = String(options.windowEnd || "").trim();
  const generatedAt =
    options.generatedAt != null ? String(options.generatedAt) : new Date().toISOString();

  const list = Array.isArray(rows) ? rows : [];
  const agg = aggregateCrystalRoutingDashboardSummary(list);
  const topDecisionSources = aggregateTopDecisionSourcesForCrystalRows(list);
  const t = { ...WEEKLY_REVIEW_HEURISTIC_DEFAULTS, ...options.heuristicThresholds };

  const denom = agg.totalCrystalRoutingCases;
  const alignedRate = denom > 0 ? agg.alignedCount / denom : 0;
  const softMismatchRate = denom > 0 ? agg.softMismatchCount / denom : 0;
  const hardMismatchRate = denom > 0 ? agg.hardMismatchCount / denom : 0;

  const baseline = options.baselineAggregate ?? null;
  const signals = buildCrystalWeeklyQualitySignals(agg, baseline);
  const statusPack = deriveReviewStatus(agg, t);
  const recommendations = buildRecommendations(statusPack, agg);

  /** Rule distribution: full counts for appendix (deterministic key order) */
  const ruleDistribution = {};
  for (const { ruleId, count } of agg.topRoutingRuleIds) {
    ruleDistribution[ruleId] = count;
  }

  return {
    weeklyReviewVersion: CRYSTAL_WEEKLY_REVIEW_VERSION,
    windowStart,
    windowEnd,
    generatedAt,
    totalCrystalCases: denom,
    notApplicableRowCount: agg.notApplicableCount,
    alignedCount: agg.alignedCount,
    softMismatchCount: agg.softMismatchCount,
    hardMismatchCount: agg.hardMismatchCount,
    alignedRate,
    softMismatchRate,
    hardMismatchRate,
    crystalSpecificSurfaceRate: agg.crystalSpecificSurfaceRate,
    genericFallbackRate: agg.genericFallbackRate,
    fallbackHeavyRate: agg.fallbackHeavyRate,
    weakProtectDefaultRate: agg.weakProtectDefaultRate,
    topMismatchTypes: agg.topMismatchTypes,
    topRoutingRuleIds: agg.topRoutingRuleIds,
    topDecisionSources,
    ruleDistribution,
    recommendations,
    reviewStatus: statusPack.reviewStatus,
    monitorItems: statusPack.monitorItems,
    investigateItems: statusPack.investigateItems,
    escalateItems: statusPack.escalateItems,
    signals,
    rawAggregateSnapshot: agg,
    heuristicNote:
      "Template weekly heuristics only — calibrate thresholds to your baseline; not production truth.",
  };
}

/**
 * @param {ReturnType<typeof buildCrystalWeeklyQualityReview>} summary
 */
export function renderCrystalWeeklyQualityReviewMarkdown(summary) {
  const w = (s) => (s == null ? "" : String(s));
  const pct = (x) => (typeof x === "number" && Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—");

  const lines = [];
  lines.push("# Crystal weekly quality review");
  lines.push("");
  lines.push("## A. Header");
  lines.push("");
  lines.push(`- **Week window:** ${w(summary.windowStart)} → ${w(summary.windowEnd)}`);
  lines.push(`- **Generated at:** ${w(summary.generatedAt)}`);
  lines.push(`- **Review status:** \`${w(summary.reviewStatus)}\``);
  lines.push(`- **Schema:** \`${w(summary.weeklyReviewVersion)}\``);
  lines.push("");
  lines.push(`> ${w(summary.heuristicNote)}`);
  lines.push("");
  lines.push("## B. Executive summary");
  lines.push("");
  lines.push(`- **Total crystal cases:** ${summary.totalCrystalCases}`);
  lines.push(`- **Aligned / soft / hard counts:** ${summary.alignedCount} / ${summary.softMismatchCount} / ${summary.hardMismatchCount}`);
  lines.push(`- **Aligned rate:** ${pct(summary.alignedRate)}`);
  lines.push(`- **Soft mismatch rate:** ${pct(summary.softMismatchRate)}`);
  lines.push(`- **Hard mismatch rate:** ${pct(summary.hardMismatchRate)}`);
  lines.push(`- **Crystal-specific surface rate:** ${pct(summary.crystalSpecificSurfaceRate)}`);
  lines.push(`- **Generic code-bank fallback rate:** ${pct(summary.genericFallbackRate)}`);
  lines.push(`- **Fallback-heavy rate:** ${pct(summary.fallbackHeavyRate)}`);
  lines.push(`- **Weak-protect default rate:** ${pct(summary.weakProtectDefaultRate)}`);
  lines.push(`- **Non-crystal rows in export (excluded from crystal rates):** ${summary.notApplicableRowCount}`);
  lines.push("");
  lines.push("## C. Top findings");
  lines.push("");
  lines.push("### Top mismatch types");
  lines.push("");
  if (!summary.topMismatchTypes.length) {
    lines.push("_None (or all `none`)._");
  } else {
    for (const { mismatchType, count } of summary.topMismatchTypes.slice(0, 12)) {
      lines.push(`- \`${mismatchType}\`: ${count}`);
    }
  }
  lines.push("");
  lines.push("### Top routing rules (`crystalRoutingRuleId`)");
  lines.push("");
  for (const { ruleId, count } of summary.topRoutingRuleIds.slice(0, 12)) {
    lines.push(`- \`${ruleId}\`: ${count}`);
  }
  lines.push("");
  lines.push("### Top visible wording decision sources");
  lines.push("");
  if (!summary.topDecisionSources.length) {
    lines.push("_No crystal rows._");
  } else {
    for (const { source, count } of summary.topDecisionSources.slice(0, 12)) {
      lines.push(`- \`${source}\`: ${count}`);
    }
  }
  lines.push("");
  lines.push("## D. Risk calls");
  lines.push("");
  lines.push("### Monitor");
  lines.push("");
  for (const x of summary.monitorItems) {
    lines.push(`- ${x}`);
  }
  lines.push("");
  lines.push("### Investigate");
  lines.push("");
  if (!summary.investigateItems.length) {
    lines.push("_None from template heuristic._");
  } else {
    for (const x of summary.investigateItems) {
      lines.push(`- ${x}`);
    }
  }
  lines.push("");
  lines.push("### Escalate");
  lines.push("");
  if (!summary.escalateItems.length) {
    lines.push("_None from template heuristic._");
  } else {
    for (const x of summary.escalateItems) {
      lines.push(`- ${x}`);
    }
  }
  lines.push("");
  lines.push("## E. Suggested next actions");
  lines.push("");
  for (const r of summary.recommendations) {
    lines.push(`- ${r}`);
  }
  lines.push("");
  lines.push("## F. Appendix — raw metric snapshot");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(summary.rawAggregateSnapshot, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Rule distribution (counts)");
  lines.push("");
  const keys = Object.keys(summary.ruleDistribution).sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    lines.push(`- \`${k}\`: ${summary.ruleDistribution[k]}`);
  }
  lines.push("");
  return lines.join("\n");
}
