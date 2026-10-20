// sweep กู้งานแจ้งลูกค้าหลังไม่อนุมัติ (sql/069): enqueue ล้ม = ไม่ mark (คงค้าง) · สำเร็จ/dedupe = mark · list ล้ม = ไม่พัง · ข้อความตาม settlement
import test from "node:test";
import assert from "node:assert/strict";
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "" })) process.env[k] ??= v;
const { sweepRejectNotifyPending } = await import("../src/services/payments/rejectNotifySweep.service.js");
const rows = [
  { payment_id: "p1", line_user_id: "U1", reject_reason: "ยอดเงินไม่ตรง", settlement_status: "money_pending", rejected_at: "2026-10-20T04:54:15Z" },
  { payment_id: "p2", line_user_id: "U2", reject_reason: "สลิปไม่ชัด", settlement_status: "none", rejected_at: "2026-10-20T04:55:00Z" },
];
test("sweep: enqueue สำเร็จ → mark · enqueue ล้ม → ไม่ mark (pending คงอยู่ให้รอบหน้า) · dedupe นับแยก · ข้อความ money_pending ไม่ชวนโอนเพิ่ม", async () => {
  const marks = []; const enq = [];
  const store = { listRejectNotifyPending: async () => rows, markRejectNotifyQueued: async (id) => { marks.push(id); return true; } };
  const oe = console.error; console.error = () => {};
  let s;
  try { s = await sweepRejectNotifyPending({ store, enqueueRejectNotify: async (a) => { enq.push(a); if (a.paymentId === "p2") throw new Error("db down"); return { id: "o1", deduped: false }; } }); } finally { console.error = oe; }
  assert.deepEqual([s.listed, s.queued, s.failed, s.deduped], [2, 1, 1, 0]); assert.deepEqual(marks, ["p1"]);
  assert.match(enq[0].text, /ยังไม่ต้องโอนเพิ่มหรือส่งสลิปใหม่/); assert.doesNotMatch(enq[0].text, /เริ่มขั้นตอนชำระใหม่/); assert.match(enq[1].text, /เริ่มขั้นตอนชำระใหม่/);
  const s2 = await sweepRejectNotifyPending({ store: { listRejectNotifyPending: async () => [rows[0]], markRejectNotifyQueued: async () => true }, enqueueRejectNotify: async () => ({ id: "o1", deduped: true }) });
  assert.deepEqual([s2.queued, s2.deduped], [0, 1]);
  const oe2 = console.error; console.error = () => {};
  let s3; try { s3 = await sweepRejectNotifyPending({ store: { listRejectNotifyPending: async () => { throw new Error("permission denied"); }, markRejectNotifyQueued: async () => true } }); } finally { console.error = oe2; }
  assert.equal(s3.error, "list_failed");
});
