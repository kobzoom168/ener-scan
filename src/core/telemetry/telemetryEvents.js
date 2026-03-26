export const TelemetryEvents = {
  ACTIVE_STATE_ROUTING: "ACTIVE_STATE_ROUTING",
  STATE_CONFLICT_RESOLVED: "STATE_CONFLICT_RESOLVED",
  STATE_MICRO_INTENT: "STATE_MICRO_INTENT",
  SAFE_INTENT_CONSUMED: "SAFE_INTENT_CONSUMED",
  STATE_GUIDANCE_LEVEL: "STATE_GUIDANCE_LEVEL",
  CONV_AI_REQUESTED: "CONV_AI_REQUESTED",
  CONV_AI_SKIPPED: "CONV_AI_SKIPPED",
  CONV_AI_VALIDATED: "CONV_AI_VALIDATED",
  CONV_AI_REJECTED: "CONV_AI_REJECTED",
  CONV_AI_FALLBACK: "CONV_AI_FALLBACK",
  CONV_COST: "CONV_COST",
  EDGE_GATE_ACTION: "EDGE_GATE_ACTION",
  DUPLICATE_SUPPRESSED: "DUPLICATE_SUPPRESSED",
  NONSCAN_REPLY_SENT: "NONSCAN_REPLY_SENT",
  /** Deterministic routing / UX fallback (e.g. conv AI rejected). */
  STATE_FALLBACK_REASON: "STATE_FALLBACK_REASON",
  STATE_NO_PROGRESS_STREAK: "STATE_NO_PROGRESS_STREAK",
  NONSCAN_REPLY_GATEWAY_PAYMENT_QR: "NONSCAN_REPLY_GATEWAY_PAYMENT_QR",
  NONSCAN_GATEWAY_PUSH: "NONSCAN_GATEWAY_PUSH",
  /** replyText/pushText outside gateway is OK only inside an exempt block; `reason` identifies path. */
  NONSCAN_AUDIT_EXEMPT: "NONSCAN_AUDIT_EXEMPT",
  PACKAGE_SELECTED_ENTERED: "package_selected_entered",
  PACKAGE_SELECTED_CLEARED: "package_selected_cleared",
  AWAITING_PAYMENT_ENTERED: "awaiting_payment_entered",
  PAYMENT_QR_BUNDLE_SENT: "payment_qr_bundle_sent",
  SLIP_PHASE_ENTERED: "slip_phase_entered",
  /** Canonical payment funnel / UX phase change (see docs/payment-funnel-telemetry.md). */
  PAYMENT_FUNNEL_TRANSITION: "PAYMENT_FUNNEL_TRANSITION",
  PENDING_VERIFY_ENTERED: "pending_verify_entered",
  PAYMENT_APPROVED_FUNNEL: "payment_approved_funnel",
  PAYMENT_REJECTED_FUNNEL: "payment_rejected_funnel",
  /** Payment slip classification gate (awaiting_slip image). */
  SLIP_CHECK_REQUESTED: "SLIP_CHECK_REQUESTED",
  SLIP_CHECK_ACCEPTED: "SLIP_CHECK_ACCEPTED",
  SLIP_CHECK_REJECTED: "SLIP_CHECK_REJECTED",
  SLIP_CHECK_UNCLEAR: "SLIP_CHECK_UNCLEAR",
  /** Canonical per-evaluation slip gate outcome (label, scores, mode, decision). */
  SLIP_CHECK_RESOLVED: "SLIP_CHECK_RESOLVED",
};

/**
 * @param {string} event
 * @param {Record<string, unknown>} payload
 */
export function logTelemetryEvent(event, payload = {}) {
  console.log(JSON.stringify({ event, ...payload }));
}
