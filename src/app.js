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
import {
  getPaymentsPendingVerifyForAdmin,
  markPaymentApprovedAndUnlock,
  markPaymentRejected,
} from "./stores/payments.db.js";

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

// Needed for admin approve/reject POST from basic HTML forms.
app.use(express.urlencoded({ extended: false }));

const lineConfig = {
  channelAccessToken: env.CHANNEL_ACCESS_TOKEN,
  channelSecret: env.CHANNEL_SECRET,
};

const lineClient = new line.Client(lineConfig);

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

function requireAdmin(req, res, next) {
  const token =
    req.headers["x-admin-token"] ||
    req.query?.token ||
    req.body?.token ||
    null;

  if (!env.ADMIN_TOKEN) {
    res.status(500).send("ADMIN_TOKEN not configured");
    return;
  }

  if (!token || String(token) !== String(env.ADMIN_TOKEN)) {
    res.status(401).send("unauthorized");
    return;
  }

  next();
}

app.get("/admin/payments", requireAdmin, async (req, res) => {
  try {
    const payments = await getPaymentsPendingVerifyForAdmin({ limit: 100 });

    const escapeHtml = (s) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const rowsHtml = payments
      .map((p) => {
        const slipPreview =
          p.slip_url ? `<a href="${escapeHtml(p.slip_url)}" target="_blank">ดูสลิป</a>` : "<i>ไม่มีรูปสลิป</i>";

        return `
          <tr>
            <td>${escapeHtml(p.id)}</td>
            <td>${escapeHtml(p.line_user_id || "")}</td>
            <td>${escapeHtml(p.package_code || "")}</td>
            <td>${escapeHtml(p.package_name || "")}</td>
            <td>${escapeHtml(p.expected_amount ?? "")}</td>
            <td>${slipPreview}</td>
            <td>${new Date(p.created_at).toLocaleString("th-TH")}</td>
            <td>
              <form method="POST" action="/admin/payments/${encodeURIComponent(p.id)}/approve?token=${encodeURIComponent(String(env.ADMIN_TOKEN))}">
                <button type="submit" style="padding:6px 12px;margin-right:8px;">Approve</button>
              </form>
              <form method="POST" action="/admin/payments/${encodeURIComponent(p.id)}/reject?token=${encodeURIComponent(String(env.ADMIN_TOKEN))}">
                <button type="submit" style="padding:6px 12px;">Reject</button>
              </form>
            </td>
          </tr>
        `;
      })
      .join("");

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Admin - Pending Payments</title>
  </head>
  <body style="font-family: Arial, sans-serif; max-width: 980px; margin: 24px auto;">
    <h2>Pending Payment Verify</h2>
    <p>รายการรอแอดมินตรวจสอบ: <b>${payments.length}</b></p>
    <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th>paymentId</th>
          <th>line_user_id</th>
          <th>package_code</th>
          <th>package_name</th>
          <th>expected_amount</th>
          <th>slip</th>
          <th>created_at</th>
          <th>actions</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="8"><i>ไม่มีรายการ pending</i></td></tr>`}
      </tbody>
    </table>
  </body>
</html>`;

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (err) {
    console.error("[ADMIN] GET /admin/payments failed:", {
      message: err?.message,
      code: err?.code,
    });
    res.status(500).send("admin_list_failed");
  }
});

app.get("/admin/payments/:id", requireAdmin, async (req, res) => {
  const paymentId = String(req.params?.id || "").trim();
  if (!paymentId) {
    res.status(400).json({ ok: false, message: "paymentId_missing" });
    return;
  }

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ ok: false, message: error?.message });
    return;
  }

  res.status(200).json({ ok: true, payment: data });
});

app.post("/admin/payments/:id/approve", requireAdmin, async (req, res) => {
  const paymentId = String(req.params?.id || "").trim();
  const approvedBy = "admin";

  if (!paymentId) {
    res.status(400).send("paymentId_missing");
    return;
  }

  try {
    const activation = await markPaymentApprovedAndUnlock({ paymentId, approvedBy });
    if (!activation?.lineUserId) throw new Error("activation_missing_lineUserId");

    const paidUntilDate = activation.paidUntil ? new Date(activation.paidUntil) : null;
    const paidUntilText = paidUntilDate
      ? paidUntilDate.toLocaleDateString("th-TH")
      : "ภายใน 24 ชั่วโมง";

    const paidRemainingText =
      Number(activation.paidRemainingScans) >= 999999
        ? "สแกนได้ไม่จำกัดช่วงที่สิทธิ์ใช้งานอยู่"
        : `สแกนได้อีก ${activation.paidRemainingScans} ครั้ง`;

    const message =
      `ชำระเงินสำเร็จแล้ว ระบบเปิดสิทธิ์ให้เรียบร้อยครับ\n\n` +
      `${paidRemainingText}\n` +
      `หมดอายุ: ${paidUntilText}\n\n` +
      `กรุณาส่งรูปสแกนอีกครั้งได้เลยครับ`;

    await lineClient.pushMessage(activation.lineUserId, {
      type: "text",
      text: message,
    });

    res.status(200).send("ok");
  } catch (err) {
    console.error("[ADMIN] approve failed:", {
      paymentId,
      message: err?.message,
      code: err?.code,
      hint: err?.hint,
    });
    res.status(409).send(err?.message || "approve_failed");
  }
});

app.post("/admin/payments/:id/reject", requireAdmin, async (req, res) => {
  const paymentId = String(req.params?.id || "").trim();
  const rejectReason = req.body?.reject_reason || req.body?.reason || null;
  const approvedBy = "admin";

  if (!paymentId) {
    res.status(400).send("paymentId_missing");
    return;
  }

  try {
    // Fetch payment details first so we can re-create a fresh awaiting_payment row.
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("id,user_id,line_user_id,package_code,package_name,expected_amount,status")
      .eq("id", paymentId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!payment) throw new Error("payment_not_found");

    await markPaymentRejected({
      paymentId,
      rejectReason,
      approvedBy,
    });

    // Create a new awaiting_payment so the user can upload a new slip.
    await createPaymentPending({
      appUserId: payment.user_id,
      amount: Number(payment.expected_amount) || env.PAYMENT_UNLOCK_AMOUNT_THB || 99,
      currency: env.PAYMENT_UNLOCK_CURRENCY || "THB",
      packageCode: payment.package_code,
      packageName: payment.package_name,
      expectedAmount: payment.expected_amount,
    });

    if (payment.line_user_id) {
      const message =
        "ไม่พบการชำระเงินที่ตรงกับรายการนี้ครับ กรุณาส่งสลิปใหม่อีกครั้งในแชทนี้ แล้วแอดมินจะตรวจสอบให้ครับ";

      await lineClient.pushMessage(payment.line_user_id, {
        type: "text",
        text: message,
      });
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("[ADMIN] reject failed:", {
      paymentId,
      message: err?.message,
      code: err?.code,
      hint: err?.hint,
    });
    res.status(409).send(err?.message || "reject_failed");
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

app.post("/payments/webhook", express.json(), async (req, res) => {
  const payload = req.body || {};

  const paymentIdDirect =
    payload?.paymentId ||
    payload?.payment_id ||
    payload?.payment?.id ||
    null;

  const gbpReferenceNo =
    payload?.gbpReferenceNo ||
    payload?.gbp_reference_no ||
    payload?.gbpReference ||
    payload?.txn?.gbpReferenceNo ||
    payload?.txn?.gbpReference ||
    null;

  const referenceNo =
    payload?.referenceNo ||
    payload?.reference_no ||
    payload?.reference ||
    payload?.txn?.referenceNo ||
    payload?.txn?.reference ||
    null;

  const lineUserId = String(payload?.lineUserId || payload?.line_user_id || "").trim() || null;
  const verifiedBy =
    payload?.verifiedBy || payload?.verified_by || "payment_webhook";

  const verified =
    payload?.verified === true ||
    payload?.status === "succeeded" ||
    payload?.success === true ||
    payload?.event === "payment_succeeded";

  console.log("[PAYMENT_WEBHOOK] received", {
    paymentId: paymentIdDirect,
    verified,
    hasProviderRefs: Boolean(gbpReferenceNo || referenceNo),
    lineUserId,
  });

  try {
    if (!verified) throw new Error("payment_not_verified");
    console.log("[PAYMENT_WEBHOOK] verified", { verifiedBy, paymentId: paymentIdDirect });

    let paymentId = paymentIdDirect;

    // Map GB provider refs to internal payment row (when paymentId is not provided).
    if (!paymentId && (gbpReferenceNo || referenceNo)) {
      if (gbpReferenceNo) {
        const { data, error } = await supabase
          .from("payments")
          .select("id")
          .eq("provider_payment_id", gbpReferenceNo)
          .maybeSingle();
        if (error) throw error;
        paymentId = data?.id || null;
      }

      if (!paymentId && referenceNo) {
        const { data, error } = await supabase
          .from("payments")
          .select("id")
          .eq("provider_reference_no", referenceNo)
          .maybeSingle();
        if (error) throw error;
        paymentId = data?.id || null;
      }
    }

    // If we still don't have an internal payment row, create one (succeeded) using lineUserId.
    if (!paymentId) {
      if (!lineUserId) throw new Error("paymentId_missing_and_lineUserId_missing");

      const appUser = await getAppUserByLineUserId(lineUserId);
      if (!appUser?.id) throw new Error("appUser_not_found_for_lineUserId");

      const nowIso = new Date().toISOString();
      const unlockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("payments")
        .insert({
          user_id: appUser.id,
          provider: "payment_webhook",
          amount: 99,
          currency: "THB",
          status: "succeeded",
          paid_at: nowIso,
          unlock_hours: 24,
          unlocked_until: unlockedUntil,
          verified_by: verifiedBy,
        })
        .select("id")
        .maybeSingle();

      if (error) throw error;
      paymentId = data?.id || null;
    }

    if (!paymentId) throw new Error("paymentId_missing_after_mapping");

    const activation = await markPaymentSucceededAndExtendEntitlement({
      paymentId,
      verifiedBy,
    });

    console.log("[PAYMENT_WEBHOOK] user mapped", {
      paymentId,
      lineUserId: activation?.lineUserId || null,
    });

    console.log("[PAYMENT_WEBHOOK] package activated", {
      paymentId,
      paidUntil: activation?.paidUntil || null,
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[PAYMENT_WEBHOOK] failed", {
      paymentId: paymentIdDirect,
      lineUserId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    res.status(500).json({ ok: false, message: error?.message || "payments_webhook_failed" });
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
      amount: 99,
      currency: "THB",
    });

    // Create GB Prime Pay PromptPay QR exactly once per internal payment row.
    console.log("[GB_CREATE_START]", { lineUserId, paymentId, amountTHB: 99 });

    let qr = null;
    try {
      qr = await createGbPrimePayPromptPayQr({ paymentId, amountTHB: 99 });
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