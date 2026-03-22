import { supabase } from "../config/supabase.js";

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

  const payloadWithCache = {
    ...basePayload,
    from_cache: Boolean(fromCache),
  };

  let { data, error } = await supabase
    .from("scan_results")
    .insert(payloadWithCache)
    .select("id")
    .maybeSingle();

  const missingFromCache =
    error &&
    typeof error.message === "string" &&
    /from_cache/i.test(error.message);

  if (missingFromCache) {
    console.warn(
      "[SUPABASE] createScanResult: from_cache column missing, retry without it (run sql/011_scan_results_from_cache.sql)"
    );
    ({ data, error } = await supabase
      .from("scan_results")
      .insert(basePayload)
      .select("id")
      .maybeSingle());
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

