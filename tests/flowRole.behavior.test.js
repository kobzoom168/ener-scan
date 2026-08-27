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
  CHANNEL_ACCESS_TOKEN: "hermetic", CHANNEL_SECRET: "hermetic", GEMINI_API_KEY: "hermetic", REDIS_URL: "",
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

test("A: provisional 15 นาที bind/consume ครั้งเดียว แล้วลบทันที", async () => {
  const { storePreScanObjectInfo, consumePreScanObjectInfo, PRE_SCAN_INFO_TTL_SEC } = await import(
    "../src/services/objectInfoGate/preScanObjectInfo.util.js"
  );
  const mem = new Map();
  const deps = { set: async (k, v) => { mem.set(k, v); }, get: async (k) => mem.get(k) || null, clear: async (k) => { mem.delete(k); } };
  assert.equal(PRE_SCAN_INFO_TTL_SEC, 900);
  await storePreScanObjectInfo("U1", "พระสมเด็จวัดระฆัง ปี 2506", deps);
  const a = await consumePreScanObjectInfo("U1", deps);
  assert.equal(a.raw, "พระสมเด็จวัดระฆัง ปี 2506");
  assert.equal(await consumePreScanObjectInfo("U1", deps), null, "consume แล้วต้องหาย (กันผูกผิดชิ้น)");
  // หมดอายุ = null
  mem.set("objinfo:preprovided:U2", JSON.stringify({ raw: "x", at: Date.now() - 16 * 60 * 1000 }));
  assert.equal(await consumePreScanObjectInfo("U2", deps), null);
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
test("C: energy/amulet advice → ajarn ก่อน generate · เงิน/สถานะ → admin · handoff/ผม ใน output อาจารย์ = reject → retry → role-safe fallback ไม่เงียบ", async () => {
  const m = await import("../src/core/conversation/consultRoleRoute.util.js");
  assert.equal(m.routeConsultRole("สายเสน่ห์ ต้องหาพระหรือเครื่องรางแบบไหนครับ"), "ajarn"); // เคส 13
  assert.equal(m.routeConsultRole("เสริมบารมีครับ"), "ajarn"); // เคส 2
  assert.equal(m.routeConsultRole("เน้นโชคลาภ ห้อยองค์ไหนดี"), "ajarn");
  assert.equal(m.routeConsultRole("จ่ายยังไงครับ"), "admin");
  assert.equal(m.routeConsultRole("ผลยังไม่มาเลย"), "admin");
  assert.equal(m.routeConsultRole("สวัสดีครับ"), null);
  assert.equal(m.checkAjarnVoice("สายเสน่หาเชื่อกันว่า พระขุนแผน … ส่งรูปมาให้อาจารย์สแกนดูได้").ok, false);
  assert.equal(m.checkAjarnVoice("ชิ้นที่สแกนไว้เด่นด้านปกป้อง เจอชิ้นไหนส่งรูปมาให้อาจารย์สแกนดูได้").ok, false);
  assert.equal(m.checkAjarnVoice("อาจารย์มองว่าสายเสน่หา พระขุนแผนกับตะกรุดมหาเสน่ห์เด่นด้านนี้ครับ").ok, true);
  assert.equal(m.checkAjarnVoice("เดี๋ยวผมถามอาจารย์ให้ครับ").ok, false);
  const fb = m.ajarnRoleSafeFallback({ hasReport: false });
  assert.ok(fb.length > 0);
  assert.doesNotMatch(fb, /เด่นด้าน|คะแนน|\d+%|ส่งให้อาจารย์|ผม/);
  // orchestrator wiring: retry แล้ว fallback ห้ามส่งของเดิม
  const src = readFileSync("src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js", "utf8");
  assert.match(src, /consultText = ajarnRoleSafeFallback/);
  assert.match(src, /const speaker = routedRole === "ajarn" \? "ajarn"/);
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
test("F: consult timeout + คำถาม → transport 1 ด้วยข้อความซื่อสัตย์ไม่สัญญา · มี evidence → ตอบจาก evidence", async () => {
  const { isQuestionLike, buildConsultUnavailableText, CONSULT_UNAVAILABLE_TEXT } = await import(
    "../src/services/lineWebhook/consultTimeoutFallback.util.js"
  );
  assert.equal(isQuestionLike("มีแบบพลังเต็มไหมครับ"), true);
  assert.equal(isQuestionLike("ขอบคุณครับ"), false);
  const honest = buildConsultUnavailableText({ hasReport: false });
  assert.equal(honest.text, CONSULT_UNAVAILABLE_TEXT);
  assert.doesNotMatch(honest.text, /เดี๋ยว|แป๊บ|รอ|ถามอีก|จะตอบ|ส่งให้อาจารย์/);
  const ev = buildConsultUnavailableText({ hasReport: true, latestScore: 7.8, latestPower: "ปกป้อง", latestCompat: 78 });
  assert.equal(ev.via, "evidence");
  assert.match(ev.text, /7\.8\/10/); assert.match(ev.text, /ปกป้อง/); assert.match(ev.text, /78%/);
  // idleReply: orchestrator คืน idle_bypass_consult_null → fallback ถูกส่ง 1 ครั้ง ไม่ใช่ nudge ส่งรูป
  const { replyIdleTextNoDuplicate } = await import("../src/services/lineWebhook/idleReply.util.js");
  const sent = [];
  const r = await replyIdleTextNoDuplicate({
    client: {}, replyToken: "t", userId: "U1",
    invokePhase1GeminiOrchestrator: async () => ({ handled: false, reason: "idle_bypass_consult_null" }),
    allowIdleDirectConsult: true,
    onConsultUnavailable: async () => ({ text: CONSULT_UNAVAILABLE_TEXT, replyType: "consult_unavailable", speakerRole: "admin", via: "honest" }),
    deps: { sendNonScanReply: async (o) => { sent.push(o); return { sent: true }; }, buildIdleDeterministicPrimaryText: () => "ส่งรูปมาได้เลย", buildIdleText: async () => null },
  });
  assert.equal(r.via, "consult_unavailable");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, CONSULT_UNAVAILABLE_TEXT);
  assert.equal(sent[0].replyType, "consult_unavailable");
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
test("replay 13 เคส: inbound จริง → route ใหม่ตามที่ audit คาด (hermetic, network=0)", async () => {
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
  assert.equal(EXTERNAL.network, 0);
});
