/**
 * Report: style-reference effectiveness from persisted quality_analytics.
 *
 * Usage:
 *   node scripts/report-style-reference-effectiveness.mjs
 *   node scripts/report-style-reference-effectiveness.mjs --limit=3000
 *   MIN_COHORT_N=40 SCORE_EDGE=0.4 node scripts/report-style-reference-effectiveness.mjs
 *
 * Requires .env (SUPABASE_*). Does not change scan flow.
 */
import "../src/config/env.js";
import { supabase } from "../src/config/supabase.js";
import {
  buildStyleReferenceEffectivenessReport,
  computeCohortMetrics,
  metricsByStyleMode,
  recommendRollout,
  splitByStyleReferenceUsed,
} from "../src/analysis/styleReferenceEffectiveness.report.js";

function parseLimit() {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
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

  console.log("=== Style reference effectiveness (quality_analytics) ===\n");
  console.log(JSON.stringify(report, null, 2));

  if (rec.warnings?.length) {
    console.log("\n--- Warnings ---");
    for (const w of rec.warnings) console.log(`  ⚠ ${w}`);
  }

  console.log("\n--- Decision ---");
  console.log(`  recommendation: ${rec.recommendation}`);
  console.log(`  reason: ${rec.reason}`);
  if (rec.gap != null) console.log(`  score_after gap (used - not): ${rec.gap.toFixed(4)}`);
} catch (err) {
  console.error("[STYLE_EFFECTIVENESS_REPORT] failed:", err?.message || err);
  process.exit(1);
}
