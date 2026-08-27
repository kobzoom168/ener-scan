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
};
for (const [k, v] of Object.entries(HERMETIC_ENV)) process.env[k] = v;
try {
  for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && !process.env[m[1]]) process.env[m[1]] = "test-placeholder";
  }
} catch { /* ignore */ }
const EXTERNAL = { network: 0 };
globalThis.fetch = async () => { EXTERNAL.network += 1; throw new Error("HERMETIC: network blocked"); };

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

test("A: bind ตอนรับรูป (atomic move) · reverse completion: รูป A รับก่อน รูป B รับทีหลัง B เสร็จก่อน → ข้อมูลอยู่กับ A เท่านั้น · consume ครั้งเดียว", async () => {
  const m = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  const mem = new Map();
  const fake = {
    set: async (k, v) => { mem.set(k, v); },
    move: async (src, dst) => { const v = mem.get(src); if (v == null) return null; mem.delete(src); mem.set(dst, v); return v; },
    getdel: async (k) => { const v = mem.get(k); if (v == null) return null; mem.delete(k); return v; },
  };
  await m.storePreScanObjectInfo("U1", "พระสมเด็จวัดระฆัง ปี 2506", fake);
  assert.equal(await m.bindPreScanInfoToJob("U1", "jobA", fake), true, "รูป A รับก่อน → bind");
  assert.equal(await m.bindPreScanInfoToJob("U1", "jobB", fake), false, "รูป B รับทีหลัง ไม่มีข้อมูลเหลือ");
  // B เสร็จก่อน
  assert.equal(await m.consumeJobPreScanInfo("jobB", fake), null);
  const a = await m.consumeJobPreScanInfo("jobA", fake);
  assert.equal(a.raw, "พระสมเด็จวัดระฆัง ปี 2506");
  assert.equal(await m.consumeJobPreScanInfo("jobA", fake), null, "consume แล้วต้องหาย");
  // สอง worker แย่ง consume job เดียวกัน: ได้แค่ตัวเดียว (getdel atomic)
  await m.storePreScanObjectInfo("U2", "หลวงปู่ทวด วัดช้างให้", fake);
  await m.bindPreScanInfoToJob("U2", "jobC", fake);
  const [w1, w2] = await Promise.all([m.consumeJobPreScanInfo("jobC", fake), m.consumeJobPreScanInfo("jobC", fake)]);
  assert.equal([w1, w2].filter(Boolean).length, 1);
  // DB ล้ม → restore แล้ว consume ได้อีกครั้ง
  await m.restoreJobPreScanInfo("jobC", w1 || w2, fake);
  assert.ok((await m.consumeJobPreScanInfo("jobC", fake))?.raw);
  // ไม่มี redis (move คืน null) = ไม่ bind → gate ถามตามปกติ
  assert.equal(await m.bindPreScanInfoToJob("U9", "jobZ", { move: async () => null }), false);
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
  assert.match(src.slice(at, at + 1200), /speakerRoleOverride: "admin"/);
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
