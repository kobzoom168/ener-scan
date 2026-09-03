import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Static source contracts — Cost Discovery instrumentation (Codex 3 ก.ย. 2026)
 *  instrumentation-only: กันถอย tag/telemetry โดยไม่แตะ decision ใด ๆ */
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("wrapper: user ส่ง OpenRouter เป็น env:callSite และถอด telemetry ออกจาก payload", () => {
  const s = read("src/services/openaiDeepScan.api.js");
  assert.match(s, /TELEMETRY_ENV_LABEL/);
  // env prefix ทำที่ชั้น rawClient เท่านั้น — transport ที่ inject ในเทสต์เห็น callSite ดิบ
  assert.match(s, /const envTagUser = \(u\) => `\$\{TELEMETRY_ENV_LABEL\}:\$\{String\(u \|\| "untagged"\)\}`/);
  assert.equal((s.match(/user: envTagUser\(p\?\.user\)/g) || []).length, 3, "responses+embeddings+chat ต้องผ่าน envTagUser ครบ");
  assert.match(s, /const \{ telemetry: rawTelemetry, \.\.\.p \}/);
  assert.match(s, /contextReason/);
  assert.match(s, /"non_scan"/);
  assert.match(s, /SCAN_CALL_MISSING_JOB_CONTEXT/);
  assert.match(s, /generationId/);
  // LLM_USAGE ทั้งฝั่ง ok และ error ต้องมี usageExtras
  assert.equal((s.match(/\.\.\.usageExtras/g) || []).length >= 2, true);
});

test("processScanJob: ครอบ job ด้วย runWithScanJobContext (jobIdPrefix/accessSource/attempt)", () => {
  const s = read("src/services/scanV2/processScanJob.service.js");
  assert.match(s, /runWithScanJobContext\(telemetryCtx/);
  assert.match(s, /jobIdPrefix: String\(jobRow\.id\)\.slice\(0, 8\)/);
  assert.match(s, /accessSource: String\(jobRow\.access_source/);
  assert.match(s, /processScanJobInner\(workerId, jobRow\)/);
});

test("verifier: 2D loop ส่ง candidateRank/candidateCount/decisionPath และ verifier forward telemetry", () => {
  const loop = read("src/services/scanV2/tryCrossAccountEmbeddingBaselineReuse.service.js");
  assert.match(loop, /candidateRank,\s*\n\s*candidateCount: pool\.length/);
  assert.match(loop, /deps\.decisionPath \|\| "2d_embedding"/);
  const ver = read("src/services/scanV2/objectSameIdentityVerifier.service.js");
  assert.match(ver, /telemetry = null/);
  assert.match(ver, /\{ telemetry \}/);
  const reid = read("src/services/scanV2/tryVisionReidBaselineReuse.service.js");
  assert.match(reid, /decisionPath: "2g_reid_arbiter"/);
  assert.match(reid, /decisionPath: "2g_reid",/);
});

test("embeddings ติด tag objectEmbedding.vector + gemini ติด env prefix", () => {
  assert.match(read("src/services/objectEmbedding.service.js"), /user: "objectEmbedding\.vector"/);
  const g = read("src/integrations/gemini/geminiFlash.api.js");
  assert.match(g, /TELEMETRY_ENV_LABEL/);
  assert.match(g, /\$\{TELEMETRY_ENV_LABEL\}:\$\{String\(opts\.callSite\)\}/);
});

test("ห้ามมี secret/key อยู่ในไฟล์ที่แก้ (กัน key หลุด log/โค้ด)", () => {
  for (const p of [
    "src/services/openaiDeepScan.api.js",
    "src/integrations/gemini/geminiFlash.api.js",
    "src/core/telemetry/scanJobContext.js",
  ]) {
    assert.doesNotMatch(read(p), /sk-or-v1-[A-Za-z0-9]/);
  }
});
