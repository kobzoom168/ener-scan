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
}) {
  const normalizedUserId = String(appUserId || "").trim();
  const normalizedRequestId = String(scanRequestId || "").trim();

  if (!normalizedUserId || !normalizedRequestId) {
    throw new Error("scan_result_missing_user_or_request_id");
  }

  const payload = {
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

  const { data, error } = await supabase
    .from("scan_results")
    .insert(payload)
    .select("id")
    .maybeSingle();

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

