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
  const bare = buildIntentContract({ text: "พลังองค์นี้เป็นไง" }, null);
  assert.equal(bare.expectedRole, "consult", "ไม่มีรายงาน = ห้ามเป็นเสียงอาจารย์");
  assert.equal(bare.allowQuestion, false);
  assert.equal(bare.requiredNextAction, false);
  const withReport = buildIntentContract({ text: "พลังองค์นี้เป็นไง", recentScanIds: ["r1"] }, null);
  assert.equal(withReport.expectedRole, "ajarn");
  assert.equal(buildIntentContract({ text: "จ่ายยังไง" }, "paywall").expectedRole, "admin");
});
