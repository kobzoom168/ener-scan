function toGbReferenceNo(paymentId) {
  // GB Prime Pay referenceNo has a max length of 15 characters.
  // We derive a deterministic 15-char value from our internal paymentId.
  return String(paymentId || "")
    .replace(/-/g, "")
    .slice(0, 15);
}

async function createQrCashWithGbPrimePay({
  amountTHB,
  paymentId,
  token,
  qrcashUrl,
}) {
  const referenceNo = toGbReferenceNo(paymentId);
  const amount = Number(amountTHB);
  if (!referenceNo) throw new Error("gb_reference_no_empty");
  if (!Number.isFinite(amount)) throw new Error("gb_amount_invalid");
  if (!token) throw new Error("gb_token_missing");

  const body = new URLSearchParams();
  body.set("token", String(token));
  body.set("referenceNo", referenceNo);
  body.set("amount", amount.toFixed(2));

  const res = await fetch(qrcashUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`gb_qrcash_failed_${res.status}_${text.slice(0, 200)}`);
  }

  const qrArrayBuffer = await res.arrayBuffer();
  const qrBase64 = Buffer.from(qrArrayBuffer).toString("base64");

  // GB Prime Pay returns these as response headers.
  const resultCode = res.headers.get("resultCode") || res.headers.get("resultcode");
  const gbpReferenceNo =
    res.headers.get("gbpReferenceNo") ||
    res.headers.get("gbpReferenceno");

  return {
    referenceNo,
    resultCode: resultCode || null,
    gbpReferenceNo: gbpReferenceNo || null,
    qrBase64,
  };
}

export async function createGbPrimePayPromptPayQr({
  paymentId,
  amountTHB,
}) {
  const token = process.env.GBPRIMEPAY_TOKEN;
  const qrcashUrl =
    process.env.GBPRIMEPAY_QRCASH_URL ||
    "https://api.globalprimepay.com/v3/qrcode";

  return createQrCashWithGbPrimePay({
    paymentId,
    amountTHB,
    token,
    qrcashUrl,
  });
}

