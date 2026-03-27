/**
 * Deterministic helpers for payment vs scan routing (truth from access + DB row).
 * Kept small for unit tests and webhook branches.
 */

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
  if (isActiveSlipPaymentRow(pendingPaymentRow)) return false;
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
