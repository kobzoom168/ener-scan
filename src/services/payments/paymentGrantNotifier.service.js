/**
 * สร้างงานแจ้งลูกค้าสำหรับ "สิทธิ์ที่เติมสำเร็จแล้ว" — durable, กู้คืนได้ (กบ 23 ก.ย. 2026)
 *
 * ทำไมต้องมี: การ enqueue อาจล้มหลังจากเติมสิทธิ์สำเร็จไปแล้ว ถ้าไม่มีอะไรบันทึกไว้
 * คำพูดที่ว่า "ระบบจะลองส่งใหม่เอง" ก็ไม่จริง
 *
 * แหล่งความจริงคือแถวใน `payment_entitlement_grants` ที่ถูกเขียนใน **ทรานแซกชันเดียว**
 * กับการอนุมัติ → มีสิทธิ์ที่เติมแล้วเมื่อไร ก็มี "เจตนาแจ้ง" เมื่อนั้นเสมอ
 *
 * ความหมายของ `notified_at`
 *   = **สร้างงานแจ้งลูกค้าสำเร็จแล้ว** (มีแถวใน `outbound_messages`)
 *   ≠ ส่งถึงลูกค้าแล้ว — การส่งจริงและการ retry เป็นหน้าที่ของคิว outbound ทั้งหมด
 *
 * ข้อกำหนดที่ยึด
 *   - **ไม่แตะสิทธิ์เลย** ทำแค่สร้างงานแจ้ง
 *   - **legacy ไม่ถูกแตะ**: แถว `paid` เก่าไม่มี grant row จึงไม่มีวันถูกหยิบ
 *   - กันงานซ้ำด้วย **unique index ที่ DB** (`uq_outbound_approve_notify_per_payment`)
 *     ไม่พึ่ง SELECT-ก่อน-INSERT อย่างเดียว
 *   - ไม่สร้างงานซ้ำไม่จำกัด: เจอว่ามีงานอยู่แล้ว → stamp `notified_at` แล้วจบ
 */
import { supabase } from "../../config/supabase.js";

export async function runPaymentGrantNotifySweep(deps = {}) {
  const db = deps.db ?? supabase;
  const limit = Number(deps.limit) || 20;
  const summary = { scanned: 0, enqueued: 0, alreadyQueued: 0, failed: 0 };

  const { data: rows, error } = await db.rpc("list_payment_grants_pending_notify", {
    p_limit: limit,
  });
  if (error) {
    console.error(JSON.stringify({
      event: "PAYMENT_GRANT_NOTIFY_LIST_FAILED",
      reason: String(error?.message || error).slice(0, 160),
    }));
    return summary;
  }
  for (const g of rows || []) {
    summary.scanned += 1;
    const paymentId = String(g.payment_id);
    try {
      const enqueue = deps.enqueueApproveNotify
        ?? (await import("../scanV2/outboundAdminEnqueue.service.js")).enqueueApproveNotify;
      const buildText = deps.buildPaymentApprovedText
        ?? (await import("../../utils/webhookText.util.js")).buildPaymentApprovedText;

      const text = await buildText({
        paidRemainingScans: Number(g.scans_added) + Number(g.carry_over || 0),
        paidUntil: g.paid_until,
        paymentRef: null,
        lineUserId: g.line_user_id,
        paidPlanCode: g.paid_plan_code,
      });
      const r = await enqueue({ lineUserId: g.line_user_id, paymentId, text });
      if (r?.deduped) summary.alreadyQueued += 1;
      else summary.enqueued += 1;

      // มีงานแล้ว (ไม่ว่าเพิ่งสร้างหรือมีอยู่ก่อน) → stamp เพื่อไม่วนสร้างซ้ำ
      await db.rpc("mark_payment_grant_notified", { p_payment_id: paymentId });
      console.log(JSON.stringify({
        event: "PAYMENT_GRANT_NOTIFY_ENQUEUED",
        paymentIdPrefix: paymentId.slice(0, 8),
        deduped: Boolean(r?.deduped),
      }));
    } catch (e) {
      summary.failed += 1;
      // ไม่ stamp → รอบหน้าลองใหม่ · ห้ามแตะสิทธิ์ ห้ามเติมซ้ำ
      const msg = String(e?.message || e);
      const isDupe = /duplicate key|uq_outbound_approve_notify/i.test(msg);
      if (isDupe) {
        // แข่งกันสร้างงาน — อีกเส้นชนะไปแล้ว ถือว่ามีงานแล้ว
        summary.alreadyQueued += 1;
        summary.failed -= 1;
        await db.rpc("mark_payment_grant_notified", { p_payment_id: paymentId }).catch(() => {});
        continue;
      }
      console.error(JSON.stringify({
        event: "PAYMENT_GRANT_NOTIFY_FAILED",
        paymentIdPrefix: paymentId.slice(0, 8),
        reason: msg.slice(0, 160),
      }));
    }
  }
  if (summary.scanned > 0) {
    console.log(JSON.stringify({ event: "PAYMENT_GRANT_NOTIFY_SWEEP", ...summary }));
  }
  return summary;
}
