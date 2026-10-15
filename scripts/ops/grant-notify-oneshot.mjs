// รันในคอนเทนเนอร์ของ image ที่ตรึงไว้ (mount ไฟล์นี้เข้า /app): กู้ "ข้อความแจ้งเติมสิทธิ์" ที่ค้าง
//   docker run --rm --env-file .env --network <net> -v <ops>/scripts/ops/grant-notify-oneshot.mjs:/app/ops-oneshot.mjs:ro <image-id> node /app/ops-oneshot.mjs
// exit: 0 = รอบนี้ไม่มี error (อาจยังเหลือแถวอายุ < 2 นาที — ผู้เรียกต้องนับใน DB เอง) · 2 = อ่านรายการจาก RPC ไม่ได้ (ห้ามถือว่าศูนย์) · 4 = มีรายการที่ enqueue/stamp ล้ม
// ไม่เติมสิทธิ์ซ้ำ ไม่ stamp โดยไม่มี outbound (ใช้ runPaymentGrantNotifySweep เดิมของแอป)
import { supabase } from "./src/config/supabase.js";
import { runPaymentGrantNotifySweep } from "./src/services/payments/paymentGrantNotifier.service.js";

const probe = await supabase.rpc("list_payment_grants_pending_notify", { p_limit: 1 });
if (probe.error) {
  console.log(JSON.stringify({ event: "GRANT_NOTIFY_ONESHOT_LIST_FAILED", reason: String(probe.error.message || probe.error).slice(0, 160) }));
  process.exit(2);
}
const summary = await runPaymentGrantNotifySweep({ limit: 200 });
console.log(JSON.stringify({ event: "GRANT_NOTIFY_ONESHOT", ...summary }));
process.exit(summary.failed > 0 ? 4 : 0);
