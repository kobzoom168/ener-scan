import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Week2 instrumentation tests (Codex): pre-job context / opaquePairId / call-count ไม่เปลี่ยน / no-PII */
const HERMETIC_ENV = {
  OPENAI_API_KEY: "sk-hermetic", LOCAL_POSTGREST_URL: "http://hermetic.invalid", LOCAL_POSTGREST_ANON_KEY: "x",
  LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_URL: "http://hermetic.invalid", SUPABASE_SERVICE_ROLE_KEY: "x",
  CHANNEL_ACCESS_TOKEN: "hermetic", CHANNEL_SECRET: "hermetic", GEMINI_API_KEY: "hermetic",
  LLM_FRONT_PROVIDER: "openrouter", OPENROUTER_API_KEY: "hermetic", REDIS_URL: "",
};
for (const [k, v] of Object.entries(HERMETIC_ENV)) if (process.env[k] === undefined) process.env[k] = v;

const { runWithScanJobContext } = await import("../src/core/telemetry/scanJobContext.js");
const { buildLlmUsageContext } = await import("../src/core/telemetry/llmUsage.util.js");
const { withUsageTracking } = await import("../src/services/openaiDeepScan.api.js");
const { buildOpaquePairId } = await import("../src/services/scanV2/tryCrossAccountEmbeddingBaselineReuse.service.js");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("pre-job context: preJobRef ไหลลง usage + contextReason=pre_job และไม่มี UID", async () => {
  const got = await runWithScanJobContext({ preJobRef: "pj1:abcdef123456", reason: "pre_job" }, async () =>
    buildLlmUsageContext({}),
  );
  assert.equal(got.preJobRef, "pj1:abcdef123456");
  assert.equal(got.contextReason, "pre_job");
  assert.equal(got.jobIdPrefix, null);
});

test("opaquePairId: stable/versioned จาก imageBuffer+candidateId · ไม่มี UID · เปลี่ยนตามรูปและ candidate", () => {
  const ctx = { imageBuffer: Buffer.from("img-bytes-1"), jobId: "j1" };
  const a1 = buildOpaquePairId(ctx, { id: "cand-1" });
  const a2 = buildOpaquePairId(ctx, { id: "cand-1" });
  const b = buildOpaquePairId(ctx, { id: "cand-2" });
  const c = buildOpaquePairId({ imageBuffer: Buffer.from("img-bytes-2") }, { id: "cand-1" });
  assert.match(a1, /^pv1:[0-9a-f]{20}$/);
  assert.equal(a1, a2, "ต้อง stable");
  assert.notEqual(a1, b);
  assert.notEqual(a1, c);
});

test("telemetry ใหม่ (opaquePairId/candidateIdPrefix) ไม่ถึง provider transport และ call count ไม่เปลี่ยน", async () => {
  const calls = [];
  const fake = withUsageTracking("responses", async (p) => {
    calls.push(p);
    assert.equal("telemetry" in p, false);
    return { id: "gen-w2", usage: {} };
  });
  const logs = [];
  const oLog = console.log;
  console.log = (x) => logs.push(String(x));
  try {
    await fake({ user: "objectSameIdentityVerifier", model: "m", telemetry: { opaquePairId: "pv1:deadbeefdeadbeefdead", candidateIdPrefix: "cand1234", candidateRank: 2, candidateCount: 5, decisionPath: "2d_embedding" } });
  } finally {
    console.log = oLog;
  }
  assert.equal(calls.length, 1, "transport call count ต้องเท่าเดิม (1)");
  const u = JSON.parse(logs.find((l) => l.includes("LLM_USAGE")));
  assert.equal(u.opaquePairId, "pv1:deadbeefdeadbeefdead");
  assert.equal(u.candidateIdPrefix, "cand1234");
});

test("static: webhook pre-job wrap + terminal typed + 2G LIGHTGLUE_RESULT มี pair/candidate/version", () => {
  const w = read("src/routes/lineWebhook.js");
  assert.match(w, /preJobRefOf\(/);
  assert.match(w, /runWithScanJobContext\(\{ preJobRef, reason: "pre_job" \}/);
  assert.match(w, /PRE_JOB_GATE_TERMINAL/);
  assert.match(w, /terminalReason: "rejected_before_job"/);
  const g = read("src/services/scanV2/tryVisionReidBaselineReuse.service.js");
  assert.match(g, /opaquePairId: telemetry\?\.opaquePairId/);
  assert.match(g, /matcherVersion: "lightglue-sidecar-v1"/);
  const d = read("src/services/scanV2/tryCrossAccountEmbeddingBaselineReuse.service.js");
  assert.match(d, /opaquePairId: buildOpaquePairId\(ctx, cand\)/);
  assert.match(d, /matcherVersion: "llm-verifier-v1"/);
  // ห้าม log UID เต็มในบรรทัดใหม่ (preJobRef เป็น hash เท่านั้น)
  assert.doesNotMatch(w.split("PRE_JOB_GATE_TERMINAL")[1].slice(0, 300), /lineUserId|userId/);
});
