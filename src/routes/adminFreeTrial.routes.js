/**
 * หน้าเก่า /admin/free-trial (สวิตช์ ON/OFF ตัวเดียว) — ปิดตั้งแต่ 067 (14 ต.ค. 2026)
 *  - GET  → 302 ไป /admin/free-policy (หน้าใหม่ 3 โหมด + ตั้งเวลา, session-only)
 *  - POST → 410 ไม่บันทึกอะไร (ช่องทางเก่าต้องไม่ข้ามกติกา 72 ชม./โหมดเดียว; RPC เดิมก็ REVOKE จาก web_anon แล้ว)
 */
import express from "express";
import { requireAdminSession } from "../middleware/requireAdmin.js";

export default function createAdminFreeTrialRouter({ authorize = requireAdminSession } = {}) {
  const router = express.Router();
  router.get("/admin/free-trial", authorize, (_req, res) => {
    res.set("Cache-Control", "no-store").redirect(302, "/admin/free-policy");
  });
  router.post("/admin/free-trial", authorize, (_req, res) => {
    console.log(JSON.stringify({ event: "ADMIN_FREE_TRIAL_LEGACY_POST_REJECTED" }));
    res.status(410).type("text/plain").send("หน้านี้ปิดแล้ว — ใช้ /admin/free-policy (สิทธิ์ฟรี 3 โหมด + ตั้งเวลา)");
  });
  return router;
}
