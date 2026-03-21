/**
 * Admin-only user resets (no scan_results / history deletion).
 */
import { supabase } from "../config/supabase.js";
import {
  countScanResultsTodayForAppUser,
  getLocalDateKey,
} from "./paymentAccess.db.js";
import { clearPaymentState } from "./manualPaymentAccess.store.js";

function getNowIso() {
  return new Date().toISOString();
}

/**
 * Clear paid entitlement, restore today's free tier via offset (see paymentAccess.service),
 * expire open manual payments, clear in-memory slip state.
 * @param {{ lineUserId: string, adminLabel?: string }} opts
 */
export async function resetFreeTrialForLineUserByAdmin({
  lineUserId,
  adminLabel = "admin_dashboard",
} = {}) {
  const lu = String(lineUserId || "").trim();
  if (!lu) throw new Error("line_user_id_missing");

  const now = new Date();
  const nowIso = getNowIso();

  const { data: userRow, error: uErr } = await supabase
    .from("app_users")
    .select("id,line_user_id")
    .eq("line_user_id", lu)
    .maybeSingle();

  if (uErr) throw uErr;
  if (!userRow?.id) throw new Error("app_user_not_found");

  const appUserId = String(userRow.id);
  const scansToday = await countScanResultsTodayForAppUser(appUserId, now);
  const dateKey = getLocalDateKey(now);

  const { error: updErr } = await supabase
    .from("app_users")
    .update({
      paid_until: null,
      paid_remaining_scans: 0,
      paid_plan_code: null,
      free_scan_daily_offset: scansToday,
      free_scan_offset_date: dateKey,
      updated_at: nowIso,
    })
    .eq("id", appUserId);

  if (updErr) throw updErr;

  const { data: expRows, error: expErr } = await supabase
    .from("payments")
    .update({ status: "expired", updated_at: nowIso })
    .eq("user_id", appUserId)
    .in("status", ["awaiting_payment", "pending_verify"])
    .select("id");

  if (expErr) throw expErr;
  const expiredCount = Array.isArray(expRows) ? expRows.length : 0;

  clearPaymentState(lu);

  console.log(
    JSON.stringify({
      event: "admin_reset_free_trial",
      outcome: "ok",
      lineUserId: lu,
      appUserId,
      adminLabel,
      scansToday,
      freeOffsetApplied: scansToday,
      freeOffsetDate: dateKey,
      expiredPayments: expiredCount,
    })
  );

  return {
    appUserId,
    lineUserId: lu,
    scansToday,
    freeOffsetDate: dateKey,
    expiredPayments: expiredCount,
  };
}
