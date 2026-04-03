/**
 * Awaiting-payment slip images: validate before pending_verify (slip path only).
 * No Phase-1 here — callers must not gate these replies on Gemini `handled`.
 *
 * @module slipImageValidation.service
 */

import { evaluateSlipGate } from "../../core/payments/slipCheck/slipGate.service.js";
import { checkSingleObject } from "../objectCheck.service.js";

function bufferToBase64(buffer) {
  return Buffer.isBuffer(buffer)
    ? buffer.toString("base64")
    : Buffer.from(buffer).toString("base64");
}

/** User-facing copy when image is not accepted as a transfer slip (gateway primary). */
export function buildSlipNotTransferReceiptText() {
  return [
    "ภาพนี้ยังไม่ใช่สลิปการโอนนะครับ",
    "ถ้าจะส่งหลักฐานการชำระ รบกวนส่งภาพสลิปโอนเงินหรือหน้ารายการโอนที่เห็นยอดและเวลาให้ชัดอีกครั้งครับ",
  ].join("\n");
}

export function logSlipImageValidationStart(payload) {
  console.log(
    JSON.stringify({
      event: "SLIP_IMAGE_VALIDATION_START",
      userId: payload.userId ?? null,
      paymentId: payload.paymentId ?? null,
      messageId: payload.messageId ?? null,
      flowState: payload.flowState ?? null,
    }),
  );
}

export function logSlipImageValidationResult(payload) {
  console.log(
    JSON.stringify({
      event: "SLIP_IMAGE_VALIDATION_RESULT",
      userId: payload.userId ?? null,
      paymentId: payload.paymentId ?? null,
      messageId: payload.messageId ?? null,
      flowState: payload.flowState ?? null,
      validationResult: payload.validationResult ?? null,
      slipLabel: payload.slipLabel ?? null,
      rejectReason: payload.rejectReason ?? null,
      confidence: payload.confidence ?? null,
      objectCheckResult: payload.objectCheckResult ?? null,
    }),
  );
}

export function logSlipImageRejectedNotASlip(payload) {
  console.log(
    JSON.stringify({
      event: "SLIP_IMAGE_REJECTED_NOT_A_SLIP",
      userId: payload.userId ?? null,
      paymentId: payload.paymentId ?? null,
      messageId: payload.messageId ?? null,
      flowState: payload.flowState ?? null,
      validationResult: payload.validationResult ?? null,
      slipLabel: payload.slipLabel ?? null,
      rejectReason: payload.rejectReason ?? null,
      confidence: payload.confidence ?? null,
      objectCheckResult: payload.objectCheckResult ?? null,
    }),
  );
}

export function logSlipImageAccepted(payload) {
  console.log(
    JSON.stringify({
      event: "SLIP_IMAGE_ACCEPTED",
      userId: payload.userId ?? null,
      paymentId: payload.paymentId ?? null,
      messageId: payload.messageId ?? null,
      flowState: payload.flowState ?? null,
      slipLabel: payload.slipLabel ?? null,
      confidence: payload.confidence ?? null,
      objectCheckResult: payload.objectCheckResult ?? null,
    }),
  );
}

export function logSlipPendingVerifyRouted(payload) {
  console.log(
    JSON.stringify({
      event: "SLIP_PENDING_VERIFY_ROUTED",
      userId: payload.userId ?? null,
      paymentId: payload.paymentId ?? null,
      messageId: payload.messageId ?? null,
      flowState: payload.flowState ?? null,
    }),
  );
}

/**
 * @param {object} ctx
 * @param {Buffer} ctx.imageBuffer
 * @param {string} ctx.userId
 * @param {string|number} ctx.paymentId
 * @param {string|null} [ctx.messageId]
 * @param {string} [ctx.flowState]
 * @param {object} [options]
 * @param {typeof evaluateSlipGate} [options.runSlipGate]
 * @param {typeof checkSingleObject} [options.runObjectCheck]
 * @param {(buf: Buffer) => string} [options.toBase64ForCheck]
 * @param {Parameters<typeof evaluateSlipGate>[1]} [options.slipGateOptions]
 * @returns {Promise<{ proceed: boolean, gate: import('../../core/payments/slipCheck/slipCheck.types.js').SlipGateResult, objectCheckResult?: string, rejectKind?: string }>}
 */
export async function evaluateAwaitingPaymentSlipImage(ctx, options = {}) {
  const userId = String(ctx.userId || "").trim();
  const paymentId = ctx.paymentId != null ? String(ctx.paymentId) : "";
  const messageId = ctx.messageId != null ? String(ctx.messageId) : null;
  const flowState = String(ctx.flowState || "awaiting_payment").trim();
  const imageBuffer = ctx.imageBuffer;

  const runGate =
    typeof options.runSlipGate === "function"
      ? options.runSlipGate
      : (c, o) => evaluateSlipGate(c, o ?? {});
  const runObjectCheck =
    typeof options.runObjectCheck === "function"
      ? options.runObjectCheck
      : (b64) =>
          checkSingleObject(b64, {
            messageId: messageId ?? null,
            path: "slip_validation_object_guard",
          });
  const b64 =
    typeof options.toBase64ForCheck === "function"
      ? options.toBase64ForCheck(imageBuffer)
      : bufferToBase64(imageBuffer);

  logSlipImageValidationStart({
    userId,
    paymentId,
    messageId,
    flowState,
  });

  const gate = await runGate(
    {
      imageBuffer,
      lineUserId: userId,
      paymentId,
      stateOwner: "awaiting_slip",
    },
    options.slipGateOptions ?? {},
  );

  logSlipImageValidationResult({
    userId,
    paymentId,
    messageId,
    flowState,
    validationResult: gate.decision,
    slipLabel: gate.slipLabel ?? null,
    rejectReason: gate.rejectReason ?? null,
    confidence:
      gate.slipEvidenceScore != null ? Number(gate.slipEvidenceScore) : null,
    objectCheckResult: null,
  });

  if (gate.decision === "reject") {
    logSlipImageRejectedNotASlip({
      userId,
      paymentId,
      messageId,
      flowState,
      validationResult: "slip_gate_reject",
      slipLabel: gate.slipLabel ?? null,
      rejectReason: gate.rejectReason ?? null,
      confidence:
        gate.slipEvidenceScore != null ? Number(gate.slipEvidenceScore) : null,
      objectCheckResult: null,
    });
    return { proceed: false, gate, rejectKind: "slip_gate_reject" };
  }

  if (gate.decision !== "accept") {
    logSlipImageRejectedNotASlip({
      userId,
      paymentId,
      messageId,
      flowState,
      validationResult: "slip_gate_unclear",
      slipLabel: gate.slipLabel ?? null,
      rejectReason: gate.rejectReason ?? null,
      confidence:
        gate.slipEvidenceScore != null ? Number(gate.slipEvidenceScore) : null,
      objectCheckResult: null,
    });
    return { proceed: false, gate, rejectKind: "slip_gate_unclear" };
  }

  let objectCheckResult;
  try {
    objectCheckResult = await runObjectCheck(b64);
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "SLIP_OBJECT_GUARD_CHECK_FAILED",
        userId,
        paymentId,
        messageId,
        message: e?.message,
      }),
    );
    objectCheckResult = "unclear";
  }

  logSlipImageValidationResult({
    userId,
    paymentId,
    messageId,
    flowState,
    validationResult: "post_gate_object_check",
    slipLabel: gate.slipLabel ?? null,
    rejectReason: null,
    confidence:
      gate.slipEvidenceScore != null ? Number(gate.slipEvidenceScore) : null,
    objectCheckResult: String(objectCheckResult || ""),
  });

  if (objectCheckResult === "single_supported") {
    logSlipImageRejectedNotASlip({
      userId,
      paymentId,
      messageId,
      flowState,
      validationResult: "sacred_object_not_slip",
      slipLabel: gate.slipLabel ?? null,
      rejectReason: "object_check_single_supported",
      confidence:
        gate.slipEvidenceScore != null ? Number(gate.slipEvidenceScore) : null,
      objectCheckResult: String(objectCheckResult),
    });
    return {
      proceed: false,
      gate,
      objectCheckResult: String(objectCheckResult),
      rejectKind: "sacred_object_not_slip",
    };
  }

  logSlipImageAccepted({
    userId,
    paymentId,
    messageId,
    flowState,
    slipLabel: gate.slipLabel ?? null,
    confidence:
      gate.slipEvidenceScore != null ? Number(gate.slipEvidenceScore) : null,
    objectCheckResult: String(objectCheckResult || ""),
  });

  return {
    proceed: true,
    gate,
    objectCheckResult: String(objectCheckResult || ""),
  };
}
