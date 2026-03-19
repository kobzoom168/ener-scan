import express from "express";
import line from "@line/bot-sdk";

import { env } from "./config/env.js";
import { supabase } from "./config/supabase.js";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import { saveBirthdate } from "./stores/userProfile.db.js";
import { checkScanAccess } from "./services/paymentAccess.service.js";
import { markPaymentSucceededAndExtendEntitlement } from "./stores/payments.db.js";

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
  const paymentId =
    payload?.paymentId || payload?.payment_id || payload?.payment?.id || null;

  console.log("[PAYMENT_WEBHOOK] received", {
    paymentId,
    hasPaymentId: Boolean(paymentId),
  });

  try {
    if (!paymentId) {
      throw new Error("paymentId_missing_in_payload");
    }

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

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_server_error" });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Ener Scan API listening on port ${port}`);
});