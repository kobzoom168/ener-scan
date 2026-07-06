/**
 * EasySlip (easyslip.com) — bank-verified slip checking, API v2.
 * POST https://api.easyslip.com/v2/verify/bank
 *   Authorization: Bearer <token>, multipart: image=<file>,
 *   checkDuplicate=true, matchAmount=<expected>, matchAccount=true.
 *
 * Normalized result (same shape as slipokVerify):
 *   { outcome: "verified" | "invalid" | "error", transRef, amount,
 *     transferredAtIso, receiverName, receiverAccountLast4, receiverPromptPay,
 *     senderName, bankName, failCode, failMessage, raw }
 */
import { env } from "../../../config/env.js";

export function isEasyslipConfigured() {
  return Boolean(env.EASYSLIP_ENABLED && env.EASYSLIP_API_KEY);
}

function digitsLast4(v) {
  const d = String(v || "").replace(/\D+/g, "");
  return d.length >= 4 ? d.slice(-4) : d || null;
}

/**
 * @param {{ imageBuffer: Buffer, lineUserId?: string, paymentId?: string, expectedAmount?: number|null }} p
 */
export async function verifySlipWithEasyslip({ imageBuffer, lineUserId, paymentId, expectedAmount = null }) {
  const url = env.EASYSLIP_API_BASE;

  const form = new FormData();
  form.append("image", new Blob([imageBuffer], { type: "image/jpeg" }), "slip.jpg");
  // NOTE: no checkDuplicate — EasySlip counts every submission, so a legit
  // resend of the same slip for the SAME payment (our auto re-verify loop)
  // would be flagged. Cross-payment reuse is already blocked by our own
  // duplicate_slip_ref check (excludes the current payment).
  // matchAccount: EasySlip validates the receiver against the bank accounts
  // registered in their dashboard — much more reliable than masked-name matching.
  form.append("matchAccount", "true");
  if (Number.isFinite(Number(expectedAmount)) && Number(expectedAmount) > 0) {
    form.append("matchAmount", String(Number(expectedAmount)));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), env.EASYSLIP_TIMEOUT_MS);

  let resp = null;
  let json = null;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.EASYSLIP_API_KEY}` },
      body: form,
      signal: ctrl.signal,
    });
    json = await resp.json().catch(() => null);
  } catch (e) {
    clearTimeout(timer);
    console.error(
      JSON.stringify({
        event: "EASYSLIP_REQUEST_FAILED",
        paymentIdPrefix: String(paymentId || "").slice(0, 8),
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return { outcome: "error", failCode: "network", failMessage: String(e?.message || e).slice(0, 160) };
  }
  clearTimeout(timer);

  const data = json?.data || null;
  const ok = resp.status === 200 && json?.success === true && data;

  console.log(
    JSON.stringify({
      event: "EASYSLIP_RESPONSE",
      paymentIdPrefix: String(paymentId || "").slice(0, 8),
      lineUserIdPrefix: String(lineUserId || "").slice(0, 8),
      httpStatus: resp.status,
      success: Boolean(ok),
      isDuplicate: data?.isDuplicate ?? null,
      isAmountMatched: data?.isAmountMatched ?? null,
      hasMatchedAccount: data?.matchedAccount != null,
      failMessage: !ok && json?.message ? String(json.message).slice(0, 140) : null,
    }),
  );

  if (ok) {
    // Bank confirmed the transaction exists — now their extra checks:
    if (expectedAmount != null && data.isAmountMatched === false) {
      return { outcome: "invalid", failCode: "easyslip_amount_mismatch", failMessage: "amount mismatch", raw: data };
    }
    const raw = data.rawSlip || {};
    const receiverMatched = data.matchedAccount != null;
    return {
      outcome: "verified",
      transRef: String(raw.transRef || "").trim() || null,
      amount: Number(raw.amount?.amount ?? data.amountInSlip) || null,
      transferredAtIso: String(raw.date || "").trim() || null,
      receiverName:
        String(raw.receiver?.account?.name?.th || raw.receiver?.account?.name?.en || "").trim() || null,
      // matchedAccount != null means EasySlip confirmed it's OUR registered
      // account — feed the configured last4 so evaluate()'s receiver check passes.
      receiverAccountLast4: receiverMatched
        ? String(env.SLIP_RECEIVER_ACCOUNT_LAST4 || "").trim() || digitsLast4(raw.receiver?.account?.bank?.account)
        : digitsLast4(raw.receiver?.account?.bank?.account),
      receiverPromptPay: digitsLast4(raw.receiver?.account?.proxy?.account),
      senderName:
        String(raw.sender?.account?.name?.th || raw.sender?.account?.name?.en || "").trim() || null,
      bankName: String(raw.sender?.bank?.short || raw.sender?.bank?.name || "").trim() || null,
      raw: data,
    };
  }

  // Failure mapping. Real error shape (observed live):
  //   { "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
  //   invalid (→ manual review): SLIP_NOT_FOUND (no such transaction / no QR —
  //   conservative: a human looks at it, fakes never auto-pass).
  //   error (→ fallback to OCR): auth/quota/validation/pending-bank/image-format.
  const errCode = String(json?.error?.code || json?.message || "").toUpperCase();
  const errMessage = String(json?.error?.message || json?.message || "").slice(0, 200) || null;
  const FALLBACK_CODES = new Set([
    "INVALID_API_KEY", "UNAUTHORIZED", "QUOTA_EXCEEDED", "VALIDATION_ERROR",
    "SLIP_PENDING", "IMAGE_SIZE_TOO_LARGE", "INVALID_IMAGE_FORMAT", "APPLICATION_EXPIRED",
  ]);
  const outcome =
    resp.status === 401 || resp.status === 403 || FALLBACK_CODES.has(errCode)
      ? "error"
      : "invalid";
  return {
    outcome,
    failCode: errCode ? errCode.toLowerCase() : `http_${resp.status}`,
    failMessage: errMessage,
    raw: json,
  };
}
