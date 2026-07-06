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

/**
 * Clear paid entitlement only — does not change free-scan offset or history.
 * Expires open manual payment rows; clears in-memory slip state.
 */
export async function revokePaidAccessForLineUserByAdmin({
  lineUserId,
  adminLabel = "admin_dashboard",
} = {}) {
  const lu = String(lineUserId || "").trim();
  if (!lu) throw new Error("line_user_id_missing");

  const nowIso = getNowIso();

  const { data: userRow, error: uErr } = await supabase
    .from("app_users")
    .select("id,line_user_id")
    .eq("line_user_id", lu)
    .maybeSingle();

  if (uErr) throw uErr;
  if (!userRow?.id) throw new Error("app_user_not_found");

  const appUserId = String(userRow.id);

  const { error: updErr } = await supabase
    .from("app_users")
    .update({
      paid_until: null,
      paid_remaining_scans: 0,
      paid_plan_code: null,
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
      event: "admin_revoke_paid_access",
      outcome: "ok",
      lineUserId: lu,
      appUserId,
      adminLabel,
      expiredPayments: expiredCount,
    })
  );

  return {
    appUserId,
    lineUserId: lu,
    expiredPayments: expiredCount,
  };
}

/** Adding paid scans to a user whose window lapsed re-opens it for this long. */
const ADMIN_ADJUST_DEFAULT_WINDOW_HOURS = 24;

/**
 * Admin dashboard: add/remove paid_remaining_scans by a delta (clamped at 0).
 * When adding to a user whose paid_until is missing/past, the window is extended
 * to now + 24h so the added scans are actually usable (paid access needs both
 * remaining scans AND an active window).
 */
export async function adjustPaidRemainingScansForLineUserByAdmin({
  lineUserId,
  delta,
  setTo = null,
  adminLabel = "admin_dashboard",
} = {}) {
  const lu = String(lineUserId || "").trim();
  if (!lu) throw new Error("line_user_id_missing");

  let d = null;
  let absolute = null;
  if (setTo != null) {
    absolute = Math.trunc(Number(setTo));
    if (!Number.isFinite(absolute) || absolute < 0 || absolute > 999) {
      throw new Error("invalid_delta");
    }
  } else {
    d = Math.trunc(Number(delta));
    if (!Number.isFinite(d) || d === 0 || Math.abs(d) > 99) {
      throw new Error("invalid_delta");
    }
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const { data: userRow, error: uErr } = await supabase
    .from("app_users")
    .select("id,line_user_id,paid_remaining_scans,paid_until")
    .eq("line_user_id", lu)
    .maybeSingle();

  if (uErr) throw uErr;
  if (!userRow?.id) throw new Error("app_user_not_found");

  const appUserId = String(userRow.id);
  const before = Number(userRow.paid_remaining_scans) || 0;
  const after = absolute != null ? absolute : Math.max(0, before + d);

  const paidUntilMs = userRow.paid_until
    ? Date.parse(String(userRow.paid_until))
    : NaN;
  const windowActive = Number.isFinite(paidUntilMs) && paidUntilMs > nowMs;

  const patch = {
    paid_remaining_scans: after,
    updated_at: nowIso,
  };
  let paidUntilExtended = false;
  if (after > before && after > 0 && !windowActive) {
    patch.paid_until = new Date(
      nowMs + ADMIN_ADJUST_DEFAULT_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();
    paidUntilExtended = true;
  }

  const { error: updErr } = await supabase
    .from("app_users")
    .update(patch)
    .eq("id", appUserId);
  if (updErr) throw updErr;

  console.log(
    JSON.stringify({
      event: "admin_adjust_paid_scans",
      outcome: "ok",
      lineUserId: lu,
      appUserId,
      adminLabel,
      delta: d,
      setTo: absolute,
      before,
      after,
      paidUntilExtended,
      paidUntil: patch.paid_until || userRow.paid_until || null,
    })
  );

  return {
    appUserId,
    lineUserId: lu,
    delta: d,
    setTo: absolute,
    before,
    after,
    paidUntilExtended,
    paidUntil: patch.paid_until || userRow.paid_until || null,
  };
}
