/**
 * P0-A/B/C (Codex 28 ส.ค. 2026 — หลัง LINE smoke b1a0323 บน staging) — hermetic tests
 * P0-A pre-scan ack dedupe ผูก inbound messageId · P0-B forensic retry ownership ของ evidence
 * · P0-C คำถามแพ็ก/ราคา/สิทธิ์ deterministic SSOT AI=0
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
// AI=0: นับเฉพาะ fetch ไป host โมเดล (DB/PostgREST ก็ใช้ fetch — ไม่ใช่ AI)
const EXTERNAL = { network: 0, ai: 0 };
globalThis.fetch = async (url) => {
  EXTERNAL.network += 1;
  if (/openai|openrouter|generativelanguage|anthropic|deepseek|llm\./i.test(String(url))) EXTERNAL.ai += 1;
  throw new Error("HERMETIC: network blocked");
};

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function mockClient() {
  const payloads = [];
  return { payloads, replyMessage: async (_t, msg) => { payloads.push(msg); }, pushMessage: async (_u, msg) => { payloads.push(msg); } };
}

/* ---------- P0-A ---------- */
test("P0-A: ack ข้อมูลชิ้น — inbound A → 1 · inbound B เนื้อหาคนละชิ้น copy เดิมใน 3 นาที → 1 · redelivery B → 0 เพิ่ม · ไม่มี messageId = พฤติกรรมเดิม", async () => {
  const { sendNonScanReply } = await import("../src/services/nonScanReply.gateway.js");
  const { PRE_SCAN_INFO_ACK_TEXT } = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  const c = mockClient();
  const uid = `u_p0a_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const send = (mid, token) => sendNonScanReply({
    client: c, userId: uid, replyToken: token, replyType: "pre_scan_object_info_ack", semanticKey: "pre_scan_object_info_ack",
    text: PRE_SCAN_INFO_ACK_TEXT, alternateTexts: [], speakerRoleOverride: "admin", inboundMessageId: mid,
  });
  const a = await send("msgA", "tA");
  assert.equal(a.sent, true); assert.equal(a.suppressed, false);
  const b = await send("msgB", "tB");
  assert.equal(b.sent, true, "inbound B ต้องได้ ack แม้ copy เหมือน A");
  assert.equal(b.suppressed, false); assert.equal(b.retryCount, 1);
  const bAgain = await send("msgB", "tB2");
  assert.equal(bAgain.sent, false, "redelivery messageId เดิมห้ามส่งเพิ่ม");
  assert.equal(bAgain.suppressed, true); assert.equal(bAgain.exactDuplicate, true);
  assert.equal(c.payloads.length, 2);
  // caller เดิมที่ไม่ส่ง inboundMessageId: exact duplicate ยังถูกกัน (ไม่ regress)
  const legacy = await sendNonScanReply({ client: c, userId: uid, replyToken: "tL", replyType: "pre_scan_object_info_ack", semanticKey: "pre_scan_object_info_ack", text: PRE_SCAN_INFO_ACK_TEXT, alternateTexts: [] });
  assert.equal(legacy.suppressed, true);
  assert.equal(c.payloads.length, 2);
  // webhook ส่ง inboundMessageId ที่ call site ack จริง
  const wh = src("src/routes/lineWebhook.js");
  const i = wh.indexOf('replyType: ok ? "pre_scan_object_info_ack"');
  assert.ok(i > 0);
  assert.match(wh.slice(i, i + 900), /inboundMessageId: event\.message\?\.id/);
  assert.equal(EXTERNAL.ai, 0, "AI=0");
});

/* ---------- P0-B ---------- */
function fakeRedis(mem) {
  return {
    expire: async (k, ttl) => ({ ok: true, existed: mem.has(k), ttl }),
    move: async (s, d, ttl) => { const v = mem.get(s); if (v == null) return { status: "no_source", value: null }; mem.delete(s); mem.set(d, v); return { status: "moved", value: v, ttl }; },
    getdel: async (k) => { const v = mem.get(k); if (v == null) return { status: "missing", value: null }; mem.delete(k); return { status: "got", value: v }; },
  };
}

test("P0-B util: extend TTL job-scoped (ไม่คืน uid-scoped) · transfer atomic A→B ครั้งเดียว (retry ซ้ำ = no_source) · consume หลังหน้าต่างขยาย ยังอ่านได้ (redis TTL คืออายุจริง, cap 24h)", async () => {
  const u = await import("../src/services/objectInfoGate/preScanObjectInfo.util.js");
  const mem = new Map(); const r = fakeRedis(mem);
  const raw = JSON.stringify({ raw: "พระสมเด็จวัดระฆังพิมพ์ใหญ่", at: Date.now() - 20 * 60 * 1000 }); // เก่ากว่า 15 นาที
  mem.set("objinfo:pre_job:A", raw);
  const ext = await u.extendJobPreScanInfoTtl("A", 1020, { expire: r.expire });
  assert.deepEqual(ext, { ok: true, existed: true });
  assert.equal([...mem.keys()].some((k) => k.startsWith("objinfo:preprovided:")), false, "ห้ามคืนเป็น uid-scoped");
  const t1 = await u.transferJobPreScanInfo("A", "B", { move: r.move });
  assert.deepEqual(t1, { moved: true });
  assert.equal(mem.has("objinfo:pre_job:A"), false); assert.equal(mem.has("objinfo:pre_job:B"), true);
  const t2 = await u.transferJobPreScanInfo("A", "C", { move: r.move }); // retry ซ้ำ/คนละ job ห้ามได้ evidence
  assert.deepEqual(t2, { moved: false, status: "no_source" });
  assert.equal(mem.has("objinfo:pre_job:C"), false);
  const same = await u.transferJobPreScanInfo("B", "B", { move: r.move });
  assert.equal(same.status, "invalid_input");
  const got = await u.consumeJobPreScanInfo("B", { getdel: r.getdel });
  assert.equal(got?.raw, "พระสมเด็จวัดระฆังพิมพ์ใหญ่", "evidence อายุ 20 นาทีแต่ key ยังอยู่ (ขยายตาม challenge) ต้องอ่านได้");
  mem.set("objinfo:pre_job:Z", JSON.stringify({ raw: "x", at: Date.now() - 25 * 3600 * 1000 }));
  assert.equal(await u.consumeJobPreScanInfo("Z", { getdel: r.getdel }), null, "เกิน sanity cap 24 ชม. = ทิ้ง");
  assert.equal(EXTERNAL.ai, 0, "AI=0");
});

test("P0-B worker (static contract): authchal ฝัง originalJobId · issue = extend TTL ตาม AUTH_CHALLENGE_TTL_SEC · proven (PASSED+thumb และ SOFT_PASS) = transfer หลัง clear key · fail/no_thumb/expired ไม่ transfer", () => {
  const w = src("src/services/scanV2/processScanJob.service.js");
  assert.match(w, /JSON\.stringify\(\{ b: upload\.storage_bucket, p: upload\.storage_path, jobId: String\(jobId\) \}\)/);
  assert.match(w, /extendJobPreScanInfoTtl\(jobId, env\.AUTH_CHALLENGE_TTL_SEC \+ 120\)/);
  assert.match(w, /PRE_SCAN_OBJECT_INFO_CHALLENGE_HELD/);
  const transfers = w.match(/await transferChallengedPreScanInfo\(\{ chal, jobId, lineUserId \}\)/g) || [];
  assert.equal(transfers.length, 2, "ย้ายเฉพาะ 2 จุดที่ challenge proven");
  // ทั้งสองจุดต้องอยู่หลัง clearDedupeKey(authchal) และหลัง challengeProven = true
  for (const m of w.matchAll(/await transferChallengedPreScanInfo\(\{ chal, jobId, lineUserId \}\)/g)) {
    const before = w.slice(Math.max(0, m.index - 400), m.index);
    assert.match(before, /clearDedupeKey\(`scan_v2:authchal:\$\{lineUserId\}`\)/);
    assert.match(before, /challengeProven = true/);
  }
  // path fail: auth_challenge_failed / no_thumb ไม่มี transfer ใกล้ ๆ
  const failIdx = w.indexOf('"auth_challenge_failed", `inliers=');
  assert.ok(failIdx > 0);
  assert.doesNotMatch(w.slice(failIdx - 600, failIdx), /transferChallengedPreScanInfo/);
  // ownership มาจาก key จริง: ไม่มี jobId = ไม่เดา
  assert.match(w, /PRE_SCAN_OBJECT_INFO_RETRY_NO_OWNER/);
  // transfer ใช้ MOVE atomic ใน redis (Lua) ไม่ใช่ get+set
  const u = src("src/services/objectInfoGate/preScanObjectInfo.util.js");
  assert.match(u, /const move = deps\.move \|\| moveKeyAtomic;/);
  const rd = src("src/redis/scanV2Redis.js");
  assert.match(rd, /export async function expireKeyTyped/);
});

/* ---------- P0-C ---------- */
const OFFER = {
  freeQuotaPerDay: 2, paidPriceThb: 49, paidScanCount: 4, paidWindowHours: 24, defaultPackageKey: "49",
  packages: [
    { key: "29", priceThb: 29, scanCount: 1, windowHours: 24, active: true },
    { key: "49", priceThb: 49, scanCount: 4, windowHours: 24, active: true },
    { key: "399", priceThb: 399, scanCount: 999999, windowHours: 720, active: true },
  ],
};

test("P0-C classifier: ค่าครู 49 บาทได้กี่ครั้ง / แพ็กนี้ดีไหม / สิทธิ์สแกนเหลือกี่ครั้ง → typed · จ่าย 49 / คำถามพลัง / ข้อมูลชิ้น = other", async () => {
  const { classifyPackageQuestion } = await import("../src/utils/packageQuestion.util.js");
  assert.equal(classifyPackageQuestion("ค่าครู 49 บาทได้กี่ครั้ง"), "pack_price_count");
  assert.equal(classifyPackageQuestion("แพ็ก 399 ใช้ได้กี่ครั้ง"), "pack_price_count");
  assert.equal(classifyPackageQuestion("49 บาทกี่ครั้ง"), "pack_price_count");
  assert.equal(classifyPackageQuestion("แพ็คนี้ดีไหม"), "pack_worth");
  assert.equal(classifyPackageQuestion("แพ็กนี้ดีไหม"), "pack_worth");
  assert.equal(classifyPackageQuestion("โปร 49 คุ้มไหม"), "pack_worth");
  assert.equal(classifyPackageQuestion("สิทธิ์สแกนเหลือกี่ครั้ง"), "quota_remaining");
  assert.equal(classifyPackageQuestion("โควตาเหลือไหม"), "quota_remaining");
  assert.equal(classifyPackageQuestion("สแกนฟรีเหลือกี่ครั้ง"), "quota_remaining");
  assert.equal(classifyPackageQuestion("จ่าย 49"), "other");
  assert.equal(classifyPackageQuestion("พลังชิ้นนี้เด่นด้านไหน"), "other");
  assert.equal(classifyPackageQuestion("พระสมเด็จวัดประสาทบุญญาวาส ปี 2506"), "other");
  assert.equal(classifyPackageQuestion("พระองค์นี้ราคาเท่าไหร่"), "other", "ราคาพระ ≠ ราคาแพ็ก");
  assert.equal(classifyPackageQuestion("สายเสน่ห์ควรหาพระแบบไหน"), "other");
});

test("P0-C replies (copy ตาม Codex): ราคา/ครั้งตรง offer ไม่แถมชวนจ่าย · แพ็กนี้ดีไหม ใช้ selected package ก่อน ไม่มีค่อยสรุป · ไม่มี QR/ลิงก์/แจ้งกลับ · สิทธิ์อ่านจาก access จริง", async () => {
  const u = await import("../src/utils/packageQuestion.util.js");
  const a = u.buildPackagePriceCountReply({ offer: OFFER, text: "ค่าครู 49 บาทได้กี่ครั้ง" });
  assert.equal(a, "49 บาท ใช้ได้ 4 ครั้ง ภายใน 24 ชั่วโมงครับ");
  const b = u.buildPackagePriceCountReply({ offer: OFFER, text: "แพ็ก 399 ได้กี่ครั้ง" });
  assert.equal(b, "399 บาท สแกนไม่จำกัด 30 วัน (รายเดือน)ครับ");
  const c = u.buildPackagePriceCountReply({ offer: OFFER, text: "ค่าครู 149 บาทได้กี่ครั้ง" });
  assert.match(c, /ไม่มีแพ็ก 149 บาท/); assert.match(c, /1\) 29 บาท/);
  const w = u.buildPackageWorthReply({ offer: OFFER, text: "แพ็กนี้ดีไหม" });
  assert.match(w, /29 บาท/); assert.match(w, /49 บาท/); assert.match(w, /399 บาท/);
  const wSel = u.buildPackageWorthReply({ offer: OFFER, text: "แพ็กนี้ดีไหม", selectedPackageKey: "49" });
  assert.match(wSel, /^49 บาท ใช้ได้ 4 ครั้ง ภายใน 24 ชั่วโมง ตกครั้งละประมาณ 12 บาท/);
  assert.doesNotMatch(wSel, /29 บาท|399 บาท/, "มี selected package = ตอบแพ็กนั้นเท่านั้น");
  for (const t of [a, b, c, w, wSel]) {
    assert.doesNotMatch(t, /พิมพ์ จ่าย|จ่าย \d|แจ้งกลับ|เช็กสถานะให้ก่อน|http|QR|คิวอาร์|ระบบ/, `ห้ามชวนจ่าย/สัญญา/QR: ${t}`);
  }
  const now = new Date("2026-08-28T04:00:00Z");
  const q1 = u.buildQuotaRemainingReply({ access: { paidUntil: "2026-09-10T00:00:00Z", paidRemainingScans: 3 }, freeRemainingToday: 1, freeQuotaPerDay: 2, now });
  assert.match(q1, /สิทธิ์แพ็กเหลือ 3 ครั้ง ใช้ได้ถึง 10 ก\.ย\./); assert.match(q1, /สแกนฟรีวันนี้เหลือ 1 จาก 2 ครั้ง/);
  const q2 = u.buildQuotaRemainingReply({ access: { paidUntil: null, paidRemainingScans: 0 }, freeRemainingToday: 0, freeQuotaPerDay: 2, nextResetLabel: "รีเซ็ตเที่ยงคืน", now });
  assert.match(q2, /ไม่มีสิทธิ์แพ็กเปิดอยู่/); assert.match(q2, /ใช้ครบ 2 ครั้งแล้ว รีเซ็ตเที่ยงคืน/);
  const q3 = u.buildQuotaRemainingReply({ access: { paidUntil: "2026-09-10T00:00:00Z", paidRemainingScans: 999999 }, freeRemainingToday: null, freeQuotaPerDay: null, now });
  assert.match(q3, /สแกนไม่จำกัด/); assert.doesNotMatch(q3, /สแกนฟรี/, "ไม่รู้ฟรี = ไม่พูดตัวเลขฟรี (ห้าม hardcode)");
  const q4 = u.buildQuotaRemainingReply({ access: { paidUntil: "2026-08-01T00:00:00Z", paidRemainingScans: 5 }, freeRemainingToday: 2, freeQuotaPerDay: 2, now });
  assert.match(q4, /ไม่มีสิทธิ์แพ็กเปิดอยู่/, "แพ็กหมดอายุ = ไม่ active แม้ remaining>0");
  assert.equal(EXTERNAL.ai, 0, "AI=0");
});

test("P0-C evidence: 3 คำถาม → resolver ตอบจาก SSOT/checkScanAccess, AI=0, transport=1 ต่อคำถาม (gateway จริง+mock client) · 'จ่าย 49' = isPaymentCommand จริง → null (QR route เดิม) · คำถามราคาไม่ใช่ payment command · access ล้ม → 'ตรวจไม่ได้' ไม่สัญญา", async () => {
  const u = await import("../src/utils/packageQuestion.util.js");
  const { isPaymentCommand, isPromoInquiryText } = await import("../src/utils/webhookText.util.js");
  const { sendNonScanReply } = await import("../src/services/nonScanReply.gateway.js");
  const access = { allowed: true, reason: "free", usedScans: 0, freeScansLimit: 2, freeScansRemaining: 2, paidUntil: null, paidRemainingScans: 0 };
  let accessCalls = 0;
  const deps = (text) => ({ text, lowerText: text.toLowerCase(), userId: "Uevidence", offer: OFFER, selectedPackageKey: null, isPaymentCommand, checkScanAccess: async () => { accessCalls += 1; return access; } });
  const expect = {
    "ค่าครู 49 บาทได้กี่ครั้ง": { kind: "pack_price_count", re: /^49 บาท ใช้ได้ 4 ครั้ง ภายใน 24 ชั่วโมงครับ$/ },
    "แพ็กนี้ดีไหม": { kind: "pack_worth", re: /29 บาท[\s\S]*49 บาท[\s\S]*399 บาท/ },
    "สิทธิ์สแกนเหลือกี่ครั้ง": { kind: "quota_remaining", re: /ไม่มีสิทธิ์แพ็กเปิดอยู่ครับ สแกนฟรีวันนี้เหลือ 2 จาก 2 ครั้ง/ },
  };
  const c = mockClient();
  let n = 0;
  for (const [q, exp] of Object.entries(expect)) {
    assert.equal(isPaymentCommand(q, q.toLowerCase()), false, `${q} ต้องไม่ใช่คำสั่งจ่าย`);
    const r = await u.resolvePackageQuestionReply(deps(q));
    assert.ok(r, q); assert.equal(r.kind, exp.kind); assert.match(r.text, exp.re);
    const before = c.payloads.length;
    const sent = await sendNonScanReply({ client: c, userId: `u_ev_${n++}`, replyToken: `t${n}`, replyType: `package_question_${r.kind}`, semanticKey: `package_question_${r.kind}`, text: r.text, alternateTexts: [], speakerRoleOverride: "admin", inboundMessageId: `m${n}` });
    assert.equal(sent.sent, true); assert.equal(c.payloads.length - before, 1, "transport=1");
    assert.equal(c.payloads[c.payloads.length - 1].text, r.text);
  }
  assert.equal(accessCalls, 1, "สิทธิ์อ่าน authoritative 1 ครั้ง (เฉพาะคำถามสิทธิ์)");
  assert.equal(EXTERNAL.ai, 0, "AI=0");
  // "จ่าย 49" = payment command จริง → resolver ไม่แตะ (payment route เดิม → QR)
  assert.equal(isPaymentCommand("จ่าย 49", "จ่าย 49"), true);
  assert.equal(await u.resolvePackageQuestionReply(deps("จ่าย 49")), null);
  assert.equal(await u.resolvePackageQuestionReply(deps("จ่ายเงิน")), null);
  // "มีโปรอะไรบ้าง" = promo inquiry เดิม (เมนูแพ็ก) — ไม่ถูก router นี้แย่ง
  assert.equal(isPromoInquiryText("มีโปรอะไรบ้าง"), true);
  assert.equal(await u.resolvePackageQuestionReply(deps("มีโปรอะไรบ้าง")), null);
  // access ล้ม → บอกตรง ไม่สัญญา
  const fail = await u.resolvePackageQuestionReply({ ...deps("สิทธิ์สแกนเหลือกี่ครั้ง"), checkScanAccess: async () => { throw new Error("db down"); } });
  assert.equal(fail.accessReadFailed, true); assert.equal(fail.text, u.QUOTA_READ_FAILED_TEXT);
  assert.doesNotMatch(fail.text, /แจ้งกลับ|เดี๋ยว/);
});

test("P0-C webhook (static contract): router อยู่หลังจับข้อมูลชิ้น ก่อน 'เข้าใจแล้ว' และก่อน orchestrator ทุกตัว · ใช้ resolver เดียวกับ test · ส่ง isPaymentCommand+checkScanAccess จริง · admin · AI=0 · orchestrator ไม่มี 'แจ้งกลับ'", () => {
  const wh = src("src/routes/lineWebhook.js");
  const iCapture = wh.indexOf('event: "PRE_SCAN_OBJECT_INFO_CAPTURED"');
  const iRouter = wh.indexOf("await maybeHandlePackageQuestion({ client, event, userId, text, lowerText })");
  const iHowto = wh.indexOf('ปุ่ม "เข้าใจแล้ว" จากการ์ดกติกาตอน add เพื่อน');
  const iHandleText = wh.indexOf("async function handleTextMessage(");
  assert.ok(iCapture > 0 && iRouter > 0 && iHowto > 0 && iHandleText > 0);
  assert.ok(iCapture < iRouter && iRouter < iHowto, "ลำดับ: capture → router → เข้าใจแล้ว");
  const firstOrchInText = wh.indexOf("invokePhase1GeminiOrchestrator()", iHandleText);
  assert.ok(firstOrchInText < 0 || iRouter < firstOrchInText, "router ต้องมาก่อน orchestrator ใน handleTextMessage");
  const fn = wh.slice(wh.indexOf("async function maybeHandlePackageQuestion("), iHandleText);
  assert.match(fn, /resolvePackageQuestionReply\(\{/);
  assert.match(fn, /\n\s*isPaymentCommand,/); assert.match(fn, /\n\s*checkScanAccess,/);
  assert.match(fn, /selectedPackageKey: getSelectedPaymentPackageKey\(userId\)/);
  assert.match(fn, /speakerRoleOverride: "admin"/); assert.match(fn, /aiCallCount: 0/);
  assert.doesNotMatch(fn, /runGeminiFrontOrchestrator|runGeminiConsult|sendQrBundle|handlePaymentCommandTextRoute|แจ้งกลับ/);
  const orch = src("src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js");
  const fb = orch.slice(orch.indexOf("function safeTextForBlockedClaim"), orch.indexOf("function safeTextForBlockedClaim") + 900);
  assert.doesNotMatch(fb.replace(/\/\/.*$/gm, ""), /แจ้งกลับ|เช็กสถานะให้ก่อน/, "fallback สิทธิ์ห้ามสัญญางานอนาคต");
});
