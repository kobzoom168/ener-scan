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

function boolEnv(name, envSrc = process.env) {
  const v = String(envSrc[name] ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * config จาก env — อ่านจาก `envSrc` แหล่งเดียว (ค่าเริ่มต้น process.env) · ผู้เรียกที่ฉีด env ต้องส่งแหล่งเดียวกัน (Codex 2 ต.ค.: ห้ามอ่านคนละแหล่ง)
 * @returns {{token:string, chatId:string, approvers:Set<string>, webhookSecret:string}|null}
 */
export function readTelegramApprovalConfig(envSrc = process.env) {
  if (!boolEnv("TELEGRAM_SLIP_APPROVAL_ENABLED", envSrc)) return null;
  // No fallback to the shared alert bot.
  const token = String(envSrc.TELEGRAM_APPROVAL_BOT_TOKEN || "").trim();
  const chatId = String(envSrc.TELEGRAM_APPROVAL_CHAT_ID || "").trim();
  const webhookSecret = String(envSrc.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const approvers = new Set(
    String(envSrc.TELEGRAM_APPROVER_USER_IDS || "")
      .split(",").map((s) => s.trim()).filter((s) => /^\d{3,20}$/.test(s)),
  );
  // ขาดอย่างใดอย่างหนึ่ง = ปิดไว้ ดีกว่าเปิดครึ่ง ๆ
  if (!token || !chatId || !webhookSecret || approvers.size === 0) return null;
  return { token, chatId, approvers, webhookSecret };
}

export function isTelegramSlipApprovalEnabled() {
  return readTelegramApprovalConfig() != null;
}

/** env เป็นผู้คุม (authority) เมื่อมีการตั้ง TELEGRAM_SLIP_APPROVAL_ENABLED หรือ TELEGRAM_APPROVAL_BOT_TOKEN (ค่าว่าง = ไม่ตั้ง) */
export function telegramConfigAuthority(envSrc = process.env) {
  const set = (k) => String(envSrc[k] ?? "").trim() !== "";
  return set("TELEGRAM_SLIP_APPROVAL_ENABLED") || set("TELEGRAM_APPROVAL_BOT_TOKEN") ? "env" : "db";
}

/**
 * config ที่มีผลจริง (Codex 2 ต.ค. 2026):
 *   authority = env  → ใช้ env อย่างเดียว (ระบบทดสอบแยก/ops pin) · ENABLED=false หรือไม่ครบ = ปิด **ไม่ fallback ไป DB**
 *   authority = db   → อ่าน DB สดทุกครั้ง (ไม่มี cache: ถอนผู้อนุมัติ/ปิดมีผลทันที) · อ่านไม่ได้ = โยน error → ผู้เรียกต้องปฏิเสธ
 * @returns {Promise<{token:string, chatId:string, approvers:Set<string>, webhookSecret:string, source:"env"|"db"}|null>}
 */
export async function resolveTelegramApprovalConfig(deps = {}) {
  const envSrc = deps.env ?? process.env;
  if (telegramConfigAuthority(envSrc) === "env") {
    const cfg = readTelegramApprovalConfig(envSrc); // แหล่งเดียวกับที่ใช้เลือก authority
    return cfg ? { ...cfg, source: "env" } : null;
  }
  const store = deps.store ?? (await import("./telegramConfig.store.js"));
  if (!store.configStoreReadiness(envSrc).ready) return null; // ops ยังไม่ตั้ง key → ปิด
  return store.loadRuntimeConfigFromDb({ env: envSrc }); // อาจ throw → ผู้เรียกปฏิเสธ
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

/* ─────────────────────── ไม่อนุมัติ (2 ขั้น) — กบ/Codex 20 ต.ค. 2026 ─────────────────────── */
/** เหตุผลไม่อนุมัติ (รหัสเดียวกับ preset หน้า Admin) · moneyPending = เหตุผลที่ "เงินอาจเข้าแล้ว" → ต้องคงเรื่องเงินไว้รอดำเนินการ */
export const REJECT_REASONS = Object.freeze([
  { code: "amount", label: "ยอดเงินไม่ตรง", moneyPending: true },
  { code: "blur", label: "สลิปไม่ชัด", moneyPending: false },
  { code: "duplicate", label: "สลิปซ้ำ/ใช้ไปแล้ว", moneyPending: false },
  { code: "not_found", label: "ไม่พบรายการชำระเงิน", moneyPending: false },
  { code: "expired", label: "รายการหมดอายุแล้ว", moneyPending: true },
  { code: "other", label: "ตรวจแล้วไม่ผ่าน (อื่น ๆ)", moneyPending: true },
]);
export function rejectReasonByCode(code) { return REJECT_REASONS.find((r) => r.code === String(code || "")) || null; }
/** เงินอาจเข้าร้านแล้วไหม: เหตุผลบอกว่าเงินเข้า หรือสลิปอ่านยอด > 0 ได้ (ยังไม่ใช่การพิสูจน์เงินเข้า — เป็นธงให้คนตามต่อ) */
export function shouldFlagMoneyPending(reason, pay) {
  const amt = Number(pay?.slipAmount ?? NaN);
  return Boolean(reason?.moneyPending) || (Number.isFinite(amt) && amt > 0);
}
export function buildRejectReasonKeyboard(paymentId) {
  const rows = []; const list = [...REJECT_REASONS];
  while (list.length) rows.push(list.splice(0, 2).map((r) => ({ text: r.label, callback_data: `rr:${paymentId}:${r.code}` })));
  return { inline_keyboard: rows };
}
export function buildRejectConfirmMessage({ paymentRef, packageName, expectedAmount, slipAmount, paymentId, reason, moneyPending }) {
  return [
    "ยืนยันการไม่อนุมัติ",
    "",
    `เลขรายการ: ${paymentRef || "-"}`,
    `paymentId: ${paymentId}`,
    `แพ็ก: ${packageName || "-"}`,
    `ยอดที่ต้องชำระ: ${expectedAmount != null ? `${expectedAmount} บาท` : "-"} · ยอดที่อ่านได้จากสลิป: ${slipAmount != null ? `${slipAmount} บาท` : "อ่านไม่ได้"}`,
    `เหตุผล: ${reason?.label || "-"}`,
    "",
    "ผลที่จะเกิด:",
    "• ไม่เติมสิทธิ์ และไม่หักสิทธิ์เดิมของลูกค้า",
    "• รายการนี้ปิดเป็น ไม่อนุมัติ (รายการที่อนุมัติไปแล้วจะไม่ถูกเปลี่ยน)",
    "• ลูกค้าจะได้รับข้อความแจ้งเหตุผลทาง LINE 1 ครั้ง (ไม่อ้างว่าคืนเงินแล้ว)",
    moneyPending
      ? "• ⚠ ยอดที่โอนมา (ถ้ามี) จะถูกบันทึกเป็น 'เงินรอดำเนินการ' — ต้องคืน/โอนเพิ่ม/ตัดจบด้วยคนที่หน้า Admin ไม่ถือว่าจบ"
      : "• ไม่มีการบันทึกเรื่องเงิน (เหตุผลนี้ไม่ได้บ่งว่าเงินเข้า)",
    "",
    "กด ยืนยันไม่อนุมัติ (ทำได้ครั้งเดียว)",
  ].join("\n");
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
  let cfg = deps.config;
  if (cfg === undefined) { try { cfg = await resolveTelegramApprovalConfig(deps); } catch (e) { console.error(JSON.stringify({ event: "TELEGRAM_CONFIG_READ_FAILED", path: "notify", reason: String(e?.message || e).slice(0, 120) })); return { ok: false, reason: "config_unavailable" }; } }
  if (!cfg) return { ok: false, reason: "disabled" };
  const paymentId = String(p.paymentId || "").trim();
  if (!paymentId) return { ok: false, reason: "no_payment_id" };
  try {
    // ผู้เรียก (LIFF/webhook) อาจไม่ส่งยอด/แพ็ก → อ่านจาก DB เพื่อไม่ให้ข้อความขึ้น "-"/"อ่านไม่ได้" ทั้งที่ reason เป็น amount_mismatch (บั๊กจริง 20 ต.ค. PAY-AB51E942)
    if (p.expectedAmount == null || p.slipAmount == null || !p.packageName) {
      try {
        // อ่านผ่าน store เดิม (read-only) — service นี้ห้ามแตะตาราง payments ตรง
        const load = deps.loadPaymentSummary ?? (async (id) => (await import("../../stores/payments.db.js")).getPaymentById(id));
        const row = await load(paymentId);
        if (row) p = { ...p, expectedAmount: p.expectedAmount ?? (row.expected_amount != null ? Number(row.expected_amount) : null), slipAmount: p.slipAmount ?? (row.slip_amount != null ? Number(row.slip_amount) : null), packageName: p.packageName || row.package_name || null, packageCode: p.packageCode || row.package_code || null, paymentRef: p.paymentRef || row.payment_ref || null };
      } catch { /* อ่านไม่ได้ = ใช้ค่าที่ส่งมา */ }
    }
    const caption = buildPendingSlipMessage(p);
    const loadBytes = typeof deps.loadSlipBytes === "function" ? deps.loadSlipBytes : defaultLoadSlipBytes;
    const photo = await loadBytes(p).catch(() => null);
    await (deps.sendSlip ?? tgSendSlip)(cfg, {
      caption, photo,
      replyMarkup: { inline_keyboard: [[{ text: "อนุมัติรายการนี้", callback_data: `ap:${paymentId}` }, { text: "ไม่อนุมัติ", callback_data: `rj:${paymentId}` }]] },
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
  const db = deps.db ?? supabase;
  // อ่าน config สดทุก callback (ไม่ใช้ cache) — ถอนผู้อนุมัติ/ปิดใช้งานมีผลกับปุ่มเดิมทันที · อ่านไม่ได้ = ปฏิเสธ ไม่ใช้สิทธิ์เก่า
  let cfg = deps.config;
  if (cfg === undefined) {
    try { cfg = await resolveTelegramApprovalConfig(deps); }
    catch (e) {
      console.error(JSON.stringify({ event: "TELEGRAM_CONFIG_READ_FAILED", path: "callback", reason: String(e?.message || e).slice(0, 120) }));
      await recordApprovalAudit({ channel: "telegram", actor: String(cb?.from?.id ?? "") || null, action: "callback", result: "error", detail: { reason: "config_unavailable" } }, db).catch(() => {});
      return { action: "auth", result: "error", text: "ตรวจสอบสิทธิ์ไม่ได้ในขณะนี้ ยังไม่ได้เปลี่ยนสถานะรายการ ลองใหม่อีกครั้ง" };
    }
  }
  if (!cfg) return { action: "none", result: "denied", text: "ระบบอนุมัติทาง Telegram ปิดอยู่" };
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
    if (consumed.kind && consumed.kind !== "confirm") {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId,
        action: "approve_confirmed", result: "denied", detail: { reason: "wrong_token_kind", kind: consumed.kind } }, db);
      return { action: "confirm", result: "denied", text: "ปุ่มนี้ไม่ใช่ปุ่มยืนยันอนุมัติ" };
    }
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

  // ── ไม่อนุมัติ ขั้น 1: เลือกเหตุผล (ยังไม่เปลี่ยนสถานะ)
  if (data.startsWith("rj:")) {
    const paymentId = data.slice(3);
    const pay = await deps.loadPayment(paymentId);
    if (!pay) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_requested", result: "error", detail: { reason: "not_found" } }, db);
      return { action: "request", result: "error", text: "ไม่พบรายการนี้แล้ว" };
    }
    if (pay.status !== "pending_verify") {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_requested", result: "stale", detail: { status: pay.status } }, db);
      return { action: "request", result: "stale", text: `รายการนี้ไม่อยู่ในสถานะรอตรวจแล้ว (ตอนนี้: ${pay.status})` };
    }
    await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_requested", result: "ok", detail: {} }, db);
    return { action: "request", result: "ok", text: [`เลือกเหตุผลที่ไม่อนุมัติ`, `เลขรายการ: ${pay.paymentRef || "-"}`, `paymentId: ${paymentId}`, "(ยังไม่เปลี่ยนสถานะ จนกว่าจะกดยืนยันในขั้นถัดไป)"].join("\n"),
      replyMarkup: buildRejectReasonKeyboard(paymentId) };
  }
  // ── ไม่อนุมัติ ขั้น 2: แสดงผลที่จะเกิด + ออกปุ่มยืนยัน (token ครั้งเดียว)
  if (data.startsWith("rr:")) {
    const [, paymentId, code] = data.split(":");
    const reason = rejectReasonByCode(code);
    const pay = paymentId ? await deps.loadPayment(paymentId) : null;
    if (!pay || !reason) {
      await recordApprovalAudit({ paymentId: paymentId || null, channel: "telegram", actor: auth.fromId, action: "reject_reason_selected", result: "error", detail: { reason: !pay ? "not_found" : "bad_reason" } }, db);
      return { action: "request", result: "error", text: !pay ? "ไม่พบรายการนี้แล้ว" : "เหตุผลไม่ถูกต้อง" };
    }
    if (pay.status !== "pending_verify") {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_reason_selected", result: "stale", detail: { status: pay.status } }, db);
      return { action: "request", result: "stale", text: `รายการนี้ไม่อยู่ในสถานะรอตรวจแล้ว (ตอนนี้: ${pay.status})` };
    }
    const token = crypto.randomBytes(24).toString("base64url");
    const issued = await db.rpc("issue_telegram_reject_token", { p_token: token, p_payment_id: paymentId, p_ttl_seconds: CONFIRM_TTL_SECONDS, p_status: pay.status, p_reason_code: reason.code });
    if (issued?.error) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_reason_selected", result: "error", detail: { reason: "token_issue_failed" } }, db);
      return { action: "request", result: "error", text: "ออกปุ่มยืนยันไม่สำเร็จ ลองใหม่อีกครั้ง" };
    }
    const moneyPending = shouldFlagMoneyPending(reason, pay);
    await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_reason_selected", result: "ok", detail: { reasonCode: reason.code, moneyPending, ttlSeconds: CONFIRM_TTL_SECONDS } }, db);
    return { action: "request", result: "ok",
      text: buildRejectConfirmMessage({ paymentId, paymentRef: pay.paymentRef, packageName: pay.packageName, expectedAmount: pay.expectedAmount, slipAmount: pay.slipAmount ?? null, reason, moneyPending }),
      replyMarkup: { inline_keyboard: [[{ text: "ยืนยันไม่อนุมัติ", callback_data: `rc:${token}` }]] } };
  }
  // ── ไม่อนุมัติ ขั้น 3: ยืนยันจริง (token ครั้งเดียว · ปฏิเสธแบบ atomic ใน DB · paid แล้วไม่แตะ · ไม่แตะสิทธิ์)
  if (data.startsWith("rc:")) {
    const token = data.slice(3);
    const { data: consumed } = await db.rpc("consume_telegram_approval_token", { p_token: token, p_tg_user_id: auth.fromId });
    if (!consumed?.ok) {
      await recordApprovalAudit({ channel: "telegram", actor: auth.fromId, action: "reject_confirmed", result: "denied", detail: { reason: consumed?.reason || "token_invalid" } }, db);
      return { action: "confirm", result: "denied", text: "ปุ่มนี้ใช้ไม่ได้แล้ว (หมดอายุหรือถูกใช้ไปแล้ว) เปิดรายการใหม่อีกครั้งครับ" };
    }
    const paymentId = String(consumed.paymentId);
    if (consumed.kind !== "reject_confirm") {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_confirmed", result: "denied", detail: { reason: "wrong_token_kind", kind: consumed.kind } }, db);
      return { action: "confirm", result: "denied", text: "ปุ่มนี้ไม่ใช่ปุ่มยืนยันไม่อนุมัติ" };
    }
    const reason = rejectReasonByCode(consumed.rejectReasonCode) || rejectReasonByCode("other");
    const pay = await deps.loadPayment(paymentId);
    if (!pay) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_confirmed", result: "error", detail: { reason: "not_found" } }, db);
      return { action: "confirm", result: "error", text: "ไม่พบรายการนี้แล้ว" };
    }
    const moneyPending = shouldFlagMoneyPending(reason, pay);
    let out;
    try {
      out = await deps.rejectPayment({ paymentId, actor: `telegram:${auth.fromId}`, reasonCode: reason.code, reasonText: reason.label, moneyPending });
    } catch (e) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_confirmed", result: "error", detail: { reason: String(e?.message || e).slice(0, 120) } }, db);
      return { action: "confirm", result: "error", text: "ไม่อนุมัติไม่สำเร็จ ระบบบันทึกไม่ผ่าน ยังไม่เปลี่ยนสถานะรายการ" };
    }
    if (!out?.ok) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_confirmed", result: "stale", detail: { reason: out?.reason || "unknown", status: out?.status || null } }, db);
      return { action: "confirm", result: "stale", text: out?.reason === "already_paid"
        ? "รายการนี้ถูกอนุมัติไปแล้ว — ไม่เปลี่ยนสถานะ ไม่หักสิทธิ์"
        : `รายการนี้ไม่อยู่ในสถานะรอตรวจแล้ว (ตอนนี้: ${out?.status || "-"})` };
    }
    if (out.already) {
      await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_confirmed", result: "ok", detail: { already: true } }, db);
      return { action: "confirm", result: "ok", text: "รายการนี้ถูกปฏิเสธไปแล้วก่อนหน้านี้ — ไม่ส่งข้อความซ้ำ" };
    }
    let notify = { ok: false, reason: "skipped" };
    if (out.lineUserId && typeof deps.notifyCustomerReject === "function") {
      try { const r = await deps.notifyCustomerReject({ lineUserId: out.lineUserId, paymentId, reasonText: reason.label, moneyPending }); notify = { ok: true, deduped: Boolean(r?.deduped) }; }
      catch (e) { notify = { ok: false, reason: String(e?.message || e).slice(0, 120) }; console.error(JSON.stringify({ event: "TELEGRAM_REJECT_CUSTOMER_NOTIFY_FAILED", paymentId, reason: notify.reason })); }
    }
    await recordApprovalAudit({ paymentId, channel: "telegram", actor: auth.fromId, action: "reject_confirmed", result: "ok", detail: { reasonCode: reason.code, moneyPending, settlementStatus: out.settlementStatus || null, customerNotified: notify.ok === true } }, db);
    return { action: "confirm", result: "ok", text: [
      "ไม่อนุมัติแล้ว ไม่เติมสิทธิ์ ไม่หักสิทธิ์เดิม",
      moneyPending ? `⚠ เงินรอดำเนินการ: ยอดที่อ่านได้ ${out.slipAmount != null ? `${out.slipAmount} บาท` : "-"} — ไปที่หน้า Admin > รายการนี้ เพื่อบันทึกคืนเงิน/โอนเพิ่ม/ตัดจบ` : null,
      notify.ok ? "แจ้งลูกค้าทาง LINE แล้ว" : "แจ้งลูกค้าไม่สำเร็จ (ระบบจะลองใหม่เอง)",
    ].filter(Boolean).join("\n") };
  }
  return { action: "unknown", result: "denied", text: "ปุ่มนี้ไม่รองรับ" };
}
