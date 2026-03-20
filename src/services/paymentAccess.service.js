import { getUserPaidUntil, getUserScanCount } from "../stores/paymentAccess.db.js";
import { ensureUserByLineUserId } from "../stores/users.db.js";
import { getPaymentState, hasPaymentAccess } from "../stores/manualPaymentAccess.store.js";
import { buildPaymentRequiredFlex } from "./flex/status.flex.js";
import { buildPaymentRequiredText } from "../utils/webhookText.util.js";
import { supabase } from "../config/supabase.js";

const FREE_SCANS_LIMIT = 2; // lifetime free scans for new users
const PAID_SCAN_LIMIT = 5;
const PAID_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h window

function toMs(isoString) {
  const ms = Date.parse(String(isoString || ""));
  return Number.isFinite(ms) ? ms : NaN;
}

export async function checkScanAccess({ userId, now = new Date() }) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
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
    await ensureUserByLineUserId(normalizedUserId);
  } catch (error) {
    console.error("[PAYMENT_DEBUG] checkScanAccess ensureUserByLineUserId failed (ignored):", {
      lineUserId: normalizedUserId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    // Keep payment gate semantics unchanged: fall through to existing logic.
  }

  const [paidUntil, usedScans] = await Promise.all([
    getUserPaidUntil(normalizedUserId),
    getUserScanCount(normalizedUserId),
  ]);

  const nowMs = now.getTime();

  // 1) Paid access first (DB paid_until OR in-memory manual unlock).
  let paidUntilMs = null;
  if (hasPaymentAccess(normalizedUserId)) {
    const state = getPaymentState(normalizedUserId);
    if (state?.state === "unlocked") {
      paidUntilMs = Number(state.unlockedUntilMs);
    }
  } else {
    const paidUntilCandidateMs = paidUntil ? toMs(paidUntil) : NaN;
    paidUntilMs = Number.isFinite(paidUntilCandidateMs)
      ? paidUntilCandidateMs
      : null;
  }

  if (paidUntilMs && paidUntilMs > nowMs) {
    const paidWindowStartMs = paidUntilMs - PAID_WINDOW_MS;

    // Count scan_results within the last 24h window ending at paid_until.
    const { data: appUserRow, error: userError } = await supabase
      .from("app_users")
      .select("id")
      .eq("line_user_id", normalizedUserId)
      .limit(1)
      .maybeSingle();

    if (userError) throw userError;

    const appUserId = appUserRow?.id ? String(appUserRow.id) : null;
    let paidUsedScans = 0;

    if (appUserId) {
      const startIso = new Date(paidWindowStartMs).toISOString();
      const endIso = new Date(paidUntilMs).toISOString();

      const { count, error: countError } = await supabase
        .from("scan_results")
        .select("*", { count: "exact", head: true })
        .eq("user_id", appUserId)
        .gte("created_at", startIso)
        .lt("created_at", endIso);

      if (countError) throw countError;
      paidUsedScans = count ?? 0;
    }

    const remainingPaidScans = Math.max(0, PAID_SCAN_LIMIT - paidUsedScans);

    if (remainingPaidScans > 0) {
      return {
        allowed: true,
        reason: "paid",
        remaining: remainingPaidScans,
        usedScans,
        freeScansLimit: FREE_SCANS_LIMIT,
        freeScansRemaining: 0,
        paidUntil,
      };
    }
    return {
      allowed: false,
      reason: "payment_required",
      remaining: 0,
      usedScans,
      freeScansLimit: FREE_SCANS_LIMIT,
      freeScansRemaining: 0,
      paidUntil,
    };
  }

  // 2) Else: lifetime free scans (max 2).
  const remainingFreeScans = Math.max(0, FREE_SCANS_LIMIT - usedScans);
  if (usedScans < FREE_SCANS_LIMIT) {
    return {
      allowed: true,
      reason: "free",
      remaining: remainingFreeScans,
      usedScans,
      freeScansLimit: FREE_SCANS_LIMIT,
      freeScansRemaining: remainingFreeScans,
      paidUntil,
    };
  }

  // 3) Deny: payment required.
  return {
    allowed: false,
    reason: "payment_required",
    remaining: 0,
    usedScans,
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
