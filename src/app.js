import express from "express";
import line from "@line/bot-sdk";
import path from "path";

import { env } from "./config/env.js";
import { supabase } from "./config/supabase.js";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import { saveBirthdate } from "./stores/userProfile.db.js";
import { checkScanAccess } from "./services/paymentAccess.service.js";
import { markPaymentSucceededAndExtendEntitlement } from "./stores/payments.db.js";
import { createPaymentPending } from "./stores/payments.db.js";
import { getAppUserByLineUserId } from "./stores/users.db.js";
import { createGbPrimePayPromptPayQr } from "./services/gbPrimePay.service.js";

process.on("uncaughtException", (error) => {
  console.error("[FATAL] uncaughtException", {
    message: error?.message,
    stack: error?.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] unhandledRejection", {
    reason,
  });
});

const app = express();

const lineConfig = {
  channelAccessToken: env.CHANNEL_ACCESS_TOKEN,
  channelSecret: env.CHANNEL_SECRET,
};

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.send("Ener Scan API running");
});

// Serve static PromptPay QR for manual payments.
// URL: /payment/promptpay-qr.jpg
app.use(
  "/payment",
  express.static(path.join(process.cwd(), "src", "payment"))
);

app.get("/debug/payment-access/:lineUserId", async (req, res) => {
  const lineUserId = String(req.params?.lineUserId || "").trim();
  console.log("[DEBUG] /debug/payment-access", { lineUserId });

  try {
    const access = await checkScanAccess({ userId: lineUserId });
    res.json({ ok: true, access });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
  }
});

app.post(
  "/webhook/line",
  line.middleware(lineConfig),
  lineWebhookRouter(lineConfig)
);

app.post("/webhook/payment", express.json(), async (req, res) => {
  const payload = req.body || {};
  const paymentIdDirect =
    payload?.paymentId || payload?.payment_id || payload?.payment?.id || null;

  const gbpReferenceNo =
    payload?.gbpReferenceNo ||
    payload?.gbp_reference_no ||
    payload?.gbpReference ||
    payload?.txn?.gbpReferenceNo ||
    payload?.txn?.gbpReference;

  const referenceNo =
    payload?.referenceNo ||
    payload?.reference_no ||
    payload?.reference ||
    payload?.txn?.referenceNo ||
    payload?.txn?.reference;

  let paymentId = paymentIdDirect;

  console.log("[PAYMENT_WEBHOOK] received", {
    paymentId,
    hasPaymentId: Boolean(paymentIdDirect),
    hasProviderRefs: Boolean(gbpReferenceNo || referenceNo),
  });

  try {
    let mappedPaymentId = null;

    // GB webhook mapping: prefer gbpReferenceNo -> provider_payment_id, then referenceNo -> provider_reference_no
    if (gbpReferenceNo || referenceNo) {
      if (gbpReferenceNo) {
        const { data, error } = await supabase
          .from("payments")
          .select("id")
          .eq("provider_payment_id", gbpReferenceNo)
          .maybeSingle();

        if (error) throw error;
        mappedPaymentId = data?.id || null;
      }

      if (!mappedPaymentId && referenceNo) {
        const { data, error } = await supabase
          .from("payments")
          .select("id")
          .eq("provider_reference_no", referenceNo)
          .maybeSingle();

        if (error) throw error;
        mappedPaymentId = data?.id || null;
      }

      if (mappedPaymentId) paymentId = mappedPaymentId;

      console.log("[GB_WEBHOOK_MAP]", {
        referenceNo,
        gbpReferenceNo,
        mappedPaymentId,
        usedInternalPaymentId: Boolean(paymentId),
      });
    }

    if (!paymentId) throw new Error("paymentId_missing_in_payload");

    await markPaymentSucceededAndExtendEntitlement({
      paymentId,
      verifiedBy: "payment_webhook",
    });

    console.log("[PAYMENT_WEBHOOK] success", { paymentId });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[PAYMENT_WEBHOOK] failed", {
      paymentId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    res.status(500).json({ ok: false, message: error?.message || "payment_webhook_failed" });
  }
});

app.post("/payments/create", express.json(), async (req, res) => {
  const lineUserId = req.body?.lineUserId;

  console.log("[PAYMENTS_CREATE] received", { lineUserId });

  try {
    if (!lineUserId) {
      res.status(400).json({ ok: false, message: "lineUserId_missing" });
      return;
    }

    const appUser = await getAppUserByLineUserId(lineUserId);
    if (!appUser?.id) {
      res.status(404).json({ ok: false, message: "user_not_found" });
      return;
    }

    const paymentId = await createPaymentPending({
      appUserId: appUser.id,
      amount: 49,
      currency: "THB",
    });

    // Create GB Prime Pay PromptPay QR exactly once per internal payment row.
    console.log("[GB_CREATE_START]", { lineUserId, paymentId, amountTHB: 49 });

    let qr = null;
    try {
      qr = await createGbPrimePayPromptPayQr({ paymentId, amountTHB: 49 });
    } catch (err) {
      console.error("[GB_CREATE_ERROR]", {
        lineUserId,
        paymentId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        // Intentionally keep a raw error dump for faster diagnosis
        raw: err,
      });
      throw err;
    }

    console.log("[GB_CREATE_RESPONSE]", {
      paymentId,
      referenceNo: qr?.referenceNo || null,
      gbpReferenceNo: qr?.gbpReferenceNo || null,
      resultCode: qr?.resultCode || null,
      hasQrBase64: Boolean(qr?.qrBase64),
      qrBase64Length: typeof qr?.qrBase64 === "string" ? qr.qrBase64.length : 0,
    });

    const updatePayload = {
      provider_payment_id: qr?.gbpReferenceNo || null,
      provider_reference_no: qr?.referenceNo || null,
      qr_base64: qr?.qrBase64 || null,
    };

    console.log("[GB_DB_UPDATE_ATTEMPT]", {
      paymentId,
      provider_payment_id: updatePayload.provider_payment_id,
      provider_reference_no: updatePayload.provider_reference_no,
      hasQrBase64: Boolean(updatePayload.qr_base64),
    });

    const { data: updatedPayment, error: updateError } = await supabase
      .from("payments")
      .update(updatePayload)
      .eq("id", paymentId)
      .select(
        "id, provider_payment_id, provider_reference_no, qr_base64, updated_at"
      )
      .maybeSingle();

    console.log("[GB_DB_UPDATE_RESULT]", {
      paymentId,
      ok: !updateError,
      errorMessage: updateError?.message || null,
      hasRow: Boolean(updatedPayment?.id),
      provider_payment_id: updatedPayment?.provider_payment_id || null,
      provider_reference_no: updatedPayment?.provider_reference_no || null,
      qrBase64Length:
        typeof updatedPayment?.qr_base64 === "string"
          ? updatedPayment.qr_base64.length
          : 0,
    });

    const paymentUrl = `https://ener-scan-production.up.railway.app/payments/mock/${paymentId}`;

    console.log("[PAYMENTS_CREATE] success", { lineUserId, paymentId });
    res.status(200).json({ ok: true, paymentId, paymentUrl });
  } catch (error) {
    console.error("[PAYMENTS_CREATE] failed", {
      lineUserId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    res.status(500).json({
      ok: false,
      message: "payment_create_failed",
    });
  }
});

app.get("/payments/mock/:paymentId", async (req, res) => {
  const paymentId = String(req.params?.paymentId || "").trim();

  const { data: payment, error } = await supabase
    .from("payments")
    .select("amount, qr_base64")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) throw error;

  const qrImgBase64 = payment?.qr_base64 || null;
  console.log("[GB_RENDER]", {
    paymentId,
    hasQrBase64: Boolean(qrImgBase64),
    amount: payment?.amount ?? null,
  });

  const qrImgTag = qrImgBase64
    ? `<img alt="GB Prime Pay QR" src="data:image/png;base64,${qrImgBase64}" style="width:260px;height:260px;margin:16px 0;border-radius:12px;"/>`
    : `<p><i>ไม่สามารถสร้าง QR ได้ตอนนี้</i></p>`;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Ener Scan Mock Payment</title>
  </head>
  <body style="font-family: Arial, sans-serif; max-width: 720px; margin: 24px auto;">
    <h2>Mock Payment</h2>
    <p><b>paymentId:</b> ${paymentId}</p>
    ${qrImgTag}
    <p>สำหรับ MVP ตอนนี้ คุณสามารถยืนยันการชำระเงินด้วยการเรียก endpoint:</p>
    <pre style="background: #f6f6f6; padding: 12px; border-radius: 8px;">curl -X POST http://localhost:3000/webhook/payment \\
-H "Content-Type: application/json" \\
-d '{"paymentId":"${paymentId}"}'</pre>
    <p><i>หมายเหตุ:</i> เปลี่ยน host/port ให้ตรงกับ environment ที่คุณทดสอบ</p>
  </body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_server_error" });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Ener Scan API listening on port ${port}`);
});