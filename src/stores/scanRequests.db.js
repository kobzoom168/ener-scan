import { supabase } from "../config/supabase.js";

export async function createScanRequest({
  appUserId,
  flowVersion,
  scanJobId,
  birthdateUsed,
  usedSavedBirthdate = false,
  requestSource = "line",
}) {
  const normalizedUserId = String(appUserId || "").trim();
  if (!normalizedUserId) {
    throw new Error("scan_request_missing_user_id");
  }

  const payload = {
    user_id: normalizedUserId,
    request_status: "pending",
    flow_version: typeof flowVersion === "number" ? flowVersion : null,
    scan_job_id: scanJobId || null,
    birthdate_used: birthdateUsed || null,
    used_saved_birthdate: Boolean(usedSavedBirthdate),
    request_source: requestSource || "line",
  };

  const { data, error } = await supabase
    .from("scan_requests")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[SUPABASE] createScanRequest error:", {
      userId: normalizedUserId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  if (!data?.id) {
    throw new Error("scan_request_insert_failed");
  }

  return data.id;
}

export async function updateScanRequestStatus(scanRequestId, status) {
  const normalizedId = String(scanRequestId || "").trim();
  if (!normalizedId) return false;

  const safeStatus = String(status || "").trim() || "pending";

  const { error } = await supabase
    .from("scan_requests")
    .update({
      request_status: safeStatus,
    })
    .eq("id", normalizedId);

  if (error) {
    console.error("[SUPABASE] updateScanRequestStatus error:", {
      scanRequestId: normalizedId,
      status: safeStatus,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return true;
}

