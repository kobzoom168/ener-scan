/**
 * Report: style-reference effectiveness from persisted quality_analytics.
 *
 * Usage:
 *   npm run report:style-effectiveness
 *   node scripts/report-style-reference-effectiveness.mjs --limit=3000
 *   node scripts/report-style-reference-effectiveness.mjs --full
 *   node scripts/report-style-reference-effectiveness.mjs --json-only
 *   node scripts/report-style-reference-effectiveness.mjs --persist
 *
 * Default: compact summary. --full: + full JSON. --json-only: JSON stdout only.
 * Env: MIN_COHORT_N, SCORE_EDGE
 * Requires .env (SUPABASE_*). Does not change scan flow.
 */
import "../src/config/env.js";
import { supabase } from "../src/config/supabase.js";
import {
  appendStyleEffectivenessRun,
  getLatestTwoRuns,
  STYLE_EFFECTIVENESS_RUNS_FILE,
} from "../src/analysis/styleReferenceEffectivenessHistory.store.js";
import {
  buildCompactSummaryBlock,
  buildKeyMetricsSnapshot,
  buildStyleReferenceEffectivenessReport,
  compareGapTrend,
  computeConfidenceLevel,
  computeCohortMetrics,
  metricsByStyleMode,
  recommendRollout,
  splitByStyleReferenceUsed,
} from "../src/analysis/styleReferenceEffectiveness.report.js";

const argv = process.argv.slice(2);
const fullDump = argv.includes("--full");
const jsonOnly = argv.includes("--json-only");
const persist = argv.includes("--persist");

function parseLimit() {
  const arg = argv.find((a) => a.startsWith("--limit="));
  if (arg) {
    const n = Number(arg.split("=")[1]);
    return Number.isFinite(n) ? Math.min(10000, Math.max(100, n)) : 2000;
  }
  return 2000;
}

const minCohortN = (() => {
  const raw = process.env.MIN_COHORT_N;
  const n = raw === undefined || raw === "" ? 30 : Number(raw);
  return Number.isFinite(n) ? Math.max(5, Math.min(5000, n)) : 30;
})();

const scoreEdge = (() => {
  const raw = process.env.SCORE_EDGE;
  const n = raw === undefined || raw === "" ? 0.5 : Number(raw);
  return Number.isFinite(n) ? Math.max(0.05, Math.min(10, n)) : 0.5;
})();

const limit = parseLimit();

try {
  const { data, error } = await supabase
    .from("scan_results")
    .select("id, created_at, quality_analytics")
    .not("quality_analytics", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data || [];

  const { used, notUsed } = splitByStyleReferenceUsed(rows);
  const usedStats = computeCohortMetrics(used, "style_reference_used_true");
  const notUsedStats = computeCohortMetrics(notUsed, "style_reference_used_false");
  const byMode = metricsByStyleMode(rows);

  const rec = recommendRollout({
    usedStats,
    notUsedStats,
    minCohortN,
    scoreEdge,
  });

  const confidence = computeConfidenceLevel({
    usedStats,
    notUsedStats,
    minCohortN,
  });

  const report = buildStyleReferenceEffectivenessReport({
    totalRows: rows.length,
    usedVsNot: {
      used: usedStats,
      not_used: notUsedStats,
    },
    byMode,
    recommendation: rec,
    thresholds: { min_cohort_n: minCohortN, score_edge: scoreEdge },
  });

  const snapshot = buildKeyMetricsSnapshot({
    usedStats,
    notUsedStats,
    rec,
    limitQuery: limit,
  });

  const [lastPersistedRun] = await getLatestTwoRuns();
  const trend = compareGapTrend(
    snapshot,
    lastPersistedRun?.key_metrics_snapshot || null,
  );

  if (!jsonOnly) {
    const compact = buildCompactSummaryBlock({
      report,
      confidence,
      trend,
    });
    console.log(compact);
    console.log("");
  }

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else if (fullDump) {
    console.log("=== Full report JSON ===\n");
    console.log(JSON.stringify(report, null, 2));
  }

  if (persist) {
    const runRecord = {
      generated_at: report.generated_at,
      sample_size: rows.length,
      recommendation: rec.recommendation,
      reason: rec.reason,
      confidence,
      warnings: rec.warnings || [],
      key_metrics_snapshot: snapshot,
      thresholds: { min_cohort_n: minCohortN, score_edge: scoreEdge },
      trend_vs_previous: trend,
    };
    await appendStyleEffectivenessRun(runRecord);
    console.log(
      `[STYLE_EFFECTIVENESS_REPORT] persisted run → ${STYLE_EFFECTIVENESS_RUNS_FILE}`,
    );
  }
} catch (err) {
  console.error("[STYLE_EFFECTIVENESS_REPORT] failed:", err?.message || err);
  process.exit(1);
}
