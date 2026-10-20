// enqueueRejectNotify (sql/069 รอบ 3): 1 แถว outbound ต่อ payment ตลอดอายุ — unique index ระดับ DB + แอปจับ 23505
//  - แข่งกันเข้าคิว (Telegram กดซ้ำ + sweep พร้อมกัน) → แถวเดียว ทั้งคู่ได้ id เดียวกัน · แถวเดิม sent → ไม่สร้างใหม่ (deduped)
//  - แถวเดิม failed/dead → ไม่สร้างซ้ำเงียบ ๆ: stuck=true + onStuck (admin alert) · 23505 แต่หาแถวไม่พบ → โยน error (ไม่ทำเป็นสำเร็จ)
import test from "node:test";
import assert from "node:assert/strict";
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "" })) process.env[k] ??= v;
globalThis.fetch = async () => { throw new Error("external network forbidden"); };
const { enqueueRejectNotify, REJECT_NOTIFY_LIVE_STATUSES } = await import("../src/services/scanV2/outboundAdminEnqueue.service.js");

/** ตาราง outbound ปลอมที่บังคับ unique (related_payment_id) WHERE kind='reject_notify' เหมือน DB — insert ชน = error.code 23505 */
function fakeOutboundTable(seed = []) {
  const rows = [...seed]; let n = 0; const inserts = [];
  return { rows, inserts,
    findExisting: async (pid, kind) => rows.filter((r) => r.related_payment_id === pid && r.kind === kind).sort((a, b) => a.seq - b.seq)[0] ?? null,
    insert: async (row) => {
      inserts.push(row);
      await new Promise((r) => setTimeout(r, 1)); // ให้สองคำสั่งอ่าน "ไม่มีแถว" ก่อนทั้งคู่ แล้วค่อย insert (จำลอง race read-then-insert)
      if (row.kind === "reject_notify" && rows.some((r) => r.related_payment_id === row.related_payment_id && r.kind === "reject_notify")) { const e = new Error("duplicate key value violates unique constraint \"uq_outbound_reject_notify_per_payment\""); e.code = "23505"; throw e; }
      const saved = { ...row, id: `ob-${++n}`, seq: n }; rows.push(saved); return { id: saved.id };
    },
  };
}
const quiet = async (fn) => { const ol = console.log, oe = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = ol; console.error = oe; } };
const P = { lineUserId: "U3e463f4aaaaaaaaaaaaaaaaaaaaaaaaa", paymentId: "c9d2b025-e7a6-49c3-aef2-41122ebb73f8", text: "ไม่อนุมัติ" };

test("แข่งกันเข้าคิวพร้อมกัน 2 คำสั่ง → outbound 1 แถว · ทั้งคู่ได้ id เดียวกัน (คนแพ้ได้ deduped=true จาก 23505) · เรียกซ้ำภายหลังก็ไม่เพิ่มแถว", async () => {
  const t = fakeOutboundTable();
  const [a, b] = await quiet(() => Promise.all([enqueueRejectNotify(P, t), enqueueRejectNotify(P, t)]));
  assert.equal(t.rows.length, 1, "ต้องมีแถว reject_notify แถวเดียว"); assert.equal(t.inserts.length, 2, "ทั้งคู่พยายาม insert (อ่านก่อนไม่พอ) → DB กัน");
  assert.equal(a.id, t.rows[0].id); assert.equal(b.id, t.rows[0].id);
  assert.deepEqual([a.deduped, b.deduped].sort(), [false, true]); assert.equal(a.stuck || b.stuck, false);
  const c = await quiet(() => enqueueRejectNotify(P, t)); assert.equal(c.deduped, true); assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0].payload_json.paymentId, P.paymentId); assert.equal(t.rows[0].related_payment_id, P.paymentId);
});

test("แถวเดิม sent แล้ว → ไม่สร้างใหม่ (deduped, ไม่ stuck) · แถวเดิม dead/failed → ไม่สร้างซ้ำ + stuck=true + onStuck ถูกเรียก (ไม่ requeue เอง) · payment อื่นไม่ถูกบล็อก", async () => {
  assert.deepEqual([...REJECT_NOTIFY_LIVE_STATUSES], ["queued", "sending", "retry_wait", "sent"]);
  const sent = fakeOutboundTable([{ id: "ob-sent", seq: 1, related_payment_id: P.paymentId, kind: "reject_notify", status: "sent" }]);
  const r = await quiet(() => enqueueRejectNotify(P, sent)); assert.deepEqual([r.id, r.status, r.deduped, r.stuck], ["ob-sent", "sent", true, false]); assert.equal(sent.inserts.length, 0);
  for (const st of ["dead", "failed"]) {
    const stuckCalls = [];
    const t = fakeOutboundTable([{ id: `ob-${st}`, seq: 1, related_payment_id: P.paymentId, kind: "reject_notify", status: st }]);
    const d = await quiet(() => enqueueRejectNotify(P, { ...t, onStuck: async (x) => { stuckCalls.push(x); } }));
    assert.deepEqual([d.id, d.status, d.deduped, d.stuck], [`ob-${st}`, st, true, true]); assert.equal(t.inserts.length, 0, "ห้ามสร้างข้อความซ้ำ");
    assert.equal(stuckCalls.length, 1); assert.equal(stuckCalls[0].paymentId, P.paymentId); assert.equal(stuckCalls[0].status, st);
    const other = await quiet(() => enqueueRejectNotify({ ...P, paymentId: "11111111-2222-4333-8444-555555555555" }, t)); assert.equal(other.deduped, false); assert.equal(t.rows.length, 2);
  }
  // onStuck ล้ม (เช่น Telegram alert ส่งไม่ได้) → ยังคืนผล stuck ไม่โยน
  const t2 = fakeOutboundTable([{ id: "ob-d", seq: 1, related_payment_id: P.paymentId, kind: "reject_notify", status: "dead" }]);
  const d2 = await quiet(() => enqueueRejectNotify(P, { ...t2, onStuck: async () => { throw new Error("alert down"); } })); assert.equal(d2.stuck, true);
});

test("23505 แต่หาแถวผู้ชนะไม่พบ (DB ผิดปกติ) → โยน error ไม่คืน id ปลอม · error อื่นจาก insert → โยนต่อ", async () => {
  const noWinner = { findExisting: async () => null, insert: async () => { const e = new Error("dup"); e.code = "23505"; throw e; } };
  await assert.rejects(() => quiet(() => enqueueRejectNotify(P, noWinner)), /dup/);
  const other = { findExisting: async () => null, insert: async () => { const e = new Error("permission denied"); e.code = "42501"; throw e; } };
  await assert.rejects(() => quiet(() => enqueueRejectNotify(P, other)), /permission denied/);
});
