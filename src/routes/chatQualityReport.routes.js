/**
 * ให้ Hermes Agent (เครื่อง kob-dev) ดึงรายงานตรวจแชทฉบับล่าสุด (กบ 19 ก.ค. 2026)
 * กันด้วย token ตายตัวจาก env CHAT_QUALITY_REPORT_TOKEN — ไม่ตั้ง token = ปิด route
 */
import express from "express";
import { getAppSetting } from "../stores/appSettings.db.js";

export default function createChatQualityReportRouter() {
  const router = express.Router();
  router.get("/internal/chat-quality/latest", async (req, res) => {
    const expected = String(process.env.CHAT_QUALITY_REPORT_TOKEN || "").trim();
    const got = String(req.query?.token || "").trim();
    if (!expected || !got || got !== expected) {
      return res.status(401).type("text/plain").send("unauthorized");
    }
    try {
      const v = await getAppSetting("chat_quality_last_report");
      const text = v && typeof v === "object" ? String(v.text || "") : "";
      if (!text) return res.status(404).type("text/plain").send("no_report_yet");
      return res.type("text/plain; charset=utf-8").send(text);
    } catch {
      return res.status(500).type("text/plain").send("error");
    }
  });
  return router;
}
