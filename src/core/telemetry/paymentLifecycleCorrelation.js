/**
 * Canonical funnel phases for analytics (not necessarily 1:1 with DB status).
 * @readonly
 */
export const FunnelPhase = Object.freeze({
  IDLE: "idle",
  PAYWALL_SELECTING: "paywall_selecting",
  PACKAGE_SELECTED: "package_selected",
  /** DB `payments.status === awaiting_payment` (row exists, before slip). */
  AWAITING_PAYMENT: "awaiting_payment",
  /** In-memory manual MVP: user prompted, waiting for slip image. */
  SLIP_PHASE: "slip_phase",
  /** QR intro+image+slip hint delivered (may overlap temporally with slip_phase). */
  QR_DELIVERED: "qr_delivered",
  /** DB `pending_verify`. */
  PENDING_VERIFY: "pending_verify",
  PAID: "paid",
  REJECTED: "rejected",
});

export const LIFECYCLE_SCHEMA_VERSION = 1;

/**
 * Strip null/undefined from analytics payloads.
 * @param {Record<string, unknown>} o
 */
export function omitEmptyLifecycleFields(o) {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
}

/**
 * Standard correlation shape for payment funnel logs (queries + joins).
 *
 * @param {object} raw
 * @param {string} [raw.userId] — LINE user id
 * @param {string|number|null} [raw.paymentId]
 * @param {string|null} [raw.paymentRef]
 * @param {string|null} [raw.packageKey] — offer / package code
 */
export function buildLifecycleCorrelation(raw = {}) {
  const userId = String(raw.userId || "").trim();
  const pid = raw.paymentId;
  const paymentId =
    pid === undefined || pid === null || pid === ""
      ? undefined
      : String(pid).trim();
  const paymentRef = raw.paymentRef != null ? String(raw.paymentRef).trim() : undefined;
  const packageKey =
    raw.packageKey != null ? String(raw.packageKey).trim() : undefined;

  return omitEmptyLifecycleFields({
    lifecycleSchemaVersion: LIFECYCLE_SCHEMA_VERSION,
    userId: userId || undefined,
    lineUserId: userId || undefined,
    paymentId,
    paymentRef,
    packageKey,
  });
}
