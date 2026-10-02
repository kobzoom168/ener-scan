/**
 * หน้า Admin: ตั้งค่า Telegram อนุมัติสลิป (Codex/กบ 2 ต.ค. 2026) — บันทึกค่า ≠ เปิดใช้งาน
 *  - session login Admin **เท่านั้น** (requireAdminSessionOnly — ไม่รับ legacy x-admin-token/?token) + CSRF ใน session (timing-safe) · ไม่มี HTML สาธารณะ
 *  - Token ช่องรหัสผ่าน ทางเดียว: ว่าง = คงเดิม · เปลี่ยน (เมื่อมีอยู่แล้ว) ต้องติ๊กยืนยัน + พิมพ์ "เปลี่ยน TOKEN"
 *  - ไม่ส่ง token/secret กลับใน HTML/API/URL/log · webhook secret สร้างฝั่งเซิร์ฟเวอร์ ไม่ให้กรอก
 *  - ถ้า env เป็นผู้คุม (authority=env) แสดง "ควบคุมโดย config เซิร์ฟเวอร์" และ **ปฏิเสธการบันทึก** (ไม่ให้ดูเหมือนเปลี่ยนสำเร็จ)
 *  - ปุ่ม เปิดใช้งาน / ตั้ง webhook / ส่งทดสอบ: ปิดไว้ (ต้องอนุมัติแยก) — หน้านี้ไม่ setWebhook ไม่ส่งข้อความ ไม่เปิด flag
 */
import express from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { requireAdminSessionOnly } from "../middleware/requireAdmin.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const CONFIRM_TEXT = "เปลี่ยน TOKEN";
const thai = (iso) => (iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }) : "-");

export default function createAdminTelegramApprovalRouter({
  authorize = requireAdminSessionOnly,
  store = null,                 // ฉีดได้เพื่อทดสอบ (ไม่แตะ DB)
  svc = null,                   // telegramSlipApproval.service (telegramConfigAuthority)
  envSrc = process.env,
} = {}) {
  const router = express.Router();
  const loadStore = async () => store ?? (await import("../services/payments/telegramConfig.store.js"));
  const loadSvc = async () => svc ?? (await import("../services/payments/telegramSlipApproval.service.js"));
  const envLabel = () => String(envSrc.APP_ENV || envSrc.NODE_ENV || "unknown");

  async function readState() {
    const [st, sv] = await Promise.all([loadStore(), loadSvc()]);
    const authority = sv.telegramConfigAuthority(envSrc);
    const readiness = st.configStoreReadiness(envSrc);
    let status = null, statusError = null;
    if (authority === "db" && readiness.ready) {
      try { status = await st.getPublicStatus({ env: envSrc }); } catch (e) { statusError = String(e?.message || e).slice(0, 120); }
    }
    return { authority, readiness, status, statusError };
  }

  function statusLabel({ authority, readiness, status, statusError }) {
    if (authority === "env") return { kind: "env", text: "ควบคุมโดย config เซิร์ฟเวอร์ (env) — ค่าในหน้านี้ไม่มีผล" };
    if (!readiness.ready) return { kind: "ops", text: `ยังใช้ไม่ได้ — ops ต้องตั้ง ${readiness.missing.join(", ")} บนเซิร์ฟเวอร์ก่อน` };
    if (statusError) return { kind: "error", text: "อ่านสถานะไม่ได้ในขณะนี้ (ยังไม่เปลี่ยนอะไร)" };
    if (!status?.configured) return { kind: "none", text: "ยังไม่ตั้งค่า" };
    return status.enabled ? { kind: "on", text: "ตั้งค่าแล้ว — เปิดใช้งานแล้ว" } : { kind: "off", text: "ตั้งค่าแล้ว — ยังไม่เปิดใช้งาน" };
  }

  function render(req, state, { saved = false, error = null } = {}) {
    const { authority, status } = state;
    const label = statusLabel(state);
    const canSave = authority === "db" && state.readiness.ready && !state.statusError;
    const approvers = Array.isArray(status?.approvers) ? status.approvers : [];
    const a = (i) => approvers[i] || {};
    const color = { env: "#8a6d3b", ops: "#a94442", error: "#a94442", none: "#555", off: "#8a6d3b", on: "#2e7d32" }[label.kind];
    return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ตั้งค่า Telegram อนุมัติสลิป</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#222}
.card{border:1px solid #ddd;border-radius:10px;padding:16px;margin:12px 0}.status{padding:10px 12px;border-radius:8px;background:#f6f6f6;border-left:5px solid ${color}}
label{display:block;margin:10px 0 4px;font-weight:600}input[type=text],input[type=password]{width:100%;padding:8px;border:1px solid #bbb;border-radius:6px;font-size:15px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.muted{color:#666;font-size:13px}.btn{padding:10px 16px;border-radius:8px;border:0;background:#1976d2;color:#fff;font-size:15px}
.btn[disabled]{background:#bbb}.warn{background:#fff8e1;border:1px solid #ffe08a;padding:10px;border-radius:8px}.ok{background:#e8f5e9;border:1px solid #a5d6a7;padding:10px;border-radius:8px}.err{background:#fdecea;border:1px solid #f5c6cb;padding:10px;border-radius:8px}</style></head>
<body>
<h1>ตั้งค่า Telegram อนุมัติสลิป</h1>
<p class="muted">Environment: <strong>${esc(envLabel())}</strong> · host ${esc(req.hostname || "")} · หน้านี้ตั้งค่า <strong>ระบบนี้เท่านั้น</strong> (ไม่ใช่ระบบทดสอบแยก ไม่ใช่ Pro ถ้าคุณอยู่บน staging)</p>
<div class="status"><strong>สถานะ:</strong> ${esc(label.text)}
${status?.token_set ? `<div class="muted">ตั้งค่า Token แล้ว (${esc(thai(status.token_set_at))}) · webhook secret สร้างฝั่งเซิร์ฟเวอร์แล้ว · ตั้ง webhook กับ Telegram: ${status.webhook_set_at ? esc(thai(status.webhook_set_at)) : "ยังไม่ได้ตั้ง"}</div>` : ""}
${status?.updated_at ? `<div class="muted">แก้ล่าสุด ${esc(thai(status.updated_at))} โดย ${esc(status.updated_by || "-")}</div>` : ""}</div>
${saved ? (status?.enabled
  ? `<p class="ok">บันทึกการตั้งค่าแล้ว — ระบบ<strong>เปิดใช้งานอยู่</strong> การบันทึกไม่ได้เปลี่ยนสวิตช์ แต่ Chat ID/รายชื่อผู้อนุมัติที่แก้<strong>มีผลกับระบบที่เปิดอยู่ทันที</strong> (ไม่ได้ตั้ง webhook ใหม่ ไม่ได้ส่งข้อความ)</p>`
  : `<p class="ok">บันทึกการตั้งค่าแล้ว — <strong>ยังไม่เปิดใช้งาน</strong> การบันทึกไม่ได้เปลี่ยนสวิตช์ ไม่ได้ตั้ง webhook และไม่ได้ส่งข้อความใด ๆ</p>`) : ""}
${error ? `<p class="err">${esc(error)}</p>` : ""}
${authority === "env" ? `<p class="warn">ระบบนี้อ่าน config จากตัวแปรเซิร์ฟเวอร์ (env) การบันทึกในหน้านี้ถูกปิดไว้ เพื่อไม่ให้ดูเหมือนเปลี่ยนสำเร็จทั้งที่ระบบยังใช้ค่า env เดิม</p>` : ""}
<form method="post" action="/admin/telegram-approval" autocomplete="off" class="card">
<input type="hidden" name="csrf" value="${esc(req.session?.telegramCfgCsrf || "")}">
<label>Bot Token ${status?.token_set ? '<span class="muted">(ตั้งแล้ว — เว้นว่างเพื่อคงค่าเดิม)</span>' : '<span class="muted">(จำเป็นครั้งแรก)</span>'}</label>
<input type="password" name="bot_token" autocomplete="new-password" placeholder="${status?.token_set ? "••••••••  (คงค่าเดิม)" : "123456789:AAAA…"}" ${canSave ? "" : "disabled"}>
${status?.token_set ? `<p class="muted"><label style="display:inline;font-weight:400"><input type="checkbox" name="confirm_token_change" value="1"> ยืนยันเปลี่ยน Token</label> &nbsp; พิมพ์ <code>${CONFIRM_TEXT}</code>: <input type="text" name="confirm_text" style="width:180px;display:inline" ${canSave ? "" : "disabled"}></p>` : ""}
<label>ห้องรับรายการ — Telegram Chat ID</label>
<input type="text" name="chat_id" value="${esc(status?.chat_id || "")}" placeholder="-1001234567890" inputmode="numeric" ${canSave ? "" : "disabled"}>
<div class="row">
<div><label>ผู้อนุมัติคนที่ 1 — ชื่อเรียก</label><input type="text" name="approver1_label" value="${esc(a(0).label || "")}" placeholder="กบ" ${canSave ? "" : "disabled"}></div>
<div><label>ผู้อนุมัติคนที่ 1 — Telegram User ID</label><input type="text" name="approver1_id" value="${esc(a(0).tg_user_id || "")}" inputmode="numeric" ${canSave ? "" : "disabled"}></div>
<div><label>ผู้อนุมัติคนที่ 2 — ชื่อเรียก</label><input type="text" name="approver2_label" value="${esc(a(1).label || "")}" ${canSave ? "" : "disabled"}></div>
<div><label>ผู้อนุมัติคนที่ 2 — Telegram User ID</label><input type="text" name="approver2_id" value="${esc(a(1).tg_user_id || "")}" inputmode="numeric" ${canSave ? "" : "disabled"}></div>
</div>
<p class="muted">ผู้อนุมัติยึดที่ User ID ตัวเลข (ไม่ใช่ username) · ทุกการกดในห้องจะตรวจ User ID + Chat ID ทุกครั้ง · การเป็นผู้อนุมัติไม่ให้สิทธิ์แก้หน้านี้</p>
<p><button class="btn" type="submit" ${canSave ? "" : "disabled"}>บันทึกการตั้งค่า</button> <span class="muted">บันทึกค่า ≠ เปิดใช้งาน</span></p>
</form>
<div class="card"><strong>ขั้นถัดไป (ต้องอนุมัติแยก — ปุ่มปิดไว้)</strong>
<p><button class="btn" disabled>เปิดใช้งาน</button> <button class="btn" disabled>ตั้ง webhook กับ Telegram</button> <button class="btn" disabled>ส่งข้อความทดสอบเข้าห้อง</button></p>
<p class="muted">หน้านี้ไม่ setWebhook ไม่ส่งข้อความ และไม่เปิด flag เอง · การทดสอบส่งจริงเป็นขั้นแยกและต้องยืนยันก่อน · ปฏิเสธสลิปผ่าน Telegram ยังไม่มี</p></div>
</body></html>`;
  }

  router.get("/admin/telegram-approval", authorize, async (req, res) => {
    if (!req.session) return res.status(503).send("admin_session_unavailable");
    req.session.telegramCfgCsrf ||= randomBytes(24).toString("hex");
    const state = await readState();
    res.set("Cache-Control", "no-store").type("html").send(render(req, state, { saved: req.query?.saved === "1" }));
  });

  router.post("/admin/telegram-approval", authorize, express.urlencoded({ extended: false, limit: "4kb" }), async (req, res) => {
    if (!req.session) return res.status(503).send("admin_session_unavailable");
    const expected = Buffer.from(req.session.telegramCfgCsrf || "");
    const received = Buffer.from(String(req.body?.csrf || ""));
    if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) return res.status(403).send("invalid_csrf");
    const state = await readState();
    if (state.authority === "env") return res.status(409).type("html").send(render(req, state, { error: "ระบบนี้ควบคุมโดย config เซิร์ฟเวอร์ (env) — ไม่บันทึก" }));
    if (!state.readiness.ready) return res.status(503).type("html").send(render(req, state, { error: "ops ยังไม่ตั้ง key บนเซิร์ฟเวอร์ — ไม่บันทึก" }));
    if (state.statusError) return res.status(503).type("html").send(render(req, state, { error: "อ่านสถานะปัจจุบันไม่ได้ — ไม่บันทึก" }));
    const b = req.body || {};
    const token = String(b.bot_token || "").trim();
    if (token && state.status?.token_set) {
      const ok = String(b.confirm_token_change || "") === "1" && String(b.confirm_text || "").trim() === CONFIRM_TEXT;
      if (!ok) return res.status(400).type("html").send(render(req, state, { error: `มี Token อยู่แล้ว — การเปลี่ยนต้องติ๊กยืนยันและพิมพ์ "${CONFIRM_TEXT}"` }));
    }
    const approvers = [1, 2].map((i) => ({ label: String(b[`approver${i}_label`] || "").trim(), tgUserId: String(b[`approver${i}_id`] || "").trim() })).filter((x) => x.tgUserId || x.label);
    const actor = String(req.session?.adminUser || req.session?.adminName || "admin").slice(0, 80);
    try {
      const st = await loadStore();
      await st.saveSettings({ chatId: String(b.chat_id || ""), approvers, token: token || null, actor }, { env: envSrc });
    } catch (e) {
      const code = String(e?.message || e);
      const msg = { invalid_chat_id: "Chat ID ไม่ถูกต้อง (ตัวเลข อาจติดลบ)", approvers_required: "ต้องมีผู้อนุมัติอย่างน้อย 1 คน", invalid_approver_id: "Telegram User ID ต้องเป็นตัวเลข", duplicate_approver_id: "User ID ผู้อนุมัติซ้ำกัน", invalid_bot_token: "รูปแบบ Bot Token ไม่ถูกต้อง", token_required_on_first_save: "ครั้งแรกต้องใส่ Bot Token" }[code] || "บันทึกไม่สำเร็จ (ระบบ) ยังไม่เปลี่ยนค่า";
      console.error(JSON.stringify({ event: "ADMIN_TELEGRAM_CFG_SAVE_FAILED", code: code.slice(0, 80) })); // ไม่มีค่าใด ๆ จากฟอร์ม
      const status400 = /invalid_|required|duplicate/.test(code);
      return res.status(status400 ? 400 : 500).type("html").send(render(req, state, { error: msg }));
    }
    console.log(JSON.stringify({ event: "ADMIN_TELEGRAM_CFG_SAVED", actor, tokenChanged: Boolean(token), approverCount: approvers.length }));
    res.redirect(303, "/admin/telegram-approval?saved=1");
  });
  return router;
}
