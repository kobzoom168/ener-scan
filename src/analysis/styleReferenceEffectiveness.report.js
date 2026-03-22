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
