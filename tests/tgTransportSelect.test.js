/**
 * regression — การเลือก transport ของ Telegram ใน harness (Codex 2 ต.ค. 2026):
 * mock เฉพาะ automated/--dry-run · โหมด live จริงต้องไปที่ transport จริง — พิสูจน์ด้วย spy แทน fetch (ไม่มีการส่งจริง)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { selectTelegramTransport, installTelegramTransport } from "../scripts/ops/fixtures/tg-transport.mjs";

const spy = { calls: [] };
const fakeFetch = async (input) => { spy.calls.push(String(input)); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }); };
// shortCircuitFetch แบบเดียวกับ it-network-guard: ครอบ fetch ปัจจุบัน ตอบเองเมื่อ pattern ตรง
function shortCircuitFetch(pattern, response) { const real = globalThis.fetch; globalThis.fetch = function (input, init) { const u = String(input); if (pattern.test(u)) return Promise.resolve(response(u)); return real.call(this, input, init); }; }
const URL_TG = "https://api.telegram.org/bot123:abc/sendMessage";

test("ตารางเลือก transport", () => {
  assert.equal(selectTelegramTransport({ mode: undefined, dryRun: false }), "mock");
  assert.equal(selectTelegramTransport({ mode: "live", dryRun: true }), "mock");
  assert.equal(selectTelegramTransport({ mode: "live", dryRun: false }), "real");
});

test("automated / --dry-run → mock: spy ชั้นล่างไม่ถูกเรียก แต่บันทึก method", async () => {
  for (const cfg of [{ mode: undefined, dryRun: false }, { mode: "live", dryRun: true }]) {
    globalThis.fetch = fakeFetch; spy.calls.length = 0; const calls = [];
    assert.equal(installTelegramTransport({ ...cfg, calls, shortCircuitFetch }), "mock");
    const r = await fetch(URL_TG, { method: "POST", body: JSON.stringify({ chat_id: 1 }) });
    assert.equal((await r.json()).ok, true);
    assert.deepEqual(spy.calls, [], "mock ต้องไม่ถึง transport จริง");
    assert.equal(calls.length, 1); assert.equal(calls[0].method, "sendMessage"); assert.equal(calls[0].transport, "mock");
  }
});

test("live (ไม่ dry-run) → real: ไปถึง transport จริง (spy) และบันทึก status · URL อื่นผ่านตามปกติ", async () => {
  globalThis.fetch = fakeFetch; spy.calls.length = 0; const calls = [];
  assert.equal(installTelegramTransport({ mode: "live", dryRun: false, calls, shortCircuitFetch }), "real");
  await fetch(URL_TG, { method: "POST", body: JSON.stringify({ chat_id: 1 }) });
  await fetch("https://example.invalid/other");
  assert.deepEqual(spy.calls, [URL_TG, "https://example.invalid/other"]);
  assert.equal(calls.length, 1); assert.equal(calls[0].transport, "real"); assert.equal(calls[0].method, "sendMessage"); assert.equal(calls[0].status, 200);
  assert.ok(!JSON.stringify(calls).includes("123:abc"), "token ต้องไม่ถูกบันทึก");
});
