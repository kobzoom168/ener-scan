import express from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { requireAdminSession } from "../middleware/requireAdmin.js";
import { getNewCustomerTrialStatus, saveNewCustomerTrialPolicy } from "../services/newCustomerTrial.service.js";
import { loadActiveScanOffer } from "../services/scanOffer.loader.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));

export default function createAdminFreeTrialRouter({
  authorize = requireAdminSession,
  read = getNewCustomerTrialStatus,
  save = saveNewCustomerTrialPolicy,
  offer = loadActiveScanOffer,
} = {}) {
  const router = express.Router();
  router.get("/admin/free-trial", authorize, async (req, res) => {
    try {
      const policy = await read();
      if (!req.session) return res.status(503).send("admin_session_unavailable");
      req.session.freeTrialCsrf ||= randomBytes(24).toString("hex");
      const daily = offer().freeQuotaPerDay;
      res.set("Cache-Control", "no-store").type("html").send(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>สิทธิ์ทดลองใช้ฟรี — Ener Scan</title><style>
body{font-family:system-ui,sans-serif;background:#17140f;color:#f5eddf;margin:0;padding:24px;font-size:18px}
main{max-width:620px;margin:auto}section{background:#252017;padding:24px;border-radius:16px}
h1{font-size:26px}p{line-height:1.7}a{color:#e9c36d}label{display:flex;gap:14px;align-items:center;font-weight:bold}
input{width:28px;height:28px}button{background:#e9c36d;border:0;border-radius:10px;padding:16px;font-size:18px;width:100%;cursor:pointer}
small{display:block;color:#c1b6a5;line-height:1.7;margin:16px 0}</style></head><body><main>
<a href="/admin/promo">← โปรโมชันและแพ็ก</a><h1>สิทธิ์ทดลองใช้ฟรี</h1><section>
<p>สถานะ: <strong>${policy.enabled ? "ลูกค้าใหม่ฟรีรวม 2 ครั้ง" : `ฟรีรายวัน ${esc(daily)} ครั้งต่อคน`}</strong></p>
${req.query.saved ? "<p role=\"status\">บันทึกสำเร็จแล้ว</p>" : ""}
<form method="post" action="/admin/free-trial">
<input type="hidden" name="csrf" value="${esc(req.session.freeTrialCsrf)}">
<label><input type="checkbox" name="enabled"${policy.enabled ? " checked" : ""}>เปิดโหมดลูกค้าใหม่ฟรีรวม 2 ครั้ง</label>
<p>เปิด: หยุดฟรีรายวัน ลูกค้าใหม่ได้สิทธิ์ทดลองรวม 2 ครั้งต่อบัญชี ไม่เติมใหม่ทุกวัน</p>
<p>ปิด: กลับไปใช้ฟรีรายวัน ${esc(daily)} ครั้ง ตามค่าที่ตั้งในหน้าโปรโมชัน</p>
<small>ลูกค้าใหม่ = บัญชีที่เริ่มใช้ตั้งแต่การเปิดโหมดนี้ครั้งแรก บัญชีเก่าไม่ได้รับสิทธิ์ใหม่ย้อนหลัง
สิทธิ์แพ็กและโบนัสที่ให้ไว้ยังใช้ได้ตามเดิม ยอดทดลองใช้ฟรีไม่รีเซ็ตเมื่อปิดแล้วเปิดใหม่
งานที่อยู่ในคิวจองสิทธิ์ไว้จนเสร็จ งานล้มเหลวไม่กินสิทธิ์</small>
<small>วันเริ่มนโยบายครั้งแรก: ${esc(policy.eligible_since || "ยังไม่เริ่ม — จะบันทึกเมื่อเปิดครั้งแรก")}</small>
<label><input type="checkbox" name="confirmed" required>ยืนยันการเปลี่ยนนโยบาย (เปิดครั้งแรกหลังแจ้งลูกค้าล่วงหน้า 7 วัน)</label>
<button type="submit">บันทึกนโยบาย</button></form></section></main></body></html>`);
    } catch {
      res.status(503).send("ยังอ่านนโยบายไม่ได้ ตรวจ migration 057 และการเชื่อมต่อฐานข้อมูลก่อนครับ");
    }
  });
  router.post("/admin/free-trial", authorize, express.urlencoded({ extended: false, limit: "2kb" }), async (req, res) => {
    const expected = Buffer.from(req.session?.freeTrialCsrf || "");
    const received = Buffer.from(String(req.body?.csrf || ""));
    if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return res.status(403).send("invalid_csrf");
    }
    if (req.body?.confirmed !== "on" || (req.body?.enabled != null && req.body.enabled !== "on")) {
      return res.status(400).send("confirmation_required");
    }
    try {
      const enabled = req.body.enabled === "on";
      await save(enabled);
      console.log(JSON.stringify({ event: "ADMIN_FREE_TRIAL_POLICY_SAVED", enabled }));
      res.redirect(303, "/admin/free-trial?saved=1");
    } catch {
      res.status(503).send("บันทึกไม่สำเร็จ กรุณาตรวจสถานะก่อนลองอีกครั้งครับ");
    }
  });
  return router;
}
