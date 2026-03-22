import { supabase } from "../config/supabase.js";

/**
 * Recent rows with quality_analytics for offline / admin review (prompt evolution prep).
 * Filters in JS so it works without DB-side JSON operators.
 *
 * @param {{
 *   limit?: number,
 *   minScoreAfter?: number,
 *   requireDeltaPositive?: boolean,
 *   improveApplied?: boolean | null,
 *   qualityTier?: string | null,
 * }} [opts]
 */
export async function listScanResultsForQualityReview({
  limit = 100,
  minScoreAfter = 40,
  requireDeltaPositive = false,
  improveApplied = null,
  qualityTier = null,
} = {}) {
  const cap = Math.min(500, Math.max(1, Number(limit) || 100));

  const { data, error } = await supabase
    .from("scan_results")
    .select("id, created_at, result_text, quality_analytics, prompt_version, from_cache")
    .not("quality_analytics", "is", null)
    .order("created_at", { ascending: false })
    .limit(cap * 3);

  if (error) {
    console.error("[scanQualityInsights] listScanResultsForQualityReview", {
      message: error.message,
    });
    throw error;
  }

  const rows = data || [];

  const filtered = rows.filter((row) => {
    const qa = row.quality_analytics;
    if (!qa || typeof qa !== "object") return false;

    const after = Number(qa.score_after);
    if (!Number.isFinite(after) || after < minScoreAfter) return false;

    if (requireDeltaPositive && !(Number(qa.delta) > 0)) return false;

    if (improveApplied === true && !qa.improve_applied) return false;
    if (improveApplied === false && qa.improve_applied) return false;

    if (
      qualityTier &&
      String(qa.quality_tier || "").toLowerCase() !==
        String(qualityTier).toLowerCase()
    ) {
      return false;
    }

    return true;
  });

  return filtered.slice(0, cap);
}

/**
 * Heuristic “top performing” candidates: high score_after and optional positive delta.
 *
 * @param {Parameters<typeof listScanResultsForQualityReview>[0]} opts
 */
export async function listTopPerformingScanResults(opts = {}) {
  return listScanResultsForQualityReview({
    minScoreAfter: opts.minScoreAfter ?? 45,
    requireDeltaPositive: opts.requireDeltaPositive ?? false,
    improveApplied: opts.improveApplied ?? null,
    qualityTier: opts.qualityTier ?? null,
    limit: opts.limit ?? 50,
  });
}

/**
 * Broader sample for aggregates (e.g. avg gain ratio by quality_tier).
 * @param {{ limit?: number }} [opts]
 */
export async function fetchRecentScanResultsWithQuality({ limit = 500 } = {}) {
  const cap = Math.min(2000, Math.max(50, Number(limit) || 500));

  const { data, error } = await supabase
    .from("scan_results")
    .select("id, created_at, result_text, quality_analytics")
    .not("quality_analytics", "is", null)
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) {
    console.error("[scanQualityInsights] fetchRecentScanResultsWithQuality", {
      message: error.message,
    });
    throw error;
  }

  return data || [];
}
