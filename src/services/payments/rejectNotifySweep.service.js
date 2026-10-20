/**
 * งานกู้การแจ้งลูกค้าหลัง "ไม่อนุมัติ" (sql/069): ปฏิเสธสำเร็จแต่ enqueue แจ้งล้ม → แถวคง reject_notify_pending=true
 *  - maintenance ทุกรอบ: list (เฉพาะที่ปฏิเสธมาแล้ว >1 นาที) → enqueueRejectNotify (dedupe ต่อ payment ในคิว outbound ซึ่งมี retry ของตัวเอง) → mark queued
 *  - "เข้าคิวแจ้งแล้ว" ≠ "ส่งถึง LINE แล้ว" (การส่งจริงเป็นของ worker-delivery) · ไม่แตะสถานะบิล/สิทธิ์
 */
import { buildPaymentRejectedText } from "../../utils/webhookText.util.js";

/** ข้อความลูกค้าจาก snapshot ณ เวลาปฏิเสธ (sql/069 รอบ 3) — ไม่ใช้ settlement_status/reject_reason ปัจจุบัน · แถวเก่าไม่มี snapshot = fallback ค่าในแถว */
export function rejectNotifyTextFromSnapshot(snapshot, fallback = {}) {
  const snap = snapshot && typeof snapshot === "object" ? snapshot : null;
  const reason = snap?.reasonText ?? fallback.reason ?? null;
  const moneyPending = snap ? Boolean(snap.moneyPending) : Boolean(fallback.moneyPending);
  return buildPaymentRejectedText({ reason, moneyPending });
}

export async function sweepRejectNotifyPending(deps = {}) {
  const store = deps.store ?? (await import("../../stores/paymentOps.store.js"));
  const enqueue = deps.enqueueRejectNotify ?? (await import("../scanV2/outboundAdminEnqueue.service.js")).enqueueRejectNotify;
  const summary = { listed: 0, queued: 0, deduped: 0, failed: 0, stuck: 0, unconfirmed: 0 };
  let rows;
  try { rows = await store.listRejectNotifyPending(Number(deps.limit) || 20); }
  catch (e) { console.error(JSON.stringify({ event: "REJECT_NOTIFY_SWEEP_LIST_FAILED", reason: String(e?.code || e?.message || e).slice(0, 120) })); return { ...summary, error: "list_failed" }; }
  for (const r of rows) {
    summary.listed += 1;
    try {
      const text = rejectNotifyTextFromSnapshot(r.reject_notify_snapshot, { reason: r.reject_reason, moneyPending: r.settlement_status === "money_pending" });
      const q = await enqueue({ lineUserId: r.line_user_id, paymentId: r.payment_id, text });
      if (!q?.id) { summary.unconfirmed += 1; console.error(JSON.stringify({ event: "REJECT_NOTIFY_SWEEP_NO_OUTBOUND_ROW", paymentIdPrefix: String(r.payment_id).slice(0, 8), note: "ไม่ mark queued — รอบหน้าลองใหม่" })); continue; }
      await store.markRejectNotifyQueued(r.payment_id); // mark เฉพาะเมื่อยืนยันแล้วว่ามีแถว outbound จริง
      if (q.stuck) summary.stuck += 1; else if (q.deduped) summary.deduped += 1; else summary.queued += 1;
      console.log(JSON.stringify({ event: "REJECT_NOTIFY_SWEEP_QUEUED", paymentIdPrefix: String(r.payment_id).slice(0, 8), deduped: Boolean(q.deduped), stuck: Boolean(q.stuck), outboundStatus: q.status || null }));
    } catch (e) {
      summary.failed += 1;
      console.error(JSON.stringify({ event: "REJECT_NOTIFY_SWEEP_ITEM_FAILED", paymentIdPrefix: String(r.payment_id).slice(0, 8), reason: String(e?.message || e).slice(0, 120) }));
    }
  }
  if (summary.listed) console.log(JSON.stringify({ event: "REJECT_NOTIFY_SWEEP", ...summary }));
  return summary;
}
