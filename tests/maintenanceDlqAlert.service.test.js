import { test } from "node:test";
import assert from "node:assert/strict";
import { maybeSendDlqAlert } from "../src/services/maintenanceDlqAlert.service.js";

// 19 ต.ค. 2026: DLQ alert → Telegram ผ่าน adminAlert (ไม่มี LINE แอดมิน) — เทสต์ฉบับ smoke (ฉบับ dedupe เต็มอยู่ใน dlqAlert.dedupe.test.js)
const baseEnv = { ADMIN_ALERT_TELEGRAM_CHAT_ID: "-1001000000000001", APP_ENV: "staging", CANARY_DLQ_DEAD_ALERT_THRESHOLD: 1 };
const redisOff = { isAvailable: async () => false, getValue: async () => null, setValueWithTtl: async () => {}, tryDedupeOnce: async () => true };
const alertSpy = (result = { ok: true }) => { const calls = []; return { calls, sendAdminAlert: async (p) => { calls.push(p); return typeof result === "function" ? result() : result; } }; };

test("maybeSendDlqAlert: below threshold → no alert", async () => {
  const s = alertSpy();
  await maybeSendDlqAlert({ outDead: 0, outFailed: 0 }, { env: { ...baseEnv, CANARY_DLQ_DEAD_ALERT_THRESHOLD: 1 }, redis: redisOff, sendAdminAlert: s.sendAdminAlert });
  assert.equal(s.calls.length, 0);
});

test("maybeSendDlqAlert: dead below custom threshold → no alert", async () => {
  const s = alertSpy();
  await maybeSendDlqAlert({ outDead: 2, outFailed: 0 }, { env: { ...baseEnv, CANARY_DLQ_DEAD_ALERT_THRESHOLD: 3 }, redis: redisOff, sendAdminAlert: s.sendAdminAlert });
  assert.equal(s.calls.length, 0);
});

test("maybeSendDlqAlert: threshold met → single Telegram alert (category dlq, severity high), text mentions dead/failed counts", async () => {
  const s = alertSpy();
  const r = await maybeSendDlqAlert({ outDead: 2, outFailed: 3 }, { env: baseEnv, redis: redisOff, sendAdminAlert: s.sendAdminAlert });
  assert.equal(r.sent, true); assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].category, "dlq"); assert.equal(s.calls[0].severity, "high");
  assert.match(s.calls[0].text, /dead = 2, failed = 3/); assert.match(s.calls[0].text, /\[staging\]/);
});

test("maybeSendDlqAlert: ไม่ได้ตั้ง chat → ยังเรียก adminAlert (log ไม่เงียบ) ไม่ใช้ LINE · ไม่ตั้ง marker (รอบหน้าลองใหม่จนตั้งค่า) · ส่งล้มแต่เข้า outbox = แจ้งแล้ว", async () => {
  const s = alertSpy({ ok: false, queued: false, reason: "not_configured" });
  const r = await maybeSendDlqAlert({ outDead: 1, outFailed: 0 }, { env: { APP_ENV: "staging", CANARY_DLQ_DEAD_ALERT_THRESHOLD: 1 }, redis: redisOff, sendAdminAlert: s.sendAdminAlert });
  assert.equal(s.calls.length, 1); assert.equal(r.sent, false); assert.match(r.error, /not_configured/);
  const q = alertSpy({ ok: false, queued: true, reason: "http_500" });
  assert.equal((await maybeSendDlqAlert({ outDead: 1, outFailed: 0 }, { env: baseEnv, redis: redisOff, sendAdminAlert: q.sendAdminAlert })).sent, true, "queued ใน outbox = ถือว่าแจ้งแล้ว (outbox รับประกันส่ง)");
});

test("maybeSendDlqAlert: adminAlert throw หรือคืน not queued → ไม่ throw, sent=false (รอบหน้าลองใหม่)", async () => {
  const s1 = alertSpy(() => { throw new Error("boom"); });
  await assert.doesNotReject(async () => { const r = await maybeSendDlqAlert({ outDead: 1, outFailed: 0 }, { env: baseEnv, redis: redisOff, sendAdminAlert: s1.sendAdminAlert }); assert.equal(r.sent, false); assert.match(r.error, /boom/); });
  const s2 = alertSpy({ ok: false, queued: false, reason: "lost" });
  const r2 = await maybeSendDlqAlert({ outDead: 1, outFailed: 0 }, { env: baseEnv, redis: redisOff, sendAdminAlert: s2.sendAdminAlert });
  assert.equal(r2.sent, false); assert.match(r2.error, /lost/);
});

// Codex รอบ 2 ข้อ 1: เส้นจริง (ไม่ mock sendAdminAlert, ไม่ฉีด Telegram env ผ่าน deps.env) — ค่าตั้งใน process.env ต้องถูกอ่าน
test("เส้นจริง: Telegram ตั้งใน process.env · deps.env = config env (ไม่มีตัวแปร Telegram) → ส่งถึง Telegram จริง (fetch fake) ไม่ใช่ not_configured", async () => {
  const saved = { ...process.env };
  const calls = [];
  const fetchFake = async (url, init) => { calls.push({ url: String(url).replace(/bot[^/]+/, "bot<token>"), body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  try {
    process.env.ADMIN_ALERT_TELEGRAM_CHAT_ID = "-1001000000000009";
    process.env.TELEGRAM_BOT_TOKEN = "123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const r = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: [{ id: "a1", updated_at: "2026-10-19T00:00:00Z" }] }, { env: { APP_ENV: "staging", CANARY_DLQ_DEAD_ALERT_THRESHOLD: 1, TELEGRAM_BOT_TOKEN: undefined }, redis: redisOff, fetch: fetchFake, alertRedis: { getValue: async () => null, setValueWithTtl: async () => {} }, db: { rpc: async () => ({ error: { message: "must not enqueue on success" } }) } });
    assert.equal(r.sent, true, JSON.stringify(r)); assert.equal(calls.length, 1);
    assert.equal(calls[0].body.chat_id, "-1001000000000009"); assert.match(calls[0].body.text, /^\[staging\]\[dlq\]\[high\]\n\[DLQ Alert\]\[staging\] outbound_messages\.dead = 1/);
    // ไม่ตั้งใน process.env และไม่มีใน deps.env → not_configured (ไม่ยิง)
    delete process.env.ADMIN_ALERT_TELEGRAM_CHAT_ID;
    const oe = console.error; console.error = () => {};
    let r2; try { r2 = await maybeSendDlqAlert({ outDead: 1, outFailed: 0, items: [{ id: "a2", updated_at: "2026-10-19T00:00:00Z" }] }, { env: { APP_ENV: "staging", CANARY_DLQ_DEAD_ALERT_THRESHOLD: 1 }, redis: redisOff, fetch: fetchFake }); } finally { console.error = oe; }
    assert.equal(r2.sent, false); assert.match(r2.error, /not_configured/); assert.equal(calls.length, 1);
  } finally { for (const k of ["ADMIN_ALERT_TELEGRAM_CHAT_ID", "TELEGRAM_BOT_TOKEN"]) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
});
