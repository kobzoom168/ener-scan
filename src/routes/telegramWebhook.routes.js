/**
 * Telegram webhook — รับเฉพาะ callback_query ของปุ่มอนุมัติสลิป (งาน 3, กบ 23 ก.ย. 2026)
 *
 * ความปลอดภัย (ทุกข้อบังคับ ไม่มีทางลัด):
 *  - **POST เท่านั้น** ไม่มีลิงก์ GET ที่กดแล้วเปลี่ยนสถานะ
 *  - ตรวจ `X-Telegram-Bot-Api-Secret-Token` ทุกครั้ง (ตั้งตอน setWebhook) เทียบแบบ timing-safe
 *  - ตรวจ Telegram user id ของผู้กด + chat id ซ้ำในชั้น service ทุกครั้ง
 *  - ไม่รับข้อความ/คำสั่งตัวอักษร (เช่นพิมพ์ว่า "อนุมัติ") — ไม่มี AI ตีความ
 *  - ไม่ log token/secret/ข้อมูลส่วนตัว
 *  - ปิดอยู่โดยค่าเริ่มต้น: ไม่มี config ครบ = ตอบ 404 เหมือนไม่มี endpoint
 */
import { Router } from "express";
import crypto from "node:crypto";

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * @param {object} [deps] — ฉีดได้เพื่อทดสอบ (ไม่แตะ network/DB จริง)
 */
export default function createTelegramWebhookRouter(deps = {}) {
  const router = Router();

  router.post("/telegram/webhook", async (req, res) => {
    const svc = deps.service ?? (await import("../services/payments/telegramSlipApproval.service.js"));
    const cfg = deps.config ?? svc.readTelegramApprovalConfig();
    // ปิดอยู่ = ทำเหมือนไม่มี endpoint นี้
    if (!cfg) return res.status(404).json({ ok: false });

    if (!timingSafeEqual(req.get("x-telegram-bot-api-secret-token"), cfg.webhookSecret)) {
      console.warn(JSON.stringify({ event: "TELEGRAM_WEBHOOK_BAD_SECRET" }));
      return res.status(401).json({ ok: false });
    }

    const cb = req.body?.callback_query;
    // รับเฉพาะปุ่ม — อัปเดตชนิดอื่น (ข้อความ/รูป/คำสั่ง) ไม่ทำอะไรเลย
    if (!cb) return res.status(200).json({ ok: true, ignored: true });

    let out;
    try {
      out = await svc.handleApprovalCallback(cb, deps.handlerDeps ?? (await buildRuntimeDeps()));
    } catch (e) {
      console.error(JSON.stringify({
        event: "TELEGRAM_WEBHOOK_HANDLER_ERROR",
        reason: String(e?.message || e).slice(0, 160),
      }));
      out = { action: "error", result: "error", text: "ระบบขัดข้อง ยังไม่ได้เปลี่ยนสถานะรายการ" };
    }

    // ตอบ Telegram เสมอ (ไม่งั้นปุ่มจะค้างหมุน) — ล้มก็ไม่ทำให้ webhook พัง
    try {
      await (deps.answer ?? defaultAnswer)(cfg, cb, out);
    } catch (e) {
      console.error(JSON.stringify({
        event: "TELEGRAM_WEBHOOK_ANSWER_FAILED",
        reason: String(e?.description || e?.message || e).slice(0, 160),
      }));
    }
    return res.status(200).json({ ok: true });
  });

  return router;
}

/** ตอบกลับ Telegram: popup สั้น + แก้ปุ่มในข้อความเดิมให้ตรงสถานะล่าสุด */
async function defaultAnswer(cfg, cb, out) {
  const api = `https://api.telegram.org/bot${cfg.token}`;
  await fetch(`${api}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      callback_query_id: cb.id,
      text: String(out.text || "").slice(0, 190),
      show_alert: out.result !== "ok",
    }),
  });
  const chatId = cb?.message?.chat?.id;
  const messageId = cb?.message?.message_id;
  if (chatId == null || messageId == null) return;
  // ขั้นขอยืนยัน = ส่งข้อความใหม่พร้อมปุ่มยืนยัน · ขั้นอื่น = ปลดปุ่มออกจากข้อความเดิม
  if (out.action === "request" && out.result === "ok" && out.replyMarkup) {
    await fetch(`${api}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId, text: out.text,
        reply_to_message_id: messageId, reply_markup: out.replyMarkup,
      }),
    });
    return;
  }
  await fetch(`${api}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: out.text, reply_to_message_id: messageId }),
  });
}

/** deps จริงตอนรันใน production — ใช้ service เดิมทั้งหมด ไม่มีทางลัดเติมโควตา */
async function buildRuntimeDeps() {
  const [{ supabase }, payments, enqueue] = await Promise.all([
    import("../config/supabase.js"),
    import("../stores/payments.db.js"),
    import("../services/scanV2/outboundAdminEnqueue.service.js"),
  ]);
  return {
    db: supabase,
    async loadPayment(paymentId) {
      const { data, error } = await supabase
        .from("payments")
        .select("id,status,package_code,package_name,expected_amount,payment_ref,line_user_id")
        .eq("id", paymentId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        paymentId: data.id,
        status: data.status,
        packageCode: data.package_code,
        packageName: data.package_name,
        expectedAmount: data.expected_amount != null ? Number(data.expected_amount) : null,
        paymentRef: data.payment_ref,
        lineUserId: data.line_user_id,
      };
    },
    // ← approval service เดิม แต่ตอนนี้เป็น transaction เดียว (ดู sql/062)
    // ส่ง expect เข้าไปให้ตรวจ "ยอด/แพ็ก/สถานะ" ณ จุด commit จริง ไม่ใช่ตรวจใน handler แล้วอ่านใหม่
    async approvePayment({ paymentId, approvedBy, expect }) {
      return payments.markPaymentApprovedAndUnlock({
        paymentId, approvedBy, expect, channel: "telegram",
      });
    },
    async notifyCustomer({ activation, paymentId }) {
      const { buildPaymentApprovedText } = await import("../utils/webhookText.util.js");
      const text = await buildPaymentApprovedText({
        paidRemainingScans: activation.paidRemainingScans,
        paidUntil: activation.paidUntil,
        paymentRef: null,
        lineUserId: activation.lineUserId,
        paidPlanCode: activation.paidPlanCode,
      });
      return enqueue.enqueueApproveNotify({
        lineUserId: activation.lineUserId, paymentId, text,
      });
    },
  };
}
