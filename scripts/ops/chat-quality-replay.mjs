// Replay รายงาน chat quality ของวันที่กำหนด "แบบไม่ส่งข้อความ" (Codex 19 ต.ค. 2026 ขั้น staging ข้อ 3)
//  - ไม่ส่ง Telegram/LINE · ไม่เขียน app_settings · ไม่ใช้ redis dedupe · อ่าน DB อย่างเดียว
//  - **ไม่ใช่ทดสอบ offline**: ยังเรียก Gemini เพื่อวิเคราะห์ = ส่งข้อความแชตให้ผู้ให้บริการโมเดลและมีค่าใช้จ่ายตามปกติ (Codex 19 ต.ค.)
//  - ใช้ในคอนเทนเนอร์ของ env นั้น (มี .env + network เดียวกับแอป) เช่น:
//    docker run --rm --env-file .env --network <net> -v <ops>/scripts/ops/chat-quality-replay.mjs:/app/ops-replay.mjs:ro <image-id> node /app/ops-replay.mjs 2026-10-16
//  - พิมพ์: POLICY ที่ใช้ (auditState/windows) + รายงาน · รายงานต้นฉบับ (buildReportText) ใส่ LINE userId เต็มในเคสที่มีปัญหา → สคริปต์นี้ **mask เป็น 8 ตัว+…** ก่อนพิมพ์เสมอ
import { runChatQualityDailySweep } from "./src/services/chatQualityDailyReport.service.js";
const dateKey = String(process.argv[2] || "").trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) { console.error("usage: node ops-replay.mjs YYYY-MM-DD   (วันตามเวลาไทย)"); process.exit(2); }
const r = await runChatQualityDailySweep(new Date(), { dryRun: true, reportDateKey: dateKey });
if (r?.skipped) { console.log(JSON.stringify({ event: "CHAT_QUALITY_REPLAY_SKIPPED", reason: r.skipped })); process.exit(3); }
console.log(JSON.stringify({ event: "CHAT_QUALITY_REPLAY", dateKey: r.reportDateKey, auditState: r.policy?.auditState ?? null, windows: r.policy?.windows ?? [], convCount: r.convCount, okCount: r.okCount, problems: r.problems, analyzeFailed: r.analyzeFailed, sent: false }));
console.log("----- REPORT (not sent) -----");
console.log(String(r.report || "").replace(/U[0-9a-f]{32}/g, (m) => `${m.slice(0, 8)}…`)); // mask uid เต็มก่อนแชร์ (Codex 19 ต.ค.)
process.exit(0);
