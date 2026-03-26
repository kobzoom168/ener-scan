import { TelemetryEvents, logTelemetryEvent } from "./telemetryEvents.js";
import {
  buildLifecycleCorrelation,
  FunnelPhase,
  LIFECYCLE_SCHEMA_VERSION,
} from "./paymentLifecycleCorrelation.js";

export { FunnelPhase, buildLifecycleCorrelation, LIFECYCLE_SCHEMA_VERSION };

/**
 * @param {object} opts
 * @param {string} opts.step
 * @param {string} opts.fromState
 * @param {string} opts.toState
 * @param {string} opts.reason
 * @param {Record<string, unknown>} [extras]
 * @param {string} [legacyMirrorEvent] — optional second log line for backward-compatible `event` names
 */
export function emitPaymentFunnelTransition(
  {
    step,
    fromState,
    toState,
    reason,
    userId,
    paymentId,
    paymentRef,
    packageKey,
    ...extra
  },
  legacyMirrorEvent = null,
) {
  const correlation = buildLifecycleCorrelation({
    userId,
    paymentId,
    paymentRef,
    packageKey,
  });
  const ts = Date.now();
  const payload = {
    ...correlation,
    step,
    fromState,
    toState,
    reason: String(reason || "").trim() || undefined,
    ts,
    ...extra,
  };
  logTelemetryEvent(TelemetryEvents.PAYMENT_FUNNEL_TRANSITION, payload);
  if (legacyMirrorEvent) {
    logTelemetryEvent(legacyMirrorEvent, payload);
  }
}

/**
 * @param {object} o
 * @param {string} o.userId
 * @param {string} o.packageKey
 * @param {string} o.source
 * @param {string} [o.fromState]
 */
export function emitPackageSelectedEntered({
  userId,
  packageKey,
  source,
  fromState = FunnelPhase.PAYWALL_SELECTING,
}) {
  emitPaymentFunnelTransition(
    {
      step: "package_selected_entered",
      fromState,
      toState: FunnelPhase.PACKAGE_SELECTED,
      reason: source,
      userId,
      packageKey,
    },
    TelemetryEvents.PACKAGE_SELECTED_ENTERED,
  );
}

/**
 * @param {object} o
 * @param {string} o.userId
 * @param {string} o.source
 */
export function emitPackageSelectedCleared({ userId, source }) {
  emitPaymentFunnelTransition(
    {
      step: "package_selected_cleared",
      fromState: FunnelPhase.PACKAGE_SELECTED,
      toState: FunnelPhase.AWAITING_PAYMENT,
      reason: source,
      userId,
    },
    TelemetryEvents.PACKAGE_SELECTED_CLEARED,
  );
}

/**
 * @param {object} o
 * @param {string} o.userId
 * @param {string|number|null} [o.paymentId]
 * @param {string|null} [o.paymentRef]
 * @param {string|null} [o.packageKey]
 * @param {string} o.source
 * @param {boolean} [o.hadPackageSelected]
 */
export function emitAwaitingPaymentEntered({
  userId,
  paymentId,
  paymentRef,
  packageKey,
  source,
  hadPackageSelected = false,
}) {
  const fromState = hadPackageSelected
    ? FunnelPhase.PACKAGE_SELECTED
    : FunnelPhase.PAYWALL_SELECTING;
  emitPaymentFunnelTransition(
    {
      step: "awaiting_payment_entered",
      fromState,
      toState: FunnelPhase.AWAITING_PAYMENT,
      reason: source,
      userId,
      paymentId,
      paymentRef,
      packageKey,
      hadPackageSelected,
    },
    TelemetryEvents.AWAITING_PAYMENT_ENTERED,
  );
}

/**
 * @param {object} o
 * @param {string} o.userId
 * @param {string|number|null} [o.paymentId]
 * @param {string|null} [o.paymentRef]
 * @param {string|null} [o.packageKey]
 * @param {string} [o.semanticKey]
 * @param {string} [o.replyType]
 */
export function emitPaymentQrBundleSent({
  userId,
  paymentId,
  paymentRef,
  packageKey,
  semanticKey,
  replyType,
}) {
  emitPaymentFunnelTransition(
    {
      step: "qr_bundle_sent",
      fromState: FunnelPhase.SLIP_PHASE,
      toState: FunnelPhase.QR_DELIVERED,
      reason: "gateway_payment_qr_bundle",
      userId,
      paymentId,
      paymentRef,
      packageKey,
      semanticKey,
      replyType,
    },
    TelemetryEvents.PAYMENT_QR_BUNDLE_SENT,
  );
}

/**
 * @param {object} o
 * @param {string} o.userId
 * @param {string|number|null} [o.paymentId]
 * @param {string|null} [o.paymentRef]
 * @param {string|null} [o.packageKey]
 * @param {string} o.source
 */
export function emitSlipPhaseEntered({
  userId,
  paymentId,
  paymentRef,
  packageKey,
  source,
}) {
  emitPaymentFunnelTransition(
    {
      step: "slip_phase_entered",
      fromState: FunnelPhase.AWAITING_PAYMENT,
      toState: FunnelPhase.SLIP_PHASE,
      reason: source,
      userId,
      paymentId,
      paymentRef,
      packageKey,
    },
    TelemetryEvents.SLIP_PHASE_ENTERED,
  );
}

/**
 * Slip stored; DB row moves to pending_verify.
 */
export function emitPendingVerifyEntered({
  userId,
  paymentId,
  paymentRef,
  packageKey,
  reason,
}) {
  emitPaymentFunnelTransition(
    {
      step: "pending_verify_entered",
      fromState: FunnelPhase.AWAITING_PAYMENT,
      toState: FunnelPhase.PENDING_VERIFY,
      reason,
      userId,
      paymentId,
      paymentRef,
      packageKey,
    },
    TelemetryEvents.PENDING_VERIFY_ENTERED,
  );
}

export function emitPaymentApprovedFunnel({
  userId,
  paymentId,
  paymentRef,
  packageKey,
  reason = "admin_approve",
}) {
  emitPaymentFunnelTransition(
    {
      step: "payment_approved",
      fromState: FunnelPhase.PENDING_VERIFY,
      toState: FunnelPhase.PAID,
      reason,
      userId,
      paymentId,
      paymentRef,
      packageKey,
    },
    TelemetryEvents.PAYMENT_APPROVED_FUNNEL,
  );
}

export function emitPaymentRejectedFunnel({
  userId,
  paymentId,
  paymentRef,
  packageKey,
  reason = "admin_reject",
}) {
  emitPaymentFunnelTransition(
    {
      step: "payment_rejected",
      fromState: FunnelPhase.PENDING_VERIFY,
      toState: FunnelPhase.REJECTED,
      reason,
      userId,
      paymentId,
      paymentRef,
      packageKey,
    },
    TelemetryEvents.PAYMENT_REJECTED_FUNNEL,
  );
}
