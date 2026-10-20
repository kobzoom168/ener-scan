// enqueueRejectNotify (sql/069 รอบ 3): 1 แถว outbound ต่อ payment ตลอดอายุ — unique index ระดับ DB + แอปจับ 23505
//  - แข่งกันเข้าคิว (Telegram กดซ้ำ + sweep พร้อมกัน) → แถวเดียว ทั้งคู่ได้ id เดียวกัน · แถวเดิม sent → ไม่สร้างใหม่ (deduped)
//  - แถวเดิม failed/dead → ไม่สร้างซ้ำเงียบ ๆ: stuck=true + onStuck (admin alert) · 23505 แต่หาแถวไม่พบ → โยน error (ไม่ทำเป็นสำเร็จ)
import test from "node:test";
import assert from "node:assert/strict";
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "" })) process.env[k] ??= v;
globalThis.fetch = async () => { throw new Error("external network forbidden"); };
const { enqueueRejectNotify, REJECT_NOTIFY_LIVE_STATUSES } = await import("../src/services/scanV2/outboundAdminEnqueue.service.js");
const { rejectNotifyOutcome, rejectNotifyOperatorText, adminAlertStateFromResult } = await import("../src/utils/rejectNotifyOutcome.util.js");

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
  // รอบ 4 (Codex): ผลการแจ้งแอดมินต้องสะท้อนใน adminAlert — throw/LOST → "lost" (ห้ามล้าง pending) · ส่งสำเร็จ → "sent" · เข้าคิวถาวร → "queued" · dedupe (เคยส่งในหน้าต่าง) → "sent"
  const dead = () => fakeOutboundTable([{ id: "ob-d", seq: 1, related_payment_id: P.paymentId, kind: "reject_notify", status: "dead" }]);
  const cases = [
    [async () => { throw new Error("alert down"); }, "lost"],
    [async () => ({ ok: false, queued: false, reason: "send_failed" }), "lost"],     // ADMIN_ALERT_LOST
    [async () => ({ ok: false, queued: false, reason: "not_configured" }), "lost"],
    [async () => ({ ok: true }), "sent"],
    [async () => ({ ok: false, queued: true, reason: "send_failed", outboxId: 7 }), "queued"], // outbox ถาวร
    [async () => ({ ok: false, skipped: "deduped" }), "sent"],
    [async () => undefined, "lost"],
  ];
  for (const [onStuck, expect] of cases) {
    const t = dead(); const d = await quiet(() => enqueueRejectNotify(P, { ...t, onStuck }));
    assert.deepEqual([d.stuck, d.adminAlert, t.inserts.length], [true, expect, 0], `adminAlert=${expect}`);
    const oc = rejectNotifyOutcome(d);
    assert.equal(oc.state, `stuck_alert_${expect}`); assert.equal(oc.markable, expect !== "lost", "lost ต้องไม่ markable"); assert.equal(oc.customerQueued, false, "stuck ไม่ใช่ลูกค้าเข้าคิว");
  }
  assert.equal(adminAlertStateFromResult({ ok: true }), "sent");
});

test("rejectNotifyOutcome/OperatorText: แยกสถานะ ลูกค้าเข้าคิว / ค้าง+แอดมินสำเร็จ / ค้าง+เข้าคิวแอดมิน / ค้าง+แอดมินล้ม / ไม่มีแถว — ข้อความไม่ใช้คำว่า 'เข้าคิวแจ้งลูกค้า' แทนทุกกรณี", () => {
  const q = rejectNotifyOutcome({ id: "a", status: "queued", deduped: false, stuck: false }); assert.deepEqual([q.state, q.markable, q.customerQueued], ["queued", true, true]);
  const dl = rejectNotifyOutcome({ id: "a", status: "sent", deduped: true, stuck: false }); assert.deepEqual([dl.state, dl.markable, dl.customerQueued], ["deduped_live", true, true]);
  const un = rejectNotifyOutcome({ deduped: false }); assert.deepEqual([un.state, un.markable], ["unconfirmed", false]); assert.deepEqual(rejectNotifyOutcome(null).state, "unconfirmed");
  const sent = rejectNotifyOutcome({ id: "a", status: "dead", deduped: true, stuck: true, adminAlert: "sent" }); assert.deepEqual([sent.state, sent.markable, sent.customerQueued, sent.adminAlert], ["stuck_alert_sent", true, false, "sent"]);
  const lost = rejectNotifyOutcome({ id: "a", status: "failed", deduped: true, stuck: true }); assert.deepEqual([lost.state, lost.markable], ["stuck_alert_lost", false]);
  assert.match(rejectNotifyOperatorText(q), /เข้าคิวแจ้งลูกค้าทาง LINE แล้ว \(ยังไม่ยืนยันว่าส่งถึง\)/);
  assert.match(rejectNotifyOperatorText(q, { already: true }), /ถูกปฏิเสธไปแล้วก่อนหน้านี้ — เข้าคิวแจ้งลูกค้าที่ค้างอยู่ให้แล้ว/);
  assert.match(rejectNotifyOperatorText(dl), /มีในคิว\/ส่งแล้วอยู่ก่อน \(sent\) ไม่สร้างซ้ำ/);
  for (const [oc, re] of [[sent, /แจ้งแอดมินสำเร็จแล้ว/], [rejectNotifyOutcome({ id: "a", status: "dead", stuck: true, deduped: true, adminAlert: "queued" }), /เข้าคิวแจ้งแอดมินแล้ว/], [lost, /แจ้งแอดมินไม่สำเร็จ ระบบจะลองแจ้งแอดมินใหม่เอง/]]) {
    const t = rejectNotifyOperatorText(oc); assert.match(t, /ข้อความแจ้งลูกค้าค้าง/); assert.match(t, re); assert.doesNotMatch(t, /เข้าคิวแจ้งลูกค้า/);
    const ta = rejectNotifyOperatorText(oc, { already: true }); assert.match(ta, /^รายการนี้ถูกปฏิเสธไปแล้วก่อนหน้านี้ — ข้อความแจ้งลูกค้าค้าง/); assert.doesNotMatch(ta, /เข้าคิวแจ้งลูกค้าที่ค้างอยู่ให้แล้ว/);
  }
  assert.match(rejectNotifyOperatorText(un), /เข้าคิวแจ้งลูกค้าไม่สำเร็จ — ระบบจะลองเข้าคิวใหม่เอง/);
});

test("23505 แต่หาแถวผู้ชนะไม่พบ (DB ผิดปกติ) → โยน error ไม่คืน id ปลอม · error อื่นจาก insert → โยนต่อ", async () => {
  const noWinner = { findExisting: async () => null, insert: async () => { const e = new Error("dup"); e.code = "23505"; throw e; } };
  await assert.rejects(() => quiet(() => enqueueRejectNotify(P, noWinner)), /dup/);
  const other = { findExisting: async () => null, insert: async () => { const e = new Error("permission denied"); e.code = "42501"; throw e; } };
  await assert.rejects(() => quiet(() => enqueueRejectNotify(P, other)), /permission denied/);
});
