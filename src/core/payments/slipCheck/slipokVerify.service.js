/**
 * SlipOK (slipok.com) — bank-verified slip checking.
 * Reads the slip's mini-QR transaction ref and checks it against the bank, so a
 * "verified" result means the transfer really happened (fakes can't pass).
 *
 * POST {SLIPOK_API_BASE}/{branchId}  header x-authorization: <api key>
 * multipart: files=<image>, log=true
 *
 * Normalized result:
 *   { outcome: "verified" | "invalid" | "error",
 *     transRef, amount, transferredAtIso, receiverName, receiverAccountLast4,
 *     receiverPromptPay, senderName, bankName, failCode, failMessage, raw }
 * outcome meanings: verified = bank confirmed; invalid = bank/SlipOK says the
 * slip is not a usable real transaction (definitive reject → manual review);
 * error = SlipOK unreachable/misconfigured (caller falls back to OCR).
 */
import { env } from "../../../config/env.js";

export function isSlipokConfigured() {
  return Boolean(env.SLIPOK_ENABLED && env.SLIPOK_API_KEY && env.SLIPOK_BRANCH_ID);
}

function digitsLast4(v) {
  const d = String(v || "").replace(/\D+/g, "");
  return d.length >= 4 ? d.slice(-4) : d;
}

function buildTransferredAtIso(data) {
  // transDate "20260706" (or "2026-07-06"), transTime "10:23:45" — Bangkok time.
  const rawDate = String(data?.transDate || "").replace(/\D+/g, "");
  const time = /^\d{2}:\d{2}(:\d{2})?$/.test(String(data?.transTime || ""))
    ? String(data.transTime).length === 5
      ? `${data.transTime}:00`
      : String(data.transTime)
    : null;
  if (rawDate.length !== 8 || !time) {
    // some responses carry a ready timestamp
    const ts = String(data?.transTimestamp || data?.transDateTime || "").trim();
    return ts || null;
  }
  return `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T${time}+07:00`;
}

/**
 * @param {{ imageBuffer: Buffer, lineUserId?: string, paymentId?: string }} p
 */
export async function verifySlipWithSlipok({ imageBuffer, lineUserId, paymentId }) {
  const base = env.SLIPOK_API_BASE.replace(/\/+$/, "");
  const url = `${base}/${encodeURIComponent(env.SLIPOK_BRANCH_ID)}`;

  const form = new FormData();
  form.append(
    "files",
    new Blob([imageBuffer], { type: "image/jpeg" }),
    "slip.jpg",
  );
  form.append("log", "true");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), env.SLIPOK_TIMEOUT_MS);

  let resp = null;
  let json = null;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "x-authorization": env.SLIPOK_API_KEY },
      body: form,
      signal: ctrl.signal,
    });
    json = await resp.json().catch(() => null);
  } catch (e) {
    clearTimeout(timer);
    console.error(
      JSON.stringify({
        event: "SLIPOK_REQUEST_FAILED",
        paymentIdPrefix: String(paymentId || "").slice(0, 8),
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return { outcome: "error", failCode: "network", failMessage: String(e?.message || e).slice(0, 160) };
  }
  clearTimeout(timer);

  const data = json?.data || null;
  const success = json?.success === true && data;

  console.log(
    JSON.stringify({
      event: "SLIPOK_RESPONSE",
      paymentIdPrefix: String(paymentId || "").slice(0, 8),
      lineUserIdPrefix: String(lineUserId || "").slice(0, 8),
      httpStatus: resp.status,
      success: Boolean(success),
      failCode: json?.code ?? null,
      failMessage: json?.message ? String(json.message).slice(0, 140) : null,
    }),
  );

  if (success) {
    return {
      outcome: "verified",
      transRef: String(data.transRef || data.transRefId || "").trim() || null,
      amount: Number(data.amount ?? data.paidAmount) || null,
      transferredAtIso: buildTransferredAtIso(data),
      receiverName:
        String(data.receiver?.displayName || data.receiver?.name || "").trim() || null,
      receiverAccountLast4:
        digitsLast4(data.receiver?.account?.value || data.receivingBankAccount) || null,
      receiverPromptPay: digitsLast4(data.receiver?.proxy?.value) || null,
      senderName:
        String(data.sender?.displayName || data.sender?.name || "").trim() || null,
      bankName: String(data.sendingBank || data.receivingBank || "").trim() || null,
      raw: data,
    };
  }

  // SlipOK/bank replied but says no — misconfig/auth/quota → "error" (fallback to
  // OCR); anything about the slip itself → definitive "invalid".
  const code = json?.code != null ? Number(json.code) : null;
  const CONFIG_CODES = new Set([1000, 1001, 1002, 1003, 1004, 1005]); // auth/branch/quota-type errors
  const outcome =
    resp.status === 401 || resp.status === 403 || (code != null && CONFIG_CODES.has(code))
      ? "error"
      : "invalid";
  return {
    outcome,
    failCode: code != null ? String(code) : `http_${resp.status}`,
    failMessage: json?.message ? String(json.message).slice(0, 200) : null,
    raw: json,
  };
}
