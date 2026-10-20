/**
 * งานกู้การแจ้งลูกค้าหลัง "ไม่อนุมัติ" (sql/069): ปฏิเสธสำเร็จแต่ enqueue แจ้งล้ม → แถวคง reject_notify_pending=true
 *  - maintenance ทุกรอบ: list (เฉพาะที่ปฏิเสธมาแล้ว >1 นาที) → enqueueRejectNotify (dedupe ต่อ payment ในคิว outbound ซึ่งมี retry ของตัวเอง) → mark queued
 *  - "เข้าคิวแจ้งแล้ว" ≠ "ส่งถึง LINE แล้ว" (การส่งจริงเป็นของ worker-delivery) · ไม่แตะสถานะบิล/สิทธิ์
 */
import { buildPaymentRejectedText } from "../../utils/webhookText.util.js";

export async function sweepRejectNotifyPending(deps = {}) {
  const store = deps.store ?? (await import("../../stores/paymentOps.store.js"));
  const enqueue = deps.enqueueRejectNotify ?? (await import("../scanV2/outboundAdminEnqueue.service.js")).enqueueRejectNotify;
  const summary = { listed: 0, queued: 0, deduped: 0, failed: 0 };
  let rows;
  try { rows = await store.listRejectNotifyPending(Number(deps.limit) || 20); }
  catch (e) { console.error(JSON.stringify({ event: "REJECT_NOTIFY_SWEEP_LIST_FAILED", reason: String(e?.code || e?.message || e).slice(0, 120) })); return { ...summary, error: "list_failed" }; }
  for (const r of rows) {
    summary.listed += 1;
    try {
      const text = buildPaymentRejectedText({ reason: r.reject_reason, moneyPending: r.settlement_status === "money_pending" });
      const q = await enqueue({ lineUserId: r.line_user_id, paymentId: r.payment_id, text });
      await store.markRejectNotifyQueued(r.payment_id);
      if (q?.deduped) summary.deduped += 1; else summary.queued += 1;
      console.log(JSON.stringify({ event: "REJECT_NOTIFY_SWEEP_QUEUED", paymentIdPrefix: String(r.payment_id).slice(0, 8), deduped: Boolean(q?.deduped) }));
    } catch (e) {
      summary.failed += 1;
      console.error(JSON.stringify({ event: "REJECT_NOTIFY_SWEEP_ITEM_FAILED", paymentIdPrefix: String(r.payment_id).slice(0, 8), reason: String(e?.message || e).slice(0, 120) }));
    }
  }
  if (summary.listed) console.log(JSON.stringify({ event: "REJECT_NOTIFY_SWEEP", ...summary }));
  return summary;
}
