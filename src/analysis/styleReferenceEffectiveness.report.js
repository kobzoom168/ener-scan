/**
 * Offline reporting: style-reference cohorts from persisted quality_analytics.
 * No runtime / scan dependency.
 */

/** @param {number[]} xs */
function mean(xs) {
  if (!xs.length) return null;
  const s = xs.reduce((a, b) => a + b, 0);
  return Math.round((s / xs.length) * 1000) / 1000;
}

/** @param {object} row */
function qa(row) {
  const q = row?.quality_analytics;
  return q && typeof q === "object" ? q : {};
}

/**
 * @param {object[]} rows
 * @param {string} label
 */
export function computeCohortMetrics(rows, label) {
  const scoreAfters = [];
  const deltas = [];
  const gainRatios = [];
  let improveApplied = 0;
  /** @type {Record<string, number>} */
  const tierDist = {};

  for (const row of rows) {
    const q = qa(row);
    const sa = Number(q.score_after);
    if (Number.isFinite(sa)) scoreAfters.push(sa);
    const d = Number(q.delta);
    if (Number.isFinite(d)) deltas.push(d);
    const g = Number(q.improve_gain_ratio);
    if (Number.isFinite(g)) gainRatios.push(g);
    if (q.improve_applied === true) improveApplied += 1;
    const t = q.quality_tier != null ? String(q.quality_tier) : "(null)";
    tierDist[t] = (tierDist[t] || 0) + 1;
  }

  const n = rows.length;
  return {
    label,
    n,
    avg_score_after: mean(scoreAfters),
    avg_delta: mean(deltas),
    avg_improve_gain_ratio: mean(gainRatios),
    improve_applied_rate: n ? Math.round((improveApplied / n) * 10000) / 10000 : null,
    quality_tier_distribution: tierDist,
  };
}

/**
 * Split rows by style_reference_used (strict boolean true vs not).
 * @param {object[]} rows
 */
export function splitByStyleReferenceUsed(rows) {
  const used = rows.filter((r) => qa(r).style_reference_used === true);
  const notUsed = rows.filter((r) => qa(r).style_reference_used !== true);
  return { used, notUsed };
}

/**
 * Per style_reference_mode (off / on / sample).
 * @param {object[]} rows
 */
export function metricsByStyleMode(rows) {
  /** @type {Record<string, object[]>} */
  const buckets = { off: [], on: [], sample: [], unknown: [] };
  for (const row of rows) {
    const m = String(qa(row).style_reference_mode || "").toLowerCase();
    if (m === "off" || m === "on" || m === "sample") {
      buckets[m].push(row);
    } else {
      buckets.unknown.push(row);
    }
  }
  return {
    off: computeCohortMetrics(buckets.off, "mode_off"),
    on: computeCohortMetrics(buckets.on, "mode_on"),
    sample: computeCohortMetrics(buckets.sample, "mode_sample"),
    unknown: computeCohortMetrics(buckets.unknown, "mode_unknown"),
  };
}

/**
 * @param {{
 *   usedStats: ReturnType<typeof computeCohortMetrics>,
 *   notUsedStats: ReturnType<typeof computeCohortMetrics>,
 *   minCohortN?: number,
 *   scoreEdge?: number,
 * }} opts
 */
export function recommendRollout({
  usedStats,
  notUsedStats,
  minCohortN = 30,
  scoreEdge = 0.5,
}) {
  /** @type {string[]} */
  const warnings = [];

  if (usedStats.n < minCohortN) {
    warnings.push(
      `cohort style_reference_used=true is small (n=${usedStats.n}, recommended min ${minCohortN})`,
    );
  }
  if (notUsedStats.n < minCohortN) {
    warnings.push(
      `cohort style_reference_used=false is small (n=${notUsedStats.n}, recommended min ${minCohortN})`,
    );
  }

  const insufficient =
    usedStats.n < minCohortN ||
    notUsedStats.n < minCohortN;

  if (insufficient) {
    return {
      recommendation: "keep_sampling",
      reason: "insufficient_cohort_size",
      warnings,
    };
  }

  const du = usedStats.avg_score_after;
  const dn = notUsedStats.avg_score_after;
  if (!Number.isFinite(du) || !Number.isFinite(dn)) {
    return {
      recommendation: "keep_sampling",
      reason: "missing_avg_score_after",
      warnings,
    };
  }

  const gap = du - dn;
  if (gap >= scoreEdge) {
    return {
      recommendation: "expand",
      reason: `avg_score_after higher with style ref by ${gap.toFixed(3)} (threshold ${scoreEdge})`,
      gap,
      warnings,
    };
  }
  if (gap <= -scoreEdge) {
    return {
      recommendation: "disable",
      reason: `avg_score_after lower with style ref by ${(-gap).toFixed(3)} (threshold ${scoreEdge})`,
      gap,
      warnings,
    };
  }

  return {
    recommendation: "keep_sampling",
    reason: `no_clear_gap (${gap.toFixed(3)} vs ±${scoreEdge})`,
    gap,
    warnings,
  };
}

/**
 * Full report object for JSON output.
 * @param {object} params
 */
export function buildStyleReferenceEffectivenessReport({
  totalRows,
  usedVsNot,
  byMode,
  recommendation,
  thresholds,
}) {
  return {
    version: 1,
    kind: "style_reference_effectiveness_report",
    generated_at: new Date().toISOString(),
    total_rows_analyzed: totalRows,
    thresholds,
    comparisons: {
      style_reference_used_true_vs_false: usedVsNot,
      by_style_reference_mode: byMode,
    },
    recommendation,
  };
}

/**
 * Operational confidence (not statistical CI).
 * @param {{
 *   usedStats: ReturnType<typeof computeCohortMetrics>,
 *   notUsedStats: ReturnType<typeof computeCohortMetrics>,
 *   minCohortN?: number,
 * }} opts
 * @returns {"high"|"medium"|"low"}
 */
export function computeConfidenceLevel({
  usedStats,
  notUsedStats,
  minCohortN = 30,
}) {
  const strong = minCohortN * 2;
  const u = usedStats.n;
  const v = notUsedStats.n;
  const du = usedStats.avg_score_after;
  const dn = notUsedStats.avg_score_after;
  if (!Number.isFinite(du) || !Number.isFinite(dn)) return "low";
  if (u >= strong && v >= strong) return "high";
  if (u >= minCohortN && v >= minCohortN) return "medium";
  return "low";
}

/**
 * Snapshot for history persistence and trend lines.
 * @param {{
 *   usedStats: ReturnType<typeof computeCohortMetrics>,
 *   notUsedStats: ReturnType<typeof computeCohortMetrics>,
 *   rec: ReturnType<typeof recommendRollout>,
 *   limitQuery: number,
 * }} opts
 */
export function buildKeyMetricsSnapshot({
  usedStats,
  notUsedStats,
  rec,
  limitQuery,
}) {
  const gap =
    Number.isFinite(rec.gap) ? rec.gap
    : Number.isFinite(usedStats.avg_score_after) &&
        Number.isFinite(notUsedStats.avg_score_after)
      ? usedStats.avg_score_after - notUsedStats.avg_score_after
      : null;

  return {
    query_limit: limitQuery,
    used_n: usedStats.n,
    not_used_n: notUsedStats.n,
    avg_score_after_used: usedStats.avg_score_after,
    avg_score_after_not_used: notUsedStats.avg_score_after,
    score_after_gap: gap,
    avg_delta_used: usedStats.avg_delta,
    avg_delta_not_used: notUsedStats.avg_delta,
    avg_improve_gain_ratio_used: usedStats.avg_improve_gain_ratio,
    avg_improve_gain_ratio_not_used: notUsedStats.avg_improve_gain_ratio,
    improve_applied_rate_used: usedStats.improve_applied_rate,
    improve_applied_rate_not_used: notUsedStats.improve_applied_rate,
  };
}

/**
 * Compare score_after gap vs previous run (higher gap = relatively better for style-used cohort).
 * @param {{ score_after_gap: number | null }} [latest]
 * @param {{ score_after_gap: number | null }} [previous]
 */
export function compareGapTrend(latest, previous) {
  if (!latest || !previous) {
    return {
      direction: "unknown",
      detail: "missing_snapshot",
      gap_delta: null,
    };
  }
  const g1 = Number(latest.score_after_gap);
  const g0 = Number(previous.score_after_gap);
  if (!Number.isFinite(g1) || !Number.isFinite(g0)) {
    return {
      direction: "unknown",
      detail: "non_numeric_gap",
      gap_delta: null,
    };
  }
  const delta = g1 - g0;
  const eps = 0.05;
  if (delta > eps) {
    return {
      direction: "improving",
      detail: "score_after_gap_increased_vs_previous_run",
      gap_delta: Math.round(delta * 10000) / 10000,
    };
  }
  if (delta < -eps) {
    return {
      direction: "degrading",
      detail: "score_after_gap_decreased_vs_previous_run",
      gap_delta: Math.round(delta * 10000) / 10000,
    };
  }
  return {
    direction: "stable",
    detail: "score_after_gap_similar_to_previous_run",
    gap_delta: Math.round(delta * 10000) / 10000,
  };
}

/**
 * @param {{
 *   report: ReturnType<typeof buildStyleReferenceEffectivenessReport>,
 *   confidence: string,
 *   trend: object,
 * }} opts
 */
export function buildCompactSummaryBlock({
  report,
  confidence,
  trend,
}) {
  const rec = report.recommendation || {};
  const cmp = report.comparisons?.style_reference_used_true_vs_false;
  const u = cmp?.used;
  const n = cmp?.not_used;
  const lines = [
    "══════════════════════════════════════════════════════",
    " Style reference effectiveness — operational summary",
    "══════════════════════════════════════════════════════",
    `Generated: ${report.generated_at}`,
    `Rows analyzed: ${report.total_rows_analyzed}`,
    "",
    `Recommendation: ${rec.recommendation ?? "(n/a)"}`,
    `Confidence: ${confidence}`,
    `Reason: ${rec.reason ?? "(n/a)"}`,
  ];
  if (rec.gap != null && Number.isFinite(rec.gap)) {
    lines.push(`Score gap (avg score_after, used − not): ${rec.gap.toFixed(4)}`);
  }
  lines.push("");
  lines.push("Headline metrics (used vs not used):");
  lines.push(`  n: ${u?.n ?? "?"} vs ${n?.n ?? "?"}`);
  lines.push(
    `  avg score_after: ${u?.avg_score_after ?? "?"} vs ${n?.avg_score_after ?? "?"}`,
  );
  lines.push(`  avg delta: ${u?.avg_delta ?? "?"} vs ${n?.avg_delta ?? "?"}`);
  lines.push(
    `  improve_applied rate: ${u?.improve_applied_rate ?? "?"} vs ${n?.improve_applied_rate ?? "?"}`,
  );
  lines.push(
    `  avg improve_gain_ratio: ${u?.avg_improve_gain_ratio ?? "?"} vs ${n?.avg_improve_gain_ratio ?? "?"}`,
  );
  if (Array.isArray(rec.warnings) && rec.warnings.length) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of rec.warnings) lines.push(`  ⚠ ${w}`);
  }
  lines.push("");
  lines.push("Trend vs previous persisted run:");
  lines.push(`  direction: ${trend.direction}`);
  lines.push(`  detail: ${trend.detail}`);
  if (trend.gap_delta != null) {
    lines.push(`  gap change (this run − previous): ${trend.gap_delta}`);
  }
  return lines.join("\n");
}
