import { supabase } from "../config/supabase.js";

/**
 * External input is LINE line_user_id string.
 * Entitlement and scan count use app_users + scan_results (source of truth).
 * If app_users row is not found, treat as new user (null paid_until, 0 scans).
 * Real DB errors remain fail-closed (throw).
 */

/** Calendar day key in server local timezone (matches checkScanAccess "today" window). */
export function getLocalDateKey(d = new Date()) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeLineUserId(lineUserId) {
  return String(lineUserId || "").trim();
}

/**
 * Count scan_results for this app user between local midnight and next midnight.
 */
export async function countScanResultsTodayForAppUser(appUserId, now = new Date()) {
  const uid = String(appUserId || "").trim();
  if (!uid) return 0;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const { count, error } = await supabase
    .from("scan_results")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .gte("created_at", startOfToday.toISOString())
    .lt("created_at", endOfToday.toISOString());

  if (error) throw error;
  return count ?? 0;
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
  if (!appUser?.id) {
    console.log("[PAYMENT_DEBUG] getUserScanCount no app_users row, treating as 0 scans", {
      lineUserId: normalized,
    });
    return 0;
  }

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

  console.log("[PAYMENT_DEBUG] getUserScanCount success", {
    appUserId,
    lineUserId: normalized,
    count: count ?? 0,
  });

  return count ?? 0;
}

/**
 * Consume 1 paid scan after a scan has fully succeeded.
 * Must only be called when the caller already knows access source is "paid".
 */
export async function decrementUserPaidRemainingScans(appUserId) {
  const normalizedAppUserId = String(appUserId || "").trim();
  if (!normalizedAppUserId) throw new Error("decrementPaid_missing_app_user_id");

  // Read current remaining then update (simple non-transactional decrement; scan flow is resilient).
  const { data: userRow, error: readError } = await supabase
    .from("app_users")
    .select("paid_remaining_scans")
    .eq("id", normalizedAppUserId)
    .maybeSingle();

  if (readError) throw readError;

  const current = Number(userRow?.paid_remaining_scans) || 0;
  const next = Math.max(0, current - 1);

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("app_users")
    .update({
      paid_remaining_scans: next,
      updated_at: nowIso,
    })
    .eq("id", normalizedAppUserId);

  if (updateError) throw updateError;

  return next;
}

/**
 * Total scans + last scan time for admin dashboard (by app_users.id).
 */
export async function getScanUsageSummaryForAppUser(appUserId) {
  const uid = String(appUserId || "").trim();
  if (!uid) {
    return { totalScans: 0, lastScanAt: null };
  }

  const { count, error: countError } = await supabase
    .from("scan_results")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);

  if (countError) throw countError;

  const { data: lastRow, error: lastError } = await supabase
    .from("scan_results")
    .select("created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) throw lastError;

  return {
    totalScans: count ?? 0,
    lastScanAt: lastRow?.created_at ? String(lastRow.created_at) : null,
  };
}
