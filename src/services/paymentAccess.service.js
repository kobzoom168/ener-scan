import { ensureUserByLineUserId } from "../stores/users.db.js";
import {
  countScanResultsTodayForAppUser,
  getLocalDateKey,
} from "../stores/paymentAccess.db.js";
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
    .select(
      "id, paid_until, paid_remaining_scans, free_scan_daily_offset, free_scan_offset_date"
    )
    .eq("line_user_id", lineUserId)
    .limit(1)
    .maybeSingle();

  if (appUserErr) {
    // Make future schema drift obvious in logs (does not change behavior).
    const missingColumn =
      typeof appUserErr?.message === "string"
        ? appUserErr.message.match(/column\s+([a-zA-Z0-9_.]+)\s+does not exist/i)?.[1] ||
          null
        : null;

    console.error("[PAYMENT_ACCESS_SCHEMA_MISMATCH]", {
      userId: lineUserId,
      supabaseCode: appUserErr?.code,
      supabaseMessage: appUserErr?.message,
      missingColumn,
      hint:
        "Check SQL migrations for app_users paid columns: paid_remaining_scans, paid_until, paid_plan_code",
    });

    throw appUserErr;
  }

  const appUserId = appUserRow?.id ? String(appUserRow.id) : null;

  const paidUntil = appUserRow?.paid_until ? String(appUserRow.paid_until) : null;
  const paidUntilMs = paidUntil ? Date.parse(paidUntil) : NaN;
  const paidRemainingScans = appUserRow?.paid_remaining_scans
    ? Number(appUserRow.paid_remaining_scans)
    : 0;

  // Free usage: count scans created today (server local time), minus admin reset offset.
  let freeUsedToday = 0;
  if (appUserId) {
    freeUsedToday = await countScanResultsTodayForAppUser(appUserId, now);
  }

  const offsetDate = appUserRow?.free_scan_offset_date
    ? String(appUserRow.free_scan_offset_date).slice(0, 10)
    : null;
  const offsetN = Number(appUserRow?.free_scan_daily_offset) || 0;
  if (
    offsetDate &&
    offsetDate === getLocalDateKey(now) &&
    offsetN > 0
  ) {
    freeUsedToday = Math.max(0, freeUsedToday - offsetN);
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

/** Text-only paywall reply (LINE Flex reserved for final scan result). */
export async function buildPaymentGateReply({ decision, userId = null }) {
  return {
    fallbackText: await buildPaymentRequiredText({
      usedScans: decision?.usedScans ?? FREE_SCANS_LIMIT,
      freeLimit: decision?.freeScansLimit ?? FREE_SCANS_LIMIT,
      userId,
    }),
  };
}
