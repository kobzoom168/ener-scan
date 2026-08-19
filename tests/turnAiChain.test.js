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

test("settledAiLatencyMs สะสมต่อ call ที่ settle จริง แยกจาก turnLatencyMs + annotate state", async () => {
  await runWithTurnContext({ messageId: "c", kind: "text" }, async () => {
    const h1 = recordTurnAiCall("x");
    const h2 = recordTurnAiCall("y");
    const h3 = recordTurnAiCall("z");
    recordTurnAiLatency(120, h1);
    recordTurnAiLatency(80, h2);
    recordTurnAiLatency(-5, h3); // ค่าลบต้องไม่ลดยอด (นับ settle แต่บวก 0)
    annotateTurn({ state: "idle" });
    await new Promise((r) => setTimeout(r, 10));
    const out = captureEmit(() => emitTurnAiChain());
    const e = out.find((o) => o.event === "CHAT_TURN_AI_CHAIN");
    assert.equal(e.settledAiLatencyMs, 200);
    assert.equal(e.settledAiCallCount, 3);
    assert.equal(e.pendingAiCount, 0);
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
    assert.ok(e.settledAiLatencyMs >= 0);
    assert.equal(e.pendingAiCount, 0);
  });
});

test("gemini paths ครบทั้ง compat และ google-direct (source contract ใน geminiFlash)", () => {
  const s = fsMod.readFileSync("src/integrations/gemini/geminiFlash.api.js", "utf8");
  const hits = [...s.matchAll(/recordTurnAiCall\(/g)].length;
  assert.ok(hits >= 2, `ต้องบันทึกทั้ง compat และ google path (พบ ${hits})`);
  assert.ok([...s.matchAll(/recordTurnAiLatency\(/g)].length >= 2);
});

test("pending accounting (Codex รอบ 3): call ค้างตอน emit → pendingAiCount>0 + elapsed ไม่ใช่ศูนย์เงียบ ๆ", async () => {
  await runWithTurnContext({ messageId: "p1", kind: "text" }, async () => {
    recordTurnAiCall("consult"); // ยิงแล้วยังไม่ settle (outer timeout scenario)
    await new Promise((r) => setTimeout(r, 25));
    const out = captureEmit(() => emitTurnAiChain());
    const e = out.find((o) => o.event === "CHAT_TURN_AI_CHAIN");
    assert.equal(e.aiCallCount, 1);
    assert.equal(e.settledAiCallCount, 0);
    assert.equal(e.pendingAiCount, 1, "request ค้างต้องเห็นเป็น pending");
    assert.ok(e.pendingElapsedMs >= 20, "ต้องรายงาน elapsed ของตัวค้าง ไม่ใช่ latency=0 เฉย ๆ");
    assert.equal(e.settledAiLatencyMs, 0);
  });
});

test("embeddings เข้า wrapper แล้ว (Codex รอบ 3)", () => {
  const s = fsMod.readFileSync("src/services/openaiDeepScan.api.js", "utf8");
  const emb = s.indexOf("embeddings: {");
  const seg = s.slice(emb, emb + 300);
  assert.ok(seg.includes('withUsageTracking("embeddings"'), "embeddings ต้องผ่าน wrapper เดียวกัน");
});

test("call-ID matching (Codex รอบ 4 P1): call หลังเสร็จก่อน call แรก → pending ชี้ตัวที่ค้างจริง", async () => {
  await runWithTurnContext({ messageId: "ooo", kind: "text" }, async () => {
    const h1 = recordTurnAiCall("slow_call");   // ตัวแรก — จะค้าง
    await new Promise((r) => setTimeout(r, 15));
    const h2 = recordTurnAiCall("fast_call");   // ตัวหลัง — เสร็จก่อน
    recordTurnAiLatency(5, h2);                 // settle ตัวหลังด้วย handle
    const out = captureEmit(() => emitTurnAiChain());
    const e = out.find((o) => o.event === "CHAT_TURN_AI_CHAIN");
    assert.equal(e.pendingAiCount, 1);
    // ตัวค้างคือ slow_call (เริ่มก่อน ~15ms) — FIFO เดิมจะชี้ผิดเป็นตัวหลัง
    assert.ok(e.pendingElapsedMs >= 15, `pendingElapsedMs ต้องเป็นของ slow_call ได้ ${e.pendingElapsedMs}`);
    recordTurnAiLatency(100, h1);
    assert.ok(h1 && h2 && h1.id !== h2.id);
  });
});

test("settle guard (Codex รอบ 5 P1): settle ซ้ำด้วย handle เดิม/เกินจำนวน call → ไม่นับโป่ง", async () => {
  await runWithTurnContext({ messageId: "dup", kind: "text" }, async () => {
    const h = recordTurnAiCall("only_call");
    recordTurnAiLatency(50, h);
    recordTurnAiLatency(50, h);   // ซ้ำ handle เดิม — ต้องไม่นับ
    recordTurnAiLatency(50);       // ไม่มี call ค้างเหลือ — ต้องไม่นับ
    const out = captureEmit(() => emitTurnAiChain());
    const e = out.find((o) => o.event === "CHAT_TURN_AI_CHAIN");
    assert.equal(e.aiCallCount, 1);
    assert.equal(e.settledAiCallCount, 1, "settle ซ้ำห้ามนับเพิ่ม");
    assert.equal(e.settledAiLatencyMs, 50, "latency ซ้ำห้ามสะสมเพิ่ม");
    assert.equal(e.pendingAiCount, 0);
  });
});
