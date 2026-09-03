/**
 * flow/role audit 26 ส.ค. 2026 — behavior tests ต่อเคสจริง (hermetic: env ตั้งที่หัว, fake transport/model/DB)
 * acceptance ตามรายงาน docs/ai/reports/2026-08-26-flow-role-audit.md §3
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const HERMETIC_ENV = {
  OPENAI_API_KEY: "sk-hermetic", LOCAL_POSTGREST_URL: "http://hermetic.invalid", LOCAL_POSTGREST_ANON_KEY: "x",
  LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_URL: "http://hermetic.invalid", SUPABASE_SERVICE_ROLE_KEY: "x",
  CHANNEL_ACCESS_TOKEN: "hermetic", CHANNEL_SECRET: "hermetic", GEMINI_API_KEY: "hermetic", REDIS_URL: "", OBJECT_INFO_GATE_ENABLED: "true",
  // P0-3 budget test ผ่าน orchestrator จริง: LLM client ใช้ fetch (openrouter compat) → fake ได้
  LLM_FRONT_PROVIDER: "openrouter", OPENROUTER_API_KEY: "hermetic", OPENROUTER_BASE_URL: "http://llm.hermetic.invalid/v1",
  GEMINI_FRONT_ORCHESTRATOR_ENABLED: "true", GEMINI_FRONT_ORCHESTRATOR_MODE: "active", GEMINI_CONSULT_ENABLED: "true",
  GEMINI_FRONT_TIMEOUT_MS: "2000", GEMINI_CONSULT_TIMEOUT_MS: "2000",
};
for (const [k, v] of Object.entries(HERMETIC_ENV)) process.env[k] = v;
try {
  for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && !process.env[m[1]]) process.env[m[1]] = "test-placeholder";
  }
} catch { /* ignore */ }
const EXTERNAL = { network: 0 };
globalThis.fetch = async () => { EXTERNAL.network += 1; throw new Error("HERMETIC: network blocked"); };

/** supabase จำลองสำหรับ production helper findEarliestJobSince — เคารพ eq/gt/neq/order/limit จริง ไม่ override decision */
function fakeSupabase(rows) {
  return {
    from: () => {
      const q = { filters: [], orders: [], lim: null };
      const b = {
        select: () => b,
        eq: (c, v) => { q.filters.push((r) => String(r[c]) === String(v)); return b; },
        gt: (c, v) => { q.filters.push((r) => r[c] > v); return b; },
        neq: (c, v) => { q.filters.push((r) => String(r[c]) !== String(v)); return b; },
        order: (c, { ascending = true } = {}) => { q.orders.push([c, ascending]); return b; },
        limit: (n) => { q.lim = n; return b; },
        then: (res, rej) => {
          try {
            let out = rows.filter((r) => q.filters.every((f) => f(r)));
            out.sort((x, y) => { for (const [c, asc] of q.orders) { if (x[c] < y[c]) return asc ? -1 : 1; if (x[c] > y[c]) return asc ? 1 : -1; } return 0; });
            if (q.lim != null) out = out.slice(0, q.lim);
            res({ data: out, error: null });
          } catch (e) { rej(e); }
        },
      };
      return b;
    },
  };
}
/** redis จำลอง typed (ปิด/เปิดได้) — get / compare-and-move / getdel / set / del */
function fakeRedis(mem, state = { up: true }) {
  return {
    state,
    set: async (k, v) => { if (!state.up) return { ok: false, reason: "redis_unavailable" }; mem.set(k, v); return { ok: true }; },
    get: async (k) => { if (!state.up) return { status: "redis_unavailable", value: null }; const v = mem.get(k); return v == null ? { status: "missing", value: null } : { status: "got", value: v }; },
    moveIfValue: async (src, dst, expected) => {
      if (!state.up) return { status: "redis_unavailable", value: null };
      const v = mem.get(src); if (v == null) return { status: "no_source", value: null };
      if (v !== expected) return { status: "value_mismatch", value: null };
      mem.delete(src); mem.set(dst, v); return { status: "moved", value: v };
    },
    getdel: async (k) => { const v = mem.get(k); if (v == null) return { status: "missing", value: null }; mem.delete(k); return { status: "got", value: v }; },
    del: async (k) => { if (!state.up) return { ok: false, reason: "redis_unavailable" }; mem.delete(k); return { ok: true }; },
  };
}
const jobRow = (id, uid, createdAtMs) => ({ id, line_user_id: uid, created_at: new Date(createdAtMs).toISOString() });

/* ---------- A: pre-scan object info (เคส 1/4/9/12) ---------- */
test("A: deterministic gate — ข้อมูลชิ้นจริง 4 เคสเข้า · คำถาม/เงิน/เมนู/ข้อความทั่วไปห้ามถูกกลืน", async () => {
  const { isPreScanObjectInfoText } = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  for (const t of [
    "พระสมเด็จวัดประสาทบุญญาวาสปี 2506", // เคส 1
    "เหรียญหลวงปู่หนูเพชร รุ่นหนุนดวง", // เคส 4/9
    "หลวงปู่ศุข วัดปากตลองมะขามเฒ่า ด้านหลังเป็นกรม หลวงชุมพร", // เคส 12
    "พระขุนแผน วัดบ้านกร่าง",
  ]) assert.equal(isPreScanObjectInfoText(t), true, `ต้องจับ: ${t}`);
  for (const t of [
    "พลังองค์นี้เป็นไง", "เหรียญหลวงปู่หนูเพชรพลังดีไหม", "จ่าย 49", "มีโปรอะไรบ้าง", "ประวัติ", "จัดชุดพระให้หน่อยครับ",
    "สวัสดีครับ อาจารย์", "ขอบคุณครับ", "เสริมบารมีครับ", "วัดไหนดีครับ", "แท้ไหมครับ หลวงปู่ศุข", "ควรพกพระอะไรดี",
    "วันนี้ไปวัดมาครับ สบายใจ", "ปี 2506 ผมเกิด", "", "x".repeat(81),
  ]) assert.equal(isPreScanObjectInfoText(t), false, `ห้ามกลืน: ${t}`);
});

test("A: bind ตอนรับรูป (eligibility-before-move) · reverse completion: รูป A รับก่อน รูป B รับทีหลัง B เสร็จก่อน → ข้อมูลอยู่กับ A เท่านั้น · consume ครั้งเดียว", async () => {
  const m = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  const mem = new Map();
  const jobs = [];
  const fake = { ...fakeRedis(mem), supabase: fakeSupabase(jobs) }; // decision ผ่าน production helper จริง
  const t0 = Date.now() - 5000;
  mem.set("objinfo:preprovided:U1", JSON.stringify({ raw: "พระสมเด็จวัดระฆัง ปี 2506", at: t0 }));
  jobs.push(jobRow("jobA", "U1", t0 + 100), jobRow("jobB", "U1", t0 + 200));
  assert.deepEqual(await m.bindPreScanInfoToJob("U1", "jobA", fake), { bound: true, status: "moved" }, "รูป A (earliest) → bind");
  assert.deepEqual(await m.bindPreScanInfoToJob("U1", "jobB", fake), { bound: false, status: "no_source" }, "รูป B รับทีหลัง ไม่มีข้อมูลเหลือ");
  // B เสร็จก่อน
  assert.equal(await m.consumeJobPreScanInfo("jobB", fake), null);
  const a = await m.consumeJobPreScanInfo("jobA", fake);
  assert.equal(a.raw, "พระสมเด็จวัดระฆัง ปี 2506");
  assert.equal(await m.consumeJobPreScanInfo("jobA", fake), null, "consume แล้วต้องหาย");
  // สอง worker แย่ง consume job เดียวกัน: ได้แค่ตัวเดียว (getdel atomic)
  const t1 = Date.now() - 1000;
  mem.set("objinfo:preprovided:U2", JSON.stringify({ raw: "หลวงปู่ทวด วัดช้างให้", at: t1 }));
  jobs.push(jobRow("jobC", "U2", t1 + 50));
  assert.equal((await m.bindPreScanInfoToJob("U2", "jobC", fake)).bound, true);
  const [w1, w2] = await Promise.all([m.consumeJobPreScanInfo("jobC", fake), m.consumeJobPreScanInfo("jobC", fake)]);
  assert.equal([w1, w2].filter(Boolean).length, 1);
  // DB ล้ม → restore แล้ว consume ได้อีกครั้ง
  await m.restoreJobPreScanInfo("jobC", w1 || w2, fake);
  assert.ok((await m.consumeJobPreScanInfo("jobC", fake))?.raw);
  // ไม่มี redis = ไม่ bind (typed) → gate ถามตามปกติ
  assert.deepEqual(await m.bindPreScanInfoToJob("U9", "jobZ", { get: async () => ({ status: "redis_unavailable", value: null }) }), { bound: false, status: "redis_unavailable" });
});

test("A: gate ผ่าน production helper — insert {error} → ไม่ log SAVED, คืน evidence ให้ job, ไหลไปถามตามเดิม · insert สำเร็จ → NOT_HELD ไม่ถาม", async () => {
  const { maybeHoldReportForObjectInfo } = await import("../src/services/objectInfoGate/objectInfoGate.service.js");
  const logs = []; const errs = [];
  const oLog = console.log, oErr = console.error;
  console.log = (x) => logs.push(String(x)); console.error = (x) => errs.push(String(x));
  const restored = [];
  const payload = { reportPayload: { summary: { energyScore: 7.2 }, amuletV1: { powerCategories: { metta: { score: 70 } } }, scanId: "sr1" } };
  const netBefore = EXTERNAL.network;
  try {
    const dbErr = { from: () => ({ insert: async () => ({ error: { message: "permission denied" } }) }) };
    const r1 = await maybeHoldReportForObjectInfo(
      { client: {}, lineUserId: "U" + "1".repeat(32), payload, relatedJobId: "jobA" },
      { supabase: dbErr, hasInfoForObject: async () => false,
        consumeJobPreScanInfo: async () => ({ raw: "พระสมเด็จวัดระฆัง ปี 2506", at: Date.now() }),
        parseOwnerInfo: async () => ({ isObjectInfo: true, objectName: "พระสมเด็จ", temple: "วัดระฆัง", eraYear: "2506", confidence: 0.9 }),
        restoreJobPreScanInfo: async (jid, info) => { restored.push([jid, info.raw]); } },
    );
    assert.ok(errs.some((l) => l.includes("OBJECT_INFO_PRE_SCAN_SAVE_FAILED")));
    assert.ok(!logs.some((l) => l.includes('"OBJECT_INFO_SAVED"') && l.includes("pre_scan_text")), "ห้าม log SAVED เมื่อ DB ล้ม");
    assert.deepEqual(restored, [["jobA", "พระสมเด็จวัดระฆัง ปี 2506"]]);
    assert.notEqual(r1?.outcome, undefined);
    // สำเร็จ
    const inserted = [];
    const dbOk = { from: () => ({ insert: async (row) => { inserted.push(row); return { error: null }; } }) };
    const r2 = await maybeHoldReportForObjectInfo(
      { client: {}, lineUserId: "U" + "2".repeat(32), payload, relatedJobId: "jobB" },
      { supabase: dbOk, hasInfoForObject: async () => false,
        consumeJobPreScanInfo: async () => ({ raw: "เหรียญหลวงปู่หนูเพชร รุ่นหนุนดวง", at: Date.now() }),
        parseOwnerInfo: async () => ({ isObjectInfo: true, objectName: "เหรียญหลวงปู่หนูเพชร", confidence: 0.8 }) },
    );
    assert.equal(r2.outcome, "not_held");
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].object_name, "เหรียญหลวงปู่หนูเพชร");
    assert.ok(logs.some((l) => l.includes("pre_scan_text")));
  } finally { console.log = oLog; console.error = oErr; }
  // error path ไหลต่อไป "ถามตามเดิม" ซึ่งมี best-effort lookups (hasEverPaid/isBanned) ชน trap แล้ว fail-open
  // — นับแยกไว้ ไม่ให้ปนกับ acceptance network=0 ของ matcher/chain
  EXTERNAL.gateAskPathLookups = EXTERNAL.network - netBefore;
  assert.ok(EXTERNAL.gateAskPathLookups <= 3, `ask path external lookups: ${EXTERNAL.gateAskPathLookups}`);
});

test("A: ingestion bind อยู่ตอนสร้าง job (ก่อน ack) · deliverOutbound ส่ง relatedJobId ให้ gate (static)", () => {
  const ing = readFileSync("src/services/scanV2/webhookImageIngestion.service.js", "utf8");
  const b = ing.indexOf("bindPreScanInfoToJob(lineUserId, jobRow.id)");
  const ack = ing.indexOf('kind: "pre_scan_ack",\n    priority: OUTBOUND_PRIORITY.pre_scan_ack,\n    related_job_id: jobRow.id');
  assert.ok(b > 0 && ack > 0 && b < ack);
  assert.match(readFileSync("src/services/scanV2/deliverOutbound.service.js", "utf8"), /holdFn\(\{ client, lineUserId, payload, relatedJobId: msg\.related_job_id/);
  // ไม่มี uid-scoped consume เหลือใน gate
  assert.doesNotMatch(readFileSync("src/services/objectInfoGate/objectInfoGate.service.js", "utf8"), /consumePreScanObjectInfo/);
});

test("A: webhook ส่ง ack แอดมิน 1 ครั้ง ไม่เข้า consult (static: gate อยู่ก่อน orchestrator, ack ไม่ตีความพลัง)", async () => {
  const src = readFileSync("src/routes/lineWebhook.js", "utf8");
  const at = src.indexOf("isPreScanObjectInfoText(text)");
  const orch = src.indexOf("const invokePhase1GeminiOrchestrator = async");
  assert.ok(at > 0 && at < orch, "gate ต้องอยู่ก่อน orchestrator");
  const { PRE_SCAN_INFO_ACK_TEXT } = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  assert.doesNotMatch(PRE_SCAN_INFO_ACK_TEXT, /เด่นด้าน|พลัง|คะแนน|วัด|รุ่น|ปี/);
  assert.match(src.slice(at, at + 3000), /speakerRoleOverride: "admin"/); // บล็อกยาวขึ้นหลัง P0-F (decide เจ้าของก่อนเก็บ)
});

/* ---------- B: purpose free-text (เคส 2) ---------- */
test("B: purpose state ค้าง + ข้อความสั้น → เก็บ free-text ตอบ copy เดิม · คำถาม/เงิน/เมนูไม่ถูกจับ", async () => {
  const src = readFileSync("src/services/objectInfoGate/objectInfoGate.service.js", "utf8");
  const block = src.slice(src.indexOf("KEYMAP"), src.indexOf("const { objectKey } = JSON.parse(raw);"));
  assert.match(block, /short\.length > 30/);
  assert.match(block, /notPurpose/);
  // regex เดียวกับใน code
  const notPurpose = /[?？]|ไหม|มั้ย|หรือเปล่า|ยังไง|เท่าไหร่|กี่|ทำไม|อะไร|จ่าย|โอน|สลิป|ค่าครู|ราคา|แพ็ก|โปร(?!ด)|สิทธิ์|ประวัติ|จัดชุด|เมนู|ยกเลิก|วิธีใช้/u;
  assert.equal(notPurpose.test("เสริมบารมี"), false);
  for (const t of ["จ่าย 49", "พลังดีไหม", "ประวัติ", "จัดชุด", "มีโปรอะไร"]) assert.equal(notPurpose.test(t), true, t);
});

/* ---------- C: role จาก route (เคส 2/13) ---------- */
test("C: route ก่อน generate · mixed voice (อาจารย์+ผม) = reject · status ชนะ energy", async () => {
  const m = await import("../src/core/conversation/consultRoleRoute.util.js");
  assert.equal(m.routeConsultRole("สายเสน่ห์ ต้องหาพระหรือเครื่องรางแบบไหนครับ"), "ajarn");
  assert.equal(m.routeConsultRole("เสริมบารมีครับ"), "ajarn");
  assert.equal(m.routeConsultRole("เน้นโชคลาภ ห้อยองค์ไหนดี"), "ajarn");
  for (const t of ["ผลพลังออกหรือยัง", "คะแนนออกยังครับ", "สถานะผลสแกน", "ผลพลังมายัง", "จ่ายยังไงครับ", "ผลยังไม่มาเลย"]) {
    assert.equal(m.routeConsultRole(t), "admin", t);
  }
  assert.equal(m.routeConsultRole("สวัสดีครับ"), null);
  assert.equal(m.checkAjarnVoice("อาจารย์มองว่าสายเสน่หา พระขุนแผนเด่นด้านนี้ครับ").ok, true);
  assert.equal(m.checkAjarnVoice("อาจารย์ว่าดีครับ เดี๋ยวผมส่งรูปให้อาจารย์ดูอีกที").ok, false, "mixed voice");
  assert.equal(m.checkAjarnVoice("อาจารย์มองว่าเหมาะครับ ผมว่าพกได้เลย").ok, false, "ผม ใน mixed");
  assert.equal(m.checkAjarnVoice("สายเสน่หาเชื่อกันว่า … ส่งรูปมาให้อาจารย์สแกนดูได้").ok, false);
  const fb = m.ajarnRoleSafeFallback({ hasReport: false });
  assert.doesNotMatch(fb, /ส่งรูป|เด่นด้าน|คะแนน|\d+%|ผม/);
});

test("C/#4/#6: shared budget — output ผิด role+money+tone+ระบบ พร้อมกันทุกครั้ง → model calls = 2 → deterministic fallback ไม่เงียบ ไม่มีของที่ reject", async () => {
  const { runConsultGuardChain } = await import("../src/core/conversation/consultGuardChain.util.js");
  const bad = "ดีมากครับ ผมว่าองค์นี้เด่นด้านเมตตา ระบบให้ 9/10 ค่าครูแค่ 49 บาท ส่งรูปมาให้อาจารย์ดูได้เลยครับ";
  let calls = 0;
  const r = await runConsultGuardChain({
    generate: async () => { calls += 1; return bad; },
    routedRole: "ajarn", roleDirective: "ตอบเป็นอาจารย์", moneyCtx: { userMoneyIntent: false, inPaymentState: false }, hasReport: false,
    log: () => {},
  });
  assert.equal(calls, 2, "primary + regenerate รวม 1 = 2");
  assert.equal(r.modelCalls, 2);
  assert.equal(r.outcome, "sent");
  assert.notEqual(r.text, bad);
  assert.doesNotMatch(r.text, /ระบบ|บาท|ส่งรูปมาให้อาจารย์|ดีมาก/);
  // ถูกตั้งแต่ primary → 1 call
  let c2 = 0;
  const ok = await runConsultGuardChain({ generate: async () => { c2 += 1; return "อาจารย์มองว่าองค์นี้เหมาะพกติดตัวครับ"; }, routedRole: "ajarn", log: () => {} });
  assert.equal(c2, 1); assert.equal(ok.guardOutcome, "primary_ok");
  // regenerate แล้วผ่าน → 2 calls, ใช้ของใหม่
  let c3 = 0;
  const fixed = await runConsultGuardChain({ generate: async (d) => { c3 += 1; return d ? "อาจารย์มองว่าเหมาะครับ" : "ผมว่าเหมาะครับ"; }, routedRole: "ajarn", log: () => {} });
  assert.equal(c3, 2); assert.equal(fixed.guardOutcome, "regenerated_ok"); assert.equal(fixed.text, "อาจารย์มองว่าเหมาะครับ");
  // เงิน + ลูกค้าถามเงิน → defer_payment (ไม่ส่ง)
  const money = await runConsultGuardChain({ generate: async () => "อาจารย์บอกว่าค่าครู 49 บาทครับ", routedRole: null, moneyCtx: { userMoneyIntent: true, inPaymentState: false }, log: () => {} });
  assert.equal(money.outcome, "defer_payment");
  // คำต้องห้าม ระบบ อย่างเดียว → regenerate → ยังมี → neutral fallback
  const forb = await runConsultGuardChain({ generate: async () => "ระบบอ่านว่าเมตตาครับ", routedRole: null, log: () => {} });
  assert.equal(forb.modelCalls, 2); assert.doesNotMatch(forb.text, /ระบบ/);
  // orchestrator ใช้ chain จริง (ไม่มี retry แยกเหลือ)
  const src = readFileSync("src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js", "utf8");
  assert.match(src, /runConsultGuardChain\(\{/);
  assert.equal((src.match(/await runGeminiConsult\(\{/g) || []).length, 0, "ห้ามมี retry เรียก runGeminiConsult แยกนอก chain");
});

/* ---------- D: synergy (เคส 5) ---------- */
test("D: จัดชุดพระให้หน่อยครับ เข้า synergy · negation/ความหมายอื่น/เล่าเรื่องไม่เข้า", async () => {
  const { isSynergyRequest } = await import("../src/services/lineWebhook/synergyIntent.util.js");
  for (const t of ["จัดชุด", "ชุดวันนี้", "จัดชุดพลัง", "จัดชุดพระให้หน่อยครับ", "ขอจัดชุดหน่อย", "ช่วยจัดชุดพระให้ทีครับ", "จัดชุดให้หน่อย"]) {
    assert.equal(isSynergyRequest(t), true, t);
  }
  for (const t of ["ยังไม่จัดชุด", "อย่าจัดชุด", "จัดชุดข้อมูล", "เมื่อวานอาจารย์จัดชุดให้เพื่อนผมด้วย", "ไม่ต้องจัดชุดนะ", "จัดชุดเสื้อไปงาน", "x".repeat(41) + "จัดชุด"]) {
    assert.equal(isSynergyRequest(t), false, t);
  }
});

/* ---------- E: ranking (เคส 11) ---------- */
test("E: เข้ากับผมมากที่สุด/เหมาะกับผมที่สุด → ranking gate · ไม่มีสิทธิ์ redirect AI=0 · มีสิทธิ์ flow เดิม", async () => {
  const { isRankingQuery, buildRankingRedirectText } = await import("../src/services/lineWebhook/rankingQueryGate.util.js");
  assert.equal(isRankingQuery("พระชิ้นไหนที่เข้ากับผมมากที่สุด"), true);
  assert.equal(isRankingQuery("องค์ไหนเหมาะกับผมที่สุด"), true);
  assert.equal(isRankingQuery("เข้ากับดวงผมที่สุดคือชิ้นไหน"), true);
  assert.equal(isRankingQuery("พลังองค์นี้เป็นไง"), false);
  // redirect copy deterministic ไม่มีตัวเลข/% (AI=0)
  const txt = buildRankingRedirectText("https://scan.my-ener.uk/r/rpt_x");
  assert.doesNotMatch(txt, /\d+\s*%|\d+\/10/);
  // มีสิทธิ์ → return false (flow เดิม) — static: hasRecentPaidAccess → return false อยู่ก่อน redirect
  const src = readFileSync("src/routes/lineWebhook.js", "utf8");
  const fn = src.slice(src.indexOf("async function maybeHandleRankingQueryGate"), src.indexOf("async function maybeHandleRankingQueryGate") + 2600);
  assert.match(fn, /hasRecentPaidAccess\(userId\)\) return false/);
  assert.match(fn, /speakerRoleOverride: "admin"/);
});

/* ---------- F: consult timeout fallback (เคส 6) ---------- */
test("F: delivered-only evidence · held/failed ห้ามใช้ · null ไม่เป็น 0 · ใช้เฉพาะคำถามชิ้นล่าสุด · timeout → transport 1 ไม่สัญญา", async () => {
  const de = await import("../src/services/scanV2/deliveredEvidence.util.js");
  const mk = (jobRow, sr) => ({
    from: (t) => { const o = { select: () => o, eq: () => o, not: () => o, order: () => o, limit: () => o, maybeSingle: async () => ({ data: t === "scan_jobs" ? jobRow : sr, error: null }) }; return o; },
  });
  const sr = { id: "sr1", report_payload_json: { summary: { energyScore: 7.8, compatibilityPercent: 78, mainEnergyLabel: "ปกป้อง" } } };
  const delivered = await de.getLatestDeliveredReport("U1", { supabase: mk({ result_id: "sr1", completed_at: "2026-08-22T04:00:00Z", status: "delivered" }, sr) });
  assert.equal(delivered.score, 7.8); assert.equal(delivered.compat, 78); assert.equal(delivered.power, "ปกป้อง");
  // held (ยังไม่ delivered) / failed → query status=delivered ไม่มีแถว → null
  assert.equal(await de.getLatestDeliveredReport("U1", { supabase: mk(null, sr) }), null);
  // null fields → ไม่แสดง 0
  const nul = await de.getLatestDeliveredReport("U1", { supabase: mk({ result_id: "sr1", completed_at: null, status: "delivered" }, { id: "sr1", report_payload_json: { summary: { energyScore: null, compatibilityPercent: null, mainEnergyLabel: "" } } }) });
  assert.equal(nul.score, null); assert.equal(nul.compat, null); assert.equal(nul.power, null);
  assert.equal(de.buildDeliveredReportText(nul), null);
  const { buildConsultUnavailableText, CONSULT_UNAVAILABLE_TEXT, isQuestionLike } = await import("../src/services/lineWebhook/consultTimeoutFallback.util.js");
  // คำถามคนละเรื่อง ("มีแบบพลังเต็มไหม") ห้ามเอาคะแนนล่าสุดไปตอบ
  assert.equal(buildConsultUnavailableText("มีแบบพลังเต็มไหมครับ", delivered, de).via, "honest");
  const ev = buildConsultUnavailableText("องค์นี้พลังเป็นไง", delivered, de);
  assert.equal(ev.via, "evidence"); assert.match(ev.text, /7\.8\/10/); assert.match(ev.text, /78%/);
  const evNull = buildConsultUnavailableText("องค์นี้พลังเป็นไง", nul, de);
  assert.equal(evNull.via, "honest"); assert.doesNotMatch(evNull.text, /0\/10|0%/);
  assert.doesNotMatch(CONSULT_UNAVAILABLE_TEXT, /เดี๋ยว|แป๊บ|รอ|ถามอีก|จะตอบ|ส่งให้อาจารย์|ส่งรูป/);
  assert.equal(isQuestionLike("มีแบบพลังเต็มไหมครับ"), true);
  // idleReply: orchestrator consult null → fallback ส่ง 1 ครั้ง ไม่ใช่ nudge
  const { replyIdleTextNoDuplicate } = await import("../src/services/lineWebhook/idleReply.util.js");
  const sent = [];
  const r = await replyIdleTextNoDuplicate({
    client: {}, replyToken: "t", userId: "U1",
    invokePhase1GeminiOrchestrator: async () => ({ handled: false, reason: "idle_bypass_consult_null" }),
    allowIdleDirectConsult: true,
    onConsultUnavailable: async () => ({ text: CONSULT_UNAVAILABLE_TEXT, replyType: "consult_unavailable", speakerRole: "admin", via: "honest" }),
    deps: { sendNonScanReply: async (o) => { sent.push(o); return { sent: true }; }, buildIdleDeterministicPrimaryText: () => "ส่งรูปมาได้เลย", buildIdleText: async () => null },
  });
  assert.equal(r.via, "consult_unavailable"); assert.equal(sent.length, 1); assert.equal(sent[0].text, CONSULT_UNAVAILABLE_TEXT);
  // webhook ใช้ delivered evidence เท่านั้น (ไม่อ่าน scan_results_v2 ตรง)
  const wh = readFileSync("src/routes/lineWebhook.js", "utf8");
  const blk = wh.slice(wh.indexOf("onConsultUnavailable: async () => {"), wh.indexOf("onConsultUnavailable: async () => {") + 1500);
  assert.match(blk, /getLatestDeliveredReport/); assert.doesNotMatch(blk, /from\("scan_results_v2"\)/);
});

/* ---------- G: "ระบบ" static inventory ---------- */
test("G: customer-visible copy ห้ามมีคำว่า ระบบ (internal log/admin/prompt ยกเว้น) — static inventory", () => {
  const CUSTOMER_COPY_FILES = [
    "src/services/scanV2/resultStatusReply.util.js",
    "src/services/scanV2/webhookImageIngestion.service.js",
    "src/services/referral/referral.service.js",
    "src/services/precheck/precheck.service.js",
    "src/services/lineWebhook/idleReply.util.js",
    "src/services/lineWebhook/consultTimeoutFallback.util.js",
    "src/services/objectInfoGate/preScanObjectInfo.util.js",
    "src/core/conversation/consultRoleRoute.util.js",
    "src/services/lineWebhook/rankingQueryGate.util.js",
    "src/utils/webhookText.util.js",
    "src/services/lineWebhook/freeQuotaPaywallReply.service.js",
    "src/services/lineWebhook/multiImageRejectionReply.service.js",
    "src/services/welcome/identityQuestion.service.js",
    "src/services/synergy/synergyIntro.service.js",
  ];
  for (const f of CUSTOMER_COPY_FILES) {
    const src = readFileSync(f, "utf8");
    // ข้ามบรรทัดที่เป็น regex จับ "ข้อความลูกค้า" (input matcher เช่น identityQuestion AI_TERM) — ไม่ใช่ copy ที่ส่ง
    const bad = src.split("\n").filter((l) => /ระบบ/.test(l) && /["'`]/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) && !/console\.|event:|tone-exempt|\/\*.*ระบบ.*\*\/|\(\?:|_RE\b/.test(l));
    assert.deepEqual(bad, [], `${f} มี "ระบบ" ในสตริง`);
  }
  // webhook: เฉพาะสตริงลูกค้า (ไม่รวมบล็อก admin command บรรทัด "reply(" ของ แบน/ปลดแบน)
  const wh = readFileSync("src/routes/lineWebhook.js", "utf8").split("\n");
  const offenders = wh.map((l, i) => [i + 1, l]).filter(([, l]) => /ระบบ/.test(l) && /text:|text =|Text\(|`/.test(l) && !/reply\(|console\.|event:|tone-exempt|admin|ADMIN|\/\/|telegram|แบน|ฐานข้อมูล|cache|retry|payload\.target/.test(l));
  assert.deepEqual(offenders.map(([n, l]) => `${n}: ${l.trim().slice(0, 80)}`), []);
  // LLM context ต้องไม่ป้อนคำว่า ระบบ ให้โมเดลทวน (ยกเว้นบรรทัดที่สั่ง "ห้ามพูดคำว่า ระบบ")
  const ctx = readFileSync("src/core/conversation/geminiFront/customerFactsContext.util.js", "utf8").split("\n");
  const ctxBad = ctx.filter((l) => /ระบบ/.test(l) && !/^\s*\/\//.test(l) && !/ห้ามพูดคำว่า ระบบ/.test(l));
  assert.deepEqual(ctxBad, []);
});

/* ---------- H: pre_scan_ack ไม่สัญญาเวลา ---------- */
test("H: pre_scan_ack ทุกสำนวนไม่สัญญาเวลา/ผล (คงโทน ครับ ได้)", async () => {
  const src = readFileSync("src/services/scanV2/webhookImageIngestion.service.js", "utf8");
  const block = src.slice(src.indexOf("const PRE_SCAN_ACK_VARIANTS"), src.indexOf("];", src.indexOf("const PRE_SCAN_ACK_VARIANTS")));
  const variants = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(variants.length >= 8);
  for (const v of variants) assert.doesNotMatch(v, /นาที|ผลมา|เดี๋ยวผล|ไม่เกิน|แปป/, v);
});

/* ---------- rubric ---------- */
test("rubric: evaluator ได้ replyType ต่อบรรทัด + STATE header (job/payment) · เกณฑ์ admin/ajarn/ระบบ", async () => {
  const src = readFileSync("src/services/chatQualityDailyReport.service.js", "utf8");
  assert.match(src, /อาจารย์ตอบเรื่องพลังจาก evidence[^\n]*NORMAL/);
  assert.match(src, /คำว่า "ระบบ" ใน customer-visible text/);
  assert.match(src, /\[object_info_gate_ask\] after \[pre_scan_ack\]/);
  assert.match(src, /\[pending_verify_block_scan\]/);
  const { buildStateHeader } = await import("../src/services/chatQualityDailyReport.service.js");
  const chain = (data) => { const o = { select: () => o, eq: () => o, gte: () => o, lt: () => o, order: () => o, limit: async () => ({ data }) }; return o; };
  const fake = {
    from: (t) => chain(t === "scan_jobs"
      ? [{ id: "abcdef12-x", status: "delivery_queued", created_at: "2026-08-22T03:45:43Z", updated_at: "2026-08-22T03:46:59Z" }]
      : [{ status: "paid", slip_verify_status: "manual_review", created_at: "2026-08-22T14:24:00Z", updated_at: "2026-08-22T16:15:00Z" }]),
  };
  const h = await buildStateHeader("U1", { startIso: "2026-08-21T17:00:00Z", endIso: "2026-08-22T17:00:00Z" }, { supabase: fake });
  assert.match(h, /job abcdef12 delivery_queued/);
  assert.match(h, /payment paid\/manual_review/);
});

/* ---------- 13 เคส: inbound เดิมผ่าน gate ใหม่ (route ที่คาด) ---------- */
test("route replay 9 inbound จริง (จาก 13 เคส; 4 เคสเป็น false positive ไม่มี inbound ใหม่) ผ่าน production matchers — ไม่ใช่ webhook เต็มสาย (hermetic, network=0)", async () => {
  const pre = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  const syn = await import("../src/services/lineWebhook/synergyIntent.util.js");
  const rank = await import("../src/services/lineWebhook/rankingQueryGate.util.js");
  const role = await import("../src/core/conversation/consultRoleRoute.util.js");
  const cases = [
    ["พระสมเด็จวัดประสาทบุญญาวาสปี 2506", "pre_scan_info"],
    ["เสริมบารมีครับ", "purpose_free_text"],
    ["เหรียญหลวงปู่หนูเพชร รุ่นหนุนดวง", "pre_scan_info"],
    ["จัดชุดพระให้หน่อยครับ", "synergy"],
    ["มีแบบพลังเต็มไหมครับ", "consult:ajarn"],
    ["พระชิ้นไหนที่เข้ากับผมมากที่สุด", "ranking"],
    ["หลวงปู่ศุข วัดปากตลองมะขามเฒ่า ด้านหลังเป็นกรม หลวงชุมพร", "pre_scan_info"],
    ["สายเสน่ห์ ต้องหาพระหรือเครื่องรางแบบไหนครับ", "consult:ajarn"],
    ["เน้นโชคลาภ ห้อยองค์ไหนดี", "consult:ajarn"],
  ];
  const routeOf = (t) => {
    if (pre.isPreScanObjectInfoText(t)) return "pre_scan_info";
    if (syn.isSynergyRequest(t)) return "synergy";
    if (rank.isRankingQuery(t)) return "ranking";
    if (t === "เสริมบารมีครับ") return "purpose_free_text"; // purpose state ค้าง (B)
    return `consult:${role.routeConsultRole(t)}`;
  };
  for (const [t, exp] of cases) assert.equal(routeOf(t), exp, t);
  assert.equal(EXTERNAL.network - (EXTERNAL.gateAskPathLookups || 0), 0, "matcher/chain/evidence ห้ามออกเน็ต");
});


/* ---------- P0-1 (Codex 27 ส.ค.): pre-scan persistence honesty ---------- */
test("P0-1: store typed — no redis / SET throw / SET error / untyped → ok:false ห้ามอ้าง captured · webhook ใช้ failure copy + return ก่อน consult (AI=0)", async () => {
  const m = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  const txt = "พระสมเด็จวัดระฆัง ปี 2506";
  assert.deepEqual(await m.storePreScanObjectInfo("U1", txt, { set: async () => ({ ok: false, reason: "redis_unavailable" }) }), { ok: false, reason: "redis_unavailable", message: undefined });
  const thrown = await m.storePreScanObjectInfo("U1", txt, { set: async () => { throw new Error("ECONNRESET"); } });
  assert.equal(thrown.ok, false); assert.equal(thrown.reason, "redis_error");
  const errd = await m.storePreScanObjectInfo("U1", txt, { set: async () => ({ ok: false, reason: "redis_error", message: "READONLY" }) });
  assert.equal(errd.ok, false); assert.equal(errd.reason, "redis_error");
  const untyped = await m.storePreScanObjectInfo("U1", txt, { set: async () => undefined });
  assert.equal(untyped.ok, false, "set ที่ไม่คืนผล typed ต้องไม่ถือว่าสำเร็จ");
  // default deps = setValueWithTtlTyped จริง · REDIS_URL="" → redis_unavailable (ไม่ throw ไม่ claim)
  const real = await m.storePreScanObjectInfo("U1", txt);
  assert.deepEqual(real, { ok: false, reason: "redis_unavailable", message: undefined });
  // failure copy: deterministic, ไม่ตีความพลัง, ไม่สัญญาเวลา, ไม่อ้างว่าเก็บแล้ว
  assert.doesNotMatch(m.PRE_SCAN_INFO_STORE_FAILED_TEXT, /เด่นด้าน|พลัง|คะแนน|รับข้อมูล.*แล้ว|เก็บ.*แล้ว|\d+\s*นาที|ระบบ/);
  // webhook: ok=false → replyType store_failed + failure text แล้ว return (ไม่ไหลลง orchestrator)
  const src = readFileSync("src/routes/lineWebhook.js", "utf8");
  const at = src.indexOf("stored = await storePreScanObjectInfo(userId, text);");
  assert.ok(at > 0, "webhook ต้องใช้ผล typed ของ store");
  const blk = src.slice(at, at + 1800);
  assert.match(blk, /ackText = PRE_SCAN_INFO_ACK_TEXT/); // next_image path ใช้ copy เดิม
  assert.match(blk, /const ok = stored && stored\.ok === true/);
  assert.match(blk, /ok \? ackType : "pre_scan_object_info_store_failed"/); // P0-F: ackType ตาม target แต่ failure copy เดิม
  assert.match(blk, /ok \? ackText : PRE_SCAN_INFO_STORE_FAILED_TEXT/);
  assert.match(blk, /PRE_SCAN_OBJECT_INFO_STORE_FAILED/);
  assert.match(blk, /\n      return;\n    }/);
  assert.ok(at < src.indexOf("const invokePhase1GeminiOrchestrator = async"), "ยังอยู่ก่อน orchestrator");
});

test("P0-1: bind typed — no_source ≠ redis_unavailable ≠ redis_error (GET ก่อน ไม่ MOVE) · consume typed · ingestion log แยก", async () => {
  const m = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  let moved = 0;
  const noMove = { moveIfValue: async () => { moved += 1; return { status: "moved", value: "x" }; } };
  assert.deepEqual(await m.bindPreScanInfoToJob("U1", "j1", { ...noMove, get: async () => ({ status: "missing", value: null }) }), { bound: false, status: "no_source" });
  assert.deepEqual(await m.bindPreScanInfoToJob("U1", "j1", { ...noMove, get: async () => ({ status: "redis_unavailable", value: null }) }), { bound: false, status: "redis_unavailable" });
  const e1 = await m.bindPreScanInfoToJob("U1", "j1", { ...noMove, get: async () => ({ status: "redis_error", value: null, message: "BUSY" }) });
  assert.equal(e1.status, "redis_error");
  const e2 = await m.bindPreScanInfoToJob("U1", "j1", { ...noMove, get: async () => { throw new Error("ETIMEDOUT"); } });
  assert.equal(e2.status, "redis_error");
  // ค่าเพี้ยน (ไม่มี at) → ห้าม MOVE
  const e3 = await m.bindPreScanInfoToJob("U1", "j1", { ...noMove, get: async () => ({ status: "got", value: "garbage" }) });
  assert.equal(e3.status, "stale_check_failed");
  assert.equal(moved, 0, "ทุกกรณีข้างต้นห้ามแตะ MOVE");
  // default deps (REDIS_URL="") → redis_unavailable ไม่ throw
  assert.deepEqual(await m.bindPreScanInfoToJob("U1", "j1"), { bound: false, status: "redis_unavailable" });
  // consume typed: missing/unavailable/error → null (gate ถามตามปกติ)
  assert.equal(await m.consumeJobPreScanInfo("j1", { getdel: async () => ({ status: "redis_error", value: null }) }), null);
  assert.equal(await m.consumeJobPreScanInfo("j1"), null);
  // ingestion: BOUND เฉพาะ bound===true · STALE_DISCARDED สำหรับ stale/source_changed · BIND_FAILED เมื่อ status อื่นที่ไม่ใช่ no_source
  const ing = readFileSync("src/services/scanV2/webhookImageIngestion.service.js", "utf8");
  assert.match(ing, /if \(bind\?\.bound === true\)/);
  assert.match(ing, /stale_after_prior_job[\s\S]{0,200}source_changed[\s\S]{0,400}PRE_SCAN_OBJECT_INFO_STALE_DISCARDED/);
  assert.match(ing, /else if \(bind && bind\.status !== "no_source"\)[\s\S]{0,200}PRE_SCAN_OBJECT_INFO_BIND_FAILED/);
});

test("P0-2: route=ajarn reject ผม ทุกแบบ (ผมเห็นว่า/ผมชอบ/ผมเชื่อว่า/แต่ผมว่า) · compound ไม่ใช่สรรพนามผ่าน · fallback+regenerate ไม่มี mixed voice", async () => {
  const m = await import("../src/core/conversation/consultRoleRoute.util.js");
  for (const t of [
    "อาจารย์มองว่าเหมาะครับ ผมเห็นว่าพกได้เลย",
    "ผมชอบองค์นี้ครับ",
    "ผมเชื่อว่าสายเสน่หาเหมาะกับคุณ",
    "อาจารย์มองว่าพระขุนแผนเด่นด้านเสน่หา แต่ผมว่าตะกรุดก็ดี",
    "ผม",
    "แนะนำผมว่า",
    "อาจารย์มองว่าเหมาะครับผม", // Codex รอบสี่: ครับผม = เสียงแอดมิน ห้ามยกเว้น
    "ครับผม",
  ]) assert.equal(m.checkAjarnVoice(t).ok, false, `ต้อง reject: ${t}`);
  assert.equal(m.checkAjarnVoice("อาจารย์มองว่าพระขุนแผนเด่นด้านเสน่หา แต่ผมว่าตะกรุดก็ดี").reason, "admin_self_voice");
  for (const t of ["อาจารย์ว่าเส้นผมไม่เกี่ยวกับพลังครับ", "อาจารย์มองว่าทรงผมไม่มีผลครับ", "อาจารย์มองว่าสายเสน่หา พระขุนแผนเด่นด้านนี้ครับ"]) {
    assert.equal(m.checkAjarnVoice(t).ok, true, `ต้องผ่าน: ${t}`);
  }
  // chain: mixed voice ทุกครั้ง → regenerate directive สั่งห้าม ผม → ยังผิด → role-safe fallback ไม่มี ผม/handoff
  const { runConsultGuardChain, buildRegenerateDirective, evaluateConsultGuards } = await import("../src/core/conversation/consultGuardChain.util.js");
  const mixed = "อาจารย์มองว่าเหมาะครับ ผมเห็นว่าพกได้เลย";
  const dir = buildRegenerateDirective(evaluateConsultGuards(mixed, { routedRole: "ajarn" }), { roleDirective: "x" });
  assert.match(dir, /ห้ามใช้คำว่า ผม/);
  const r = await runConsultGuardChain({ generate: async () => mixed, routedRole: "ajarn", log: () => {} });
  assert.equal(r.modelCalls, 2); assert.equal(r.guardOutcome, "role_safe_fallback");
  assert.equal(m.hasFirstPersonPhom(r.text), false); assert.doesNotMatch(r.text, /ส่งรูป|ให้อาจารย์ดู/);
  for (const hr of [true, false]) assert.equal(m.hasFirstPersonPhom(m.ajarnRoleSafeFallback({ hasReport: hr })), false);
});

/* ---------- P0-3 (Codex 27 ส.ค.): งบ AI ต่อเทิร์นเดียว ≤2 (planner+consult+regenerate+phrasing) วัดจาก ALS callSites จริง ---------- */
test("P0-3: chain เคารพ maxModelCalls (1 → ไม่ regenerate · 0 → budget_exhausted ไม่ยิง) + ALS budget helper (งบ 3)", async () => {
  const { runConsultGuardChain } = await import("../src/core/conversation/consultGuardChain.util.js");
  const als = await import("../src/core/telemetry/turnAiChain.js");
  const B = als.TURN_AI_CALL_BUDGET;
  assert.equal(B, 3, "Codex verdict rollout นี้ = 3 (expectation ด้านล่างเขียนสำหรับ 3)");
  const bad = "ผมว่าองค์นี้ดีครับ";
  let c = 0;
  const one = await runConsultGuardChain({ generate: async () => { c += 1; return bad; }, routedRole: "ajarn", maxModelCalls: 1, log: () => {} });
  assert.equal(c, 1); assert.equal(one.modelCalls, 1); assert.equal(one.guardOutcome, "role_safe_fallback");
  let z = 0;
  const zero = await runConsultGuardChain({ generate: async () => { z += 1; return bad; }, routedRole: "ajarn", maxModelCalls: 0, log: () => {} });
  assert.equal(z, 0); assert.equal(zero.outcome, "budget_exhausted");
  assert.equal(als.turnAiBudgetRemaining(), B, "นอก context = เต็มงบ");
  await als.runWithTurnContext({ messageId: "m", kind: "text" }, async () => {
    als.recordTurnAiCall("semanticCatcher"); als.recordTurnAiCall("planner");
    assert.equal(als.turnAiBudgetRemaining(), 1);
    const r = await runConsultGuardChain({ generate: async () => { als.recordTurnAiCall("consult"); return bad; }, routedRole: "ajarn", maxModelCalls: als.turnAiBudgetRemaining(), log: () => {} });
    assert.equal(r.modelCalls, 1); assert.equal(als.getTurnAiCallCount(), 3); assert.equal(als.turnAiBudgetRemaining(), 0);
  });
});

test("P0-3: orchestrator จริง + fake LLM transport (งบ 3) — non-idle planner+consult+regenerate=3 · idle direct consult×2=2 · consult ว่างหลัง planner → phrasing ได้ (call 3) · paywall planner+phrasing=2 · ทุกเทิร์น ≤3 (hermetic)", async () => {
  const als = await import("../src/core/telemetry/turnAiChain.js");
  const B = als.TURN_AI_CALL_BUDGET; assert.equal(B, 3);
  const { runGeminiFrontOrchestrator } = await import("../src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js");
  const prevFetch = globalThis.fetch;
  const llm = { calls: [], consultReply: () => "ผมว่าองค์นี้เด่นด้านเสน่หาครับ" };
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/chat/completions")) {
      const body = JSON.parse(init?.body || "{}"); const site = String(body.user || "untagged").replace(/^(pro|staging|local):/, ""); llm.calls.push(site); /* Cost Discovery: payload จริง = env:callSite */
      let content = "";
      if (site === "planner") content = JSON.stringify({ intent: "consult", state_guess: "idle", proposed_action: "consult_amulet", confidence: 0.95, reply_style: "neutral_help" });
      else if (site === "consult") content = llm.consultReply();
      else content = "ข้อความ phrasing";
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: {} }), text: async () => "" };
    }
    EXTERNAL.orchDbLookups = (EXTERNAL.orchDbLookups || 0) + 1;
    throw new Error("HERMETIC: db blocked");
  };
  const oWarn = console.warn, oLog = console.log; const warns = [];
  console.warn = (x) => warns.push(String(x)); console.log = () => {};
  try {
    const mkCtx = (phase1, extra = {}) => {
      const sent = [];
      return { sent, ctx: { userId: "U" + "7".repeat(32), text: "สายเสน่ห์ ต้องหาพระแบบไหนครับ", phase1State: phase1, conversationOwner: phase1, paymentState: "none", flowState: "idle", accessState: "free", pendingPaymentStatus: null, selectedPackageKey: null, sendGatewayReply: async (o) => { sent.push(o); return { sent: true }; }, delegates: {}, ...extra } };
    };
    const run = async (id, c) => { let n; const r = await als.runWithTurnContext({ messageId: id, kind: "text" }, async () => { const x = await runGeminiFrontOrchestrator(c.ctx); n = als.getTurnAiCallCount(); return x; }); return { r, n }; };
    // (1) non-idle: planner 1 + consult primary + regenerate (งบเหลือ 2) = 3 → ยังผิดบท → role-safe fallback ส่งจริง
    llm.calls.length = 0;
    const a = mkCtx("scan_ready_idle"); const A = await run("a", a);
    assert.deepEqual(llm.calls, ["planner", "consult", "consult"]); assert.equal(A.n, 3); assert.ok(A.n <= B);
    assert.equal(A.r.handled, true); assert.equal(a.sent.length, 1); assert.equal(a.sent[0].speakerRoleOverride, "ajarn"); assert.doesNotMatch(a.sent[0].text, /ผม/);
    // (2) idle direct: consult ผิด 2 ครั้ง (maxRegenerate 1) = 2
    llm.calls.length = 0;
    const b = mkCtx("idle", { allowIdleDirectConsult: true }); const Bb = await run("b", b);
    assert.deepEqual(llm.calls, ["consult", "consult"]); assert.equal(Bb.n, 2); assert.equal(Bb.r.handled, true); assert.equal(b.sent.length, 1);
    // (3) planner + consult ว่าง → phrasing ได้เป็น call ที่ 3 (งบ 3) → ไม่มี call ที่ 4
    llm.calls.length = 0; llm.consultReply = () => "";
    const c = mkCtx("scan_ready_idle"); const C = await run("c", c);
    assert.deepEqual(llm.calls, ["planner", "consult", "phrasing"]); assert.equal(C.n, 3); assert.equal(C.r.handled, true);
    // (4) paywall (validator ไม่อนุญาต consult) → planner + phrasing = 2
    llm.calls.length = 0; llm.consultReply = () => "ผมว่าองค์นี้เด่นด้านเสน่หาครับ";
    const d = mkCtx("paywall_selecting_package"); const D = await run("d", d);
    assert.deepEqual(llm.calls, ["planner", "phrasing"]); assert.equal(D.n, 2);
  } finally { globalThis.fetch = prevFetch; console.warn = oWarn; console.log = oLog; }
});

test("P0-1 race (Codex รอบห้า): eligibility ผ่าน production helper จริง (fake supabase เคารพ order/limit) — A/B พร้อมกัน ข้อมูลไป A (earliest) เท่านั้น ไม่ว่าใครเริ่มก่อน · Redis ล่มตอน A → B stale · source ถูกเขียนทับระหว่าง precheck→MOVE = mismatch · DB ล้ม = ไม่ MOVE · tie-break id", async () => {
  const m = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  const jobs = [];
  const mem = new Map();
  const state = { up: true };
  const fake = { ...fakeRedis(mem, state), supabase: fakeSupabase(jobs) }; // ห้าม override findEarliestJobSince
  const K = (u) => `objinfo:preprovided:${u}`;
  const seed = (u, raw, at) => mem.set(K(u), JSON.stringify({ raw, at }));

  // (1) A และ B ถูก insert แล้ว, bind A ก่อน → A ได้ · B no_source
  let t = Date.now() - 60_000; seed("U1", "พระสมเด็จวัดระฆัง ปี 2506", t);
  jobs.push(jobRow("jobA", "U1", t + 100), jobRow("jobB", "U1", t + 200));
  assert.deepEqual(await m.bindPreScanInfoToJob("U1", "jobA", fake), { bound: true, status: "moved" });
  assert.deepEqual(await m.bindPreScanInfoToJob("U1", "jobB", fake), { bound: false, status: "no_source" });
  assert.equal((await m.consumeJobPreScanInfo("jobA", fake))?.raw, "พระสมเด็จวัดระฆัง ปี 2506");

  // (2) B เริ่ม bind ก่อน A → B ห้ามขโมย (stale_after_prior_job, source คงอยู่) → A ได้
  t = Date.now() - 50_000; seed("U2", "หลวงปู่ทวด วัดช้างให้", t);
  jobs.push(jobRow("jobA2", "U2", t + 100), jobRow("jobB2", "U2", t + 200));
  const b2 = await m.bindPreScanInfoToJob("U2", "jobB2", fake);
  assert.equal(b2.status, "stale_after_prior_job"); assert.equal(b2.priorJobIdPrefix, "jobA2");
  assert.ok(mem.has(K("U2")), "source ต้องคงอยู่ให้เจ้าของ (ไม่ MOVE ไม่ DEL)");
  assert.deepEqual(await m.bindPreScanInfoToJob("U2", "jobA2", fake), { bound: true, status: "moved" });
  assert.equal(await m.consumeJobPreScanInfo("jobB2", fake), null);

  // (3) concurrent: B กับ A พร้อมกัน (B ยิงก่อนใน Promise.all) → A เท่านั้น
  t = Date.now() - 40_000; seed("U3", "เหรียญหลวงปู่หนูเพชร รุ่นหนุนดวง", t);
  jobs.push(jobRow("jobA3", "U3", t + 100), jobRow("jobB3", "U3", t + 200));
  const [rb3, ra3] = await Promise.all([m.bindPreScanInfoToJob("U3", "jobB3", fake), m.bindPreScanInfoToJob("U3", "jobA3", fake)]);
  assert.equal(ra3.bound, true); assert.equal(rb3.bound, false); assert.equal(rb3.status, "stale_after_prior_job");
  assert.equal(await m.consumeJobPreScanInfo("jobB3", fake), null); assert.ok((await m.consumeJobPreScanInfo("jobA3", fake))?.raw);

  // (4) Redis ล่มตอน A → กลับมาตอน B → B stale ไม่ bind ผิดรูป · source ค้างถึง TTL (ไม่มีใครได้)
  t = Date.now() - 30_000; seed("U4", "พระขุนแผน วัดบ้านกร่าง", t);
  jobs.push(jobRow("jobA4", "U4", t + 100));
  state.up = false;
  assert.deepEqual(await m.bindPreScanInfoToJob("U4", "jobA4", fake), { bound: false, status: "redis_unavailable" });
  assert.ok(mem.has(K("U4")), "source ค้างจริง (DEL ก็ทำไม่ได้)");
  state.up = true;
  jobs.push(jobRow("jobB4", "U4", t + 5000));
  const b4 = await m.bindPreScanInfoToJob("U4", "jobB4", fake);
  assert.equal(b4.status, "stale_after_prior_job"); assert.equal(b4.priorJobIdPrefix, "jobA4");
  assert.equal(mem.has("objinfo:pre_job:jobB4"), false); assert.equal(await m.consumeJobPreScanInfo("jobB4", fake), null);

  // (5) source ถูกเขียนทับเป็น provisional ชุดใหม่ระหว่าง precheck กับ MOVE → compare mismatch ห้ามย้ายชุดใหม่
  t = Date.now() - 20_000; seed("U5", "ชุดเก่า วัดระฆัง", t);
  jobs.push(jobRow("jobA5", "U5", t + 100));
  const newer = JSON.stringify({ raw: "ชุดใหม่ วัดปากน้ำ", at: Date.now() });
  const raceGet = { ...fake, get: async (k) => { const g = await fake.get(k); mem.set(K("U5"), newer); return g; } };
  const r5 = await m.bindPreScanInfoToJob("U5", "jobA5", raceGet);
  assert.equal(r5.status, "source_changed"); assert.equal(r5.bound, false);
  assert.equal(mem.get(K("U5")), newer, "ชุดใหม่ต้องยังอยู่ใน source ให้รูปถัดไป"); assert.equal(mem.has("objinfo:pre_job:jobA5"), false);

  // (6) DB ตรวจไม่ได้ → ห้าม MOVE, source คงอยู่, gate ถามตามปกติ
  t = Date.now() - 10_000; seed("U6", "หลวงปู่ศุข วัดปากคลองมะขามเฒ่า", t);
  const dbDown = { ...fake, supabase: { from: () => { throw new Error("db down"); } } };
  const r6 = await m.bindPreScanInfoToJob("U6", "jobA6", dbDown);
  assert.equal(r6.status, "stale_check_failed"); assert.ok(mem.has(K("U6"))); assert.equal(mem.has("objinfo:pre_job:jobA6"), false);
  const dbErr = { ...fake, supabase: { from: () => ({ select: () => ({ eq: () => ({ gt: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: "timeout" } }) }) }) }) }) }) }) } };
  assert.equal((await m.bindPreScanInfoToJob("U6", "jobA6", dbErr)).status, "stale_check_failed");
  // current job ยังไม่ปรากฏใน DB → ไม่ MOVE
  assert.equal((await m.bindPreScanInfoToJob("U6", "jobGhost", fake)).status, "stale_check_failed");

  // (7) tie-break: created_at เท่ากัน → id ASC เป็น earliest
  t = Date.now() - 5000; seed("U7", "ตะกรุดหลวงพ่อ", t);
  jobs.push(jobRow("jobZ7", "U7", t + 100), jobRow("jobA7", "U7", t + 100));
  assert.equal((await m.bindPreScanInfoToJob("U7", "jobZ7", fake)).status, "stale_after_prior_job");
  assert.equal((await m.bindPreScanInfoToJob("U7", "jobA7", fake)).bound, true);

  // pure decision
  assert.equal(m.decideBindEligibility({ currentJobId: "x", earliest: { ok: true, earliestJobId: "x" } }).eligible, true);
  assert.equal(m.decideBindEligibility({ currentJobId: "x", earliest: { ok: true, earliestJobId: "y" } }).status, "stale_after_prior_job");
  assert.equal(m.decideBindEligibility({ currentJobId: "x", earliest: { ok: false } }).status, "stale_check_failed");
  assert.equal(m.decideBindEligibility({ currentJobId: "x", earliest: { ok: true, earliestJobId: null } }).status, "stale_check_failed");
  // production helper query shape: order created_at asc + id asc, limit 1, รวม current (ไม่มี neq)
  const src = readFileSync("src/services/objectInfoGate/preScanObjectInfo.util.js", "utf8");
  const h = src.slice(src.indexOf("export async function findEarliestJobSince"), src.indexOf("export function decideBindEligibility"));
  assert.match(h, /\.gt\("created_at"/); assert.match(h, /\.order\("created_at", \{ ascending: true \}\)[\s\S]{0,40}\.order\("id", \{ ascending: true \}\)[\s\S]{0,40}\.limit\(1\)/); assert.doesNotMatch(h, /\.neq\(/);
  const ing = readFileSync("src/services/scanV2/webhookImageIngestion.service.js", "utf8");
  assert.match(ing, /stale_after_prior_job[\s\S]{0,400}PRE_SCAN_OBJECT_INFO_STALE_DISCARDED/);
});

test("P0-3 boundary (งบ 3): pre-used=2 → ยิงเพิ่มได้ 1 · pre-used=3 → planner/consult/phrasing transport=0 (typed) · orchestrator ซ้ำ → รวม ≤3 · นอก context/image turn พฤติกรรมเดิม · emit blockedCallSites", async () => {
  const als = await import("../src/core/telemetry/turnAiChain.js");
  const B = als.TURN_AI_CALL_BUDGET; assert.equal(B, 3);
  const { runGeminiFrontOrchestrator } = await import("../src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js");
  const { runGeminiPlannerWithMeta } = await import("../src/core/conversation/geminiFront/geminiPlanner.service.js");
  const { runGeminiConsult } = await import("../src/core/conversation/geminiFront/geminiConsult.service.js");
  const { runGeminiPhrasing } = await import("../src/core/conversation/geminiFront/geminiPhrasing.service.js");
  const prevFetch = globalThis.fetch;
  const llm = { calls: [] };
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/chat/completions")) {
      const body = JSON.parse(init?.body || "{}"); const site = String(body.user || "untagged").replace(/^(pro|staging|local):/, ""); llm.calls.push(site); /* Cost Discovery: payload จริง = env:callSite */
      const content = site === "planner" ? JSON.stringify({ proposed_action: "consult_amulet", confidence: 0.95 }) : site === "consult" ? "ผมว่าองค์นี้เด่นด้านเสน่หาครับ" : "phrasing";
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: {} }), text: async () => "" };
    }
    throw new Error("HERMETIC: db blocked");
  };
  const oWarn = console.warn, oLog = console.log; const warns = [];
  console.warn = (x) => warns.push(String(x)); console.log = () => {};
  const mkCtx = (phase1, extra = {}) => ({ userId: "U" + "8".repeat(32), text: "สายเสน่ห์ ต้องหาพระแบบไหนครับ", phase1State: phase1, conversationOwner: phase1, paymentState: "none", flowState: "idle", accessState: "free", pendingPaymentStatus: null, selectedPackageKey: null, sendGatewayReply: async () => ({ sent: true }), delegates: {}, ...extra });
  const pre = (n) => { for (let i = 0; i < n; i += 1) als.recordTurnAiCall(`pre${i}`); };
  try {
    // (a) pre-used = B-1 → non-idle: planner ยิงได้ 1, consult/phrasing ถูกกัน → รวม B
    llm.calls.length = 0; let a;
    await als.runWithTurnContext({ messageId: "a", kind: "text" }, async () => { pre(B - 1); const r = await runGeminiFrontOrchestrator(mkCtx("scan_ready_idle")); a = { r, count: als.getTurnAiCallCount() }; });
    assert.deepEqual(llm.calls, ["planner"]); assert.equal(a.count, B); assert.equal(a.r.reason, "ai_budget_exhausted");
    // (b) pre-used = B → transport 0 ทุก surface (typed)
    llm.calls.length = 0; let b;
    await als.runWithTurnContext({ messageId: "b", kind: "text" }, async () => {
      pre(B);
      const r = await runGeminiFrontOrchestrator(mkCtx("scan_ready_idle"));
      const pl = await runGeminiPlannerWithMeta(JSON.stringify({ text: "hi" }));
      const co = await runGeminiConsult({ userId: "U" + "8".repeat(32), userText: "พลังองค์นี้เป็นไง" });
      const ph = await runGeminiPhrasing({ allowedFacts: [], nextStep: "x", replyStyle: "neutral_help", userText: "hi", conversationHistory: [] }).catch(() => null);
      const lines = []; const o = console.log; console.log = (x) => lines.push(String(x)); als.emitTurnAiChain(); console.log = o;
      b = { r, pl, co, ph, count: als.getTurnAiCallCount(), emit: JSON.parse(lines.find((l) => l.includes("CHAT_TURN_AI_CHAIN"))) };
    });
    assert.deepEqual(llm.calls, []); assert.equal(b.r.reason, "ai_budget_exhausted"); assert.equal(b.pl.outcome, "budget_exhausted"); assert.equal(b.co, null); assert.ok(b.ph == null);
    assert.equal(b.count, B); assert.equal(b.emit.aiCallCount, B); assert.equal(b.emit.aiBudget, B); assert.ok(b.emit.blockedAiCallCount >= 2); assert.ok(b.emit.blockedCallSites.includes("planner"));
    assert.ok(warns.some((w) => w.includes("CHAT_TURN_AI_BUDGET_BLOCKED")));
    // (c) orchestrator ซ้ำในเทิร์นเดียว → รอบแรก planner+consult+consult = 3, รอบสอง transport 0 → รวม 3
    llm.calls.length = 0; let c;
    await als.runWithTurnContext({ messageId: "c", kind: "text" }, async () => {
      const r1 = await runGeminiFrontOrchestrator(mkCtx("scan_ready_idle")); const after1 = llm.calls.slice();
      const r2 = await runGeminiFrontOrchestrator(mkCtx("scan_ready_idle")); c = { r1, r2, after1, count: als.getTurnAiCallCount() };
    });
    assert.deepEqual(c.after1, ["planner", "consult", "consult"]); assert.deepEqual(llm.calls, c.after1); assert.equal(c.count, B);
    assert.equal(c.r1.handled, true); assert.equal(c.r2.reason, "ai_budget_exhausted");
    // (d) นอก text-turn context: ไม่บังคับ
    llm.calls.length = 0;
    assert.equal((await runGeminiPlannerWithMeta(JSON.stringify({ text: "hi" }))).outcome, "ok"); assert.deepEqual(llm.calls, ["planner"]);
    assert.equal(als.tryReserveTurnAiCall("z").enforced, false);
    // (e) image turn ที่ใช้ AI ไปแล้ว B → ยังยิงได้
    llm.calls.length = 0;
    await als.runWithTurnContext({ messageId: "e", kind: "image" }, async () => { pre(B); assert.equal((await runGeminiPlannerWithMeta(JSON.stringify({ text: "hi" }))).outcome, "ok"); });
    assert.deepEqual(llm.calls, ["planner"]);
  } finally { globalThis.fetch = prevFetch; console.warn = oWarn; console.log = oLog; }
});

/* ---------- P0-D / P0-E (Codex 28 ส.ค. หลัง smoke รอบ "ครบ" 08:01Z) ---------- */
test("P0-D: รูปที่มาระหว่างรูปก่อนหน้ากำลังประมวลผล ต้องได้ข้อความรอ (admin, AI=0) ไม่หายเงียบ · copy ไม่สัญญา/ไม่มีคำว่า ระบบ (static + text)", async () => {
  const src = readFileSync(new URL("../src/routes/lineWebhook.js", import.meta.url), "utf8");
  const guardAt = src.indexOf("ignore image: active processing");
  assert.ok(guardAt > 0);
  const after = src.slice(guardAt, guardAt + 1600);
  const returnAt = after.indexOf("\n    return;");
  const noticeAt = after.indexOf('replyType: "image_inflight_notice"');
  assert.ok(noticeAt > 0 && noticeAt < returnAt, "ต้องส่ง notice ก่อน return ใน guard");
  assert.ok(after.slice(0, returnAt).includes('speakerRoleOverride: "admin"'));
  assert.ok(after.slice(0, returnAt).includes("IMAGE_INFLIGHT_NOTICE"));
  const { MULTI_IMAGE_WAIT_TEXT } = await import("../src/services/scanV2/webhookImageIngestion.service.js");
  assert.ok(typeof MULTI_IMAGE_WAIT_TEXT === "string" && MULTI_IMAGE_WAIT_TEXT.length > 10);
  assert.ok(!/ระบบ/.test(MULTI_IMAGE_WAIT_TEXT), "ห้ามคำว่า ระบบ");
  assert.ok(!/(แจ้งกลับ|ส่งต่อให้|จะส่งให้)/.test(MULTI_IMAGE_WAIT_TEXT), "ห้ามสัญญางานอนาคตที่ไม่ได้ทำ (รูปนี้ไม่ได้เข้าคิว)");
});

test("P0-E: dedup/cached path (ไม่มี reportPayload แต่มี scanResultId) → โหลด payload ตาม id → consume+SAVED · ชิ้นที่มีข้อมูลแล้ว → ยัง SAVED ข้อมูลใหม่ · ไม่มีทางบันทึก → DROPPED ไม่ค้าง key · processScanJob แนบ scanResultId (static)", async () => {
  const { maybeHoldReportForObjectInfo } = await import("../src/services/objectInfoGate/objectInfoGate.service.js");
  const rp = { summary: { energyScore: 8.1 }, amuletV1: { powerCategories: { metta: { score: 77 } } }, scanId: "srCached" };
  const logs = []; const warns = []; const oLog = console.log, oWarn = console.warn, oErr = console.error;
  console.log = (x) => logs.push(String(x)); console.warn = (x) => warns.push(String(x)); console.error = () => {};
  try {
    // 1) sha256 dedup outbound: reportPayload null, publicToken none, scanResultId ของผลเดิม
    const inserted = [];
    const consumed = [];
    const db = { from: () => ({ insert: async (row) => { inserted.push(row); return { error: null }; } }) };
    const r1 = await maybeHoldReportForObjectInfo(
      { client: {}, lineUserId: "U" + "3".repeat(32), payload: { text: "ชิ้นนี้เคยสแกนไปแล้วครับ", dedupHit: true, dedupType: "sha256", scanResultId: "srCached" }, relatedJobId: "jobDup" },
      { supabase: db, loadReportPayloadById: async (id) => (id === "srCached" ? rp : null), hasInfoForObject: async () => false,
        consumeJobPreScanInfo: async (jid) => { consumed.push(jid); return { raw: "หลวงพ่อคูณวัดบ้านไร่", at: Date.now() }; },
        parseOwnerInfo: async () => ({ isObjectInfo: true, objectName: "หลวงพ่อคูณ", temple: "วัดบ้านไร่", confidence: 0.9 }) },
    );
    assert.equal(r1.outcome, "not_held");
    assert.deepEqual(consumed, ["jobDup"]);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].scan_result_id, "srCached");
    assert.equal(inserted[0].temple, "วัดบ้านไร่");
    assert.ok(logs.some((l) => l.includes('"OBJECT_INFO_SAVED"') && l.includes("pre_scan_text") && l.includes("jobDup")));
    assert.ok(!logs.some((l) => l.includes("no_report_payload")), "มี scanResultId ต้องโหลด payload ได้ ไม่ skip");

    // 2) ชิ้นมีข้อมูลอยู่แล้ว → ข้อมูลใหม่ที่ลูกค้าพิมพ์ต้องถูกบันทึก ไม่ทิ้ง
    const inserted2 = [];
    const db2 = { from: () => ({ insert: async (row) => { inserted2.push(row); return { error: null }; } }) };
    const r2 = await maybeHoldReportForObjectInfo(
      { client: {}, lineUserId: "U" + "4".repeat(32), payload: { reportPayload: rp }, relatedJobId: "jobHas" },
      { supabase: db2, hasInfoForObject: async () => true,
        consumeJobPreScanInfo: async () => ({ raw: "พระสมเด็จวัดระฆัง ปี 2500", at: Date.now() }),
        parseOwnerInfo: async () => ({ isObjectInfo: true, objectName: "พระสมเด็จ", temple: "วัดระฆัง", eraYear: "2500", confidence: 0.9 }) },
    );
    assert.equal(r2.outcome, "not_held");
    assert.equal(inserted2.length, 1);
    assert.equal(inserted2[0].era_year, "2500");

    // 3) ไม่มี payload และไม่มี scanResultId → บันทึกไม่ได้ → consume + DROPPED (ห้ามค้าง key เงียบ)
    const consumed3 = [];
    const r3 = await maybeHoldReportForObjectInfo(
      { client: {}, lineUserId: "U" + "5".repeat(32), payload: { text: "x" }, relatedJobId: "jobNoRp" },
      { supabase: db, consumeJobPreScanInfo: async (jid) => { consumed3.push(jid); return { raw: "เหรียญหลวงปู่ทวด", at: Date.now() }; } },
    );
    assert.equal(r3.outcome, "not_held");
    assert.deepEqual(consumed3, ["jobNoRp"]);
    assert.ok(warns.some((l) => l.includes("PRE_SCAN_OBJECT_INFO_DROPPED") && l.includes("no_report_payload")));
  } finally { console.log = oLog; console.warn = oWarn; console.error = oErr; }

  // static: dedup-hit outbound แนบ scanResultId ของผลเดิม
  const psj = readFileSync(new URL("../src/services/scanV2/processScanJob.service.js", import.meta.url), "utf8");
  const dedupAt = psj.indexOf('dedupType: "sha256",');
  assert.ok(dedupAt > 0);
  assert.ok(psj.slice(dedupAt, dedupAt + 400).includes("scanResultId: shaDup.scan_result_id"), "sha256 dedup outbound ต้องมี scanResultId");
  // path ที่ 2 (smoke 08:47Z): dHash near-exact dedup → SCAN_IMAGE_DEDUP_HIT ต้องแนบด้วย
  const phashAt = psj.indexOf('dedupType: "phash",');
  assert.ok(phashAt > 0);
  assert.ok(psj.slice(phashAt, phashAt + 400).includes("scanResultId: dupMatch.scan_result_id"), "phash dedup outbound ต้องมี scanResultId");
});

/* ---------- P0-F (Codex 28 ส.ค. หลัง smoke 50c4c2f): ข้อความข้อมูลชิ้นระหว่างรูป A ประมวลผล = ของ A ---------- */
function fakeSupabaseJobs(rows) {
  // เคารพ eq/in/gte/lte/order/limit จริง (findActiveJobsForUid ใช้ครบชุดนี้)
  return {
    from: () => {
      const q = { filters: [], orders: [], lim: null };
      const b = {
        select: () => b,
        eq: (c, v) => { q.filters.push((r) => String(r[c]) === String(v)); return b; },
        in: (c, arr) => { q.filters.push((r) => arr.map(String).includes(String(r[c]))); return b; },
        gte: (c, v) => { q.filters.push((r) => r[c] >= v); return b; },
        lte: (c, v) => { q.filters.push((r) => r[c] <= v); return b; },
        gt: (c, v) => { q.filters.push((r) => r[c] > v); return b; },
        order: (c, { ascending = true } = {}) => { q.orders.push([c, ascending]); return b; },
        limit: (n) => { q.lim = n; return b; },
        then: (res, rej) => {
          try {
            let out = rows.filter((r) => q.filters.every((f) => f(r)));
            out.sort((x, y) => { for (const [c, asc] of q.orders) { if (x[c] < y[c]) return asc ? -1 : 1; if (x[c] > y[c]) return asc ? 1 : -1; } return 0; });
            if (q.lim != null) out = out.slice(0, q.lim);
            res({ data: out, error: null });
          } catch (e) { rej(e); }
        },
      };
      return b;
    },
  };
}

test("P0-F: decision — ไม่มี active → next_image · 1 งาน → current_job · หลายงาน/DB error → ambiguous (fail-safe ไม่ผูกอะไร)", async () => {
  const { decidePreScanTarget, findActiveJobsForUid, PRE_SCAN_ACTIVE_JOB_STATUSES } = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  const uid = "U" + "6".repeat(32);
  const now = Date.now();
  const j = (id, status, agoMs, u = uid) => ({ id, status, created_at: new Date(now - agoMs).toISOString(), line_user_id: u });
  // 0 งาน
  assert.deepEqual(decidePreScanTarget(await findActiveJobsForUid(uid, now, { supabase: fakeSupabaseJobs([]) })), { target: "next_image" });
  // งานที่ส่งผลแล้ว/ล้ม ไม่นับ
  assert.deepEqual(decidePreScanTarget(await findActiveJobsForUid(uid, now, { supabase: fakeSupabaseJobs([j("d1", "delivered", 30_000), j("f1", "failed", 20_000)]) })), { target: "next_image" });
  // 1 งาน active ที่เริ่มก่อนข้อความ → current_job
  assert.deepEqual(decidePreScanTarget(await findActiveJobsForUid(uid, now, { supabase: fakeSupabaseJobs([j("A", "queued", 15_000), j("d1", "delivered", 60_000)]) })), { target: "current_job", jobId: "A" });
  // งาน hold (delivery_queued) ก็เป็น current ได้
  assert.equal(decidePreScanTarget(await findActiveJobsForUid(uid, now, { supabase: fakeSupabaseJobs([j("H", "delivery_queued", 40_000)]) })).jobId, "H");
  // งานที่เริ่ม "หลัง" ข้อความ ไม่ใช่เจ้าของ (created_at > textAt)
  assert.deepEqual(decidePreScanTarget(await findActiveJobsForUid(uid, now, { supabase: fakeSupabaseJobs([j("later", "queued", -5_000)]) })), { target: "next_image" });
  // งานเก่าเกิน 20 นาที ไม่นับ
  assert.deepEqual(decidePreScanTarget(await findActiveJobsForUid(uid, now, { supabase: fakeSupabaseJobs([j("old", "queued", 25 * 60_000)]) })), { target: "next_image" });
  // หลายงาน → ambiguous
  const amb = decidePreScanTarget(await findActiveJobsForUid(uid, now, { supabase: fakeSupabaseJobs([j("A", "queued", 15_000), j("B", "queued", 8_000)]) }));
  assert.equal(amb.target, "ambiguous"); assert.equal(amb.reason, "multiple_active_jobs");
  // คนอื่นไม่ปน
  assert.deepEqual(decidePreScanTarget(await findActiveJobsForUid(uid, now, { supabase: fakeSupabaseJobs([j("X", "queued", 10_000, "U" + "7".repeat(32))]) })), { target: "next_image" });
  // DB error → ambiguous
  const errChain = { then: (res) => res({ data: null, error: { message: "timeout" } }) };
  for (const k of ["select", "eq", "in", "gte", "lte", "gt", "neq", "order", "limit"]) errChain[k] = () => errChain;
  const dbErr = { from: () => errChain };
  const d = decidePreScanTarget(await findActiveJobsForUid(uid, now, { supabase: dbErr }));
  assert.equal(d.target, "ambiguous"); assert.ok(String(d.reason).startsWith("db_error"));
  assert.ok(PRE_SCAN_ACTIVE_JOB_STATUSES.includes("queued") && PRE_SCAN_ACTIVE_JOB_STATUSES.includes("delivery_queued"));
});

test("P0-F: ownership — ข้อความระหว่าง A ประมวลผล → key ของ A (ไม่แตะ preprovided) · B มาต่อทันที → no_source (ไม่ inherit) · gate ของ A consume ได้ · race text∥B พร้อมกัน → A เท่านั้น · เขียนล้ม = typed ไม่อ้างว่าเก็บแล้ว", async () => {
  const { bindPreScanInfoToCurrentJob, bindPreScanInfoToJob, consumeJobPreScanInfo, storePreScanObjectInfo } = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  const uid = "U" + "8".repeat(32);
  const mem = new Map(); const r = fakeRedis(mem);
  // A กำลังประมวลผล → ผูกตรง
  const w = await bindPreScanInfoToCurrentJob("A", "พระปิดตา วัดท่าสะแบง", { set: r.set });
  assert.deepEqual(w, { ok: true });
  assert.ok(mem.has("objinfo:pre_job:A"));
  assert.ok(!mem.has(`objinfo:preprovided:${uid}`), "current_job path ห้ามเขียน preprovided");
  // B มาต่อ → ingestion bind หา preprovided ไม่เจอ
  const b = await bindPreScanInfoToJob(uid, "B", { get: r.get, moveIfValue: r.moveIfValue, findEarliestJobSince: async () => ({ ok: true, earliestJobId: "B" }) });
  assert.equal(b.bound, false); assert.equal(b.status, "no_source");
  assert.ok(!mem.has("objinfo:pre_job:B"));
  // gate ของ A consume ได้ครั้งเดียว
  const pre = await consumeJobPreScanInfo("A", { getdel: r.getdel });
  assert.equal(pre.raw, "พระปิดตา วัดท่าสะแบง");
  assert.equal(await consumeJobPreScanInfo("A", { getdel: r.getdel }), null);
  // race: ข้อความ (current_job path) กับ B ingestion พร้อมกัน — B ต้องไม่ได้ ไม่ว่าลำดับ
  for (const order of ["text_first", "b_first"]) {
    const m2 = new Map(); const r2 = fakeRedis(m2);
    const textP = () => bindPreScanInfoToCurrentJob("A2", "เหรียญหลวงพ่อคูณ", { set: r2.set });
    const bP = () => bindPreScanInfoToJob(uid, "B2", { get: r2.get, moveIfValue: r2.moveIfValue, findEarliestJobSince: async () => ({ ok: true, earliestJobId: "B2" }) });
    const [tw, bw] = await Promise.all(order === "text_first" ? [textP(), bP()] : [bP(), textP()].reverse());
    assert.equal(tw.ok, true); assert.equal(bw.bound, false);
    assert.ok(m2.has("objinfo:pre_job:A2") && !m2.has("objinfo:pre_job:B2"));
  }
  // เขียนล้ม (redis ล่ม) → ok:false typed
  const down = fakeRedis(new Map(), { up: false });
  const f = await bindPreScanInfoToCurrentJob("A3", "พระสมเด็จ", { set: down.set });
  assert.equal(f.ok, false); assert.equal(f.reason, "redis_unavailable");
  // next_image path เดิมยังทำงาน (regression)
  const m3 = new Map(); const r3 = fakeRedis(m3);
  assert.deepEqual(await storePreScanObjectInfo(uid, "พระรอด วัดมหาวัน", { set: r3.set }), { ok: true });
  assert.ok(m3.has(`objinfo:preprovided:${uid}`));
});

test("P0-F: webhook ตัดสินเจ้าของก่อนเก็บ (static) · ambiguous ใช้ replyType แยก · copy ไม่มีคำว่า ระบบ", async () => {
  const src = readFileSync(new URL("../src/routes/lineWebhook.js", import.meta.url), "utf8");
  const at = src.indexOf("if (isPreScanObjectInfoText(text)) {");
  const blk = src.slice(at, at + 2500);
  const iDecide = blk.indexOf("decidePreScanTarget(");
  const iStore = blk.indexOf("storePreScanObjectInfo(userId, text)");
  const iCurrent = blk.indexOf("bindPreScanInfoToCurrentJob(decision.jobId, text)");
  assert.ok(iDecide > 0 && iDecide < iStore && iDecide < iCurrent, "ต้อง decide ก่อนเขียนทั้งสอง path");
  assert.ok(blk.includes('"pre_scan_object_info_ambiguous"'));
  assert.ok(blk.includes("target: decision.target"), "log CAPTURED ต้องบอก target");
  const { PRE_SCAN_INFO_CURRENT_JOB_ACK_TEXT, PRE_SCAN_INFO_AMBIGUOUS_TEXT } = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  for (const s of [PRE_SCAN_INFO_CURRENT_JOB_ACK_TEXT, PRE_SCAN_INFO_AMBIGUOUS_TEXT]) {
    assert.ok(!/ระบบ/.test(s));
    assert.ok(!/(แจ้งกลับ|เดี๋ยว.*ให้)/.test(s), `ห้ามสัญญาลอย: ${s}`);
  }
});

test("P0-F follow-up: held report ปล่อยหลังตอบ gate ต้องพา related_job_id (job ไม่ค้าง delivery_queued → ไม่ถูกนับเป็น active ผิด) (static)", () => {
  const src = readFileSync(new URL("../src/services/objectInfoGate/objectInfoGate.service.js", import.meta.url), "utf8");
  const p = src.indexOf("const pending = {");
  assert.ok(src.slice(p, p + 700).includes("relatedJobId: relatedJobId ? String(relatedJobId) : null"), "pending ต้องเก็บ relatedJobId");
  const r = src.indexOf("async function reEnqueueHeldReport(");
  assert.ok(src.slice(r, r + 500).includes("related_job_id: pending?.relatedJobId || null"), "re-enqueue ต้องส่ง related_job_id");
});

test("P0-F follow-up (แทนที่ด้วย P0-G contract): delivered แล้วห้าม mark ซ้ำ แต่ต้องไหลต่อไป settle ledger (static)", () => {
  const src = readFileSync(new URL("../src/services/scanV2/deliverOutbound.service.js", import.meta.url), "utf8");
  const f = src.indexOf("async function handleScanResultPostDelivery(");
  const body = src.slice(f, f + 2200);
  const guard = body.indexOf('=== "delivered"');
  const mark = body.indexOf('status: "delivered"');
  const settle = body.indexOf("settlePaidQuotaAfterDelivery(");
  assert.ok(guard > 0 && guard < mark && mark < settle, "เช็ค delivered → ข้ามแค่ mark → settle เสมอ");
  assert.ok(body.includes("SCAN_RESULT_POST_DELIVERY_ALREADY_DELIVERED"));
});

/* ---------- P0-G (Codex 29 ส.ค.): durable paid-quota ledger — delivered ≠ หักแล้ว ---------- */
function fakeQuotaDb(state) {
  // state: { ledger: Map<jobId,{status,app_user_id,attempts}>, jobs: Map<jobId,{access_source,app_user_id}>, balance: number, claimFailOnce?: boolean }
  const rpc = async (fn, args) => {
    if (state.rpcDown) return { data: null, error: { message: "connect_timeout" } };
    const jid = args?.p_job_id;
    const evidence = (j) => {
      if (j.access_source !== "paid" || !j.app_user_id) return "not_paid";
      if (j.version !== 2) return "not_accountable";
      if (!j.delivered) return "not_delivered";
      if (!j.sentOutbound) return j.sentSkip ? "skip_quota" : "no_sent_outbound";
      return "ok";
    };
    if (fn === "ensure_quota_decrement_pending") {
      const j = state.jobs.get(jid);
      if (!j) return { data: "job_not_found", error: null };
      const ev = evidence(j);
      if (ev !== "ok") return { data: ev, error: null };
      const led = state.ledger.get(jid);
      if (led) return { data: led.status, error: null };
      state.ledger.set(jid, { status: "pending", app_user_id: j.app_user_id, attempts: 0 });
      return { data: "pending", error: null };
    }
    if (fn === "claim_paid_scan_decrement") {
      const led = state.ledger.get(jid);
      if (!led) return { data: "no_ledger", error: null };
      if (led.status === "completed") return { data: "already_completed", error: null };
      if (state.claimFailOnce) { state.claimFailOnce = false; return { data: null, error: { message: "db_timeout" } }; }
      // P0-H: claim ตรวจหลักฐานซ้ำ (ledger อาจถูกสร้างก่อน state เปลี่ยน)
      if (state.claimRefuseOnce) { const r = state.claimRefuseOnce; state.claimRefuseOnce = null; return { data: r, error: null }; }
      const jc = state.jobs.get(jid);
      if (!jc) return { data: "job_not_found", error: null };
      const evc = evidence(jc);
      if (evc !== "ok") return { data: evc, error: null };
      // atomic เหมือน RPC จริง: หัก + completed ใน transaction เดียว
      state.balance = Math.max(0, state.balance - 1);
      led.status = "completed"; led.attempts += 1;
      return { data: "completed", error: null };
    }
    if (fn === "mark_quota_decrement_error") {
      const led = state.ledger.get(jid);
      if (led && led.status === "pending") { led.attempts += 1; led.last_error = args?.p_error; return { data: 1, error: null }; }
      return { data: 0, error: null };
    }
    if (fn === "reconcile_missing_quota_ledgers") {
      let n = 0;
      for (const [id, j] of state.jobs) {
        if (j.access_source === "paid" && j.app_user_id && j.delivered && j.version === 2 && j.sentOutbound && !j.skip && !state.ledger.has(id)) {
          state.ledger.set(id, { status: "pending", app_user_id: j.app_user_id, attempts: 0 }); n += 1;
        }
      }
      return { data: n, error: null };
    }
    throw new Error(`unknown rpc ${fn}`);
  };
  const from = (table) => {
    const q = { limit: 20 };
    const b = {
      select: () => b, eq: () => b, lte: () => b, order: () => b,
      limit: () => b,
      then: (res) => {
        const rows = [...state.ledger.entries()].filter(([, l]) => l.status === "pending").map(([job_id, l]) => ({ job_id, attempts: l.attempts }));
        res({ data: rows, error: null });
      },
    };
    return table === "scan_quota_decrements" ? b : (() => { throw new Error("unexpected table"); })();
  };
  return { rpc, supabase: { from } };
}

test("P0-G A/C/E/F: หักครั้งเดียวต่อ job — settle สำเร็จลด 1 · เรียกซ้ำ/พร้อมกัน = already_completed ยอดนิ่ง · free = not_paid ไม่มี ledger", async () => {
  const { settlePaidQuotaAfterDelivery } = await import("../src/services/scanV2/quotaLedger.util.js");
  const st = { ledger: new Map(), jobs: new Map([["J1", { access_source: "paid", app_user_id: "U1", delivered: true, version: 2, sentOutbound: true }], ["F1", { access_source: "free", app_user_id: "U1", delivered: true, version: 2, sentOutbound: true }]]), balance: 4 };
  const deps = fakeQuotaDb(st);
  // A: paid → completed, ลด 1
  assert.equal((await settlePaidQuotaAfterDelivery("J1", deps)).outcome, "completed");
  assert.equal(st.balance, 3);
  // E: retry → already_completed ยอดนิ่ง (จาก ensure ไม่ต้อง claim)
  assert.equal((await settlePaidQuotaAfterDelivery("J1", deps)).outcome, "already_completed");
  assert.equal(st.balance, 3);
  // C: duplicate พร้อมกัน 2 ตัวบน job ใหม่ → ลดรวม 1
  st.jobs.set("J2", { access_source: "paid", app_user_id: "U1", delivered: true, version: 2, sentOutbound: true });
  const [r1, r2] = await Promise.all([settlePaidQuotaAfterDelivery("J2", deps), settlePaidQuotaAfterDelivery("J2", deps)]);
  assert.deepEqual([r1.outcome, r2.outcome].sort(), ["already_completed", "completed"]);
  assert.equal(st.balance, 2);
  // F: free → not_paid ไม่มี ledger
  assert.equal((await settlePaidQuotaAfterDelivery("F1", deps)).outcome, "not_paid");
  assert.equal(st.ledger.has("F1"), false);
  assert.equal(st.balance, 2);
});

test("P0-G B/D: claim ล้ม → ledger คง pending + mark error + ยอดนิ่ง → sweeper ตามหักสำเร็จ 1 ครั้ง · crash หลัง delivered ก่อน ensure → reconcile สร้าง ledger แล้ว sweeper หัก", async () => {
  const { settlePaidQuotaAfterDelivery, sweepQuotaLedger } = await import("../src/services/scanV2/quotaLedger.util.js");
  // D: claim ล้มครั้งแรก
  const st = { ledger: new Map(), jobs: new Map([["J3", { access_source: "paid", app_user_id: "U2", delivered: true, version: 2, sentOutbound: true }]]), balance: 5, claimFailOnce: true };
  const deps = fakeQuotaDb(st);
  const d = await settlePaidQuotaAfterDelivery("J3", deps);
  assert.equal(d.outcome, "pending_retry");
  assert.equal(st.ledger.get("J3").status, "pending");
  assert.ok(st.ledger.get("J3").attempts >= 1, "mark_quota_decrement_error ต้องนับ attempt");
  assert.equal(st.balance, 5, "ล้มแล้วยอดต้องนิ่ง");
  // sweeper ตามหักต่อ → ลด 1
  const sw = await sweepQuotaLedger(deps);
  assert.equal(sw.claimed, 1);
  assert.equal(st.balance, 4);
  assert.equal(st.ledger.get("J3").status, "completed");
  // B: crash หลัง delivered(version2)+outbound sent ก่อน ensure → ไม่มี ledger → reconcile เก็บ → sweeper หัก
  st.jobs.set("J4", { access_source: "paid", app_user_id: "U2", delivered: true, version: 2, sentOutbound: true });
  const sw2 = await sweepQuotaLedger(deps);
  assert.equal(sw2.reconciled, 1);
  assert.equal(sw2.claimed, 1);
  assert.equal(st.balance, 3);
  // idempotent รอบถัดไป: ไม่มีอะไรให้ทำ ยอดนิ่ง
  const sw3 = await sweepQuotaLedger(deps);
  assert.equal(sw3.claimed + sw3.reconciled, 0);
  assert.equal(st.balance, 3);
  // rpc ล่มทั้งระบบ → typed pending_retry ไม่ throw
  st.rpcDown = true; st.jobs.set("J5", { access_source: "paid", app_user_id: "U2", delivered: true, version: 2, sentOutbound: true });
  assert.equal((await settlePaidQuotaAfterDelivery("J5", deps)).outcome, "pending_retry");
});

test("P0-G static: post-delivery ห้ามใช้ delivered เป็นหลักฐานหักสิทธิ์ — already_delivered ไหลต่อไป settle · mark delivered stamp version 2 · ไม่มี direct decrement · maintenance มี sweep", () => {
  const d = readFileSync(new URL("../src/services/scanV2/deliverOutbound.service.js", import.meta.url), "utf8");
  const f = d.indexOf("async function handleScanResultPostDelivery(");
  const body = d.slice(f, f + 2200);
  assert.ok(body.includes("const alreadyDelivered"), "ต้องมี alreadyDelivered flag");
  const iAlready = body.indexOf("SCAN_RESULT_POST_DELIVERY_ALREADY_DELIVERED");
  const iSettle = body.indexOf("settlePaidQuotaAfterDelivery(");
  assert.ok(iAlready > 0 && iSettle > iAlready, "already_delivered ต้องไม่ return ก่อน settle");
  assert.ok(!/if \(String\(job\.status[^)]*\) === "delivered"\) \{\s*console\.log[^}]+\}\s*return;/.test(body), "ห้าม return ทันทีเมื่อ delivered");
  assert.ok(body.includes("quota_accounting_version: 2"), "mark delivered ต้อง stamp version 2");
  assert.ok(!d.includes("decrementUserPaidRemainingScans"), "ห้าม direct decrement ใน deliverOutbound");
  const m = readFileSync(new URL("../src/workers/maintenanceWorker.js", import.meta.url), "utf8");
  assert.ok(m.includes("sweepQuotaLedger()"), "maintenance ต้องเรียก sweepQuotaLedger");
  const skipAt = body.indexOf("shouldSkipPaidQuotaDecrementAfterDelivery(payload)");
  assert.ok(skipAt > 0 && skipAt < iSettle, "skipQuotaDecrement (free/dedup) ต้อง return ก่อน settle — ไม่สร้าง pending");
});


/* ---------- P0-H (Codex 31 ส.ค.): DB ตรวจหลักฐานส่งเอง + lockdown สิทธิ์ ledger ---------- */
test("P0-H: หลักฐานไม่ครบ = ไม่หัก ไม่สร้าง ledger — ยังไม่ delivered / ไม่มี outbound sent / version ผิด → not_ready · skip-only → skipped", async () => {
  const { settlePaidQuotaAfterDelivery } = await import("../src/services/scanV2/quotaLedger.util.js");
  const st = { ledger: new Map(), jobs: new Map(), balance: 5 };
  const deps = fakeQuotaDb(st);
  st.jobs.set("P1", { access_source: "paid", app_user_id: "U9", delivered: false, version: 2, sentOutbound: false });
  let r = await settlePaidQuotaAfterDelivery("P1", deps);
  assert.equal(r.outcome, "not_ready"); assert.equal(r.message, "not_delivered");
  st.jobs.set("P2", { access_source: "paid", app_user_id: "U9", delivered: true, version: 2, sentOutbound: false });
  r = await settlePaidQuotaAfterDelivery("P2", deps);
  assert.equal(r.outcome, "not_ready"); assert.equal(r.message, "no_sent_outbound");
  st.jobs.set("P3", { access_source: "paid", app_user_id: "U9", delivered: true, version: 1, sentOutbound: true });
  r = await settlePaidQuotaAfterDelivery("P3", deps);
  assert.equal(r.outcome, "not_ready"); assert.equal(r.message, "not_accountable");
  st.jobs.set("P4", { access_source: "paid", app_user_id: "U9", delivered: true, version: 2, sentOutbound: false, sentSkip: true });
  r = await settlePaidQuotaAfterDelivery("P4", deps);
  assert.equal(r.outcome, "skipped");
  assert.equal(st.balance, 5, "ทุกเคสห้ามลด balance");
  assert.equal(st.ledger.size, 0, "ทุกเคสห้ามสร้าง ledger");
});

test("P0-H: claim ตรวจซ้ำใน transaction — ledger pending อยู่แต่ state ไม่พร้อมตอน claim → refuse typed + mark_error + ยอดนิ่ง (attacker วาง ledger ก่อน delivery ก็หักไม่ได้)", async () => {
  const { settlePaidQuotaAfterDelivery } = await import("../src/services/scanV2/quotaLedger.util.js");
  const st = { ledger: new Map(), jobs: new Map(), balance: 5 };
  const deps = fakeQuotaDb(st);
  st.jobs.set("P5", { access_source: "paid", app_user_id: "U9", delivered: true, version: 2, sentOutbound: true });
  st.ledger.set("P5", { status: "pending", app_user_id: "U9", attempts: 0 });
  st.claimRefuseOnce = "not_delivered"; // state แกว่งระหว่าง ensure กับ claim
  const r = await settlePaidQuotaAfterDelivery("P5", deps);
  assert.equal(r.outcome, "pending_retry"); assert.equal(r.message, "not_delivered");
  assert.equal(st.balance, 5);
  assert.equal(st.ledger.get("P5").status, "pending");
  assert.ok(st.ledger.get("P5").attempts >= 1, "claim refused ต้อง mark_error");
  // state พร้อมแล้ว → sweeper ตามหักสำเร็จ
  const { sweepQuotaLedger } = await import("../src/services/scanV2/quotaLedger.util.js");
  const sw = await sweepQuotaLedger(deps);
  assert.equal(sw.claimed, 1); assert.equal(st.balance, 4);
});

test("P0-H static: sql/055 มี evidence fn + claim FOR UPDATE บน scan_jobs + lockdown REVOKE · runner ทั้งสอง re-lockdown หลัง bulk GRANT · util มี typed ใหม่", () => {
  const sql = readFileSync(new URL("../sql/055_scan_quota_ledger.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("quota_delivery_evidence"));
  assert.ok(/claim_paid_scan_decrement[\s\S]*FROM scan_jobs WHERE id = p_job_id FOR UPDATE/.test(sql), "claim ต้อง lock+ตรวจ job ใน txn");
  assert.ok(sql.includes("REVOKE ALL ON TABLE scan_quota_decrements FROM PUBLIC"));
  assert.ok(sql.includes("REVOKE ALL ON TABLE scan_quota_decrements FROM web_anon"));
  assert.ok(sql.includes("REVOKE EXECUTE ON FUNCTION claim_paid_scan_decrement(uuid) FROM PUBLIC"));
  for (const f of ["../scripts/apply-local-db-migrations.sh", "../scripts/continue-local-db-migrations.sh"]) {
    const sh = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(sh.includes("REVOKE ALL PRIVILEGES ON scan_quota_decrements FROM web_anon"), `${f} ต้อง re-lockdown หลัง bulk GRANT`);
  }
  const u = readFileSync(new URL("../src/services/scanV2/quotaLedger.util.js", import.meta.url), "utf8");
  assert.ok(u.includes("QUOTA_LEDGER_CLAIM_REFUSED") && u.includes("QUOTA_LEDGER_NOT_READY") && u.includes("QUOTA_LEDGER_SKIPPED"));
});
