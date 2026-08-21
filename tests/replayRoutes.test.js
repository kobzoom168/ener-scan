/**
 * Production route replay (Codex B4 ชุด B): ระบบ "ปัจจุบัน" ต้องสร้างข้อความใหม่ที่ถูกต้อง
 * และส่งถึงลูกค้าจริง (transport=1) — ไม่ใช่แค่บล็อกข้อความเก่า
 *
 * - ใช้แถวจาก fixture ที่มี metadata พอ (replyType ที่มี route registry)
 * - ยิงผ่าน service/builder จริงของ replyType นั้น + customer gateway ด้วย fake LINE client
 * - LLM route: fake model คืน "ข้อความเก่า" (ผิด contract) → regenerate/fallback → ลูกค้ายังได้ข้อความ 1 ครั้ง
 * - assert: outbound count, contract ปัจจุบัน, replyType, speakerRole, route, AI calls, evidence IDs, ข้อความใหม่ ≠ เก่า
 * - แถวที่ route ยังไม่ replay ได้ = unreplayable (ห้ามนับ fixed)
 * - สรุป legacyBlocked / routeFixed / stillFailing / unreplayable สร้างจาก runner เทียบ expected.json
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/* ---------- hermetic: env + external-call traps ก่อน dynamic import ใด ๆ ---------- */
const HERMETIC_ENV = {
  OPENAI_API_KEY: "sk-hermetic", LOCAL_POSTGREST_URL: "http://hermetic.invalid", LOCAL_POSTGREST_ANON_KEY: "x",
  LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_URL: "http://hermetic.invalid", SUPABASE_SERVICE_ROLE_KEY: "x",
  CHANNEL_ACCESS_TOKEN: "hermetic", CHANNEL_SECRET: "hermetic", GEMINI_API_KEY: "hermetic",
  SMART_REJECTION_ENABLED: "false", CONV_AI_ENABLED: "false", GEMINI_CONSULT_ENABLED: "true",
  SCAN_OFFER_DB_OVERRIDE: "off", CONVERSATION_HISTORY_SINK: "memory", LINE_LOADING_ANIMATION: "off", REDIS_URL: "", APP_BASE_URL: "https://hermetic.invalid",
};
for (const [k, v] of Object.entries(HERMETIC_ENV)) process.env[k] = v;
try {
  for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && !process.env[m[1]]) process.env[m[1]] = "test-placeholder";
  }
} catch { /* .env.example ไม่มี = ใช้แค่ HERMETIC_ENV */ }

export const EXTERNAL = { network: 0, samples: [] };
globalThis.fetch = async (input) => {
  EXTERNAL.network += 1;
  EXTERNAL.samples.push(String(typeof input === "string" ? input : input?.url || input).slice(0, 80));
  throw new Error("HERMETIC: network blocked");
};
for (const modName of ["node:http", "node:https"]) {
  const mod = await import(modName);
  for (const fn of ["request", "get"]) {
    const orig = mod[fn];
    try { mod[fn] = (...a) => { EXTERNAL.network += 1; EXTERNAL.samples.push(`${modName}.${fn}`); return orig(...a); }; } catch { /* read-only namespace */ }
  }
}

const DIR = path.resolve(import.meta.dirname, "fixtures/replay");
const UID = "U" + "0".repeat(32);

function fakeClient() {
  const calls = { reply: 0, push: 0, messages: [] };
  const rec = (m) => { const arr = Array.isArray(m) ? m : [m]; calls.messages.push(...arr); };
  return {
    calls,
    replyMessage: async (_t, m) => { calls.reply += 1; rec(m); },
    pushMessage: async (_u, m) => { calls.push += 1; rec(m); },
  };
}
const textsOf = (c) => {
  const out = [];
  const walk = (n) => { if (!n || typeof n !== "object") return; if (typeof n.text === "string") out.push(n.text); if (typeof n.altText === "string") out.push(n.altText); for (const v of Object.values(n)) if (v && typeof v === "object") walk(v); };
  c.calls.messages.forEach(walk);
  return out;
};

/** ตรวจข้อความใหม่ด้วย contract ปัจจุบัน (hard tone ตาม kind ของ route) */
async function assertCurrentContract(texts, kind, id) {
  const { checkHardTone } = await import("../src/core/conversation/hardTone.util.js");
  for (const t of texts) {
    const r = checkHardTone(t, { kind });
    assert.ok(r.ok, `${id} ข้อความใหม่ผิด contract: ${r.violations.join(",")} ← ${t.slice(0, 60)}`);
  }
}

const REPORT_EV = { reportId: "tok-1", score: 7.2, compatPercent: 68, energyTags: ["เมตตา", "มหานิยม"] };

/**
 * route registry: replyType → replay(row) → { transport, texts, aiCalls, speakerRole, route, evidenceIds, kind }
 * ทุกตัวยิง builder/service จริง + customer gateway จริง ด้วย fake client
 */
const ROUTES = {
  async pre_scan_ack() {
    const { pickPreScanAckText } = await import("../src/services/scanV2/webhookImageIngestion.service.js");
    const { deliverOutboundMessage } = await import("../src/services/scanV2/deliverOutbound.service.js");
    const c = fakeClient();
    const text = pickPreScanAckText("mid-1");
    // ผ่าน deliverOutboundMessage จริง (kind=pre_scan_ack) — markSent/DB ล้มหลังส่ง ไม่กระทบ transport ที่นับ
    const res = await deliverOutboundMessage(c, { id: "ob-1", line_user_id: UID, kind: "pre_scan_ack", payload_json: { text } },
        { banGateDeps: { isBanned: async () => false, updateOutboundMessage: async () => {}, markSent: async () => {} } });
    return { transport: c.calls.push + c.calls.reply, texts: textsOf(c), aiCalls: 0, speakerRole: "admin", route: "worker", evidenceIds: [], kind: "reply", sentFlag: res?.sent === true && c.calls.push === 1 };
  },
  async object_info_gate_ask() {
    const { buildObjectInfoAskMessage } = await import("../src/services/objectInfoGate/objectInfoGate.service.js");
    const gw = await import("../src/services/lineOutbound/customerPush.gateway.js");
    const c = fakeClient();
    const { flexAsk } = buildObjectInfoAskMessage({ lane: "amulet", isPaid: false, formToken: "t0ken" });
    const r = await gw.pushToCustomer(c, UID, flexAsk, { source: "object_info_gate_ask", isBanned: async () => false });
    return { transport: c.calls.push, texts: textsOf(c), aiCalls: 0, speakerRole: "admin", route: "worker", evidenceIds: [], kind: "step", sentFlag: r.sent };
  },
  async gemini_front_consult(row) {
    const { runGeminiConsult } = await import("../src/core/conversation/geminiFront/geminiConsult.service.js");
    const { classifyUserIntent } = await import("../src/core/conversation/geminiFront/intentContract.util.js");
    const gw = await import("../src/services/lineOutbound/customerPush.gateway.js");
    let calls = 0;
    const turnBudget = { attempted: 0, max: 2 };
    const text = await runGeminiConsult(
      { userId: UID, userText: row.inbound, conversationHistory: [], intentContract: classifyUserIntent(row.inbound, row.state === "paywall" ? "paywall_selecting_package" : null), turnBudget },
      {
        generate: async () => { calls += 1; return row.outbound; }, // โมเดล "ยังตอบแบบเก่า" ทุกครั้ง
        scanHistory: async () => ({ promptText: "1) คะแนนพลัง: 7.2/10", items: [REPORT_EV] }),
        isPaidActive: async () => false, customerFacts: async () => null, kbContext: async () => null, axisTop: async () => null, rankingAllowed: async () => false,
      },
    );
    const c = fakeClient();
    let r = { sent: false };
    if (text) r = await gw.pushToCustomer(c, UID, [{ type: "text", text }], { source: "gemini_front_consult", toneKind: "reply", isBanned: async () => false });
    return { transport: c.calls.push, texts: textsOf(c), aiCalls: calls, speakerRole: "consult", route: "flow", evidenceIds: [REPORT_EV.reportId], kind: "reply", sentFlag: r.sent, budget: turnBudget };
  },
  async payment_qr_instructions_bundle() {
    const { sendNonScanPaymentQrInstructions } = await import("../src/services/nonScanReply.gateway.js");
    const { buildPaymentQrIntroText, buildPaymentQrSlipText } = await import("../src/utils/webhookText.util.js");
    const { loadActiveScanOffer } = await import("../src/services/scanOffer.loader.js");
    const { getDefaultPackage } = await import("../src/services/scanOffer.packages.js");
    const c = fakeClient();
    const offer = loadActiveScanOffer();
    const pkg = getDefaultPackage(offer);
    await sendNonScanPaymentQrInstructions({
      client: c, userId: UID, replyToken: "tok",
      introText: buildPaymentQrIntroText({ paymentRef: "EN-TEST", paidPackage: pkg, lineUserId: UID }),
      qrImageUrl: "https://example.com/qr.png", slipText: buildPaymentQrSlipText(),
    });
    // bundle = reply เดียว (multipart ใน call เดียว)
    return { transport: c.calls.reply + c.calls.push, texts: textsOf(c), aiCalls: 0, speakerRole: "admin", route: "flow", evidenceIds: [], kind: "bundle", sentFlag: c.calls.reply + c.calls.push >= 1 };
  },
  async free_quota_exhausted_deterministic() {
    const { sendFreeQuotaExhaustedPaywallViaGateway } = await import("../src/services/lineWebhook/freeQuotaPaywallReply.service.js");
    const c = fakeClient();
    const r = await sendFreeQuotaExhaustedPaywallViaGateway({ client: c, userId: UID, replyToken: "tok", accessDecision: { reason: "free_quota_exhausted", usedScans: 1 } });
    return { transport: c.calls.reply + c.calls.push, texts: textsOf(c), aiCalls: 0, speakerRole: "admin", route: "flow", evidenceIds: [], kind: "bundle", sentFlag: r?.sent !== false };
  },
  async multiple_objects(row) {
    const { sendObjectGateRoutedNonScanReply } = await import("../src/services/lineWebhook/objectGateReplySend.service.js");
    const c = fakeClient();
    const r = await sendObjectGateRoutedNonScanReply({ client: c, userId: UID + "m", replyToken: "tok", lastUserText: row.inbound,
      routing: { kind: "multiple_objects", replyType: "multiple_objects", semanticKey: "multiple_objects", reason: "replay" }, gated: null });
    return { transport: c.calls.reply + c.calls.push, texts: textsOf(c), aiCalls: 0, speakerRole: "admin", route: "flow", evidenceIds: [], kind: "step", sentFlag: r?.sent !== false };
  },
  async image_retake_required(row) {
    const { sendObjectGateRoutedNonScanReply } = await import("../src/services/lineWebhook/objectGateReplySend.service.js");
    const c = fakeClient();
    const r = await sendObjectGateRoutedNonScanReply({ client: c, userId: UID + "r", replyToken: "tok", lastUserText: row.inbound,
      routing: { kind: "image_retake_required", replyType: "image_retake_required", semanticKey: "image_retake_required", reason: "replay" }, gated: null });
    return { transport: c.calls.reply + c.calls.push, texts: textsOf(c), aiCalls: 0, speakerRole: "admin", route: "flow", evidenceIds: [], kind: "step", sentFlag: r?.sent !== false };
  },
  async scan_energy_helper() {
    const { handleDeterministicInfoCommand } = await import("../src/services/lineWebhook/deterministicInfoCommand.util.js");
    const c = fakeClient();
    const { sendNonScanReply } = await import("../src/services/nonScanReply.gateway.js");
    await handleDeterministicInfoCommand({ kind: "scan_energy", client: c, userId: UID, replyToken: "tok", deps: { getSavedBirthdate: async () => "1985-08-19", sendNonScanReply } });
    return { transport: c.calls.reply + c.calls.push, texts: textsOf(c), aiCalls: 0, speakerRole: "admin", route: "flow", evidenceIds: [], kind: "step", sentFlag: c.calls.reply + c.calls.push > 0 };
  },
};

const expectedFiles = readdirSync(DIR).filter((f) => f.endsWith(".expected.json"));

for (const ef of expectedFiles) {
  const exp = JSON.parse(readFileSync(path.join(DIR, ef), "utf8"));
  const rows = readFileSync(path.join(DIR, exp.fixture), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

  test(`route replay ${exp.fixture}: ระบบปัจจุบันตอบลูกค้าได้ถูกต้อง (ไม่ใช่แค่บล็อกของเก่า)`, async () => {
    const tally = { routeFixed: 0, stillFailing: 0, unreplayable: 0 };
    const routesUsed = new Set();
    const failures = [];
    const byRoute = {};
    for (const row of rows) {
      const replay = ROUTES[row.replyType];
      if (!replay) { tally.unreplayable++; byRoute[row.replyType] = (byRoute[row.replyType] || 0) + 1; continue; }
      try {
        const r = await replay(row);
        assert.equal(r.transport, 1, `${row.id} ${row.replyType} transport=${r.transport} (ต้องส่งข้อความใหม่ 1 ครั้ง)`);
        assert.ok(r.sentFlag, `${row.id} sent flag false`);
        assert.ok(r.texts.length >= 1, `${row.id} ไม่มีข้อความ`);
        for (const t of r.texts) assert.notEqual(t.trim(), row.outbound.trim(), `${row.id} ข้อความใหม่เท่าของเก่า`);
        await assertCurrentContract(r.texts, r.kind, row.id);
        assert.equal(r.speakerRole, row.speakerRole, `${row.id} speakerRole`);
        assert.equal(r.route, row.source, `${row.id} route`);
        if (row.expected.aiCalls === 0) assert.equal(r.aiCalls, 0, `${row.id} deterministic route เรียก AI`);
        else assert.ok(r.aiCalls >= 1 && r.aiCalls <= exp.maxAiCallsPerTurn, `${row.id} aiCalls=${r.aiCalls}`);
        if (row.expected.evidence === "report_id") assert.ok(r.evidenceIds.length >= 1, `${row.id} ไม่มี evidence id`);
        tally.routeFixed++;
        routesUsed.add(row.replyType);
      } catch (e) {
        tally.stillFailing++;
        failures.push(String(e.message).slice(0, 160));
      }
    }
    // P1 honesty: routeFixed = จำนวน historical rows ที่ครอบ ไม่ใช่จำนวน flow ที่ต่างกัน
    assert.equal(routesUsed.size, exp.uniqueReplayRoutes, `uniqueReplayRoutes ${routesUsed.size} ≠ expected ${exp.uniqueReplayRoutes}`);
    assert.equal(tally.routeFixed, exp.coveredRows, "coveredRows");
    assert.deepEqual(
      tally,
      { routeFixed: exp.routeFixed, stillFailing: exp.routeStillFailing, unreplayable: exp.unreplayable },
      `สรุป route replay ≠ expected · unreplayable by route: ${JSON.stringify(byRoute)}\n${failures.slice(0, 8).join("\n")}`,
    );
  });
}

test("hermetic: externalNetworkCalls=0 → realModelCalls=0 และ realDbReads/Writes=0 (OpenAI/Gemini/PostgREST/LINE ล้วนผ่าน fetch ที่ถูก trap)", () => {
  assert.equal(EXTERNAL.network, 0, `external calls: ${JSON.stringify(EXTERNAL.samples.slice(0, 10))}`);
  console.log(JSON.stringify({ event: "REPLAY_HERMETIC", externalNetworkCalls: EXTERNAL.network, realModelCalls: 0, realDbCalls: 0 }));
});

test("route replay: consult ที่มี valid report evidence ตอบค่าจริงได้ · invalid claim ได้ fallback และส่งจริง", async () => {
  const { runGeminiConsult } = await import("../src/core/conversation/geminiFront/geminiConsult.service.js");
  const { classifyUserIntent } = await import("../src/core/conversation/geminiFront/intentContract.util.js");
  const deps = (reply) => ({ generate: async () => reply, scanHistory: async () => ({ promptText: "x", items: [REPORT_EV] }), isPaidActive: async () => false,
    customerFacts: async () => null, kbContext: async () => null, axisTop: async () => null, rankingAllowed: async () => false });
  const ask = classifyUserIntent("พลังองค์นี้เป็นไง", null);
  const ok = await runGeminiConsult({ userId: UID, userText: "พลังองค์นี้เป็นไง", intentContract: ask }, deps("คะแนน 7.2"));
  assert.equal(ok, "คะแนน 7.2");
  const bad = await runGeminiConsult({ userId: UID, userText: "พลังองค์นี้เป็นไง", intentContract: ask }, deps("คะแนน 9.9 เด่นด้านโชคลาภ"));
  assert.equal(bad, "ยังไม่มีข้อมูลยืนยัน จึงระบุไม่ได้");
  // payment question ใน paywall ไม่ตก energy guard
  const pay = await runGeminiConsult({ userId: UID, userText: "แพ็กนี้ดีไหม", intentContract: classifyUserIntent("แพ็กนี้ดีไหม", "paywall_selecting_package") }, deps("ใช่"));
  assert.equal(pay, "ใช่");
});
