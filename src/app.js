import express from "express";
import line from "@line/bot-sdk";
import path from "path";

import { env } from "./config/env.js";
import { supabase } from "./config/supabase.js";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import { saveBirthdate } from "./stores/userProfile.db.js";
import { checkScanAccess } from "./services/paymentAccess.service.js";
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

console.log("[BUILD_INFO]", {
  version: "payment-slip-fix-v2",
  startedAt: new Date().toISOString(),
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.send("Ener Scan API running");
});

app.get("/version", (req, res) => {
  res.status(200).json({ ok: true, version: "payment-slip-fix-v2" });
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
  console.log("[ADMIN_PAYMENTS_HANDLER] start", {
    route: "GET /admin/payments",
    startedAt: new Date().toISOString(),
  });
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
      `แอดมินอนุมัติสลิปแล้ว ระบบเปิดสิทธิ์ให้เรียบร้อยครับ\n\n` +
      `${paidRemainingText}\n` +
      `หมดอายุ: ${paidUntilText}\n\n` +
      `กรุณาส่งรูปเพื่อสแกนต่อได้ครับ`;

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
    const { lineUserId } = await markPaymentRejected({
      paymentId,
      rejectReason,
      approvedBy,
    });

    if (lineUserId) {
      const message =
        "แอดมินปฏิเสธสลิปนี้ครับ — รายการชำระเงินเดิมจบแล้ว ระบบจะไม่ใช้สลิปนี้ต่อ\n\nกรุณาเริ่มขั้นตอนชำระเงินใหม่ด้วยตัวเอง:\n• สแกนรูปที่ต้องการสแกนอีกครั้ง (เมื่อบอทขอชำระเงิน) หรือ\n• พิมพ์ payment / จ่ายเงิน / ปลดล็อก เพื่อดู QR อีกครั้ง\n\nจากนั้นโอนตามยอดและส่งสลิปใหม่ในแชทนี้";

      await lineClient.pushMessage(lineUserId, {
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

function paymentGatewayDisabled(_req, res) {
  res.status(410).json({
    ok: false,
    message: "manual_payment_only_gateway_disabled",
  });
}

app.post("/webhook/payment", express.json(), paymentGatewayDisabled);
app.post("/payments/webhook", express.json(), paymentGatewayDisabled);
app.post("/payments/create", express.json(), paymentGatewayDisabled);
app.get("/payments/mock/:paymentId", paymentGatewayDisabled);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_server_error" });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Ener Scan API listening on port ${port}`);
});