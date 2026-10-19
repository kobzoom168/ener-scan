// Replay รายงาน chat quality ของวันที่กำหนด "แบบไม่ส่งข้อความ" (Codex 19 ต.ค. 2026 ขั้น staging ข้อ 3)
//  - ไม่ส่ง Telegram · ไม่เขียน app_settings · ไม่ใช้ redis dedupe · อ่าน DB อย่างเดียว (+ เรียก Gemini วิเคราะห์ตามปกติ)
//  - ใช้ในคอนเทนเนอร์ของ env นั้น (มี .env + network เดียวกับแอป) เช่น:
//    docker run --rm --env-file .env --network <net> -v <ops>/scripts/ops/chat-quality-replay.mjs:/app/ops-replay.mjs:ro <image-id> node /app/ops-replay.mjs 2026-10-16
//  - พิมพ์: POLICY ที่ใช้ (auditState/windows) + รายงานเต็ม · uid ในรายงานเป็น prefix อยู่แล้ว (ไม่มี uid เต็ม)
import { runChatQualityDailySweep } from "./src/services/chatQualityDailyReport.service.js";
const dateKey = String(process.argv[2] || "").trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) { console.error("usage: node ops-replay.mjs YYYY-MM-DD   (วันตามเวลาไทย)"); process.exit(2); }
const r = await runChatQualityDailySweep(new Date(), { dryRun: true, reportDateKey: dateKey });
if (r?.skipped) { console.log(JSON.stringify({ event: "CHAT_QUALITY_REPLAY_SKIPPED", reason: r.skipped })); process.exit(3); }
console.log(JSON.stringify({ event: "CHAT_QUALITY_REPLAY", dateKey: r.reportDateKey, auditState: r.policy?.auditState ?? null, windows: r.policy?.windows ?? [], convCount: r.convCount, okCount: r.okCount, problems: r.problems, analyzeFailed: r.analyzeFailed, sent: false }));
console.log("----- REPORT (not sent) -----");
console.log(r.report);
process.exit(0);
