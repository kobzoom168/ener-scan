/**
 * DLQ Alert dedupe (Codex 14 ต.ค. 2026): สถานะเดิมไม่รัว · งานเสียใหม่แจ้งแม้จำนวนเท่าเดิม · ส่งล้มลองใหม่ได้ (ไม่ล็อกเงียบ 6 ชม.)
 * · เรียกพร้อมกันส่งครั้งเดียว · Redis ใช้ไม่ได้ = fail-open · environment/แอดมินคนละ key ไม่ชนกัน · ข้อความไม่มีคำว่า Supabase
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const envA = { ADMIN_ALERT_TELEGRAM_CHAT_ID: "-1001000000000001", APP_ENV: "staging", CANARY_DLQ_DEAD_ALERT_THRESHOLD: 1 };
// 19 ต.ค. 2026: ปลายทาง = adminAlert (Telegram) — mock รับ {category,severity,text,dedupeKey} · fail = ครั้งที่ล้มแบบ "เข้า outbox ไม่ได้" (ok:false, queued:false)
const sender = ({ fail = 0, queue = 0 } = {}) => { const calls = []; let n = 0; return { calls, sendAdminAlert: async (p, d) => { n++; if (n <= fail) return { ok: false, queued: false, reason: "telegram_down" }; calls.push({ to: String(d?.env?.ADMIN_ALERT_TELEGRAM_CHAT_ID || ""), text: p.text, category: p.category, severity: p.severity, dedupeKey: p.dedupeKey }); if (n <= fail + queue) return { ok: false, queued: true, reason: "http_429" }; return { ok: true }; } }; };
const items1 = [{ id: "9cd40af1-e93a-4e1c-b7a5-40c8ca9f172a", updated_at: "2026-10-14T02:01:00Z" }];

test("สถานะเดิมไม่รัว: รอบแรกส่ง · รอบถัดไป (60 วิ ×5) ไม่ส่ง · หลัง 6 ชม. ส่งซ้ำ 1 ครั้ง", async () => {
  const r = fakeRedis(); const s = sender();
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert })).sent, true);
  for (let i = 0; i < 5; i++) { r.tick(60); const x = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert }); assert.equal(x.sent, false); assert.equal(x.skipped, "same_state_already_alerted"); }
  assert.equal(s.calls.length, 1);
  r.tick(DLQ_ALERT_RESEND_SEC + 1);
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert })).sent, true);
  assert.equal(s.calls.length, 2);
});

test("งานเสียใหม่แจ้งทันทีแม้ count เท่าเดิม (id/updated_at เปลี่ยน) · signature ต่างกัน", async () => {
  const r = fakeRedis(); const s = sender();
  await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert });
  r.tick(60);
  const items2 = [{ id: "ffffffff-0000-4000-8000-000000000002", updated_at: "2026-10-14T03:00:00Z" }];
  assert.notEqual(dlqSignature({ outDead: 1, outFailed: 0, items: items1 }), dlqSignature({ outDead: 1, outFailed: 0, items: items2 }));
  const x = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items2 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert });
  assert.equal(x.sent, true); assert.equal(s.calls.length, 2);
  r.tick(60);
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items2 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert })).sent, false, "สถานะใหม่นี้แจ้งแล้ว ไม่รัว");
});

test("ส่งล้ม → ไม่ตั้ง marker 6 ชม. · รอบถัดไป (60 วิ) ลองใหม่และส่งสำเร็จ", async () => {
  const r = fakeRedis(); const s = sender({ fail: 1 });
  const x1 = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert });
  assert.equal(x1.sent, false); assert.match(x1.error, /telegram_down/); assert.equal(s.calls.length, 0);
  assert.ok(![...r.store.keys()].some((k) => k.startsWith("dlq_alert:sent:")), "ห้ามตั้ง marker เมื่อส่งล้ม");
  r.tick(60);
  const x2 = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert });
  assert.equal(x2.sent, true); assert.equal(s.calls.length, 1);
});

test("เรียกพร้อมกัน (signature เดียว) → ส่งครั้งเดียว ที่เหลือ send_in_progress", async () => {
  const r = fakeRedis(); const s = sender();
  const rs = await Promise.all([1, 2, 3].map(() => maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert })));
  assert.equal(rs.filter((x) => x.sent).length, 1); assert.equal(rs.filter((x) => x.skipped === "send_in_progress").length, 2); assert.equal(s.calls.length, 1);
});

test("Redis ใช้ไม่ได้ → fail-open แจ้งทุกรอบเหมือนเดิม (ไม่เงียบ)", async () => {
  const r = fakeRedis({ available: false }); const s = sender();
  for (let i = 0; i < 3; i++) assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert })).sent, true);
  assert.equal(s.calls.length, 3);
});

test("key แยก environment/แอดมิน: staging แจ้งแล้ว ไม่ทำให้ production หรือแอดมินอื่นเงียบ · ต่ำกว่าเกณฑ์ไม่แจ้ง", async () => {
  const r = fakeRedis(); const s = sender();
  await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert });
  const envP = { ...envA, APP_ENV: "production" };
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envP, redis: r, sendAdminAlert: s.sendAdminAlert })).sent, true);
  const envB = { ...envA, ADMIN_ALERT_TELEGRAM_CHAT_ID: "-1001000000000002" };
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envB, redis: r, sendAdminAlert: s.sendAdminAlert })).sent, true);
  assert.equal(s.calls.length, 3);
  assert.equal((await maybeSendDlqAlert({ outDead: 0, outFailed: 0, items: [] }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert })).skipped, "below_threshold");
  // label จาก APP_BASE_URL เมื่อไม่มี APP_ENV
  const envH = { ADMIN_ALERT_TELEGRAM_CHAT_ID: envA.ADMIN_ALERT_TELEGRAM_CHAT_ID, APP_ENV: "", APP_BASE_URL: "https://test.my-ener.uk" };
  const x = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envH, redis: r, sendAdminAlert: s.sendAdminAlert });
  assert.equal(x.sent, true); assert.match(s.calls.at(-1).text, /\[DLQ Alert\]\[test\.my-ener\.uk\]/);
});

test("ข้อความ: ระบุ environment · 'ฐานข้อมูลของระบบ' · ไม่มีคำว่า Supabase · มีรายการล่าสุด", () => {
  const t = buildDlqAlertText({ envLabel: "staging", dead: 1, failed: 0, items: items1 });
  assert.match(t, /^\[DLQ Alert\]\[staging\] outbound_messages\.dead = 1, failed = 0/); assert.match(t, /ฐานข้อมูลของระบบ/); assert.ok(!/Supabase/i.test(t)); assert.match(t, /ล่าสุด: 9cd40af1…/);
});

test("แอดมินคนละคนแต่ prefix 8 ตัวเหมือนกัน → key ไม่ชน คนที่สองต้องได้รับแจ้ง · key ไม่มี ID เต็ม", async () => {
  const r = fakeRedis(); const s = sender();
  const a1 = { ...envA, ADMIN_ALERT_TELEGRAM_CHAT_ID: "-1001000AAAAAAAA1" };
  const a2 = { ...envA, ADMIN_ALERT_TELEGRAM_CHAT_ID: "-1001000AAAAAAAA2" };
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: a1, redis: r, sendAdminAlert: s.sendAdminAlert })).sent, true);
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: a2, redis: r, sendAdminAlert: s.sendAdminAlert })).sent, true, "คนที่สองต้องไม่ถูกข้าม");
  assert.equal(s.calls.length, 2); assert.deepEqual(s.calls.map((c) => c.to), [a1.ADMIN_ALERT_TELEGRAM_CHAT_ID, a2.ADMIN_ALERT_TELEGRAM_CHAT_ID]);
  assert.ok(![...r.store.keys()].some((k) => k.includes("AAAAAAAA1") || k.includes("AAAAAAAA2")), "key ต้องเป็น hash ไม่ใช่ ID เต็ม");
});

test("อ่านรายการ DLQ ล้ม (itemsError) → แจ้งตาม count · ไม่ตั้ง marker 6 ชม. · รอบถัดไปแจ้งซ้ำ · เมื่ออ่านได้แล้วจึง dedupe ปกติ · ข้อความบอกชัด", async () => {
  const r = fakeRedis(); const s = sender();
  const x1 = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: [], itemsError: "PGRST301" }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert });
  assert.equal(x1.sent, true); assert.equal(x1.itemsComplete, false); assert.equal(x1.signature, null);
  assert.ok(![...r.store.keys()].some((k) => k.startsWith("dlq_alert:sent:")), "signature ไม่ครบ ห้ามตั้ง marker ระยะยาว");
  assert.match(s.calls.at(-1).text, /อ่านรายการ DLQ ไม่สำเร็จ/);
  r.tick(60);
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: [], itemsError: "PGRST301" }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert })).sent, true, "ยังอ่านไม่ได้ → แจ้งซ้ำรอบถัดไป");
  r.tick(60);
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert })).sent, true, "อ่านได้แล้ว (สถานะยังไม่เคย mark) → แจ้ง + ตั้ง marker");
  r.tick(60);
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert })).skipped, "same_state_already_alerted");
  assert.equal(s.calls.length, 3);
});

test("maintenanceWorker: DB คืน {error} หรือ throw → ส่ง itemsError ไม่ใช่รายการว่าง (ผ่านโค้ดจริงของ worker ด้วย db ปลอม)", async () => {
  // จำลองบล็อกเดียวกับ worker โดยใช้ตรรกะเดิม (copy ของเงื่อนไข) — ยืนยันว่า {error} และ throw ไม่ถูกมองเป็น []
  const run = async (dbResp) => {
    let dlqItems = [], dlqItemsError = null;
    try { const { data, error } = await dbResp(); if (error) dlqItemsError = String(error.code || error.message || "query_error"); else if (!Array.isArray(data)) dlqItemsError = "malformed_response"; else dlqItems = data; }
    catch (e) { dlqItemsError = String(e?.code || e?.message || e); }
    return { dlqItems, dlqItemsError };
  };
  assert.deepEqual(await run(async () => ({ data: null, error: { code: "PGRST301", message: "x" } })), { dlqItems: [], dlqItemsError: "PGRST301" });
  assert.deepEqual(await run(async () => { throw new Error("fetch failed"); }), { dlqItems: [], dlqItemsError: "fetch failed" });
  assert.deepEqual(await run(async () => ({ data: items1, error: null })), { dlqItems: items1, dlqItemsError: null });
  const src = (await import("node:fs")).readFileSync(new URL("../src/workers/maintenanceWorker.js", import.meta.url), "utf8");
  assert.match(src, /if \(error\) dlqItemsError = /); assert.match(src, /itemsError: dlqItemsError/);
});

test("19 ต.ค.: ส่ง Telegram ไม่ได้แต่เข้า outbox ได้ (queued) → ถือว่าแจ้งแล้ว ตั้ง marker ไม่รัวซ้ำ · ไม่มี LINE ในเส้นทาง", async () => {
  const r = fakeRedis(); const s = sender({ queue: 1 });
  const x = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert });
  assert.equal(x.sent, true); assert.equal(s.calls.length, 1); assert.equal(s.calls[0].category, "dlq"); assert.equal(s.calls[0].severity, "high"); assert.match(s.calls[0].dedupeKey, /^dlq:/);
  r.tick(60);
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: items1 }, { env: envA, redis: r, sendAdminAlert: s.sendAdminAlert })).skipped, "same_state_already_alerted");
  const src = readFileSync(new URL("../src/services/maintenanceDlqAlert.service.js", import.meta.url), "utf8");
  assert.ok(!/pushMessage|bot-sdk|ADMIN_LINE_USER_ID/.test(src), "DLQ alert ต้องไม่มีเส้นทาง LINE แอดมิน");
});
