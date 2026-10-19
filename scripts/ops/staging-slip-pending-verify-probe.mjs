// Probe เส้นแจ้งสลิป pending_verify บน **staging เท่านั้น** (Codex 19 ต.ค. 2026: เคสควบคุม ไม่โอนเงินจริง ไม่กดอนุมัติ)
//  - เรียกฟังก์ชันจริง maybeNotifyAdminSlipPendingVerify ด้วย LINE client จริงของ staging → LINE แอดมิน (ADMIN_LINE_USER_ID) ได้ข้อความ "[ชำระเงิน] มีสลิปรอตรวจ"
//    · paymentId สังเคราะห์ (ไม่มีแถว payments, ไม่มีสิทธิ์ใดเปลี่ยน) · ปิดช่อง Telegram approval ในโปรเซสนี้ (ไม่สร้างปุ่มอนุมัติให้ payment ปลอม)
//    · staging ไม่ได้ตั้ง ADMIN_PAYMENT_SLIP_NOTIFY → เปิดเฉพาะใน env override ของ probe (ไม่แก้ .env)
//  - ส่งข้อความลูกค้า replyType slip_manual_review (ถ้อยคำเดียวกับ webhook) ผ่าน gateway push ไปยัง Test UID ที่ระบุ (บัญชีทดสอบของกบ) → พิสูจน์ LINE ลูกค้ายังทำงาน
//  - guard: ต้องเป็น staging (APP_BASE_URL host test.my-ener.uk หรือ APP_ENV=staging) + --confirm-staging + UID รูปแบบถูก · ไม่พิมพ์ token/UID เต็ม
//  ใช้: docker run --rm --env-file /root/ener-scan-staging/.env --network <net> -v <path>/staging-slip-pending-verify-probe.mjs:/app/ops-probe.mjs:ro <image> node /app/ops-probe.mjs <TEST_UID> --confirm-staging
import line from "@line/bot-sdk";
const uid = String(process.argv[2] || "").trim();
const confirm = process.argv.includes("--confirm-staging");
let host = ""; try { host = new URL(String(process.env.APP_BASE_URL || "")).hostname; } catch { /* ignore */ }
const isStaging = host === "test.my-ener.uk" || String(process.env.APP_ENV || "").toLowerCase() === "staging";
if (!isStaging) { console.error(JSON.stringify({ event: "SLIP_PROBE_REFUSED", reason: "not_staging", host })); process.exit(2); }
if (!confirm || !/^U[0-9a-f]{32}$/.test(uid)) { console.error("usage: node ops-probe.mjs <TEST_UID> --confirm-staging"); process.exit(2); }
if (!process.env.ADMIN_LINE_USER_ID) { console.error(JSON.stringify({ event: "SLIP_PROBE_REFUSED", reason: "ADMIN_LINE_USER_ID missing" })); process.exit(2); }
const { maybeNotifyAdminSlipPendingVerify } = await import("./src/services/adminPaymentSlipNotify.service.js");
const { sendNonScanPushMessage } = await import("./src/services/nonScanReply.gateway.js");
const client = new line.Client({ channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET });
const paymentId = `synthetic-probe-${Date.now()}`;
let tgCalled = false;
await maybeNotifyAdminSlipPendingVerify({
  client, lineUserId: uid, paymentId, paymentRef: "SYNTH-PROBE", packageKey: null, slipUrl: null,
  reasons: ["synthetic_probe_no_payment_row"],
  env: { ADMIN_PAYMENT_SLIP_NOTIFY: "1" }, // staging ไม่ตั้งค่า → เปิดเฉพาะโปรเซสนี้
  telegram: { notifyTelegramSlipPendingVerify: async () => { tgCalled = true; return { skipped: "synthetic_probe" }; } },
});
const r = await sendNonScanPushMessage({
  client, userId: uid, replyType: "slip_manual_review", semanticKey: `slip_manual_review_probe_${Date.now()}`,
  text: "รับรูปแล้วครับ ขอเช็กแปปนึง\nถ้าเป็นสลิปโอน เดี๋ยวผมเปิดสิทธิ์แล้วแจ้งกลับในแชตนี้เลยครับ",
});
await new Promise((r) => setTimeout(r, 2500)); // ให้ insertLineConversationMessage (fire-and-forget ใน gateway) เขียนเสร็จก่อนจบโปรเซส
console.log(JSON.stringify({ event: "SLIP_PROBE_DONE", host, adminIdPrefix: String(process.env.ADMIN_LINE_USER_ID).slice(0, 8), customerUidPrefix: uid.slice(0, 8), paymentIdSynthetic: paymentId, telegramApprovalBypassed: tgCalled, customerPush: r && typeof r === "object" ? { ok: r.ok ?? null, suppressed: r.suppressed ?? null } : String(r) }));
process.exit(0);
