import { supabase } from "../config/supabase.js";

async function insertScanResultRow(payload) {
  return supabase
    .from("scan_results")
    .insert(payload)
    .select("id")
    .maybeSingle();
}

export async function createScanResult({
  scanRequestId,
  appUserId,
  resultText,
  resultSummary,
  energyScore,
  mainEnergy,
  compatibility,
  modelName,
  promptVersion,
  responseTimeMs,
  fromCache = false,
  /** @type {Record<string, unknown> | null | undefined} */
  qualityAnalytics = null,
}) {
  const normalizedUserId = String(appUserId || "").trim();
  const normalizedRequestId = String(scanRequestId || "").trim();

  if (!normalizedUserId || !normalizedRequestId) {
    throw new Error("scan_result_missing_user_or_request_id");
  }

  const basePayload = {
    scan_request_id: normalizedRequestId,
    user_id: normalizedUserId,
    result_text: String(resultText || ""),
    result_summary: resultSummary || null,
    energy_score:
      energyScore !== undefined && energyScore !== null && energyScore !== "-"
        ? Number(energyScore)
        : null,
    main_energy: mainEnergy || null,
    compatibility: compatibility || null,
    model_name: modelName || null,
    prompt_version: promptVersion || null,
    response_time_ms:
      typeof responseTimeMs === "number" && Number.isFinite(responseTimeMs)
        ? Math.max(0, Math.round(responseTimeMs))
        : null,
  };

  const qa =
    qualityAnalytics && typeof qualityAnalytics === "object"
      ? qualityAnalytics
      : null;

  const withCache = Boolean(fromCache);

  let { data, error } = await insertScanResultRow({
    ...basePayload,
    from_cache: withCache,
    ...(qa ? { quality_analytics: qa } : {}),
  });

  if (
    error &&
    qa &&
    typeof error.message === "string" &&
    /quality_analytics/i.test(error.message)
  ) {
    console.warn(
      "[SUPABASE] createScanResult: quality_analytics missing, retry without it (run sql/012_scan_results_quality_analytics.sql)"
    );
    ({ data, error } = await insertScanResultRow({
      ...basePayload,
      from_cache: withCache,
    }));
  }

  const missingFromCache =
    error &&
    typeof error.message === "string" &&
    /from_cache/i.test(error.message);

  if (missingFromCache) {
    console.warn(
      "[SUPABASE] createScanResult: from_cache missing, retry without it (run sql/011_scan_results_from_cache.sql)"
    );
    ({ data, error } = await insertScanResultRow({
      ...basePayload,
      ...(qa ? { quality_analytics: qa } : {}),
    }));
  }

  if (
    error &&
    qa &&
    typeof error.message === "string" &&
    /quality_analytics/i.test(error.message)
  ) {
    console.warn(
      "[SUPABASE] createScanResult: quality_analytics missing (after from_cache fallback), retry base payload only"
    );
    ({ data, error } = await insertScanResultRow({
      ...basePayload,
    }));
  }

  if (error) {
    console.error("[SUPABASE] createScanResult error:", {
      scanRequestId: normalizedRequestId,
      userId: normalizedUserId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return data?.id || null;
}

/**
 * Remove a scan result row (e.g. free entitlement rollback when LINE delivery fails).
 * @param {string} scanResultId
 * @param {string} appUserId
 * @returns {Promise<boolean>} true if delete ran without error
 */
export async function deleteScanResultForAppUser(scanResultId, appUserId) {
  const sid = String(scanResultId || "").trim();
  const uid = String(appUserId || "").trim();
  if (!sid || !uid) return false;

  const { error } = await supabase
    .from("scan_results")
    .delete()
    .eq("id", sid)
    .eq("user_id", uid);

  if (error) {
    console.error(
      JSON.stringify({
        event: "SCAN_RESULT_DELETE",
        outcome: "error",
        scanResultIdPrefix: sid.slice(0, 8),
        message: error.message,
        code: error.code,
      }),
    );
    return false;
  }
  return true;
}
