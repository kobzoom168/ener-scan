/**
 * Deterministic helpers for payment vs scan routing (truth from access + DB row).
 * Kept small for unit tests and webhook branches.
 */

import { computePaidActive } from "../services/scanOfferAccess.resolver.js";

export const ACTIVE_SLIP_PAYMENT_STATUSES = ["awaiting_payment", "pending_verify"];

/**
 * @param {{ status?: string } | null | undefined} row
 * @returns {boolean}
 */
export function isActiveSlipPaymentRow(row) {
  if (!row?.status) return false;
  return ACTIVE_SLIP_PAYMENT_STATUSES.includes(String(row.status));
}

/**
 * Whether an in-flight manual payment / slip row should own LINE **text** routing.
 * DB status wins over in-memory MVP state. `pending_verify` stays actionable even when
 * `checkScanAccess` is still allowed (e.g. free quota).
 *
 * @param {{
 *   accessDecision?: { allowed?: boolean, reason?: string } | null;
 *   latestPaymentRow?: { status?: string } | null;
 *   paymentMemoryState?: string;
 * }} [ctx]
 * @returns {boolean}
 */
export function isAwaitingPaymentActionableForTextRouting({
  accessDecision,
  latestPaymentRow,
  paymentMemoryState,
} = {}) {
  const status = String(latestPaymentRow?.status || "").trim();
  const mem = String(paymentMemoryState || "").trim();

  if (status === "pending_verify") {
    return true;
  }

  if (accessDecision?.allowed === true) {
    return false;
  }

  if (status === "awaiting_payment") {
    return true;
  }

  if (mem === "awaiting_slip") {
    return true;
  }

  return false;
}

/**
 * User may open paywall / create payment only when scan access is denied for quota/entitlement.
 * If scan is still allowed and there is no in-flight slip row, payment-ish text is guidance-only.
 *
 * @param {{ allowed?: boolean, reason?: string } | null | undefined} accessDecision
 * @param {{ status?: string } | null | undefined} pendingPaymentRow
 * @returns {boolean}
 */
export function shouldEmitPayNotNeededForPaymentIntent(
  accessDecision,
  pendingPaymentRow,
) {
  if (!accessDecision?.allowed) return false;
  if (String(pendingPaymentRow?.status || "").trim() === "pending_verify") {
    return false;
  }
  return true;
}

/**
 * Image finalize: slip / pending_verify handling must run whenever DB has an active slip row,
 * even if checkScanAccess says allowed (e.g. free quota left but payment already started).
 *
 * @param {{ status?: string } | null | undefined} pendingPaymentRow
 * @returns {boolean}
 */
export function paymentRowOwnsImageRouting(pendingPaymentRow) {
  return isActiveSlipPaymentRow(pendingPaymentRow);
}

/**
 * When paid entitlement is active (DB + gate math), object images must use the scan pipeline.
 * Slip routing stays for users who still need to finish slip/payment without an active paid window.
 *
 * @param {{
 *   allowed?: boolean;
 *   reason?: string;
 *   paidUntil?: string | null;
 *   paidRemainingScans?: number;
 * } | null | undefined} accessDecision
 * @param {Date} [now]
 * @returns {boolean}
 */
export function shouldRouteObjectImageToScanBeforeSlipPipeline(
  accessDecision,
  now = new Date(),
) {
  if (!accessDecision) return false;
  const paidRem = Number(accessDecision.paidRemainingScans);
  const rem = Number.isFinite(paidRem) ? paidRem : 0;
  if (
    computePaidActive(
      accessDecision.paidUntil ?? null,
      rem,
      now,
    )
  ) {
    return true;
  }
  if (accessDecision.allowed === true && accessDecision.reason === "paid") {
    return true;
  }
  return false;
}
