/**
 * Single source of truth for active conversation owner on LINE text turns.
 * Aligns with {@link resolveActiveState} — webhook builds flags once, then branches.
 */
import { resolveActiveState } from "../core/conversation/activeStateResolver.js";
import {
  getGuidanceNoProgressCount,
  getSelectedPaymentPackageKey,
} from "../stores/session.store.js";
import {
  isHistoryCommand,
  isMainMenuAlias,
  isStatsCommand,
} from "./webhookText.util.js";

/**
 * Gemini / legacy logs still expect `paywall_offer_single` instead of canonical owners.
 * @param {string} stateOwner
 * @returns {string}
 */
export function toGeminiConversationOwner(stateOwner) {
  const s = String(stateOwner || "").trim();
  if (s === "paywall_selecting_package" || s === "payment_package_selected") {
    return "paywall_offer_single";
  }
  return s;
}

/**
 * @param {object} ctx
 * @param {string} ctx.userId
 * @param {object} ctx.session
 * @param {string} ctx.text
 * @param {string} ctx.lowerText
 * @param {object|null} ctx.activeAccessDecision
 * @param {object|null} ctx.activePendingPaymentRow
 * @param {string} ctx.paymentMemoryState
 * @param {{ isLocked?: boolean }} ctx.scanAbuseStatus
 */
export function computeWebhookTextActiveState(ctx) {
  const userId = String(ctx.userId || "").trim();
  const session = ctx.session || {};
  const text = String(ctx.text || "");
  const lowerText = String(ctx.lowerText || "").trim();
  const activeAccessDecision = ctx.activeAccessDecision;
  const activePendingPaymentRow = ctx.activePendingPaymentRow;
  const paymentMemoryState = String(ctx.paymentMemoryState || "").trim();
  const scanAbuseStatus = ctx.scanAbuseStatus || {};

  const pendingStatus = String(activePendingPaymentRow?.status || "").trim();
  const hasPendingVerify = pendingStatus === "pending_verify";
  const hasAwaitingSlip = pendingStatus === "awaiting_payment";

  const accessAllowed = activeAccessDecision?.allowed === true;
  const accessReason = String(activeAccessDecision?.reason || "").trim();

  let paymentState = "none";
  if (hasPendingVerify) {
    paymentState = "pending_verify";
  } else if (hasAwaitingSlip || paymentMemoryState === "awaiting_slip") {
    paymentState = "awaiting_slip";
  } else if (
    !accessAllowed &&
    accessReason === "payment_required" &&
    session.pendingImage
  ) {
    paymentState = "paywall_offer_single";
  } else if (accessAllowed && accessReason === "paid") {
    paymentState = "approved_intro";
  }

  const flowState = session.pendingImage ? "waiting_birthdate" : "idle";
  const accessState = accessAllowed
    ? accessReason === "paid"
      ? "paid_active"
      : "free_available"
    : accessReason || "payment_required";

  const isPaywallGateWithPendingScan =
    Boolean(session.pendingImage) &&
    activeAccessDecision != null &&
    !activeAccessDecision.allowed &&
    activeAccessDecision.reason === "payment_required";

  const selectedKey = getSelectedPaymentPackageKey(userId);
  const hasPackageSelected = Boolean(selectedKey);

  let hasAwaitingPaymentInteractive = false;
  /** @type {'none'|'awaiting_slip'|'pending_verify'|'paywall'|'package_selected'} */
  let paymentInteractiveKind = "none";

  if (hasPendingVerify) {
    hasAwaitingPaymentInteractive = true;
    paymentInteractiveKind = "pending_verify";
  } else if (hasAwaitingSlip || paymentMemoryState === "awaiting_slip") {
    hasAwaitingPaymentInteractive = true;
    paymentInteractiveKind = "awaiting_slip";
  } else if (paymentState === "paywall_offer_single") {
    hasAwaitingPaymentInteractive = true;
    paymentInteractiveKind = hasPackageSelected ? "package_selected" : "paywall";
  } else if (
    !accessAllowed &&
    accessReason === "payment_required" &&
    hasPackageSelected
  ) {
    hasAwaitingPaymentInteractive = true;
    paymentInteractiveKind = "package_selected";
  }

  const waitingBirthdateForScan =
    Boolean(session.pendingImage) && paymentState === "none";

  const accessPaidReady = accessAllowed && accessReason === "paid";

  const explicitCommandOrUtility =
    isHistoryCommand(text, lowerText) ||
    isStatsCommand(text) ||
    isMainMenuAlias(text, lowerText);

  const noProgressStreak = (() => {
    if (hasPendingVerify) {
      return getGuidanceNoProgressCount(userId, "pending_verify");
    }
    if (hasAwaitingSlip || paymentMemoryState === "awaiting_slip") {
      return getGuidanceNoProgressCount(userId, "awaiting_slip");
    }
    if (paymentState === "paywall_offer_single") {
      return getGuidanceNoProgressCount(userId, "paywall_offer_single");
    }
    if (waitingBirthdateForScan) {
      return getGuidanceNoProgressCount(userId, "waiting_birthdate");
    }
    return 0;
  })();

  const softLockedScan = scanAbuseStatus.isLocked === true;

  const snapshotInput = {
    userId,
    hardBlocked: false,
    softLockedScan,
    hasAwaitingPaymentInteractive,
    paymentInteractiveKind,
    waitingBirthdateForScan,
    accessPaidReady,
    explicitCommandOrUtility,
    noProgressStreak,
  };

  const resolved = resolveActiveState(snapshotInput);

  return {
    snapshotInput,
    resolved,
    paymentState,
    flowState,
    accessState,
    isPaywallGateWithPendingScan,
    pendingStatus,
    hasPendingVerify,
    hasAwaitingSlip,
    selectedPackageKey: selectedKey || null,
  };
}
