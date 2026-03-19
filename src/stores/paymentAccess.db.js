import { supabase } from "../config/supabase.js";

/**
 * External input is LINE line_user_id string.
 * Entitlement and scan count use app_users + scan_results (source of truth).
 * If app_users row is not found, treat as new user (null paid_until, 0 scans).
 * Real DB errors remain fail-closed (throw).
 */

function normalizeLineUserId(lineUserId) {
  return String(lineUserId || "").trim();
}

export async function getUserPaidUntil(lineUserId) {
  const normalized = normalizeLineUserId(lineUserId);
  if (!normalized) return null;

  console.log("[PAYMENT_DEBUG] getUserPaidUntil query", { lineUserId: normalized });
  const { data, error } = await supabase
    .from("app_users")
    .select("paid_until")
    .eq("line_user_id", normalized)
    .limit(1);

  if (error) {
    console.error("[PAYMENT_DEBUG] getUserPaidUntil error:", {
      lineUserId: normalized,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return row.paid_until ? String(row.paid_until) : null;
}

export async function getUserScanCount(lineUserId) {
  const normalized = normalizeLineUserId(lineUserId);
  if (!normalized) return 0;

  console.log("[PAYMENT_DEBUG] getUserScanCount app_users query", { lineUserId: normalized });
  const { data: appUserRows, error: userError } = await supabase
    .from("app_users")
    .select("id")
    .eq("line_user_id", normalized)
    .limit(1);

  if (userError) {
    console.error("[PAYMENT_DEBUG] getUserScanCount (app_users) error:", {
      lineUserId: normalized,
      message: userError.message,
      code: userError.code,
      details: userError.details,
      hint: userError.hint,
    });
    throw userError;
  }

  const appUser = Array.isArray(appUserRows) ? appUserRows[0] : appUserRows;
  if (!appUser?.id) return 0;

  const appUserId = String(appUser.id);
  console.log("[PAYMENT_DEBUG] getUserScanCount scan_results query", {
    appUserId,
    lineUserId: normalized,
  });
  const { count, error: countError } = await supabase
    .from("scan_results")
    .select("*", { count: "exact", head: true })
    .eq("user_id", appUserId);

  if (countError) {
    console.error("[PAYMENT_DEBUG] getUserScanCount (scan_results) error:", {
      appUserId,
      lineUserId: normalized,
      message: countError.message,
      code: countError.code,
      details: countError.details,
      hint: countError.hint,
    });
    throw countError;
  }

  return count ?? 0;
}
