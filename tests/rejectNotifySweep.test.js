// sweep กู้งานแจ้งลูกค้าหลังไม่อนุมัติ (sql/069): enqueue ล้ม = ไม่ mark (คงค้าง) · สำเร็จ/dedupe = mark · list ล้ม = ไม่พัง
// รอบ 3: ข้อความจาก snapshot ณ เวลาปฏิเสธ (ไม่ใช่ settlement/reason ปัจจุบัน) · mark เฉพาะเมื่อยืนยันว่ามีแถว outbound (id) · แถว stuck นับแยก
import test from "node:test";
import assert from "node:assert/strict";
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "" })) process.env[k] ??= v;
const { sweepRejectNotifyPending, rejectNotifyTextFromSnapshot } = await import("../src/services/payments/rejectNotifySweep.service.js");
const rows = [
  { payment_id: "p1", line_user_id: "U1", reject_reason: "ยอดเงินไม่ตรง", settlement_status: "money_pending", rejected_at: "2026-10-20T04:54:15Z" },
  { payment_id: "p2", line_user_id: "U2", reject_reason: "สลิปไม่ชัด", settlement_status: "none", rejected_at: "2026-10-20T04:55:00Z" },
];
test("sweep: enqueue สำเร็จ → mark · enqueue ล้ม → ไม่ mark (pending คงอยู่ให้รอบหน้า) · dedupe นับแยก · ข้อความ money_pending ไม่ชวนโอนเพิ่ม", async () => {
  const marks = []; const enq = [];
  const store = { listRejectNotifyPending: async () => rows, markRejectNotifyQueued: async (id) => { marks.push(id); return true; } };
  const oe = console.error; console.error = () => {};
  let s;
  try { s = await sweepRejectNotifyPending({ store, enqueueRejectNotify: async (a) => { enq.push(a); if (a.paymentId === "p2") throw new Error("db down"); return { id: "o1", status: "queued", deduped: false }; } }); } finally { console.error = oe; }
  assert.deepEqual([s.listed, s.queued, s.failed, s.deduped], [2, 1, 1, 0]); assert.deepEqual(marks, ["p1"]);
  assert.match(enq[0].text, /ยังไม่ต้องโอนเพิ่มหรือส่งสลิปใหม่/); assert.doesNotMatch(enq[0].text, /เริ่มขั้นตอนชำระใหม่/); assert.match(enq[1].text, /เริ่มขั้นตอนชำระใหม่/);
  const s2 = await sweepRejectNotifyPending({ store: { listRejectNotifyPending: async () => [rows[0]], markRejectNotifyQueued: async () => true }, enqueueRejectNotify: async () => ({ id: "o1", deduped: true }) });
  assert.deepEqual([s2.queued, s2.deduped], [0, 1]);
  const oe2 = console.error; console.error = () => {};
  let s3; try { s3 = await sweepRejectNotifyPending({ store: { listRejectNotifyPending: async () => { throw new Error("permission denied"); }, markRejectNotifyQueued: async () => true } }); } finally { console.error = oe2; }
  assert.equal(s3.error, "list_failed");
});

test("รอบ 3/4: ข้อความจาก snapshot แม้ settlement/reason ปัจจุบันเปลี่ยนแล้ว · enqueue ไม่คืน id → ไม่ mark (unconfirmed) · แถวเดิม sent = deduped+mark · แถว dead: แจ้งแอดมิน sent/queued = mark, lost = คง pending", async () => {
  const snapRow = { payment_id: "p9", line_user_id: "U9", reject_reason: "แก้ทีหลัง", settlement_status: "refunded", rejected_at: "2026-10-20T04:54:15Z", reject_notify_snapshot: { reasonText: "ยอดเงินไม่ตรง", reasonCode: "amount", moneyPending: true } };
  const marks = []; const enq = [];
  const store = { listRejectNotifyPending: async () => [snapRow], markRejectNotifyQueued: async (id) => { marks.push(id); return true; } };
  const s = await sweepRejectNotifyPending({ store, enqueueRejectNotify: async (a) => { enq.push(a); return { id: "o9", status: "queued", deduped: false }; } });
  assert.equal(s.queued, 1); assert.deepEqual(marks, ["p9"]);
  assert.match(enq[0].text, /ยอดเงินไม่ตรง/); assert.doesNotMatch(enq[0].text, /แก้ทีหลัง/); assert.match(enq[0].text, /ยังไม่ต้องโอนเพิ่มหรือส่งสลิปใหม่/, "moneyPending จาก snapshot (refunded ตอนนี้ก็ยังข้อความเดิม)");
  assert.equal(rejectNotifyTextFromSnapshot(snapRow.reject_notify_snapshot), enq[0].text, "ทุกเส้นกู้คืนใช้ฟังก์ชันเดียวกัน");
  // แถวเก่าไม่มี snapshot → fallback ค่าในแถว
  assert.match(rejectNotifyTextFromSnapshot(null, { reason: "สลิปไม่ชัด", moneyPending: false }), /สลิปไม่ชัด/);
  // ไม่มี id → ไม่ mark
  const marks2 = []; const oe = console.error; console.error = () => {}; let s2;
  try { s2 = await sweepRejectNotifyPending({ store: { listRejectNotifyPending: async () => [snapRow], markRejectNotifyQueued: async (id) => { marks2.push(id); return true; } }, enqueueRejectNotify: async () => ({ deduped: false }) }); } finally { console.error = oe; }
  assert.deepEqual([s2.unconfirmed, s2.queued, marks2.length], [1, 0, 0]);
  // sent แล้ว → deduped + mark · dead + แจ้งแอดมินสำเร็จ → stuck + mark · dead + เข้าคิวแจ้งเตือนถาวร → stuck + mark · dead + alert สูญหาย → stuckLost ไม่ mark (รอบหน้าลองแจ้งแอดมินใหม่ ไม่สร้างข้อความลูกค้า)
  const marks3 = []; const enq3 = [];
  const rowsStuck = [snapRow, { ...snapRow, payment_id: "p10" }, { ...snapRow, payment_id: "p11" }, { ...snapRow, payment_id: "p12" }];
  const st3 = { listRejectNotifyPending: async () => rowsStuck, markRejectNotifyQueued: async (id) => { marks3.push(id); return true; } };
  const oe3 = console.error; console.error = () => {}; let s3;
  try { s3 = await sweepRejectNotifyPending({ store: st3, enqueueRejectNotify: async (a) => { enq3.push(a.paymentId); return ({ p9: { id: "o9", status: "sent", deduped: true, stuck: false }, p10: { id: "o10", status: "dead", deduped: true, stuck: true, adminAlert: "sent" }, p11: { id: "o11", status: "failed", deduped: true, stuck: true, adminAlert: "queued" }, p12: { id: "o12", status: "dead", deduped: true, stuck: true, adminAlert: "lost" } })[a.paymentId]; } }); } finally { console.error = oe3; }
  assert.deepEqual([s3.deduped, s3.stuck, s3.stuckLost, s3.queued, s3.unconfirmed], [1, 2, 1, 0, 0]); assert.deepEqual(marks3, ["p9", "p10", "p11"], "p12 (alert lost) ต้องคง pending");
  // รอบถัดไป p12 ถูก list อีก → enqueue อีกครั้ง (ไม่สร้างข้อความลูกค้าใหม่ — dedupe ที่ enqueue) → ถ้าแจ้งแอดมินสำเร็จแล้วค่อย mark
  const marks4 = []; const s4 = await sweepRejectNotifyPending({ store: { listRejectNotifyPending: async () => [rowsStuck[3]], markRejectNotifyQueued: async (id) => { marks4.push(id); return true; } }, enqueueRejectNotify: async () => ({ id: "o12", status: "dead", deduped: true, stuck: true, adminAlert: "sent" }) });
  assert.deepEqual([s4.stuck, marks4], [1, ["p12"]]);
});
