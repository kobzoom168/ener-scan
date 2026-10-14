/**
 * DLQ Alert dedupe (Codex 14 ต.ค. 2026): สถานะเดิมไม่รัว · งานเสียใหม่แจ้งแม้จำนวนเท่าเดิม · ส่งล้มลองใหม่ได้ (ไม่ล็อกเงียบ 6 ชม.)
 * · เรียกพร้อมกันส่งครั้งเดียว · Redis ใช้ไม่ได้ = fail-open · environment/แอดมินคนละ key ไม่ชนกัน · ข้อความไม่มีคำว่า Supabase
 */
import test from "node:test";
import assert from "node:assert/strict";
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "" })) process.env[k] ??= v;
const { maybeSendDlqAlert, dlqSignature, buildDlqAlertText, DLQ_ALERT_RESEND_SEC } = await import("../src/services/maintenanceDlqAlert.service.js");

/** redis ปลอมแบบมี TTL (วินาที) และนาฬิกาจำลอง */
function fakeRedis({ available = true } = {}) {
  const store = new Map(); let now = 1_000_000;
  const alive = (k) => { const v = store.get(k); if (!v) return null; if (v.exp <= now) { store.delete(k); return null; } return v; };
  return {
    tick: (sec) => { now += sec; },
    store,
    isAvailable: async () => available,
    getValue: async (k) => alive(k)?.value ?? null,
    setValueWithTtl: async (k, value, ttl) => { store.set(k, { value: String(value), exp: now + ttl }); },
    tryDedupeOnce: async (k, ttl) => { if (alive(k)) return false; store.set(k, { value: "1", exp: now + ttl }); return true; },
  };
}
const envA = { ADMIN_LINE_USER_ID: "Uadmin00000000000000000000000000001", APP_ENV: "staging", CANARY_DLQ_DEAD_ALERT_THRESHOLD: 1 };
const sender = ({ fail = 0 } = {}) => { const calls = []; let n = 0; return { calls, lineClient: { pushMessage: async (to, msg) => { n++; if (n <= fail) throw new Error("line_down"); calls.push({ to, text: msg.text }); } } }; };
const items1 = [{ id: "9cd40af1-e93a-4e1c-b7a5-40c8ca9f172a", updated_at: "2026-10-14T02:01:00Z" }];

test("สถานะเดิมไม่รัว: รอบแรกส่ง · รอบถัดไป (60 วิ ×5) ไม่ส่ง · หลัง 6 ชม. ส่งซ้ำ 1 ครั้ง", async () => {
  const r = fakeRedis(); const s = sender();
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, lineClient: s.lineClient })).sent, true);
  for (let i = 0; i < 5; i++) { r.tick(60); const x = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, lineClient: s.lineClient }); assert.equal(x.sent, false); assert.equal(x.skipped, "same_state_already_alerted"); }
  assert.equal(s.calls.length, 1);
  r.tick(DLQ_ALERT_RESEND_SEC + 1);
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, lineClient: s.lineClient })).sent, true);
  assert.equal(s.calls.length, 2);
});

test("งานเสียใหม่แจ้งทันทีแม้ count เท่าเดิม (id/updated_at เปลี่ยน) · signature ต่างกัน", async () => {
  const r = fakeRedis(); const s = sender();
  await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, lineClient: s.lineClient });
  r.tick(60);
  const items2 = [{ id: "ffffffff-0000-4000-8000-000000000002", updated_at: "2026-10-14T03:00:00Z" }];
  assert.notEqual(dlqSignature({ outDead: 1, outFailed: 0, items: items1 }), dlqSignature({ outDead: 1, outFailed: 0, items: items2 }));
  const x = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items2 }, { env: envA, redis: r, lineClient: s.lineClient });
  assert.equal(x.sent, true); assert.equal(s.calls.length, 2);
  r.tick(60);
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items2 }, { env: envA, redis: r, lineClient: s.lineClient })).sent, false, "สถานะใหม่นี้แจ้งแล้ว ไม่รัว");
});

test("ส่งล้ม → ไม่ตั้ง marker 6 ชม. · รอบถัดไป (60 วิ) ลองใหม่และส่งสำเร็จ", async () => {
  const r = fakeRedis(); const s = sender({ fail: 1 });
  const x1 = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, lineClient: s.lineClient });
  assert.equal(x1.sent, false); assert.match(x1.error, /line_down/); assert.equal(s.calls.length, 0);
  assert.equal(r.store.has("dlq_alert:sent:staging:Uadmin00"), false, "ห้ามตั้ง marker เมื่อส่งล้ม");
  r.tick(60);
  const x2 = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, lineClient: s.lineClient });
  assert.equal(x2.sent, true); assert.equal(s.calls.length, 1);
});

test("เรียกพร้อมกัน (signature เดียว) → ส่งครั้งเดียว ที่เหลือ send_in_progress", async () => {
  const r = fakeRedis(); const s = sender();
  const rs = await Promise.all([1, 2, 3].map(() => maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, lineClient: s.lineClient })));
  assert.equal(rs.filter((x) => x.sent).length, 1); assert.equal(rs.filter((x) => x.skipped === "send_in_progress").length, 2); assert.equal(s.calls.length, 1);
});

test("Redis ใช้ไม่ได้ → fail-open แจ้งทุกรอบเหมือนเดิม (ไม่เงียบ)", async () => {
  const r = fakeRedis({ available: false }); const s = sender();
  for (let i = 0; i < 3; i++) assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, lineClient: s.lineClient })).sent, true);
  assert.equal(s.calls.length, 3);
});

test("key แยก environment/แอดมิน: staging แจ้งแล้ว ไม่ทำให้ production หรือแอดมินอื่นเงียบ · ต่ำกว่าเกณฑ์ไม่แจ้ง", async () => {
  const r = fakeRedis(); const s = sender();
  await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, lineClient: s.lineClient });
  const envP = { ...envA, APP_ENV: "production" };
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envP, redis: r, lineClient: s.lineClient })).sent, true);
  const envB = { ...envA, ADMIN_LINE_USER_ID: "Uother0000000000000000000000000002" };
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envB, redis: r, lineClient: s.lineClient })).sent, true);
  assert.equal(s.calls.length, 3);
  assert.equal((await maybeSendDlqAlert({ outDead: 0, outFailed: 0, items: [] }, { env: envA, redis: r, lineClient: s.lineClient })).skipped, "below_threshold");
  // label จาก APP_BASE_URL เมื่อไม่มี APP_ENV
  const envH = { ADMIN_LINE_USER_ID: envA.ADMIN_LINE_USER_ID, APP_ENV: "", APP_BASE_URL: "https://test.my-ener.uk" };
  const x = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envH, redis: r, lineClient: s.lineClient });
  assert.equal(x.sent, true); assert.match(s.calls.at(-1).text, /\[DLQ Alert\]\[test\.my-ener\.uk\]/);
});

test("ข้อความ: ระบุ environment · 'ฐานข้อมูลของระบบ' · ไม่มีคำว่า Supabase · มีรายการล่าสุด", () => {
  const t = buildDlqAlertText({ envLabel: "staging", dead: 1, failed: 0, items: items1 });
  assert.match(t, /^\[DLQ Alert\]\[staging\] outbound_messages\.dead = 1, failed = 0/); assert.match(t, /ฐานข้อมูลของระบบ/); assert.ok(!/Supabase/i.test(t)); assert.match(t, /ล่าสุด: 9cd40af1…/);
});
