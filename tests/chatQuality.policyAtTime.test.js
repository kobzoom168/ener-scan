// Regression (Codex 19 ต.ค. 2026): เกณฑ์ตรวจ ener_chat_quality ตามนโยบาย ณ เวลาที่ตอบ + แยกถามผลเก่า/ขอสแกนใหม่ + แหล่งข้อความ
// สามเคส 16 ต.ค. 2026 (uid ถูก mask) + เคสก่อน–หลังเวลามีผล 19 ต.ค. 2569 00:00 ไทย (2026-10-18T17:00Z) · hermetic ไม่แตะ DB/เน็ต
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  runDeterministicChecks,
  detectOldResultAnsweredWithPaywall,
  detectDailyPromiseAgainstPolicy,
  classifyBotSource,
  hasDailyFreePromise,
  policyModeAt,
  OLD_RESULT_QUESTION_RE,
} from "../src/services/chatQualityDeterministic.util.js";
import {
  ANALYZER_SYSTEM,
  buildTranscript,
  buildStateHeader,
  resolvePolicyWindowsForDay,
} from "../src/services/chatQualityDailyReport.service.js";

const EFFECTIVE = "2026-10-18T17:00:00Z"; // 19 ต.ค. 2569 00:00 ไทย
const day16 = { startIso: "2026-10-15T17:00:00Z", endIso: "2026-10-16T17:00:00Z" };
const day19 = { startIso: "2026-10-18T17:00:00Z", endIso: "2026-10-19T17:00:00Z" };
const day18 = { startIso: "2026-10-17T17:00:00Z", endIso: "2026-10-18T17:00:00Z" };
const at = (iso, role, text, meta = null) => ({ role, text, created_at: iso, ...(meta ? { metadata_json: meta } : {}) });
const statusAfter = { mode: "new_customer", stored_mode: "new_customer", schedule: null,
  last_applied: { id: 1, status: "applied", target_mode: "new_customer", applied_from_mode: "daily", effective_at: EFFECTIVE, announced_at: "2026-10-15T06:40:00Z" } };
const kinds = (f) => f.map((x) => x.kind);

/* ---------- เคส 1 (16 ต.ค. 07:12–07:13, ลูกค้าเก่ามี 15 รายงาน): ถามของที่ส่งไปแล้ว → paywall "พรุ่งนี้ยังมีฟรี" ---------- */
const case1 = [
  at("2026-10-16T00:12:10Z", "user", "ที่ส่งไปชิ้นไหนคุ้มครองดีบ้าง"),
  at("2026-10-16T00:13:02Z", "bot", "วันนี้สิทธิ์ฟรีครบแล้วครับ พรุ่งนี้ยังมีฟรีอีก 1 ครั้ง หรือเปิดสิทธิ์เพิ่ม 49 บาทดูได้ทันทีครับ",
    { speakerRole: "admin", replyType: "single_offer_paywall_unclear_full", source: "flow" }),
];

test("เคส 1: ถามผลเก่า/เปรียบเทียบ → ตอบ paywall = ตอบไม่ตรงคำถาม (จับเสมอ ไม่ขึ้นกับนโยบาย)", () => {
  assert.match("ที่ส่งไปชิ้นไหนคุ้มครองดีบ้าง", OLD_RESULT_QUESTION_RE);
  const f = detectOldResultAnsweredWithPaywall(case1);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "old_result_paywall");
  assert.equal(f[0].severity, "high");
  assert.equal(f[0].source, "template");
  assert.match(f[0].problem, /ผลเก่าของเจ้าของดูได้เสมอ/);
  assert.match(f[0].problem, /ไม่เดาคะแนน ไม่เร่งขาย/);
});

test("เคส 1 (ก่อนเปลี่ยนโหมด 16 ต.ค.): 'พรุ่งนี้ยังมีฟรี' ถูกต้องตามนโยบาย daily ณ เวลานั้น → ไม่จับเป็นข้อมูลสิทธิ์ผิด", () => {
  const pol = resolvePolicyWindowsForDay(statusAfter, day16);
  assert.equal(pol.windows.length, 1);
  assert.equal(pol.windows[0].mode, "daily");
  assert.match(pol.summary, /ฟรีรายวัน/);
  assert.match(pol.summary, /ห้ามใช้กติกาใหม่ตัดสินวันนี้/);
  assert.equal(policyModeAt("2026-10-16T00:13:02Z", pol.windows), "daily");
  assert.deepEqual(detectDailyPromiseAgainstPolicy(case1, pol.windows), []);
  const all = runDeterministicChecks(case1, { policyWindows: pol.windows });
  assert.deepEqual(kinds(all), ["old_result_paywall"]); // จับเฉพาะตอบไม่ตรงคำถาม
});

test("เคสเดียวกันหลังเปลี่ยนโหมด (19 ต.ค.): 'พรุ่งนี้ยังมีฟรี' = ข้อมูลสิทธิ์ผิด high", () => {
  const rows = case1.map((r) => ({ ...r, created_at: r.created_at.replace("2026-10-16", "2026-10-19") }));
  const pol = resolvePolicyWindowsForDay(statusAfter, day19);
  assert.equal(pol.windows.length, 1);
  assert.equal(pol.windows[0].mode, "new_customer");
  assert.match(pol.summary, /ไม่มีฟรีรายวัน/);
  assert.match(pol.summary, /ทดลองรวม 2 ครั้ง/);
  const f = detectDailyPromiseAgainstPolicy(rows, pol.windows);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, "daily_promise_policy_mismatch");
  assert.equal(f[0].severity, "high");
  assert.match(f[0].problem, /ฟรีเฉพาะบัญชีใหม่ที่เข้าเกณฑ์ทดลองรวม 2 ครั้ง/);
  assert.deepEqual(kinds(runDeterministicChecks(rows, { policyWindows: pol.windows })).sort(), ["daily_promise_policy_mismatch", "old_result_paywall"]);
});

test("หลังเปลี่ยนโหมด: 'บัญชีใหม่ทดลองฟรี 2 ครั้ง' ไม่ถูกจับ · โหมด none ก็จับคำสัญญารายวัน", () => {
  const pol = resolvePolicyWindowsForDay(statusAfter, day19);
  const ok = [
    at("2026-10-19T02:00:00Z", "bot", "ตอนนี้ไม่มีฟรีรายวันแล้วครับ บัญชีใหม่ที่เข้าเกณฑ์ทดลองฟรีได้รวม 2 ครั้ง หลังจากนั้นเปิดสิทธิ์เพิ่มได้ครับ", { speakerRole: "consult", replyType: "gemini_front_consult", source: "flow" }),
    at("2026-10-19T02:01:00Z", "bot", "ชิ้นนี้เด่นด้านคุ้มครองครับ", { speakerRole: "ajarn", replyType: "scan_result", source: "worker" }),
  ];
  // ประโยคแรกมีคำว่า "ฟรีรายวัน" ในบริบทปฏิเสธ ("ไม่มีฟรีรายวันแล้ว") → ไม่ใช่คำสัญญา ไม่จับ
  const f = detectDailyPromiseAgainstPolicy(ok, pol.windows);
  assert.equal(f.length, 0, JSON.stringify(f));
  assert.equal(hasDailyFreePromise("ยกเลิกฟรีรายวันแล้วครับ ตอนนี้ฟรีเฉพาะบัญชีใหม่"), false);
  assert.equal(hasDailyFreePromise("ตอนนี้ไม่มีฟรีวันนี้แล้วนะครับ"), false);
  assert.equal(hasDailyFreePromise("พรุ่งนี้มาสแกนฟรีได้อีกครับ"), true);
  assert.equal(hasDailyFreePromise("วันนี้สิทธิ์ฟรีครบแล้ว รอรีเซ็ตสิทธิ์หลังเที่ยงคืนครับ"), true);
  assert.equal(hasDailyFreePromise("บัญชีใหม่ทดลองฟรีได้ 2 ครั้งครับ"), false);
  const none = [{ ...statusAfter, mode: "none", stored_mode: "none", last_applied: { ...statusAfter.last_applied, target_mode: "none" } }][0];
  const polNone = resolvePolicyWindowsForDay(none, day19);
  const bad = [at("2026-10-19T02:00:00Z", "bot", "รอหลังเที่ยงคืนสิทธิ์ฟรีจะรีเซ็ตให้ใหม่ครับ", { speakerRole: "admin", replyType: "free_quota_exhausted_deterministic", source: "flow" })];
  const g = detectDailyPromiseAgainstPolicy(bad, polNone.windows);
  assert.equal(g.length, 1);
  assert.match(g[0].problem, /ปิดสิทธิ์ฟรี/);
});

/* ---------- เวลามีผลอยู่กลางวันตรวจ (ตัดสินตามเวลาที่ตอบ) + อ่านนโยบายไม่ได้ ---------- */
test("วันเปลี่ยนโหมดกลางช่วง: ก่อนเวลามีผล = daily ปล่อย · หลัง = จับ · อ่าน status ไม่ได้ = ไม่ตัดสิน", () => {
  const dayX = { startIso: "2026-10-18T12:00:00Z", endIso: "2026-10-19T12:00:00Z" }; // ช่วงจำลองคร่อม EFFECTIVE
  const pol = resolvePolicyWindowsForDay(statusAfter, dayX);
  assert.equal(pol.windows.length, 2);
  assert.deepEqual(pol.windows.map((w) => w.mode), ["daily", "new_customer"]);
  assert.equal(Date.parse(pol.changedAtIso), Date.parse(EFFECTIVE));
  assert.match(pol.summary, /ตัดสินข้อความตามเวลาที่ตอบ/);
  const promise = (iso) => at(iso, "bot", "วันนี้ฟรีครบแล้ว พรุ่งนี้ยังมีฟรีอีกครับ", { speakerRole: "admin", replyType: "free_quota_exhausted_deterministic", source: "flow" });
  assert.deepEqual(detectDailyPromiseAgainstPolicy([promise("2026-10-18T16:59:00Z")], pol.windows), []);
  assert.equal(detectDailyPromiseAgainstPolicy([promise("2026-10-18T17:00:00Z")], pol.windows).length, 1);
  assert.equal(detectDailyPromiseAgainstPolicy([promise("2026-10-18T17:00:00Z")], []).length, 0, "ไม่มี window = ไม่ตัดสิน");
  const nil = resolvePolicyWindowsForDay(null, dayX);
  assert.deepEqual(nil.windows, []);
  assert.match(nil.summary, /อ่านนโยบายไม่ได้/);
  // pending schedule ที่ถึงเวลาแล้วแต่ worker ยังไม่ apply → นับเป็นเหตุการณ์เปลี่ยนโหมดด้วย (effective-by-DB-time)
  const pend = { mode: "new_customer", stored_mode: "daily", last_applied: null, schedule: { id: 1, status: "pending", target_mode: "new_customer", effective_at: EFFECTIVE } };
  const pp = resolvePolicyWindowsForDay(pend, day19);
  assert.deepEqual(pp.windows.map((w) => w.mode), ["new_customer"]);
  const before = resolvePolicyWindowsForDay(pend, day18);
  assert.deepEqual(before.windows.map((w) => w.mode), ["daily"]);
});

/* ---------- เคส 2 (16 ต.ค. 07:44–07:48): template "เดี๋ยวผมส่งให้อาจารย์ดู" มี job จริง → ไม่ใช่เผย AI · "รูปก่อนหน้านี้" โดน paywall → จับ ---------- */
const case2 = [
  at("2026-10-16T00:44:10Z", "user", "พระสมเด็จวัดระฆัง"),
  at("2026-10-16T00:44:12Z", "bot", "รับข้อมูลชิ้นนี้ไว้แล้วครับ ส่งรูปมาได้เลย เดี๋ยวผมส่งให้อาจารย์ดู", { speakerRole: "admin", replyType: "pre_scan_object_info_ack", source: "flow" }),
  at("2026-10-16T00:46:40Z", "bot", "ชิ้นนี้เด่นด้านเมตตาและคุ้มครองครับ คะแนนรวม 78", { speakerRole: "ajarn", replyType: "scan_result", source: "worker" }),
  at("2026-10-16T00:48:54Z", "user", "รูปก่อนหน้านี้ล่ะครับ"),
  at("2026-10-16T00:48:56Z", "bot", "วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ เปิดสิทธิ์เพิ่มได้ 49 บาทครับ", { speakerRole: "admin", replyType: "free_quota_exhausted_deterministic", source: "flow" }),
];

test("เคส 2: 'ส่งให้อาจารย์' เป็น template + มีผลตามมา → ไม่ใช่ handoff ค้าง/ไม่ใช่เผย AI · ถามรูปก่อนหน้า → paywall = จับ", () => {
  const pol = resolvePolicyWindowsForDay(statusAfter, day16);
  const all = runDeterministicChecks(case2, { policyWindows: pol.windows });
  assert.deepEqual(kinds(all), ["old_result_paywall"], JSON.stringify(all));
  assert.match(all[0].quote, /ใช้สิทธิ์ฟรีครบแล้ว/);
  assert.equal(classifyBotSource(case2[1]), "template");
  assert.equal(classifyBotSource(case2[2]), "template");
  assert.equal(classifyBotSource(at("x", "bot", "y", { speakerRole: "consult", replyType: "gemini_front_consult", source: "flow" })), "ai");
  assert.equal(classifyBotSource(at("x", "bot", "y", { replyType: "gemini_front_reply" })), "ai");
  assert.equal(classifyBotSource(at("x", "bot", "y")), "unknown");
  assert.equal(classifyBotSource(at("x", "user", "y")), null);
  // transcript ติด tag แหล่งที่มาให้ evaluator
  const tx = buildTranscript(case2, "STATE: x", classifyBotSource);
  assert.match(tx, /\[pre_scan_object_info_ack\] \[template\]: รับข้อมูลชิ้นนี้/);
  assert.match(tx, /\[scan_result\] \[template\]/);
  assert.doesNotMatch(tx, /ลูกค้า[^\n]*\[template\]/);
});

test("ขอสแกนใหม่ (ไม่ใช่ถามผลเก่า) → paywall ปกติ ไม่จับ · ถามผลเก่าแล้วบอทตอบจากรายงานเดิม ไม่จับ · ถามผลเก่าแล้ว paywall มาช้ากว่า 3 นาที/หลังข้อความใหม่ ไม่จับ", () => {
  const newScan = [
    at("2026-10-16T01:00:00Z", "user", "สแกนชิ้นนี้ให้หน่อยครับ"),
    at("2026-10-16T01:00:02Z", "bot", "วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ เปิดสิทธิ์เพิ่มได้ 49 บาทครับ", { replyType: "free_quota_exhausted_deterministic", source: "flow" }),
  ];
  assert.deepEqual(detectOldResultAnsweredWithPaywall(newScan), []);
  const good = [
    at("2026-10-16T01:10:00Z", "user", "ที่ส่งไปชิ้นไหนคุ้มครองดีบ้าง"),
    at("2026-10-16T01:10:03Z", "bot", "จากรายงานเดิม 3 ชิ้น ชิ้นที่เด่นคุ้มครองสุดคือสมเด็จวัดระฆัง 82 คะแนนครับ", { speakerRole: "ajarn", replyType: "gemini_front_consult", source: "flow" }),
  ];
  assert.deepEqual(detectOldResultAnsweredWithPaywall(good), []);
  const late = [
    at("2026-10-16T01:20:00Z", "user", "ผลเก่าของผมเป็นไงบ้าง"),
    at("2026-10-16T01:20:02Z", "bot", "ขอเวลาดูรายงานเดิมแปปครับ", { replyType: "gemini_front_consult" }),
    at("2026-10-16T01:25:00Z", "bot", "เปิดสิทธิ์เพิ่ม 49 บาทครับ", { replyType: "single_offer_paywall" }),
  ];
  assert.deepEqual(detectOldResultAnsweredWithPaywall(late), []); // คำตอบแรกไม่ใช่ paywall
});

/* ---------- เคส 3 (15 ต.ค. 13:48 / 16 ต.ค.): "คลัง" ใน Synergy intro template = ไม่ใช่เผย AI · ตอบตรงว่าเป็น AI เมื่อถูกถาม = ไม่ใช่ error ---------- */
test("prompt: เกณฑ์นโยบาย ณ เวลาที่ตอบ / ผลเก่า / template / คลัง-ส่งให้อาจารย์ / ความซื่อตรงเรื่อง AI", () => {
  assert.match(ANALYZER_SYSTEM, /POLICY-AT-TIME RULES/);
  assert.match(ANALYZER_SYSTEM, /IN EFFECT AT THE TIME OF THE REPLY/);
  assert.match(ANALYZER_SYSTEM, /never by today's policy/);
  assert.match(ANALYZER_SYSTEM, /ข้อมูลสิทธิ์ผิด/);
  assert.match(ANALYZER_SYSTEM, /บัญชีใหม่ที่เข้าเกณฑ์ทดลองรวม 2 ครั้ง/);
  assert.match(ANALYZER_SYSTEM, /NEVER a reason to block or deflect the owner's old results/);
  assert.match(ANALYZER_SYSTEM, /ตอบไม่ตรงคำถาม \(ผลเก่า\)/);
  assert.match(ANALYZER_SYSTEM, /no guessed scores, no selling/);
  assert.match(ANALYZER_SYSTEM, /\[template\][^\n]*do NOT flag them as AI-reveal/);
  assert.match(ANALYZER_SYSTEM, /"คลัง", "ส่งให้อาจารย์", "เดี๋ยวผมส่งให้อาจารย์ดู" are in-persona/);
  assert.match(ANALYZER_SYSTEM, /checked against STATE jobs/);
  assert.match(ANALYZER_SYSTEM, /answers truthfully and briefly, that is NOT an error/);
  // เกณฑ์เดิมคงอยู่ (flowRole 26 ส.ค.)
  assert.match(ANALYZER_SYSTEM, /คำว่า "ระบบ" ใน customer-visible text/);
});

test("STATE header: มีบรรทัด POLICY + USER (ลูกค้าเก่า/ใหม่, ทดลองใช้, แพ็ก) จาก RPC ไม่เดา · ไม่มี RPC ก็ไม่พัง", async () => {
  const chain = (data, single = null) => { const o = { select: () => o, eq: () => o, gte: () => o, lt: () => o, order: () => o, limit: async () => ({ data }), maybeSingle: async () => ({ data: single }) }; return o; };
  const fake = {
    from: (t) => t === "app_users" ? chain(null, { created_at: "2026-03-01T03:00:00Z", paid_until: "2026-09-11T00:00:00Z", paid_remaining_scans: 0, bonus_scans: 0 })
      : chain(t === "scan_jobs" ? [{ id: "abcdef12-x", status: "delivered", created_at: "2026-10-16T00:44:12Z", updated_at: "2026-10-16T00:46:40Z" }] : []),
    rpc: async (fn) => ({ data: fn === "new_customer_trial_status" ? { enabled: true, eligible_since: EFFECTIVE, used: 0, pending: 0 } : null }),
  };
  const pol = resolvePolicyWindowsForDay(statusAfter, day19);
  const h = await buildStateHeader("Uxxxx", day19, { supabase: fake, policy: pol });
  assert.match(h, /^STATE:\nPOLICY \(ณ วันนั้น\): ไม่มีฟรีรายวัน/);
  assert.match(h, /USER: .*ลูกค้าเก่า ไม่เข้าเกณฑ์ทดลอง.*ทดลองใช้ไป 0\/2.*แพ็ก ไม่มี\/หมดอายุ.*โบนัส 0.*ห้ามเดา/);
  assert.match(h, /job abcdef12 delivered/);
  const fakeNew = { ...fake, from: (t) => t === "app_users" ? chain(null, { created_at: "2026-10-19T01:00:00Z", paid_until: null, paid_remaining_scans: 0, bonus_scans: 0 }) : chain([]),
    rpc: async () => ({ data: { enabled: true, eligible_since: EFFECTIVE, used: 1, pending: 0 } }) };
  const h2 = await buildStateHeader("Uyyyy", day19, { supabase: fakeNew, policy: pol });
  assert.match(h2, /ลูกค้าใหม่ที่เข้าเกณฑ์ทดลอง.*ทดลองใช้ไป 1\/2/);
  assert.match(h2, /\(no scan job \/ payment today\)/);
  const fakeNoRpc = { from: () => chain([]) }; // ไม่มี rpc → throw ภายใน → ข้าม USER
  const h3 = await buildStateHeader("Uzzzz", day19, { supabase: fakeNoRpc, policy: pol });
  assert.match(h3, /POLICY/);
  assert.doesNotMatch(h3, /USER:/);
  const h4 = await buildStateHeader("Uzzzz", day19, { supabase: fakeNoRpc });
  assert.equal(h4, "STATE: (no scan job / payment today)");
});

test("static: sweep คำนวณนโยบายครั้งเดียว/รอบ ส่ง policyWindows เข้า deterministic + classify เข้า transcript + สรุปนโยบายขึ้นหัวรายงาน · ไม่แก้นโยบาย/สิทธิ์ลูกค้า", () => {
  const src = readFileSync("src/services/chatQualityDailyReport.service.js", "utf8");
  assert.match(src, /supabase\.rpc\("free_policy_status", \{ p_line_user_id: null \}\)/);
  assert.match(src, /runDeterministicChecks\(convRows, \{ policyWindows: policy\.windows \}\)/);
  assert.match(src, /buildTranscript\(convRows, stateHeader, classifyBotSource\)/);
  assert.match(src, /policySummary: policy\.summary/);
  assert.doesNotMatch(src, /set_free_policy_mode|free_policy_schedule_set|set_new_customer_trial_policy|\.update\(|\.insert\(|\.delete\(/, "report service อ่านอย่างเดียว");
  const det = readFileSync("src/services/chatQualityDeterministic.util.js", "utf8");
  assert.doesNotMatch(det, /supabase|fetch\(|process\.env/, "deterministic util ไม่แตะ DB/เน็ต/env");
});
