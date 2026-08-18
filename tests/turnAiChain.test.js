/**
 * Codex P0-6 behavior: CHAT_TURN_AI_CHAIN telemetry
 * ALS isolation ระหว่างเทิร์นขนาน · นอก context = no-op · emit ครบ field
 */
import test from "node:test";
import assert from "node:assert/strict";
import fsMod from "node:fs";
import {
  runWithTurnContext,
  recordTurnAiCall,
  recordTurnAiLatency,
  annotateTurn,
  emitTurnAiChain,
} from "../src/core/telemetry/turnAiChain.js";

function captureEmit(fn) {
  const lines = [];
  const orig = console.log;
  console.log = (s) => { lines.push(String(s)); };
  try { fn(); } finally { console.log = orig; }
  return lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

test("เทิร์นขนานสองอันนับแยกกัน (ALS isolation)", async () => {
  const results = {};
  await Promise.all([
    runWithTurnContext({ messageId: "a", kind: "text" }, async () => {
      recordTurnAiCall("planner");
      await new Promise((r) => setTimeout(r, 20));
      recordTurnAiCall("consult");
      const out = captureEmit(() => emitTurnAiChain());
      results.a = out.find((o) => o.event === "CHAT_TURN_AI_CHAIN");
    }),
    runWithTurnContext({ messageId: "b", kind: "image" }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      recordTurnAiCall("verifier");
      const out = captureEmit(() => emitTurnAiChain());
      results.b = out.find((o) => o.event === "CHAT_TURN_AI_CHAIN");
    }),
  ]);
  assert.equal(results.a.aiCallCount, 2);
  assert.deepEqual(results.a.callSites, ["planner", "consult"]);
  assert.equal(results.a.messageId, "a");
  assert.equal(results.b.aiCallCount, 1);
  assert.deepEqual(results.b.callSites, ["verifier"]);
  assert.equal(results.b.kind, "image");
});

test("นอก context: record/emit เป็น no-op ไม่พัง ไม่ log", () => {
  recordTurnAiCall("stray");
  recordTurnAiLatency(50);
  const out = captureEmit(() => emitTurnAiChain());
  assert.equal(out.filter((o) => o.event === "CHAT_TURN_AI_CHAIN").length, 0);
});

test("aiLatencyMs สะสมแยกจาก turnLatencyMs + annotate state ติดไปด้วย", async () => {
  await runWithTurnContext({ messageId: "c", kind: "text" }, async () => {
    recordTurnAiCall("x");
    recordTurnAiLatency(120);
    recordTurnAiLatency(80);
    recordTurnAiLatency(-5); // ค่าลบต้องไม่ลดยอด
    annotateTurn({ state: "idle" });
    await new Promise((r) => setTimeout(r, 10));
    const out = captureEmit(() => emitTurnAiChain());
    const e = out.find((o) => o.event === "CHAT_TURN_AI_CHAIN");
    assert.equal(e.aiLatencyMs, 200);
    assert.ok(e.turnLatencyMs >= 10);
    assert.equal(e.state, "idle");
  });
});

/* ---------------- Codex 18d5d3a P0-6: OpenAI wrapper ต้องเข้า chain ---------------- */

test("openai withUsageTracking: success + error ต่างก็นับ attempted call เข้า chain", async () => {
  const { withUsageTracking } = await import("../src/services/openaiDeepScan.api.js");
  const okCall = withUsageTracking("responses", async () => ({ id: "r1", usage: { input_tokens: 1, output_tokens: 1 } }));
  const failCall = withUsageTracking("responses", async () => { throw new Error("timeout"); });
  await runWithTurnContext({ messageId: "oai", kind: "text" }, async () => {
    await okCall({ user: "conversationSurface", model: "gpt-x" });
    await assert.rejects(() => failCall({ user: "conversationSurface.retry", model: "gpt-x" }));
    const out = captureEmit(() => emitTurnAiChain());
    const e = out.find((o) => o.event === "CHAT_TURN_AI_CHAIN");
    assert.equal(e.aiCallCount, 2, "error/timeout ต้องนับ attempted ด้วย");
    assert.deepEqual(e.callSites, [
      "openai.responses:conversationSurface",
      "openai.responses:conversationSurface.retry",
    ]);
    assert.ok(e.aiLatencyMs >= 0);
  });
});

test("gemini paths ครบทั้ง compat และ google-direct (source contract ใน geminiFlash)", () => {
  const s = fsMod.readFileSync("src/integrations/gemini/geminiFlash.api.js", "utf8");
  const hits = [...s.matchAll(/recordTurnAiCall\(/g)].length;
  assert.ok(hits >= 2, `ต้องบันทึกทั้ง compat และ google path (พบ ${hits})`);
  assert.ok([...s.matchAll(/recordTurnAiLatency\(/g)].length >= 2);
});
