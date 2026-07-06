import { env } from "../../../config/env.js";
import { extractSlipOcrFromImage } from "./slipOcrExtractor.service.js";
import { evaluateSlipAutoApproval } from "./slipAutoApproval.service.js";
import { isSlipokConfigured, verifySlipWithSlipok } from "./slipokVerify.service.js";

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.paymentId
 * @param {Buffer} p.imageBuffer
 * @param {Record<string, unknown>} p.payment
 * @param {(paymentId: string, patch: Record<string, unknown>) => Promise<unknown>} p.updatePaymentFields
 * @param {(args: { payment: Record<string, unknown>, ocrResult: Record<string, unknown>, now: Date }) => Promise<{decision: string, reasons: string[], matched: Record<string, boolean>} >} [p.evaluate]
 * @param {(args: { imageBuffer: Buffer, lineUserId: string, paymentId: string }) => Promise<Record<string, unknown>>} [p.extract]
 * @returns {Promise<{
 *   mode: "dry_run_would_auto_approve"|"manual_review"|"auto_approved",
 *   ocrResult: Record<string, unknown>|null,
 *   reasons: string[],
 *   matched?: Record<string, boolean>
 * }>}
 */
export async function runSlipAutoApprovalAfterGateAccept({
  userId,
  paymentId,
  imageBuffer,
  payment,
  updatePaymentFields,
  evaluate = evaluateSlipAutoApproval,
  extract = extractSlipOcrFromImage,
}) {
  const now = new Date();
  let provider = "internal_vision";
  let ocrResult = null;

  // Primary: SlipOK bank verification (when configured). "verified" maps the
  // bank's own numbers into the evaluate() shape; "invalid" = bank says the
  // transaction is not real/usable → straight to manual review; "error"
  // (network/auth/quota) falls back to the internal OCR path below.
  if (isSlipokConfigured()) {
    const sv = await verifySlipWithSlipok({
      imageBuffer,
      lineUserId: userId,
      paymentId,
    });
    if (sv.outcome === "verified") {
      provider = "slipok";
      ocrResult = {
        amount: sv.amount,
        confidence: 1,
        slipRef: sv.transRef,
        transferredAtIso: sv.transferredAtIso,
        receiverName: sv.receiverName,
        receiverAccountLast4: sv.receiverAccountLast4,
        receiverPromptPay: sv.receiverPromptPay,
        senderName: sv.senderName,
        bankName: sv.bankName,
        rawText: null,
      };
    } else if (sv.outcome === "invalid") {
      await updatePaymentFields(paymentId, {
        slip_verify_provider: "slipok",
        slip_verify_status: "manual_review",
        slip_review_reason: `slipok_${sv.failCode || "invalid"}`,
        manual_review_at: now.toISOString(),
      });
      console.log(
        JSON.stringify({
          event: "SLIP_MANUAL_REVIEW_REQUIRED",
          paymentId,
          lineUserIdPrefix: String(userId || "").slice(0, 8),
          reasons: [`slipok_${sv.failCode || "invalid"}`],
          slipokMessage: sv.failMessage || null,
        }),
      );
      return {
        mode: "manual_review",
        ocrResult: null,
        reasons: [`slipok_${sv.failCode || "invalid"}`],
      };
    }
    // outcome === "error" → fall through to OCR
  }

  const basePatch = {
    slip_verify_provider: provider,
  };
  if (!ocrResult) {
    try {
      ocrResult = await extract({
        imageBuffer,
        lineUserId: userId,
        paymentId,
      });
    } catch (err) {
      await updatePaymentFields(paymentId, {
        ...basePatch,
        slip_verify_status: "manual_review",
        slip_review_reason:
          String(err?.message || "").includes("ocr_json_parse_failed")
            ? "ocr_json_parse_failed"
            : "ocr_failed",
        manual_review_at: now.toISOString(),
      });
      console.log(
        JSON.stringify({
          event: "SLIP_AUTO_APPROVE_VALIDATION_FAILED",
          paymentId,
          lineUserIdPrefix: String(userId || "").slice(0, 8),
          reason: String(err?.message || err).slice(0, 120),
        }),
      );
      return { mode: "manual_review", ocrResult: null, reasons: ["ocr_failed"] };
    }
  }

  const ocrPatch = {
    ...basePatch,
    slip_ref: ocrResult.slipRef ?? null,
    slip_amount: ocrResult.amount ?? null,
    slip_transferred_at: ocrResult.transferredAtIso ?? null,
    slip_receiver_name: ocrResult.receiverName ?? null,
    slip_receiver_account_last4: ocrResult.receiverAccountLast4 ?? null,
    slip_receiver_promptpay: ocrResult.receiverPromptPay ?? null,
    slip_sender_name: ocrResult.senderName ?? null,
    slip_bank_name: ocrResult.bankName ?? null,
    slip_ocr_confidence: ocrResult.confidence ?? null,
    slip_ocr_raw_text: ocrResult.rawText || null,
  };

  let result;
  try {
    result = await evaluate({
      payment,
      ocrResult,
      now,
    });
  } catch (err) {
    await updatePaymentFields(paymentId, {
      ...ocrPatch,
      slip_verify_status: "manual_review",
      slip_review_reason: "validation_failed",
      manual_review_at: now.toISOString(),
    });
    console.log(
      JSON.stringify({
        event: "SLIP_AUTO_APPROVE_VALIDATION_FAILED",
        paymentId,
        lineUserIdPrefix: String(userId || "").slice(0, 8),
        reason: String(err?.message || err).slice(0, 140),
      }),
    );
    return {
      mode: "manual_review",
      ocrResult,
      reasons: ["validation_failed"],
    };
  }

  if (result.decision !== "would_auto_approve") {
    await updatePaymentFields(paymentId, {
      ...ocrPatch,
      slip_verify_status: "manual_review",
      slip_review_reason: result.reasons.join(","),
      manual_review_at: now.toISOString(),
    });
    console.log(
      JSON.stringify({
        event: "SLIP_AUTO_APPROVE_DRY_RUN_FAIL",
        paymentId,
        lineUserIdPrefix: String(userId || "").slice(0, 8),
        reasons: result.reasons,
      }),
    );
    console.log(
      JSON.stringify({
        event: "SLIP_MANUAL_REVIEW_REQUIRED",
        paymentId,
        lineUserIdPrefix: String(userId || "").slice(0, 8),
        reasons: result.reasons,
      }),
    );
    return {
      mode: "manual_review",
      ocrResult,
      reasons: result.reasons,
      matched: result.matched,
    };
  }

  if (!env.SLIP_AUTO_APPROVE_ENABLED || env.SLIP_AUTO_APPROVE_DRY_RUN) {
    await updatePaymentFields(paymentId, {
      ...ocrPatch,
      slip_verify_status: "dry_run_would_auto_approve",
      slip_review_reason: null,
    });
    console.log(
      JSON.stringify({
        event: "SLIP_AUTO_APPROVE_DRY_RUN_PASS",
        paymentId,
        lineUserIdPrefix: String(userId || "").slice(0, 8),
      }),
    );
    return {
      mode: "dry_run_would_auto_approve",
      ocrResult,
      reasons: [],
      matched: result.matched,
    };
  }

  await updatePaymentFields(paymentId, {
    ...ocrPatch,
    slip_verify_status: "auto_approved",
    slip_review_reason: null,
    auto_approved_at: now.toISOString(),
  });
  console.log(
    JSON.stringify({
      event: "SLIP_AUTO_APPROVED",
      paymentId,
      lineUserIdPrefix: String(userId || "").slice(0, 8),
    }),
  );
  return {
    mode: "auto_approved",
    ocrResult,
    reasons: [],
    matched: result.matched,
  };
}
