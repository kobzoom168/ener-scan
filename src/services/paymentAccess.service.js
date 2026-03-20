import { getUserPaidUntil, getUserScanCount } from "../stores/paymentAccess.db.js";
import { ensureUserByLineUserId } from "../stores/users.db.js";
import { hasPaymentAccess } from "../stores/manualPaymentAccess.store.js";
import { buildPaymentRequiredFlex } from "./flex/status.flex.js";
import { buildPaymentRequiredText } from "../utils/webhookText.util.js";

const FREE_SCANS_LIMIT = 3;

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

  // MVP: in-memory unlock after user sends slip image (LINE webhook). Same UX as paid for scan caps.
  if (hasPaymentAccess(normalizedUserId)) {
    const freeScansRemaining = Math.max(0, FREE_SCANS_LIMIT - usedScans);
    return {
      allowed: true,
      reason: "paid",
      usedScans,
      freeScansLimit: FREE_SCANS_LIMIT,
      freeScansRemaining,
      paidUntil,
    };
  }

  const paidUntilMs = paidUntil ? toMs(paidUntil) : NaN;
  const isPaidActive =
    Number.isFinite(paidUntilMs) && paidUntilMs > now.getTime();

  const freeScansRemaining = Math.max(0, FREE_SCANS_LIMIT - usedScans);

  if (isPaidActive) {
    return {
      allowed: true,
      reason: "paid",
      usedScans,
      freeScansLimit: FREE_SCANS_LIMIT,
      freeScansRemaining,
      paidUntil,
    };
  }

  if (usedScans < FREE_SCANS_LIMIT) {
    return {
      allowed: true,
      reason: "free",
      usedScans,
      freeScansLimit: FREE_SCANS_LIMIT,
      freeScansRemaining,
      paidUntil,
    };
  }

  return {
    allowed: false,
    reason: "payment_required",
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
