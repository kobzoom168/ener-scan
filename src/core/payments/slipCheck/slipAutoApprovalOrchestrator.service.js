import { env } from "../../../config/env.js";
import { extractSlipOcrFromImage } from "./slipOcrExtractor.service.js";
import { evaluateSlipAutoApproval } from "./slipAutoApproval.service.js";
import { isSlipokConfigured, verifySlipWithSlipok } from "./slipokVerify.service.js";
import { isEasyslipConfigured, verifySlipWithEasyslip } from "./easyslipVerify.service.js";
import { loadActiveScanOffer } from "../../../services/scanOffer.loader.js";
import { findActivePackageByPriceThb } from "../../../services/scanOffer.packages.js";
import { switchPendingPaymentPackage } from "../../../stores/payments.db.js";

/** Pick the configured bank-verification provider (EasySlip preferred). */
function resolveBankSlipVerifier() {
  if (isEasyslipConfigured()) return { provider: "easyslip", verify: verifySlipWithEasyslip };
  if (isSlipokConfigured()) return { provider: "slipok", verify: verifySlipWithSlipok };
  return null;
}

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
 *   matched?: Record<string, boolean>,
 *   switchedPackage?: {
 *     fromPackageCode: string|null,
 *     key: string,
 *     label: string,
 *     priceThb: number,
 *     scanCount: number,
 *     windowHours: number
 *   }|null
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

  // Primary: bank verification (EasySlip or SlipOK, when configured). "verified"
  // maps the bank's own numbers into the evaluate() shape; "invalid" = the slip
  // is not a real/usable transaction → straight to manual review; "error"
  // (network/auth/quota) falls back to the internal OCR path below.
  const bankVerifier = resolveBankSlipVerifier();
  if (bankVerifier) {
    const expectedAmount =
      Number(payment?.expected_amount ?? payment?.amount) || null;
    const sv = await bankVerifier.verify({
      imageBuffer,
      lineUserId: userId,
      paymentId,
      expectedAmount,
    });
    if (sv.outcome === "verified") {
      provider = bankVerifier.provider;
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
      const rawCode = String(sv.failCode || "invalid");
      const reason = rawCode.startsWith(bankVerifier.provider)
        ? rawCode
        : `${bankVerifier.provider}_${rawCode}`;
      await updatePaymentFields(paymentId, {
        slip_verify_provider: bankVerifier.provider,
        slip_verify_status: "manual_review",
        slip_review_reason: reason,
        manual_review_at: now.toISOString(),
      });
      console.log(
        JSON.stringify({
          event: "SLIP_MANUAL_REVIEW_REQUIRED",
          paymentId,
          lineUserIdPrefix: String(userId || "").slice(0, 8),
          reasons: [reason],
          providerMessage: sv.failMessage || null,
        }),
      );
      return {
        mode: "manual_review",
        ocrResult: null,
        reasons: [reason],
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

  // ยอดโอนไม่ตรงแพ็กที่เลือก แต่ทุกอย่างอื่นผ่านหมด และยอดตรงราคาแพ็กอื่นเป๊ะ
  // → สลับแพ็กของ payment ให้ตามเงินจริง แล้วประเมินใหม่ ไม่ตีกลับลูกค้า (กติกา กบ:
  // ลูกค้ากด 49 แต่โอน 149 = อยากได้แพ็ก 149 จัดให้เลยพร้อมบอกว่าปรับให้แล้ว)
  let switchedPackage = null;
  if (
    result.decision !== "would_auto_approve" &&
    result.reasons.length === 1 &&
    result.reasons[0] === "amount_mismatch"
  ) {
    try {
      const offer = loadActiveScanOffer(now);
      const matched = findActivePackageByPriceThb(offer, ocrResult.amount);
      const expectedAmount = Number(payment?.expected_amount ?? payment?.amount);
      if (matched && Number(matched.priceThb) !== expectedAmount) {
        const applied = await switchPendingPaymentPackage({ paymentId, pkg: matched });
        if (applied) {
          const patchedPayment = {
            ...payment,
            package_code: matched.key,
            package_name: matched.label,
            amount: matched.priceThb,
            expected_amount: matched.priceThb,
            unlock_hours: matched.windowHours,
          };
          result = await evaluate({ payment: patchedPayment, ocrResult, now });
          if (result.decision === "would_auto_approve") {
            switchedPackage = {
              fromPackageCode: String(payment?.package_code || "") || null,
              key: matched.key,
              label: matched.label,
              priceThb: Number(matched.priceThb),
              scanCount: Number(matched.scanCount),
              windowHours: Number(matched.windowHours),
            };
          }
          console.log(
            JSON.stringify({
              event: "SLIP_PACKAGE_AUTO_SWITCHED",
              paymentId,
              lineUserIdPrefix: String(userId || "").slice(0, 8),
              fromPackageCode: String(payment?.package_code || "") || null,
              toPackageKey: matched.key,
              slipAmount: Number(ocrResult.amount),
              secondDecision: result.decision,
            }),
          );
        }
      }
    } catch (swErr) {
      // fail-open: สลับไม่สำเร็จก็เข้าคิว admin ตามปกติ
      console.error(
        JSON.stringify({
          event: "SLIP_PACKAGE_AUTO_SWITCH_FAILED",
          paymentId,
          lineUserIdPrefix: String(userId || "").slice(0, 8),
          message: String(swErr?.message || swErr).slice(0, 160),
        }),
      );
    }
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
      switchedPackage,
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
      switchedPackage,
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
    switchedPackage,
  };
}
