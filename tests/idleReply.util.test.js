/**
 * Codex P0-5 behavior: idle bypass เฉพาะ true-idle free-form fallback
 * เมนู → deterministic (planner=0, consult=0) · true-idle knowledge → consult ผ่าน
 * orchestrator (จุดเดียว) · orchestrator null/ไม่ handled → deterministic fallback
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { replyIdleTextNoDuplicate } from "../src/services/lineWebhook/idleReply.util.js";

function harness() {
  const calls = { orchestrator: 0, orchestratorArgs: [], sent: [] };
  const deps = {
    sendNonScanReply: async (p) => { calls.sent.push(p); },
    buildIdleDeterministicPrimaryText: () => "ข้อความ deterministic",
    buildIdleText: async () => null,
  };
  return { calls, deps };
}

test("เมนู (flag ไม่เปิด): orchestrator=0 · ตอบ deterministic", async () => {
  const { calls, deps } = harness();
  const r = await replyIdleTextNoDuplicate({
    client: {}, replyToken: "rt", userId: "U1",
    invokePhase1GeminiOrchestrator: async () => { calls.orchestrator += 1; return { handled: true }; },
    // ไม่ส่ง allowIdleDirectConsult (default false) — เส้นเมนู/help/start
    deps,
  });
  assert.equal(calls.orchestrator, 0, "เมนูห้ามแตะ orchestrator (planner=0, consult=0)");
  assert.equal(r.via, "deterministic");
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.sent[0].replyType, "idle_post_scan");
});

test("true idle + orchestrator handled (consult ตอบ): จบที่ orchestrator ไม่ส่งซ้ำ", async () => {
  const { calls, deps } = harness();
  const r = await replyIdleTextNoDuplicate({
    client: {}, replyToken: "rt", userId: "U1",
    invokePhase1GeminiOrchestrator: async (opts) => {
      calls.orchestrator += 1;
      calls.orchestratorArgs.push(opts);
      return { handled: true };
    },
    allowIdleDirectConsult: true,
    deps,
  });
  assert.equal(calls.orchestrator, 1);
  assert.deepEqual(calls.orchestratorArgs[0], { allowIdleDirectConsult: true }, "flag ต้องส่งเข้า orchestrator ให้เข้าเส้น consult bypass");
  assert.equal(r.via, "orchestrator");
  assert.equal(calls.sent.length, 0);
});

test("true idle + consult null (ไม่ handled): deterministic fallback เสมอ", async () => {
  const { calls, deps } = harness();
  const r = await replyIdleTextNoDuplicate({
    client: {}, replyToken: "rt", userId: "U1",
    invokePhase1GeminiOrchestrator: async () => { calls.orchestrator += 1; return { handled: false, reason: "idle_bypass_consult_null" }; },
    allowIdleDirectConsult: true,
    deps,
  });
  assert.equal(calls.orchestrator, 1);
  assert.equal(r.via, "deterministic");
  assert.equal(calls.sent.length, 1, "consult null ต้องได้ deterministic fallback");
});

test("orchestrator bypass ฝั่ง consult ไม่แตะ planner (source contract ใน orchestrator)", () => {
  const s = fs.readFileSync("src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js", "utf8");
  const bypass = s.indexOf('ctx.allowIdleDirectConsult === true');
  const planner = s.indexOf("await runGeminiPlanner(", bypass);
  const bypassBlockEnd = s.indexOf('idle_bypass_consult_null', bypass);
  assert.ok(bypass > 0 && bypassBlockEnd > 0 && planner > bypassBlockEnd, "bypass block ต้อง return ก่อนถึง planner");
});

test("webhook: จุดเปิด flag มีที่เดียว = true-idle fallback · เมนู/pending-verify ไม่เปิด (source contract)", () => {
  const s = fs.readFileSync("src/routes/lineWebhook.js", "utf8");
  // caller ฝั่ง webhook เปิด flag ได้ที่เดียว (นอก util)
  const hits = [...s.matchAll(/allowIdleDirectConsult: true/g)].length;
  assert.equal(hits, 1, "จุดเปิด bypass ใน webhook ต้องมีที่เดียว");
  const idx = s.indexOf("allowIdleDirectConsult: true");
  const back = s.slice(Math.max(0, idx - 400), idx);
  assert.ok(back.includes("True idle"), "จุดที่เปิดต้องเป็น true-idle fallback เท่านั้น");
});
