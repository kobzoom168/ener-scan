/**
 * อนุมัติสลิปผ่าน Telegram (งาน 3 — กบ 23 ก.ย. 2026)
 *
 * เพิ่ม "ช่องทางอนุมัติ" ให้รายการที่ต้องตรวจด้วยคน (pending_verify) โดยไม่ต้องล็อกอินเว็บ
 * ช่องทาง LINE/admin เดิมยังทำงานเหมือนเดิมทุกประการ
 *
 * หลักการที่ยึด
 *  - **ไม่อนุมัติอัตโนมัติ** เพียงเพราะตรวจสลิปไม่ผ่าน — คนต้องกดยืนยันเสมอ
 *  - **ไม่ใช้ AI ตีความคำว่า "อนุมัติ"** — รับเฉพาะ callback ของปุ่มที่ระบบสร้างเอง
 *  - **ไม่มีลิงก์ GET ที่กดแล้วเปลี่ยนสถานะ** — Telegram callback_query มาทาง POST webhook
 *  - **ใช้ approval service เดิม** `markPaymentApprovedAndUnlock` (มี atomic claim
 *    pending_verify→paid อยู่แล้ว) — ไม่เขียนทางลัดเติมโควตา
 *  - ปุ่มยืนยันผูกกับ **token ฝั่ง server** มีอายุ ใช้ได้ครั้งเดียว และตรวจสิทธิ์/สถานะซ้ำตอนกด
 *  - ตรวจ **Telegram user id ของผู้กด + chat id** ทุกครั้ง — ไม่ยึด username และ
 *    ไม่ถือว่า "อยู่ในกลุ่ม" = มีสิทธิ์
 *  - ยอดไม่ตรงแพ็ก → คง manual review ห้ามอัปเกรดแพ็กเอง
 *  - รูปสลิปส่งเป็น "ไบต์" เข้า Telegram ไม่เปิดเป็น URL สาธารณะ และไม่ log token/ข้อมูลส่วนตัว
 *
 * ค่าเริ่มต้น: **ปิด** (`TELEGRAM_SLIP_APPROVAL_ENABLED` ไม่ตั้ง = false)
 * และต้องมีรายชื่อผู้อนุมัติ (`TELEGRAM_APPROVER_USER_IDS`) จึงจะทำงาน
 */
import crypto from "node:crypto";
import { supabase } from "../../config/supabase.js";

const CONFIRM_TTL_SECONDS = 10 * 60;
const TG_API = "https://api.telegram.org";

/* ─────────────────────────── config ─────────────────────────── */

function boolEnv(name) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** @returns {{token:string, chatId:string, approvers:Set<string>, webhookSecret:string}|null} */
export function readTelegramApprovalConfig() {
  if (!boolEnv("TELEGRAM_SLIP_APPROVAL_ENABLED")) return null;
  // No fallback to the shared alert bot.
  const token = String(process.env.TELEGRAM_APPROVAL_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_APPROVAL_CHAT_ID || "").trim();
  const webhookSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const approvers = new Set(
    String(process.env.TELEGRAM_APPROVER_USER_IDS || "")
      .split(",").map((s) => s.trim()).filter((s) => /^\d{3,20}$/.test(s)),
  );
  // ขาดอย่างใดอย่างหนึ่ง = ปิดไว้ ดีกว่าเปิดครึ่ง ๆ
  if (!token || !chatId || !webhookSecret || approvers.size === 0) return null;
  return { token, chatId, approvers, webhookSecret };
}

export function isTelegramSlipApprovalEnabled() {
  return readTelegramApprovalConfig() != null;
}

/* ─────────────────────────── audit ─────────────────────────── */

/** บันทึกทุกความพยายาม รวมที่ถูกปฏิเสธ — ห้ามใส่ token/ข้อมูลส่วนตัวลง detail */
export async function recordApprovalAudit(
  { paymentId = null, channel, actor = null, action, result, detail = {} },
  db = supabase,
) {
  try {
    await db.rpc("record_payment_approval_audit", {
      p_payment_id: paymentId,
      p_channel: channel,
      p_actor: actor,
      p_action: action,
      p_result: result,
      p_detail: detail,
    });
  } catch (e) {
    console.error(JSON.stringify({
      event: "PAYMENT_APPROVAL_AUDIT_WRITE_FAILED",
      action, result, reason: String(e?.message || e).slice(0, 120),
    }));
  }
}

/* ────────────────────── message building ────────────────────── */

/**
 * แยก "ข้อเท็จจริงที่ระบบยืนยันแล้ว" ออกจาก "ข้อมูลที่ลูกค้าแจ้ง/ยังไม่ยืนยัน"
 * @param {{paymentId:string, paymentRef?:string|null, packageName?:string|null,
 *   packageCode?:string|null, expectedAmount?:number|null, slipAmount?:number|null,
 *   reasons?:string[]|null, lineUserId?:string|null}} p
 */
export function buildPendingSlipMessage(p) {
  const expected = p.expectedAmount != null ? Number(p.expectedAmount) : null;
  const claimed = p.slipAmount != null ? Number(p.slipAmount) : null;
  const amountMatches = expected != null && claimed != null && Math.abs(expected - claimed) < 0.005;
  const reasons = (p.reasons || []).filter((r) => r != null && String(r).trim() !== "");
  const lines = [
    "[รอตรวจด้วยคน] สลิปชำระเงิน",
    "",
    "── ข้อเท็จจริงจากระบบ ──",
    `เลขรายการ: ${p.paymentRef || "-"}`,
    `paymentId: ${p.paymentId}`,
    `แพ็กที่สั่ง: ${p.packageName || p.packageCode || "-"}`,
    `ยอดที่ต้องชำระ: ${expected != null ? `${expected} บาท` : "-"}`,
    p.lineUserId ? `ผู้ใช้ LINE: ${String(p.lineUserId).slice(0, 8)}…` : null,
    "",
    "── ข้อมูลที่ยังไม่ยืนยัน (อ่านจากสลิป) ──",
    `ยอดที่อ่านได้จากสลิป: ${claimed != null ? `${claimed} บาท` : "อ่านไม่ได้"}`,
    expected != null && claimed != null
      ? (amountMatches ? "ยอดตรงกับแพ็ก" : "⚠ ยอดไม่ตรงกับแพ็ก — ต้องตรวจด้วยตา ระบบจะไม่เปลี่ยนแพ็กให้")
      : "⚠ เทียบยอดอัตโนมัติไม่ได้ — ต้องตรวจด้วยตา",
    "",
    "── เหตุผลที่ตรวจอัตโนมัติไม่ผ่าน ──",
    reasons.length ? reasons.map((r) => `• ${String(r).slice(0, 120)}`).join("\n") : "• (ไม่ระบุ)",
    "",
    "กดปุ่มด้านล่างเพื่อเริ่มขั้นตอนอนุมัติ (ยังไม่เปลี่ยนสถานะ)",
  ];
  return lines.filter((x) => x != null).join("\n").slice(0, 3900);
}

/** ข้อความยืนยันขั้นสุดท้าย — แสดงยอด/แพ็กให้ยืนยันอีกครั้งก่อน commit */
export function buildConfirmMessage({ paymentRef, packageName, expectedAmount, paymentId }) {
  return [
    "ยืนยันการอนุมัติ",
    "",
    `เลขรายการ: ${paymentRef || "-"}`,
    `paymentId: ${paymentId}`,
    `แพ็ก: ${packageName || "-"}`,
    `ยอด: ${expectedAmount != null ? `${expectedAmount} บาท` : "-"}`,
    "",
    "กด ยืนยันอนุมัติ เพื่อเติมสิทธิ์ให้ลูกค้า (ทำได้ครั้งเดียว)",
  ].join("\n");
}

/* ─────────────────────── telegram transport ─────────────────────── */

async function tgCall(cfg, method, body) {
  const res = await fetch(`${TG_API}/bot${cfg.token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) {
    const err = new Error(`telegram_${method}_failed`);
    // ห้าม log token — เก็บเฉพาะรหัส/คำอธิบายจาก Telegram
    // @ts-ignore
    err.description = String(json?.description || res.status).slice(0, 160);
    throw err;
  }
  return json.result;
}

/** ส่งรูปสลิปเป็นไบต์ (ไม่ใช้ URL สาธารณะ) — ไม่มีรูปก็ส่งข้อความล้วน */
async function tgSendSlip(cfg, { caption, photo, replyMarkup }) {
  if (!photo) {
    return tgCall(cfg, "sendMessage", {
      chat_id: cfg.chatId, text: caption,
      disable_web_page_preview: true, reply_markup: replyMarkup,
    });
  }
  const form = new FormData();
  form.append("chat_id", cfg.chatId);
  form.append("caption", caption.slice(0, 1000));
  form.append("reply_markup", JSON.stringify(replyMarkup));
  form.append("photo", new Blob([photo], { type: "image/jpeg" }), "slip.jpg");
  const res = await fetch(`${TG_API}/bot${cfg.token}/sendPhoto`, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) {
    const err = new Error("telegram_sendPhoto_failed");
    // @ts-ignore
    err.description = String(json?.description || res.status).slice(0, 160);
    throw err;
  }
  return json.result;
}


/**
 * อ่านไบต์ของสลิปจาก object storage เพื่อส่งเข้า Telegram โดยตรง
 * — ห้ามส่ง URL สาธารณะของสลิปออกไป และห้าม log path/URL
 * key ถูกถอดจาก slipUrl โดยตัด public base ทิ้ง (รูปแบบ `<uid>/<paymentId>/<messageId>.jpg`)
 */
export async function defaultLoadSlipBytes(p) {
  const url = String(p?.slipUrl || "").trim();
  if (!url) return null;
  const { env } = await import("../../config/env.js");
  const base = String(env.S3_SLIP_PUBLIC_BASE_URL || env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!base || !url.startsWith(`${base}/`)) return null;
  const key = url.slice(base.length + 1);
  if (!/^[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+\.jpg$/.test(key)) return null;
  const { readScanImageFromStorage } = await import("../../storage/scanUploadStorage.js");
  const buf = await readScanImageFromStorage(env.PAYMENT_SLIP_BUCKET || "payment-slips", key);
  return Buffer.isBuffer(buf) && buf.length ? buf : null;
}

/* ─────────────────────────── flow ─────────────────────────── */

/**
 * แจ้งเตือนรายการที่ต้องตรวจด้วยคน พร้อมปุ่ม "อนุมัติรายการนี้"
 * ห้าม throw — ช่องทาง LINE เดิมต้องไม่ถูกกระทบ
 */
export async function notifyTelegramSlipPendingVerify(p, deps = {}) {
  const cfg = deps.config ?? readTelegramApprovalConfig();
  if (!cfg) return { ok: false, reason: "disabled" };
  const paymentId = String(p.paymentId || "").trim();
  if (!paymentId) return { ok: false, reason: "no_payment_id" };
  try {
    const caption = buildPendingSlipMessage(p);
    const loadBytes = typeof deps.loadSlipBytes === "function" ? deps.loadSlipBytes : defaultLoadSlipBytes;
    const photo = await loadBytes(p).catch(() => null);
    await (deps.sendSlip ?? tgSendSlip)(cfg, {
      caption, photo,
      replyMarkup: { inline_keyboard: [[{ text: "อนุมัติรายการนี้", callback_data: `ap:${paymentId}` }]] },
    });
    await recordApprovalAudit({
      paymentId, channel: "telegram", action: "notify_sent", result: "ok",
      detail: { withPhoto: Boolean(photo) },
    }, deps.db ?? supabase);
    return { ok: true, withPhoto: Boolean(photo) };
  } catch (e) {
    console.error(JSON.stringify({
      event: "TELEGRAM_SLIP_NOTIFY_FAILED",
      paymentId, reason: String(e?.description || e?.message || e).slice(0, 160),
    }));
    return { ok: false, reason: "send_failed" };
  }
}

/** ตรวจสิทธิ์ทุกครั้ง: user id ต้องอยู่ในรายชื่อ และ chat id ต้องตรงห้องที่ตั้งไว้ */
export function authorizeCallback(cfg, cb) {
  const fromId = String(cb?.from?.id ?? "").trim();
  const chatId = String(cb?.message?.chat?.id ?? "").trim();
  if (!fromId || !cfg.approvers.has(fromId)) return { ok: false, reason: "actor_not_allowed", fromId };
  if (!chatId || chatId !== cfg.chatId) return { ok: false, reason: "chat_not_allowed", fromId };
  return { ok: true, fromId };
}

/**
 * จัดการ callback ของปุ่ม — ขั้น 1 ขอยืนยัน · ขั้น 2 อนุมัติจริง
 * @returns {Promise<{action:string, result:string, text:string, replyMarkup?:object}>}
 */
export async function handleApprovalCallback(cb, deps = {}) {
  const cfg = deps.config ?? readTelegramApprovalConfig();
  if (!cfg) return { action: "none", result: "denied", text: "ระบบอนุมัติทาง Telegram ปิดอยู่" };
  const db = deps.db ?? supabase;
  const data = String(cb?.data || "");
  const auth = authorizeCallback(cfg, cb);
  if (!auth.ok) {
    await recordApprovalAudit({
      channel: "telegram", actor: auth.fromId || null, action: "callback", result: "denied",
      detail: { reason: auth.reason },
    }, db);
    return { action: "auth", result: "denied", text: "บัญชีนี้ไม่มีสิทธิ์อนุมัติ" };
  }

  // ── ขั้น 1: ขอยืนยัน (ยังไม่เปลี่ยนสถานะใด ๆ)
  if (data.startsWith("ap:")) {
    const paymentId = data.slice(3);
    const pay = await deps.loadPayment(paymentId);
    if (!pay) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId,
        action: "approve_requested", result: "error", detail: { reason: "not_found" } }, db);
      return { action: "request", result: "error", text: "ไม่พบรายการนี้แล้ว" };
    }
    if (pay.status !== "pending_verify") {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId,
        action: "approve_requested", result: "stale", detail: { status: pay.status } }, db);
      return { action: "request", result: "stale",
        text: `รายการนี้ไม่อยู่ในสถานะรอตรวจแล้ว (ตอนนี้: ${pay.status})` };
    }
    const token = crypto.randomBytes(24).toString("base64url");
    const issued = await db.rpc("issue_telegram_approval_token", {
      p_token: token, p_payment_id: paymentId, p_ttl_seconds: CONFIRM_TTL_SECONDS,
      p_amount: pay.expectedAmount ?? null, p_package_code: pay.packageCode ?? null,
      p_status: pay.status,
    });
    if (issued?.error) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId,
        action: "approve_requested", result: "error", detail: { reason: "token_issue_failed" } }, db);
      return { action: "request", result: "error", text: "ออกปุ่มยืนยันไม่สำเร็จ ลองใหม่อีกครั้ง" };
    }
    await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId,
      action: "approve_requested", result: "ok", detail: { ttlSeconds: CONFIRM_TTL_SECONDS } }, db);
    return {
      action: "request", result: "ok",
      text: buildConfirmMessage({ paymentId, paymentRef: pay.paymentRef,
        packageName: pay.packageName, expectedAmount: pay.expectedAmount }),
      replyMarkup: { inline_keyboard: [[{ text: "ยืนยันอนุมัติ", callback_data: `cf:${token}` }]] },
    };
  }

  // ── ขั้น 2: ยืนยันจริง
  if (data.startsWith("cf:")) {
    const token = data.slice(3);
    const { data: consumed } = await db.rpc("consume_telegram_approval_token", {
      p_token: token, p_tg_user_id: auth.fromId,
    });
    if (!consumed?.ok) {
      await recordApprovalAudit({ channel: "telegram", actor: auth.fromId,
        action: "approve_confirmed", result: "denied",
        detail: { reason: consumed?.reason || "token_invalid" } }, db);
      return { action: "confirm", result: "denied",
        text: "ปุ่มนี้ใช้ไม่ได้แล้ว (หมดอายุหรือถูกใช้ไปแล้ว) เปิดรายการใหม่อีกครั้งครับ" };
    }
    const paymentId = String(consumed.paymentId);
    const pay = await deps.loadPayment(paymentId);
    if (!pay) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId,
        action: "approve_confirmed", result: "error", detail: { reason: "not_found" } }, db);
      return { action: "confirm", result: "error", text: "ไม่พบรายการนี้แล้ว" };
    }
    // ข้อมูลเปลี่ยนหลังออกปุ่ม → ปฏิเสธปุ่มเก่า แล้วแสดงข้อมูลใหม่
    const amtChanged = Number(consumed.snapshotAmount ?? NaN) !== Number(pay.expectedAmount ?? NaN);
    const pkgChanged = String(consumed.snapshotPackageCode ?? "") !== String(pay.packageCode ?? "");
    if (pay.status !== "pending_verify" || amtChanged || pkgChanged) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId,
        action: "approve_confirmed", result: "stale",
        detail: { status: pay.status, amtChanged, pkgChanged } }, db);
      return { action: "confirm", result: "stale", text: [
        "ข้อมูลรายการเปลี่ยนไปหลังกดปุ่ม จึงไม่อนุมัติให้",
        `สถานะตอนนี้: ${pay.status}`,
        `แพ็ก: ${pay.packageName || pay.packageCode || "-"}`,
        `ยอด: ${pay.expectedAmount != null ? `${pay.expectedAmount} บาท` : "-"}`,
        "เปิดรายการใหม่แล้วตรวจอีกครั้งครับ",
      ].join("\n") };
    }

    // ── เติมสิทธิ์ด้วย service เดิม (มี atomic claim กันเติมซ้ำข้ามช่องทางอยู่แล้ว)
    let activation;
    try {
      // ส่ง snapshot ที่ผู้อนุมัติเห็นบนจอเข้าไปตรวจในทรานแซกชันเดียวกับการเปลี่ยนสถานะ
      // (ตรวจใน handler อย่างเดียวไม่พอ — แพ็กอาจเปลี่ยนระหว่างนั้น)
      activation = await deps.approvePayment({
        paymentId,
        approvedBy: `telegram:${auth.fromId}`,
        expect: {
          packageCode: consumed.snapshotPackageCode ?? null,
          expectedAmount: consumed.snapshotAmount ?? null,
        },
      });
    } catch (e) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId,
        action: "approve_confirmed", result: "error",
        detail: { reason: String(e?.message || e).slice(0, 120) } }, db);
      // ตอบว่าสำเร็จเฉพาะเมื่อบันทึกสำเร็จเท่านั้น
      return { action: "confirm", result: "error", text: "อนุมัติไม่สำเร็จ ระบบบันทึกไม่ผ่าน ยังไม่เติมสิทธิ์ให้ลูกค้า" };
    }
    const alreadyPaid = activation?.paidUntil == null && activation?.paidRemainingScans == null;

    // แจ้งลูกค้า = งานแยก ล้มแล้ว retry เฉพาะการแจ้ง (คิว outbound มี retry ของตัวเอง)
    // ห้ามเติมสิทธิ์ซ้ำเพราะการแจ้งล้ม
    let notify = { ok: false, reason: "skipped_idempotent" };
    if (!alreadyPaid && activation?.lineUserId && typeof deps.notifyCustomer === "function") {
      try {
        const r = await deps.notifyCustomer({ activation, paymentId });
        notify = { ok: true, deduped: Boolean(r?.deduped) };
      } catch (e) {
        notify = { ok: false, reason: String(e?.message || e).slice(0, 120) };
        console.error(JSON.stringify({
          event: "TELEGRAM_APPROVE_CUSTOMER_NOTIFY_FAILED",
          paymentId, reason: notify.reason,
        }));
      }
    }
    await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId,
      action: "approve_confirmed", result: "ok",
      detail: { alreadyPaid, customerNotified: notify.ok === true } }, db);
    return { action: "confirm", result: "ok", text: alreadyPaid
      ? "รายการนี้ถูกอนุมัติไปแล้วก่อนหน้านี้ — ไม่เติมสิทธิ์ซ้ำ"
      : notify.ok
        ? "อนุมัติแล้ว เติมสิทธิ์ให้ลูกค้าเรียบร้อย"
        : "อนุมัติและเติมสิทธิ์แล้ว แต่ส่งข้อความแจ้งลูกค้าไม่สำเร็จ ระบบจะลองส่งใหม่เอง (ไม่เติมสิทธิ์ซ้ำ)" };
  }

  return { action: "unknown", result: "denied", text: "ปุ่มนี้ไม่รองรับ" };
}
