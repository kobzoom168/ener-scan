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

  const { data, error } = await supabase
    .from("app_users")
    .select("paid_until")
    .eq("line_user_id", normalized)
    .maybeSingle();

  if (error) {
    console.error("[SUPABASE] getUserPaidUntil error:", {
      lineUserId: normalized,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  if (!data) return null;

  return data.paid_until ? String(data.paid_until) : null;
}

export async function getUserScanCount(lineUserId) {
  const normalized = normalizeLineUserId(lineUserId);
  if (!normalized) return 0;

  const { data: appUser, error: userError } = await supabase
    .from("app_users")
    .select("id")
    .eq("line_user_id", normalized)
    .maybeSingle();

  if (userError) {
    console.error("[SUPABASE] getUserScanCount (app_users) error:", {
      lineUserId: normalized,
      message: userError.message,
      code: userError.code,
      details: userError.details,
      hint: userError.hint,
    });
    throw userError;
  }

  if (!appUser?.id) return 0;

  const { count, error: countError } = await supabase
    .from("scan_results")
    .select("*", { count: "exact", head: true })
    .eq("user_id", appUser.id);

  if (countError) {
    console.error("[SUPABASE] getUserScanCount (scan_results) error:", {
      appUserId: appUser.id,
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
