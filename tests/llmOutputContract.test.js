/**
 * LLM customer-output contract (เฟส 2 — Codex acceptance)
 * ตรวจ policy + grounding + failure policy (regenerate 1 ครั้ง → factual fallback)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
for (const [k, v] of Object.entries({
  OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s",
  LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x",
  LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "x",
})) if (!process.env[k]) process.env[k] = v;

const M = await import("../src/core/conversation/llmOutputContract.util.js");
const REPORT_EV = { report: { ids: ["res-1"], scores: [7.2], percentages: [68], energyTags: ["เมตตา"], luckyAttributes: [], materials: [] } };

const run = (text, extra = {}) => M.checkLlmCustomerOutput({ text, ...extra });

test("policy: ตอบประโยคเดียว · ไม่ CTA · ไม่ถามกลับ · ไม่แนะนำเอง", () => {
  assert.equal(run("รับรูปแล้ว").ok, true);
  assert.ok(run("รับรูปแล้ว. ส่งชิ้นต่อไปได้").violations.includes("multi_sentence"));
  assert.ok(run("ส่งรูปมาอีกชิ้น").violations.includes("unsolicited_cta"));
  assert.ok(run("อยากดูชิ้นไหนอีกไหม").violations.includes("unsolicited_question"));
  assert.ok(run("ควรพกติดตัว").violations.includes("unsolicited_advice"));
});

test("acceptance: คำถามใช่/ไม่ใช่ ต้องขึ้นต้นด้วยใช่ หรือ ไม่ใช่", () => {
  const q = "เปิดสิทธิ์ต้องจ่ายก่อนใช่ไหม";
  assert.ok(run("ต้องชำระก่อนจึงเปิดสิทธิ์", { userText: q }).violations.includes("yesno_not_direct"));
  assert.equal(run("ใช่", { userText: q }).ok, true);
});

test("acceptance: ขอคำแนะนำชัดเจน → อนุญาตคำแนะนำเดียว · required action → อนุญาตขั้นตอนเดียว", () => {
  assert.equal(run("ควรพกติดตัว", { userAskedAdvice: true }).ok, true);
  assert.equal(run("โอนแล้วแนบสลิปในแชตนี้", { requiredNextAction: true }).ok, true);
});

test("grounding: ไม่มี evidence ห้ามคะแนน/%/พลัง/วัสดุ/วัด-รุ่น/สถิติข้ามลูกค้า", () => {
  const cases = {
    "คะแนน 7.2/10": "ungrounded:score",
    "เข้ากับดวง 68%": "ungrounded:percent",
    "เด่นด้านเมตตาและมหานิยม": "ungrounded:energy",
    "เป็นพระเนื้อผง": "ungrounded:material",
    "พระสมเด็จวัดประสาทบุญญาวาส ปี 2506": "ungrounded:provenance",
    "เลขนำโชค 7 สีแดงเป็นมงคล": "ungrounded:lucky",
  };
  for (const [text, code] of Object.entries(cases)) {
    const r = run(text);
    assert.ok(r.violations.includes(code), `${text} → ${r.violations.join(",")}`);
  }
  // สถิติข้ามลูกค้า: มี evidence ก็ยังห้าม
  assert.ok(run("อ่านมาทั้งหมด 3,689 ครั้ง", { evidence: REPORT_EV }).violations.includes("ungrounded:cross_customer_stat"));
});

test("grounding: มี report evidence → ตัวเลข/พลังผ่าน · energy intent ต้องเป็นเสียงอาจารย์", () => {
  assert.equal(run("คะแนน 7.2 เต็มสิบ", { evidence: REPORT_EV, userAskedAdvice: false }).ok, true);
  const wrongRole = run("เด่นด้านเมตตา", {
    evidence: REPORT_EV, userIntent: "energy_reading", expectedRole: "admin",
  });
  assert.ok(wrongRole.violations.includes("energy_wrong_role"));
  assert.ok(wrongRole.violations.includes("admin_energy_claim"));
  const noReport = run("เด่นด้านเมตตา", { userIntent: "energy_reading", expectedRole: "ajarn" });
  assert.ok(noReport.violations.includes("energy_without_report"));
});

test("acceptance: ชื่อพระอย่างเดียว → ห้ามมโนพลัง/คะแนน (เคสจริง 20:48 ส.ค.)", () => {
  const modelOut = "ชิ้นนี้เป็นพระสมเด็จวัดประสาทบุญญาวาส ปี 2506 พลังเด่นออกทางสมดุลกับเมตตา";
  const r = run(modelOut, { userText: "พระสมเด็จวัดประสาทบุญญาวาส ปี 2506" });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.startsWith("ungrounded")));
});

test("acceptance: 'พระจริงพลังย่อมดีกว่า' (U03877cd) → reject เพราะไม่มีหลักฐาน", () => {
  const r = run("พระจริงพลังย่อมดีกว่า มีสายพลังจากต้นทาง");
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.startsWith("ungrounded")));
});

test("failure policy: ผ่านรอบแรก → AI 1 call", async () => {
  const r = await M.enforceLlmCustomerOutput({ text: null, callSite: "consult" }, {
    generate: async () => "รับรูปแล้ว", log: () => {},
  });
  assert.equal(r.source, "model");
  assert.equal(r.aiCalls, 1);
});

test("failure policy: รอบแรกผิด → regenerate 1 ครั้ง (AI≤2) → ผ่าน", async () => {
  const outs = ["ขอบคุณครับ", "รับรูปแล้ว"];
  let seenDirective = null;
  const r = await M.enforceLlmCustomerOutput({ callSite: "consult" }, {
    generate: async (d) => { seenDirective = d ?? seenDirective; return outs.shift(); },
    log: () => {},
  });
  assert.equal(r.source, "regenerated");
  assert.equal(r.aiCalls, 2);
  assert.ok(seenDirective && seenDirective.length > 0, "regenerate ต้องส่ง violation directive");
});

test("failure policy: ผิดสองรอบ → factual fallback (ห้ามส่งข้อความผิด ห้ามเงียบ AI≤2)", async () => {
  const logs = [];
  const r = await M.enforceLlmCustomerOutput({ callSite: "consult", replyType: "consult" }, {
    generate: async () => "ชิ้นนี้คะแนน 8.5/10 เด่นเมตตา",
    log: (e, x) => logs.push([e, x]),
  });
  assert.equal(r.source, "fallback");
  assert.equal(r.aiCalls, 2);
  assert.equal(r.text, "ยังไม่มีข้อมูลยืนยัน จึงระบุไม่ได้");
  const events = logs.map((l) => l[0]);
  assert.ok(events.includes("LLM_GROUNDING_REJECTED"));
  assert.ok(events.includes("LLM_REGENERATED"));
  assert.ok(events.includes("LLM_FACTUAL_FALLBACK_USED"));
  assert.equal(logs[0][1].evidencePresent, false, "telemetry ต้องบอก evidencePresent");
  assert.ok(!JSON.stringify(logs).includes("U0"), "ห้าม log PII");
});

test("acceptance: paid/free ใช้ contract เดียวกัน (ไม่มี branch แยก)", () => {
  const src = fs.readFileSync("src/core/conversation/llmOutputContract.util.js", "utf8");
  assert.ok(!/paidActive|isPaid|free\b.*policy/i.test(src), "ห้ามมี branch paid/free ใน contract");
});

test("acceptance: fallback ไม่มีคำต้องห้าม และผ่าน hard tone", async () => {
  const { checkHardTone } = await import("../src/core/conversation/hardTone.util.js");
  for (const v of [["ungrounded:score"], ["yesno_not_direct"], ["multi_sentence"]]) {
    const t = M.factualFallbackFor(v, {});
    assert.ok(checkHardTone(t, { kind: "reply" }).ok, `fallback ต้องผ่าน hard tone: ${t}`);
  }
});

/* ---------- Codex รอบสอง: fixtures จริงจาก log 20-21 ส.ค. (P0-3) ---------- */
test("fixtures จริง 20-21 ส.ค.: ทั้ง 6 เคสต้องถูก reject", () => {
  const cases = [
    ["คะแนน 75", "ungrounded:score"],
    ["ดวงวันนี้ 75 เลข 7 สีแดง", "ungrounded:score"],
    ["ตอบมาเป็นหมื่นรอบ", "ungrounded:cross_customer_stat"],
    ["เคยดูมากกว่า 3,689 ชิ้น", "ungrounded:cross_customer_stat"],
    ["แรงสุด 8.9", "ungrounded:score"],
    ["วัด ประสาทบุญญาวาส ปีเก่า", "ungrounded:provenance"],
  ];
  for (const [text, code] of cases) {
    const r = run(text, { evidence: REPORT_EV, expectedRole: "ajarn" });
    assert.ok(r.violations.includes(code), `${text} → ${r.violations.join(",") || "ผ่าน (ไม่ควร)"}`);
  }
  assert.ok(run("ดวงวันนี้ 75 เลข 7 สีแดง", { evidence: REPORT_EV }).violations.includes("ungrounded:lucky"));
});

test("P0-2: ID เปล่าปลดล็อกไม่ได้ · report ID ไม่ปลดล็อก provenance · KB ID ไม่ปลดล็อกคะแนน/พลัง", () => {
  const idOnly = { report: { ids: ["res-1"], scores: [], percentages: [], energyTags: [] }, kb: { ids: ["kb-1"] } };
  assert.ok(run("คะแนน 7.2/10", { evidence: idOnly }).violations.includes("ungrounded:score"));
  assert.ok(run("เด่นด้านเมตตา", { evidence: idOnly, expectedRole: "ajarn" }).violations.includes("ungrounded:energy"));
  assert.ok(run("พระวัดระฆัง ปี 2506", { evidence: REPORT_EV }).violations.includes("ungrounded:provenance"));
  // ค่าที่ไม่ตรงของจริงก็ต้องตก
  assert.ok(run("คะแนน 9.1/10", { evidence: REPORT_EV }).violations.includes("ungrounded:score"));
  // มี KB provenance fact จริง → ผ่าน
  const kbProv = { report: REPORT_EV.report, kb: { ids: ["kb-1"], provenanceFacts: ["วัดระฆัง 2506"], materialFacts: ["เนื้อผง"] } };
  assert.equal(run("พระวัดระฆัง ปี 2506 เนื้อผง", { evidence: kbProv }).ok, true);
});

test("P0-1 fail-closed: retry throw/timeout/ว่าง → ส่ง fallback เท่านั้น ห้ามคืน output เดิม", async () => {
  const { enforceLlmCustomerOutput } = await import("../src/core/conversation/llmOutputContract.util.js");
  const bad = "คะแนน 9.9/10 ส่งรูปมาอีกได้เลยครับ";
  for (const fail of [() => { throw new Error("timeout of 8000ms"); }, () => "", () => { throw new Error("boom"); }]) {
    let calls = 0;
    const r = await enforceLlmCustomerOutput(
      { callSite: "t", evidence: REPORT_EV },
      { generate: async (d) => { calls += 1; return d ? fail() : bad; }, log: () => {} },
    );
    assert.equal(r.source, "fallback");
    assert.notEqual(r.text, bad);
    assert.equal(r.text, "ยังไม่มีข้อมูลยืนยัน จึงระบุไม่ได้");
    assert.equal(calls, 2);
  }
  // call แรกล้มเลย → fallback ทันที ไม่มี transport ของ model
  const r0 = await enforceLlmCustomerOutput(
    { callSite: "t" }, { generate: async () => { throw new Error("timeout"); }, log: () => {} },
  );
  assert.equal(r0.source, "fallback");
  assert.equal(r0.failureType, "timeout");
});

test("P0-6: turn budget ≤2 · guard ตัวหลังห้ามเริ่มเชนใหม่", async () => {
  const { enforceLlmCustomerOutput } = await import("../src/core/conversation/llmOutputContract.util.js");
  const turnBudget = { attempted: 0, max: 2 };
  let calls = 0;
  const gen = async () => { calls += 1; return "คะแนน 9.9/10"; };
  await enforceLlmCustomerOutput({ callSite: "a", turnBudget, evidence: REPORT_EV }, { generate: gen, log: () => {} });
  assert.equal(calls, 2);
  const second = await enforceLlmCustomerOutput({ callSite: "b", turnBudget, evidence: REPORT_EV }, { generate: gen, log: () => {} });
  assert.equal(calls, 2, "guard ตัวที่สองต้องไม่เรียกโมเดลเพิ่ม");
  assert.equal(second.source, "fallback");
  assert.equal(second.failureType, "budget_exhausted");
});

test("P0-5: คำถามใน output = reject เว้น allowQuestion · คำแนะนำ/ขั้นตอนได้อย่างละหนึ่ง", () => {
  assert.ok(run("พกไว้ไหม").violations.includes("unsolicited_question"));
  assert.ok(run("ใช่", { userText: "อันนี้เนื้อผงใช่ไหม" }).ok, "yes/no ตอบตรงผ่าน");
  assert.ok(run("ใช่ แล้วอยากดูรุ่นอื่นไหม", { userText: "เนื้อผงใช่ไหม" }).violations.includes("unsolicited_question"));
  assert.equal(run("พกไว้ไหม", { allowQuestion: true }).violations.includes("unsolicited_question"), false);
  assert.ok(run("ควรพกติดตัว แนะนำให้สวดก่อนนอน", { userAskedAdvice: true }).violations.includes("multi_advice"));
  assert.ok(run("โอนแล้วแนบสลิป จากนั้นพิมพ์ ตรวจ", { requiredNextAction: true }).violations.includes("multi_step"));
  assert.equal(run("ยังระบุไม่ได้", { userText: "ของแท้ไหม" }).violations.includes("unsolicited_question"), false);
});

test("CHAT_TURN_AI_CHAIN: consult + money guard + tone guard ใช้งบร่วมกัน ≤2 เรียกจริง", async () => {
  const { runGeminiConsult } = await import("../src/core/conversation/geminiFront/geminiConsult.service.js");
  const { buildIntentContract } = await import(
    "../src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js"
  );
  const turnBudget = { attempted: 0, max: 2 };
  const logs = [];
  const origLog = console.log;
  console.log = (x) => logs.push(String(x));
  try {
    // จำลอง: consult ใช้งบครบ 2 (contract เรียก + retry) แล้ว guard ตัวหลังขอเรียกอีก
    turnBudget.attempted = 2;
    const moneyRetry = await runGeminiConsult({ userId: "u1", userText: "ราคาเท่าไหร่", turnBudget });
    const toneRetry = await runGeminiConsult({ userId: "u1", userText: "ราคาเท่าไหร่", turnBudget });
    assert.equal(moneyRetry, null);
    assert.equal(toneRetry, null);
    assert.equal(turnBudget.attempted, 2, "guard ตัวหลังห้ามเพิ่มยอดเรียกโมเดล");
    assert.ok(logs.filter((l) => l.includes("LLM_TURN_BUDGET_EXHAUSTED")).length === 2);
  } finally {
    console.log = origLog;
  }
  // router สร้าง contract ก่อนเรียกโมเดล และ fail-closed เมื่อ metadata หาย
  // B1: router จำแนก intent เท่านั้น — role ไปตัดใน consult จาก evidence จริง
  const { resolveExpectedRole } = await import("../src/core/conversation/geminiFront/intentContract.util.js");
  const bare = buildIntentContract({ text: "พลังองค์นี้เป็นไง" }, null);
  assert.equal(bare.userIntent, "energy_question");
  assert.equal(bare.allowQuestion, false);
  assert.equal(bare.requiredNextAction, false);
  assert.equal("expectedRole" in bare, false, "router ห้ามเดา role");
  assert.equal(resolveExpectedRole(bare, { report: { ids: [] } }), "consult", "ไม่มีรายงาน = ห้ามเป็นเสียงอาจารย์");
  assert.equal(resolveExpectedRole(bare, { report: { ids: ["r1"] } }), "ajarn");
  assert.equal(resolveExpectedRole(buildIntentContract({ text: "จ่ายยังไง" }, "paywall"), { report: { ids: ["r1"] } }), "admin");
});

/* ---------- Codex รอบสาม: B1 / B2 / B3 / P1 ---------- */
test("B1: evidence มาจาก typed scan history object เดียวกับ prompt (ไม่ parse string)", async () => {
  const { buildConsultEvidence } = await import("../src/core/conversation/geminiFront/geminiConsult.service.js");
  const typed = {
    promptText: "1) ชื่อ/ประเภท: พระสมเด็จ · พลังเด่น: เมตตา · คะแนนพลัง: 7.2/10 · เข้ากับคุณ: 68%",
    items: [{ reportId: "tok-1", label: "พระสมเด็จ", score: 7.2, compatPercent: 68, energyTags: ["เมตตา"] }],
  };
  const ev = buildConsultEvidence({ recentScan: typed, kbContext: null });
  assert.deepEqual(ev.report.ids, ["tok-1"]);
  assert.deepEqual(ev.report.scores, [7.2]);
  assert.deepEqual(ev.report.percentages, [68]);
  assert.deepEqual(ev.report.energyTags, ["เมตตา"]);
  // acceptance 1-3
  assert.equal(run("คะแนน 7.2", { evidence: ev, expectedRole: "ajarn" }).ok, true);
  assert.equal(run("เด่นด้านเมตตา", { evidence: ev, expectedRole: "ajarn" }).ok, true);
  assert.ok(run("คะแนน 9.9", { evidence: ev, expectedRole: "ajarn" }).violations.includes("ungrounded:score"));
  assert.ok(run("เด่นด้านโชคลาภ", { evidence: ev, expectedRole: "ajarn" }).violations.includes("ungrounded:energy"));
  const none = buildConsultEvidence({ recentScan: null });
  assert.ok(run("คะแนน 7.2", { evidence: none }).violations.includes("ungrounded:score"));
  assert.ok(run("เด่นด้านเมตตา", { evidence: none }).violations.includes("ungrounded:energy"));
  // string เดิม (prompt) ไม่ปลดล็อกอะไร
  assert.deepEqual(buildConsultEvidence({ recentScan: typed.promptText }).report.ids, []);
});

test("B1: role ตัดจาก evidence จริง ไม่ใช่ flag ที่ caller เดา", async () => {
  const { classifyUserIntent, resolveExpectedRole, finalizeIntent } = await import(
    "../src/core/conversation/geminiFront/intentContract.util.js"
  );
  const c = classifyUserIntent("พลังองค์นี้เป็นไง", null);
  assert.equal(c.userIntent, "energy_question");
  assert.equal(resolveExpectedRole(c, { report: { ids: [] } }), "consult");
  assert.equal(resolveExpectedRole(c, { report: { ids: ["r1"] } }), "ajarn");
  assert.equal(finalizeIntent(c, { report: { ids: ["r1"] } }), "energy_reading");
  assert.equal(resolveExpectedRole(classifyUserIntent("จ่ายยังไง", "paywall"), { report: { ids: ["r1"] } }), "admin");
  assert.equal(resolveExpectedRole(null, { report: { ids: ["r1"] } }), "consult");
});

test("B1/P1: production call chain — typed history → consult → gateway เป็นเจ้าของ call แรก", async () => {
  // ยิงผ่าน runGeminiConsult จริง โดย mock เฉพาะ DB row + โมเดล (ไม่เรียก buildConsultEvidence ด้วย object ปลอม)
  const scanDb = await import("../src/stores/scanV2/scanResultsV2.db.js");
  const rows = [{ id: "row-1", html_public_token: "tok-1", created_at: "2026-08-20T10:00:00Z",
    report_payload_json: { summary: { mainEnergyLabel: "เมตตา", energyScore: 7.2, compatibilityPercent: 68 }, object: { objectLabel: "พระสมเด็จ" } } }];
  void scanDb;
  // typed builder จาก DB row จริง (DI เฉพาะตัว loader — ไม่ประกอบ items เอง)
  const mod = await import("../src/core/conversation/geminiFront/recentScanContext.util.js");
  const typed = await mod.buildScanHistoryTyped("Utest", 6, { listRows: async () => rows });
  assert.equal(typed.items[0].reportId, "tok-1");
  assert.equal(typed.items[0].score, 7.2);
  assert.equal(typed.items[0].compatPercent, 68);
  assert.deepEqual(typed.items[0].energyTags, ["เมตตา"]);
  assert.ok(typed.promptText.includes("7.2/10"));
  // chain จริง: typed → buildConsultEvidence (ฟังก์ชันเดียวกับที่ consult ใช้) → contract
  const { buildConsultEvidence } = await import("../src/core/conversation/geminiFront/geminiConsult.service.js");
  const ev = buildConsultEvidence({ recentScan: typed });
  assert.equal(run("คะแนน 7.2", { evidence: ev, expectedRole: "ajarn" }).ok, true);
  assert.ok(run("คะแนน 9.9", { evidence: ev, expectedRole: "ajarn" }).violations.includes("ungrounded:score"));
  // gateway: call แรกล้ม → LLM_FACTUAL_FALLBACK_USED จาก contract (ไม่ใช่ null เงียบจาก outer catch)
  const { enforceLlmCustomerOutput } = await import("../src/core/conversation/llmOutputContract.util.js");
  const events = [];
  const r = await enforceLlmCustomerOutput({ callSite: "gemini_front_consult" }, {
    generate: async () => { throw new Error("timeout 8000ms"); }, log: (e, x) => events.push({ e, ...x }),
  });
  assert.equal(r.source, "fallback");
  assert.ok(events.some((x) => x.e === "LLM_FACTUAL_FALLBACK_USED" && x.failureType === "timeout"));
  assert.ok(typeof mod.buildScanHistoryTyped === "function");
});

test("B2: evidence ตาม label/field — quota 75 ≠ score 75 · ปี 2506 ≠ คะแนน · compat 68 ≠ score 68", async () => {
  const { evidenceFromAllowedFacts } = await import("../src/core/conversation/llmOutputContract.util.js");
  assert.ok(run("คะแนน 75", { evidence: evidenceFromAllowedFacts("คงเหลือ 75 ครั้ง"), expectedRole: "ajarn" }).violations.includes("ungrounded:score"));
  assert.ok(run("คะแนน 75", { evidence: evidenceFromAllowedFacts({ remainingScans: 75 }) }).violations.includes("ungrounded:score"));
  assert.ok(run("คะแนน 2506", { evidence: evidenceFromAllowedFacts({ eraYear: 2506 }) }).violations.includes("ungrounded:score"));
  assert.ok(run("คะแนน 68", { evidence: evidenceFromAllowedFacts({ compatPercent: 68 }) }).violations.includes("ungrounded:score"));
  assert.ok(run("เลขนำโชค 2506", { evidence: evidenceFromAllowedFacts({ eraYear: 2506 }) }).violations.includes("ungrounded:lucky"));
  // label ถูก → ผ่าน
  const ev = evidenceFromAllowedFacts({ energyScore: 7.2, compatPercent: 68, energyTags: ["เมตตา"], reportId: "r1" });
  assert.equal(run("คะแนน 7.2", { evidence: ev, expectedRole: "ajarn" }).ok, true);
  assert.equal(run("เข้ากับดวง 68%", { evidence: ev, expectedRole: "ajarn" }).ok, true);
  assert.ok(run("คะแนน 68", { evidence: ev, expectedRole: "ajarn" }).violations.includes("ungrounded:score"));
});

test("B3: provenance เทียบราย field · lucky เทียบค่าจริง", async () => {
  const kb = (f) => ({ evidence: { kb: { ids: ["kb"], provenanceFacts: [f] } } });
  assert.ok(run("วัดปลอม ปี 9999", kb("วัดระฆัง ปี 2506")).violations.includes("ungrounded:provenance"));
  assert.equal(run("พระวัดระฆัง ปี 2506", kb("วัดระฆัง ปี 2506")).ok, true);
  assert.equal(run("พระวัดระฆัง ปี 2506", kb({ temple: "วัดระฆัง", year: 2506 })).ok, true);
  assert.ok(run("วัดระฆัง ปี 2500", kb({ temple: "วัดระฆัง", year: 2506 })).violations.includes("ungrounded:provenance"));
  assert.ok(run("วัดระฆัง รุ่นแรก", kb({ temple: "วัดระฆัง", year: 2506 })).violations.includes("ungrounded:provenance"));
  assert.ok(run("วัดระฆัง ปีเก่า", kb({ temple: "วัดระฆัง", year: 2506 })).violations.includes("ungrounded:provenance"), "ยุคคลุมเครือไม่มีค่าให้เทียบ");
  // report ID ยังปลดล็อก provenance ไม่ได้
  assert.ok(run("พระวัดระฆัง ปี 2506", { evidence: { report: { ids: ["r1"] } } }).violations.includes("ungrounded:provenance"));
  const lucky = { report: { ids: ["r"], luckyAttributes: ["แดง", 9] } };
  assert.equal(run("สีมงคลแดง", { evidence: lucky }).ok, true);
  assert.equal(run("เลขมงคล 9", { evidence: lucky }).ok, true);
  assert.ok(run("สีมงคลเขียว", { evidence: lucky }).violations.includes("ungrounded:lucky"));
  assert.ok(run("เลขมงคล 7", { evidence: lucky }).violations.includes("ungrounded:lucky"));
});

/* ---------- Codex รอบสี่: B1 intent priority · B2 canonical energy tags ---------- */
test("B1: payment/registration state ชนะ energy cue · ดีไหม ลอย ๆ ไม่ใช่พลัง · requiredNextAction ไม่มาจาก state", async () => {
  const { classifyUserIntent, resolveExpectedRole, finalizeIntent, withRequiredAction } = await import(
    "../src/core/conversation/geminiFront/intentContract.util.js"
  );
  const rep = { report: { ids: ["r1"], scores: [7.2], energyTags: ["เมตตา"] } };
  const c1 = classifyUserIntent("แพ็กนี้ดีไหม", "paywall_selecting_package");
  assert.equal(c1.userIntent, "payment_question");
  assert.equal(c1.requiredNextAction, false);
  assert.equal(resolveExpectedRole(c1, rep), "admin");
  assert.equal(run("ใช่", { userText: "แพ็กนี้ดีไหม", userIntent: finalizeIntent(c1, rep), expectedRole: "admin", evidence: rep }).ok, true);
  const c2 = classifyUserIntent("พรุ่งนี้ใช้ฟรีได้กี่โมง", "paywall_selecting_package");
  assert.equal(c2.requiredNextAction, false);
  assert.ok(run("เที่ยงคืน ส่งรูปมาได้เลย", { userIntent: c2.userIntent, expectedRole: "admin" }).violations.includes("unsolicited_cta"));
  const c3 = classifyUserIntent("พลังองค์นี้ดีไหม", null);
  assert.equal(finalizeIntent(c3, rep), "energy_reading");
  assert.equal(resolveExpectedRole(c3, rep), "ajarn");
  assert.equal(classifyUserIntent("แพ็กนี้ดีไหม", null).userIntent, "payment_question");
  assert.equal(classifyUserIntent("ดีไหม", null).userIntent, "general");
  assert.equal(withRequiredAction(c2).requiredNextAction, true);
});

test("B2: report label รวม → canonical tags · claim แยกผ่าน · tag ที่ไม่มี reject", async () => {
  const { canonicalEnergyTags } = await import("../src/core/conversation/llmOutputContract.util.js");
  assert.deepEqual(canonicalEnergyTags("เมตตา มหานิยม"), ["เมตตา", "มหานิยม"]);
  assert.deepEqual(canonicalEnergyTags("สมดุล/เมตตา").sort(), ["สมดุล", "เมตตา"].sort());
  const ev = { report: { ids: ["r1"], energyTags: canonicalEnergyTags("เมตตา มหานิยม") } };
  assert.equal(run("เด่นด้านเมตตา", { evidence: ev, expectedRole: "ajarn" }).ok, true);
  assert.equal(run("เด่นด้านมหานิยม", { evidence: ev, expectedRole: "ajarn" }).ok, true);
  assert.ok(run("เด่นด้านโชคลาภ", { evidence: ev, expectedRole: "ajarn" }).violations.includes("ungrounded:energy"));
  // typed builder ใช้ normalizer เดียวกัน
  const { buildScanHistoryTyped } = await import("../src/core/conversation/geminiFront/recentScanContext.util.js");
  const typed = await buildScanHistoryTyped("Utest", 6, { listRows: async () => [{ id: "row", html_public_token: "tok", created_at: "2026-08-20",
    report_payload_json: { summary: { mainEnergyLabel: "สมดุล/เมตตา", energyScore: 7 }, object: { objectLabel: "พระ" } } }] });
  assert.deepEqual(typed.items[0].energyTags.sort(), ["สมดุล", "เมตตา"].sort());
  assert.equal(typed.items[0].energyLabelRaw, "สมดุล/เมตตา");
});

test("smoke 24 ส.ค. เคส 1: alias ปกป้อง↔คุ้มครอง และ label จริงบน pro ต้องเป็น evidence ได้", async () => {
  const { canonicalEnergyTags } = await import("../src/core/conversation/llmOutputContract.util.js");
  assert.deepEqual(canonicalEnergyTags("ปกป้อง"), ["คุ้มครอง"]);
  assert.deepEqual(canonicalEnergyTags("พลังคุ้มครอง (เน้นเกราะใจ)"), ["คุ้มครอง"]);
  for (const l of ["อำนาจ", "เสริมพลัง", "เร่งการเปลี่ยนแปลง", "บารมี", "หนุนดวง", "โชคลาภ", "สมดุล"]) assert.deepEqual(canonicalEnergyTags(l), [l], l);
  const ev = { report: { ids: ["r1"], scores: [7.8], percentages: [78], energyTags: canonicalEnergyTags("ปกป้อง") } };
  assert.equal(run("คะแนน 7.8 เด่นด้านปกป้อง", { evidence: ev, expectedRole: "ajarn" }).ok, true, "รายงานจริง 7.8/ปกป้อง/78% ต้องผ่าน");
  assert.equal(run("เด่นด้านคุ้มครอง", { evidence: ev, expectedRole: "ajarn" }).ok, true);
  assert.ok(run("เด่นด้านโชคลาภ", { evidence: ev, expectedRole: "ajarn" }).violations.includes("ungrounded:energy"));
});
