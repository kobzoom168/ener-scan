import { env } from "../../../config/env.js";
import { supabase } from "../../../config/supabase.js";

const APPROVABLE_PAYMENT_STATUSES = new Set([
  "awaiting_payment",
  "awaiting_slip",
  "pending_verify",
]);

/**
 * @param {string|null|undefined} v
 * @returns {string}
 */
function norm(v) {
  return String(v || "").trim();
}

/**
 * @param {number|null|undefined} v
 * @returns {number|null}
 */
function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * @param {object} p
 * @param {string} p.currentPaymentId
 * @param {string} p.slipRef
 * @returns {Promise<boolean>}
 */
export async function isDuplicateSlipRefAcrossPayments({
  currentPaymentId,
  slipRef,
}) {
  const ref = norm(slipRef);
  if (!ref) return false;
  const id = norm(currentPaymentId);
  const { data, error } = await supabase
    .from("payments")
    .select("id")
    .eq("slip_ref", ref)
    .neq("id", id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

/**
 * @param {object} p
 * @param {Record<string, unknown>} p.payment
 * @param {Record<string, unknown>} p.ocrResult
 * @param {Date} [p.now]
 * @param {(args: { currentPaymentId: string, slipRef: string }) => Promise<boolean>} [p.checkDuplicateSlipRef]
 * @returns {Promise<{
 * decision: "would_auto_approve" | "manual_review_required",
 * reasons: string[],
 * matched: {
 *   amount: boolean,
 *   receiver: boolean,
 *   time: boolean,
 *   slipRef: boolean,
 *   paymentState: boolean,
 *   confidence: boolean
 * }
 * }>}
 */
export async function evaluateSlipAutoApproval({
  payment,
  ocrResult,
  now = new Date(),
  checkDuplicateSlipRef = isDuplicateSlipRefAcrossPayments,
}) {
  /** @type {string[]} */
  const reasons = [];
  const paymentId = norm(payment?.id);
  const status = norm(payment?.status).toLowerCase();
  const paymentCreatedAtMs = Date.parse(norm(payment?.created_at));
  const expectedAmount =
    n(payment?.expected_amount) ?? n(payment?.amount) ?? null;
  const amount = n(ocrResult?.amount);
  const confidence = n(ocrResult?.confidence) ?? 0;
  const slipRef = norm(ocrResult?.slipRef);
  const transferredAtIso = norm(ocrResult?.transferredAtIso);
  const transferredAtMs = Date.parse(transferredAtIso);
  const receiverName = norm(ocrResult?.receiverName).toLowerCase();
  const receiverLast4 = norm(ocrResult?.receiverAccountLast4).replace(/\D+/g, "");
  const receiverPromptPay = norm(ocrResult?.receiverPromptPay).replace(/\D+/g, "");
  const cfgReceiverName = norm(env.SLIP_RECEIVER_NAME).toLowerCase();
  const cfgReceiverLast4 = norm(env.SLIP_RECEIVER_ACCOUNT_LAST4).replace(/\D+/g, "");
  const cfgReceiverPromptPay = norm(env.SLIP_RECEIVER_PROMPTPAY).replace(/\D+/g, "");

  const paymentState = Boolean(paymentId) && APPROVABLE_PAYMENT_STATUSES.has(status);
  if (!paymentState) reasons.push("payment_state_not_approvable");

  const amountMatched =
    amount != null &&
    expectedAmount != null &&
    Math.abs(amount - expectedAmount) <= env.SLIP_AMOUNT_TOLERANCE;
  if (amount == null) reasons.push("missing_amount");
  else if (!amountMatched) reasons.push("amount_mismatch");

  let receiverMatched = false;
  if (cfgReceiverLast4 && receiverLast4 && cfgReceiverLast4 === receiverLast4) {
    receiverMatched = true;
  }
  if (
    !receiverMatched &&
    cfgReceiverPromptPay &&
    receiverPromptPay &&
    cfgReceiverPromptPay === receiverPromptPay
  ) {
    receiverMatched = true;
  }
  if (
    !receiverMatched &&
    cfgReceiverName &&
    receiverName &&
    receiverName.includes(cfgReceiverName)
  ) {
    receiverMatched = true;
  }
  if (!receiverMatched) {
    reasons.push(
      cfgReceiverLast4 || cfgReceiverPromptPay || cfgReceiverName
        ? "receiver_mismatch"
        : "missing_receiver",
    );
  }

  const confidenceMatched = confidence >= env.SLIP_OCR_MIN_CONFIDENCE;
  if (!confidenceMatched) reasons.push("low_confidence");

  const timeMatched =
    transferredAtIso &&
    Number.isFinite(transferredAtMs) &&
    Number.isFinite(paymentCreatedAtMs) &&
    transferredAtMs >= paymentCreatedAtMs &&
    now.getTime() - transferredAtMs <= env.SLIP_AUTO_APPROVE_MAX_AGE_HOURS * 60 * 60 * 1000;
  if (!transferredAtIso) reasons.push("invalid_transfer_time");
  else if (!Number.isFinite(transferredAtMs)) reasons.push("invalid_transfer_time");
  else if (!Number.isFinite(paymentCreatedAtMs)) reasons.push("payment_created_at_invalid");
  else if (transferredAtMs < paymentCreatedAtMs) reasons.push("transfer_before_payment_created");
  else if (
    now.getTime() - transferredAtMs >
    env.SLIP_AUTO_APPROVE_MAX_AGE_HOURS * 60 * 60 * 1000
  ) {
    reasons.push("transfer_too_old");
  }

  let slipRefMatched = Boolean(slipRef);
  if (!slipRef) {
    reasons.push("missing_slip_ref");
  } else {
    const dup = await checkDuplicateSlipRef({
      currentPaymentId: paymentId,
      slipRef,
    });
    if (dup) {
      slipRefMatched = false;
      reasons.push("duplicate_slip_ref");
    }
  }

  const decision =
    reasons.length === 0 ? "would_auto_approve" : "manual_review_required";
  return {
    decision,
    reasons,
    matched: {
      amount: amountMatched,
      receiver: receiverMatched,
      time: Boolean(timeMatched),
      slipRef: slipRefMatched,
      paymentState,
      confidence: confidenceMatched,
    },
  };
}
