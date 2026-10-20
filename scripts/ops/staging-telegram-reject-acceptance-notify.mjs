// Acceptance §13 (staging เท่านั้น): ส่งข้อความ "สลิปรอตรวจ" ของ fixture F1 เข้าห้อง Telegram staging ด้วยฟังก์ชันจริง notifyTelegramSlipPendingVerify
//  - config จาก DB (TELEGRAM_CONFIG_KEY/TELEGRAM_CONFIG_DB_KEY ใน env ของ container) · ไม่พิมพ์ token/secret · ไม่แตะสิทธิ์ ไม่เปลี่ยนสถานะบิล
//  - guard: APP_BASE_URL host test.my-ener.uk หรือ APP_ENV=staging · --confirm-staging · payment ต้องมีจริง, payment_ref ขึ้นต้น PAY-STGRJ, status pending_verify, line_user_id = TEST_UID ที่ระบุ
//  - ไม่ส่ง expectedAmount/slipAmount เข้าไป (ให้ service เติมจาก DB — ทางเดียวกับบั๊ก PAY-AB51E942 ที่แก้แล้ว)
//  ใช้: docker run --rm --env-file /root/ener-scan-staging/.env --network <net> -v <path>/staging-telegram-reject-acceptance-notify.mjs:/app/ops-acc.mjs:ro <image> node /app/ops-acc.mjs <PAYMENT_ID> <TEST_UID> --confirm-staging
const [paymentId, uid] = process.argv.slice(2);
const confirm = process.argv.includes("--confirm-staging");
if (!confirm || !/^[0-9a-f-]{36}$/.test(paymentId || "") || !/^U[0-9a-f]{32}$/.test(uid || "")) { console.error("usage: node ops-acc.mjs <PAYMENT_ID> <TEST_UID> --confirm-staging"); process.exit(2); }
const host = (() => { try { return new URL(String(process.env.APP_BASE_URL || "")).host; } catch { return ""; } })();
if (host !== "test.my-ener.uk" && String(process.env.APP_ENV || "") !== "staging") { console.error("STOP: not staging (APP_BASE_URL/APP_ENV)"); process.exit(3); }
const { getPaymentById } = await import("/app/src/stores/payments.db.js");
const pay = await getPaymentById(paymentId);
if (!pay) { console.error("STOP: payment not found"); process.exit(4); }
if (!String(pay.payment_ref || "").startsWith("PAY-STGRJ") || pay.status !== "pending_verify" || pay.line_user_id !== uid) {
  console.error(JSON.stringify({ event: "STOP_FIXTURE_MISMATCH", ref: pay.payment_ref, status: pay.status, uidMatch: pay.line_user_id === uid })); process.exit(5);
}
const tg = await import("/app/src/services/payments/telegramSlipApproval.service.js");
const r = await tg.notifyTelegramSlipPendingVerify({ paymentId, paymentRef: pay.payment_ref, packageCode: pay.package_code, reasons: ["amount_mismatch"], lineUserId: uid, slipUrl: pay.slip_url || null });
console.log(JSON.stringify({ event: "ACCEPTANCE_TG_PENDING_SENT", ok: r?.ok === true, reason: r?.reason ?? null, paymentIdPrefix: paymentId.slice(0, 8), ref: pay.payment_ref, uidPrefix: uid.slice(0, 8) + "…" }));
process.exit(r?.ok === true ? 0 : 6);
