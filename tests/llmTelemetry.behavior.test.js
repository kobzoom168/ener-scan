import test from "node:test";
import assert from "node:assert/strict";

/** Behavior tests — LLM telemetry (Codex P0-2, 3 ก.ย. 2026) — hermetic ทุกข้อ
 *  พิสูจน์ ALS isolation จริง + LLM_USAGE exactly-1 ทุก provider path + strip + fail-open */

const HERMETIC_ENV = {
  OPENAI_API_KEY: "sk-hermetic", LOCAL_POSTGREST_URL: "http://hermetic.invalid", LOCAL_POSTGREST_ANON_KEY: "x",
  LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_URL: "http://hermetic.invalid", SUPABASE_SERVICE_ROLE_KEY: "x",
  CHANNEL_ACCESS_TOKEN: "hermetic", CHANNEL_SECRET: "hermetic", GEMINI_API_KEY: "hermetic",
  LLM_FRONT_PROVIDER: "openrouter", OPENROUTER_API_KEY: "hermetic", REDIS_URL: "",
};
for (const [k, v] of Object.entries(HERMETIC_ENV)) if (process.env[k] === undefined) process.env[k] = v;

const { runWithScanJobContext, getScanJobContext } = await import("../src/core/telemetry/scanJobContext.js");
const { withUsageTracking } = await import("../src/services/openaiDeepScan.api.js");
const { buildCompatModel, wrapGoogleModel } = await import("../src/integrations/gemini/geminiFlash.api.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function captureConsole() {
  const logs = [];
  const warns = [];
  const oLog = console.log;
  const oWarn = console.warn;
  console.log = (x) => logs.push(String(x));
  console.warn = (x) => warns.push(String(x));
  return {
    logs,
    warns,
    usages: () =>
      logs
        .filter((l) => l.includes('"LLM_USAGE"'))
        .map((l) => JSON.parse(l)),
    restore: () => {
      console.log = oLog;
      console.warn = oWarn;
    },
  };
}

test("P0-2.1+2: ALS isolation — 2 jobs พร้อมกัน (Promise.all + nested await/setTimeout) context ไม่ปนกัน", async () => {
  const seen = { A: [], B: [] };
  const jobFlow = (name, ctx) =>
    runWithScanJobContext(ctx, async () => {
      seen[name].push(getScanJobContext().jobIdPrefix);
      await sleep(name === "A" ? 15 : 5);
      seen[name].push(getScanJobContext().jobIdPrefix);
      await new Promise((res) =>
        setTimeout(() => {
          seen[name].push(getScanJobContext().jobIdPrefix); // nested setTimeout ยังเห็น ctx ถูก job
          res();
        }, name === "A" ? 5 : 20),
      );
      return getScanJobContext();
    });
  const [ra, rb] = await Promise.all([
    jobFlow("A", { jobIdPrefix: "jobAAAAA", accessSource: "paid", attempt: 1 }),
    jobFlow("B", { jobIdPrefix: "jobBBBBB", accessSource: "free", attempt: 2 }),
  ]);
  assert.deepEqual(seen.A, ["jobAAAAA", "jobAAAAA", "jobAAAAA"]);
  assert.deepEqual(seen.B, ["jobBBBBB", "jobBBBBB", "jobBBBBB"]);
  assert.equal(ra.accessSource, "paid");
  assert.equal(rb.accessSource, "free");
  assert.equal(rb.attempt, 2);
});

test("P0-2.3: หลัง callback จบ context ต้องหาย", async () => {
  await runWithScanJobContext({ jobIdPrefix: "jobXXXXX", accessSource: "paid" }, async () => {
    assert.equal(getScanJobContext().jobIdPrefix, "jobXXXXX");
  });
  assert.equal(getScanJobContext(), null);
});

test("P0-2.4+8+12: OpenAI success → LLM_USAGE 1 record · telemetry ไม่ถึง transport · transport ถูกเรียกครั้งเดียว", async () => {
  const cap = captureConsole();
  try {
    const transportCalls = [];
    const fake = withUsageTracking("responses", async (p) => {
      transportCalls.push(p);
      assert.equal("telemetry" in p, false, "telemetry ต้องถูกถอดก่อนถึง transport");
      return { id: "gen-test-1", usage: { input_tokens: 10, output_tokens: 2 } };
    });
    await runWithScanJobContext({ jobIdPrefix: "jobCCCCC", accessSource: "paid", attempt: 3 }, () =>
      fake({ user: "deepScan", model: "m1", telemetry: { candidateRank: 1, candidateCount: 4, decisionPath: "2d_embedding" } }),
    );
    const us = cap.usages();
    assert.equal(us.length, 1);
    assert.equal(transportCalls.length, 1);
    const u = us[0];
    assert.equal(u.ok, true);
    assert.equal(u.jobIdPrefix, "jobCCCCC");
    assert.equal(u.accessSource, "paid");
    assert.equal(u.attempt, 3);
    assert.equal(u.candidateRank, 1);
    assert.equal(u.candidateCount, 4);
    assert.equal(u.decisionPath, "2d_embedding");
    assert.equal(u.generationId, "gen-test-1");
    assert.equal(u.contextReason, null);
    assert.equal(typeof u.latencyMs, "number");
  } finally {
    cap.restore();
  }
});

test("P0-2.5: OpenAI throw → LLM_USAGE 1 record (ok:false) และ rethrow error เดิม", async () => {
  const cap = captureConsole();
  try {
    const boom = new Error("upstream exploded");
    const fake = withUsageTracking("responses", async () => {
      throw boom;
    });
    await assert.rejects(() => fake({ user: "deepScan", model: "m1" }), (e) => e === boom);
    const us = cap.usages();
    assert.equal(us.length, 1);
    assert.equal(us[0].ok, false);
  } finally {
    cap.restore();
  }
});

test("P0-2.6: compat success / http error / abort → LLM_USAGE อย่างละ 1 (typed failureType, ไม่มี raw body)", async () => {
  const prevFetch = globalThis.fetch;
  const cap = captureConsole();
  try {
    const model = buildCompatModel("openrouter", { callSite: "planner", timeoutMs: 5000 });
    // success
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      assert.equal("telemetry" in body, false);
      assert.match(String(body.user || ""), /^(pro|staging|local):planner$/);
      return { ok: true, status: 200, json: async () => ({ id: "gen-compat-1", choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 5, completion_tokens: 1 } }) };
    };
    await model.generateContent("hi");
    // http 402 พร้อม body ที่ต้องไม่หลุด log
    globalThis.fetch = async () => ({ ok: false, status: 402, text: async () => "SECRET-REQUEST-ECHO sk-or-v1-abcdef" });
    await assert.rejects(() => model.generateContent("hi"));
    // abort
    globalThis.fetch = async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    };
    await assert.rejects(() => model.generateContent("hi"));
    const us = cap.usages();
    assert.equal(us.length, 3);
    assert.deepEqual(us.map((u) => u.ok), [true, false, false]);
    assert.equal(us[0].generationId, "gen-compat-1");
    assert.equal(us[1].failureType, "http_402");
    assert.equal(us[2].failureType, "abort");
    for (const u of us.slice(1)) {
      const s = JSON.stringify(u);
      assert.doesNotMatch(s, /SECRET-REQUEST-ECHO/, "ห้าม log raw provider error body");
      assert.doesNotMatch(s, /sk-or-v1-abcdef/);
    }
    assert.equal(us[0].contextReason, "non_scan");
  } finally {
    globalThis.fetch = prevFetch;
    cap.restore();
  }
});

test("P0-2.7: Google-direct success / error → LLM_USAGE อย่างละ 1", async () => {
  const cap = captureConsole();
  try {
    const good = wrapGoogleModel(
      { generateContent: async () => ({ response: { text: () => "ok", responseId: "resp-g-1", usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } } }) },
      { callSite: "phrasing", modelId: "gemini-test" },
    );
    await good.generateContent("hi");
    const bad = wrapGoogleModel(
      { generateContent: async () => { throw new Error("google_timeout something"); } },
      { callSite: "phrasing", modelId: "gemini-test" },
    );
    await assert.rejects(() => bad.generateContent("hi"));
    const us = cap.usages();
    assert.equal(us.length, 2);
    assert.equal(us[0].ok, true);
    assert.equal(us[0].provider, "google");
    assert.equal(us[0].generationId, "resp-g-1");
    assert.equal(us[0].promptTokens, 7);
    assert.equal(us[1].ok, false);
    assert.equal(us[1].failureType, "timeout");
  } finally {
    cap.restore();
  }
});

test("P0-2.9+10: ไม่มี context → contextReason=non_scan · scan callSite ไม่มี context → warn แต่ call สำเร็จปกติ", async () => {
  const cap = captureConsole();
  try {
    const fake = withUsageTracking("responses", async () => ({ id: "gen-x", usage: {} }));
    const r = await fake({ user: "objectCheck.strict", model: "m1" });
    assert.equal(r.id, "gen-x");
    const us = cap.usages();
    assert.equal(us.length, 1);
    assert.equal(us[0].contextReason, "non_scan");
    assert.equal(cap.warns.filter((w) => w.includes("SCAN_CALL_MISSING_JOB_CONTEXT")).length, 1);
  } finally {
    cap.restore();
  }
});

test("P0-2.11: console.log พัง → AI call ต้องไม่ล้ม (fail-open ของ telemetry)", async () => {
  const oLog = console.log;
  console.log = () => {
    throw new Error("console broken");
  };
  try {
    const fake = withUsageTracking("responses", async () => ({ id: "gen-y", usage: {} }));
    const r = await fake({ user: "deepScan", model: "m1" });
    assert.equal(r.id, "gen-y");
    const g = wrapGoogleModel(
      { generateContent: async () => ({ response: { text: () => "ok" } }) },
      { callSite: "phrasing" },
    );
    const rg = await g.generateContent("hi");
    assert.equal(rg.response.text(), "ok");
  } finally {
    console.log = oLog;
  }
});
