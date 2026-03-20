import { ensureUserByLineUserId } from "../stores/users.db.js";
import { buildPaymentRequiredFlex } from "./flex/status.flex.js";
import { buildPaymentRequiredText } from "../utils/webhookText.util.js";
import { supabase } from "../config/supabase.js";

const FREE_SCANS_LIMIT = 2; // free scans per day

export async function checkScanAccess({ userId, now = new Date() }) {
  const lineUserId = String(userId || "").trim();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  if (!lineUserId) {
    const finalDecision = { allowed: false, reason: "payment_required" };
    console.log("[SCAN_ACCESS_DEBUG]", {
      userId: lineUserId,
      nowIso,
      paidUntil: null,
      paidRemainingScans: 0,
      freeUsedToday: 0,
      freeRemainingToday: 0,
      finalDecision,
    });
    return {
      allowed: false,
      reason: "payment_required",
      remaining: 0,
      usedScans: 0,
      freeScansLimit: FREE_SCANS_LIMIT,
      freeScansRemaining: 0,
      paidUntil: null,
    };
  }

  // Ensure app_users row exists for this LINE user (safe, non-fatal).
  try {
    await ensureUserByLineUserId(lineUserId);
  } catch (error) {
    console.error("[SCAN_ACCESS] ensureUserByLineUserId failed (ignored):", {
      lineUserId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    // Keep payment gate semantics unchanged: fall through to fail-closed behavior.
  }

  // Get app_user + entitlement
  const { data: appUserRow, error: appUserErr } = await supabase
    .from("app_users")
    .select("id, paid_until, paid_remaining_scans")
    .eq("line_user_id", lineUserId)
    .limit(1)
    .maybeSingle();

  if (appUserErr) throw appUserErr;

  const appUserId = appUserRow?.id ? String(appUserRow.id) : null;

  const paidUntil = appUserRow?.paid_until ? String(appUserRow.paid_until) : null;
  const paidUntilMs = paidUntil ? Date.parse(paidUntil) : NaN;
  const paidRemainingScans = appUserRow?.paid_remaining_scans
    ? Number(appUserRow.paid_remaining_scans)
    : 0;

  // Free usage: count scans created today (server local time).
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  let freeUsedToday = 0;
  if (appUserId) {
    const { count, error: freeCountErr } = await supabase
      .from("scan_results")
      .select("id", { count: "exact", head: true })
      .eq("user_id", appUserId)
      .gte("created_at", startOfToday.toISOString())
      .lt("created_at", endOfToday.toISOString());

    if (freeCountErr) throw freeCountErr;
    freeUsedToday = count ?? 0;
  }

  const freeRemainingToday = Math.max(
    0,
    FREE_SCANS_LIMIT - (Number.isFinite(freeUsedToday) ? freeUsedToday : 0)
  );

  // Paid is active only when paid_until is in the future AND paid_remaining_scans > 0
  const paidActive =
    Number.isFinite(paidUntilMs) &&
    paidUntilMs > nowMs &&
    paidRemainingScans > 0;

  let finalDecision;
  if (paidActive) {
    finalDecision = { allowed: true, reason: "paid" };
    console.log("[SCAN_ACCESS_DEBUG]", {
      userId: lineUserId,
      nowIso,
      paidUntil,
      paidRemainingScans,
      freeUsedToday,
      freeRemainingToday,
      finalDecision,
    });

    return {
      allowed: true,
      reason: "paid",
      remaining: paidRemainingScans,
      usedScans: freeUsedToday,
      freeScansLimit: FREE_SCANS_LIMIT,
      freeScansRemaining: freeRemainingToday,
      paidUntil,
    };
  }

  if (freeUsedToday < FREE_SCANS_LIMIT) {
    finalDecision = { allowed: true, reason: "free" };
    console.log("[SCAN_ACCESS_DEBUG]", {
      userId: lineUserId,
      nowIso,
      paidUntil,
      paidRemainingScans,
      freeUsedToday,
      freeRemainingToday,
      finalDecision,
    });

    return {
      allowed: true,
      reason: "free",
      remaining: freeRemainingToday,
      usedScans: freeUsedToday,
      freeScansLimit: FREE_SCANS_LIMIT,
      freeScansRemaining: freeRemainingToday,
      paidUntil,
    };
  }

  finalDecision = { allowed: false, reason: "payment_required" };
  console.log("[SCAN_ACCESS_DEBUG]", {
    userId: lineUserId,
    nowIso,
    paidUntil,
    paidRemainingScans,
    freeUsedToday,
    freeRemainingToday,
    finalDecision,
  });

  return {
    allowed: false,
    reason: "payment_required",
    remaining: 0,
    usedScans: freeUsedToday,
    freeScansLimit: FREE_SCANS_LIMIT,
    freeScansRemaining: 0,
    paidUntil,
  };
}

export function buildPaymentGateReply({ decision }) {
  return {
    flex: buildPaymentRequiredFlex({
      usedScans: decision?.usedScans ?? FREE_SCANS_LIMIT,
      freeLimit: decision?.freeScansLimit ?? FREE_SCANS_LIMIT,
    }),
    fallbackText: buildPaymentRequiredText({
      usedScans: decision?.usedScans ?? FREE_SCANS_LIMIT,
      freeLimit: decision?.freeScansLimit ?? FREE_SCANS_LIMIT,
    }),
  };
}
