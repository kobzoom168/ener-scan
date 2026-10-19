// Regression (Codex 19 ต.ค. 2026 + รอบ 2): เกณฑ์ตรวจ ener_chat_quality ตามนโยบาย ณ เวลาที่ตอบ "จากประวัติที่พิสูจน์ได้" + แยกถามผลเก่า/ขอสแกนใหม่ + แหล่งข้อความตามผู้สร้างจริง
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
import { isLlmReplyType, LLM_REPLY_TYPES } from "../src/services/chatQuality/botSource.util.js";
import {
  ANALYZER_SYSTEM,
  buildTranscript,
  buildStateHeader,
  buildPolicyTimeline,
  policyModeAtTime,
  resolvePolicyWindowsForDay,
} from "../src/services/chatQualityDailyReport.service.js";

const EFFECTIVE = "2026-10-18T17:00:00Z"; // 19 ต.ค. 2569 00:00 ไทย
const NOW = Date.parse("2026-10-20T03:00:00Z");
const day14 = { startIso: "2026-10-13T17:00:00Z", endIso: "2026-10-14T17:00:00Z" }; // ก่อนมีประวัติ 067
const day16 = { startIso: "2026-10-15T17:00:00Z", endIso: "2026-10-16T17:00:00Z" };
const day18 = { startIso: "2026-10-17T17:00:00Z", endIso: "2026-10-18T17:00:00Z" };
const day19 = { startIso: "2026-10-18T17:00:00Z", endIso: "2026-10-19T17:00:00Z" };
const at = (iso, role, text, meta = null) => ({ role, text, created_at: iso, ...(meta ? { metadata_json: meta } : {}) });
const statusAfter = { mode: "new_customer", stored_mode: "new_customer", schedule: null,
  last_applied: { id: 1, status: "applied", target_mode: "new_customer", applied_from_mode: "daily", effective_at: EFFECTIVE, announced_at: "2026-10-15T06:40:00Z" } };
// ประวัติจริง (รูปแบบ free_policy_audit): 15 ต.ค. 13:4x ไทย schedule_set from daily · 19 ต.ค. 00:00:18 ไทย mode_set daily→new_customer via schedule 1
const auditReal = [
  { id: 1, at: "2026-10-15T06:45:00Z", action: "schedule_set", from_mode: "daily", to_mode: "new_customer", schedule_id: 1 },
  { id: 2, at: "2026-10-18T17:00:18Z", action: "mode_set", from_mode: "daily", to_mode: "new_customer", schedule_id: 1 },
];
const tlReal = buildPolicyTimeline({ status: statusAfter, audit: auditReal, now: NOW });
const tlNoAudit = buildPolicyTimeline({ status: statusAfter, audit: [], now: NOW });
const kinds = (f) => f.map((x) => x.kind);

/* ---------- ข้อ 5: นโยบายจากประวัติที่พิสูจน์ได้ · ช่วงไม่ทราบ = unknown งดตัดสิน ---------- */
test("timeline: เปลี่ยนล่าสุดก่อน t → to · ไม่มี → observation ก่อน t · ไม่มีอีก → unknown (ไม่อนุมานย้อนหลัง) · effective_at จริงแทน at ของ worker", () => {
  assert.equal(policyModeAtTime(tlReal, "2026-10-16T00:13:02Z"), "daily", "16 ต.ค.: observation 15 ต.ค. (schedule_set from daily) + ยังไม่ถึงการเปลี่ยน");
  assert.equal(policyModeAtTime(tlReal, "2026-10-18T16:59:59Z"), "daily");
  assert.equal(policyModeAtTime(tlReal, "2026-10-18T17:00:00Z"), "new_customer", "ใช้ effective_at 17:00:00Z ไม่ใช่ at 17:00:18Z ของ worker");
  assert.equal(policyModeAtTime(tlReal, "2026-10-14T05:00:00Z"), "unknown", "ก่อนมีประวัติ = ไม่ทราบ");
  assert.equal(policyModeAtTime(tlNoAudit, "2026-10-16T00:13:02Z"), "unknown", "ไม่มี audit: ก่อนการเปลี่ยนล่าสุดพิสูจน์ไม่ได้ (ไม่เอา applied_from_mode ไปฟันธงย้อนหลัง)");
  assert.equal(policyModeAtTime(tlNoAudit, "2026-10-19T05:00:00Z"), "new_customer");
  assert.equal(policyModeAtTime(buildPolicyTimeline({}), "2026-10-19T05:00:00Z"), "unknown");
  // เปลี่ยนมือหลายรอบ: daily → new_customer (1 ก.ย.) → daily (20 ก.ย.) → none (1 ต.ค.) แล้วปัจจุบัน none
  const multi = buildPolicyTimeline({ status: { mode: "none", stored_mode: "none", schedule: null, last_applied: null }, now: NOW, audit: [
    { at: "2026-08-25T03:00:00Z", action: "schedule_set", from_mode: "daily", to_mode: "new_customer" },
    { at: "2026-09-01T00:00:00Z", action: "mode_set", from_mode: "daily", to_mode: "new_customer" },
    { at: "2026-09-20T00:00:00Z", action: "mode_set", from_mode: "new_customer", to_mode: "daily" },
    { at: "2026-10-01T00:00:00Z", action: "mode_set", from_mode: "daily", to_mode: "none" },
  ] });
  assert.deepEqual(["2026-08-20T00:00:00Z", "2026-08-28T00:00:00Z", "2026-09-10T00:00:00Z", "2026-09-25T00:00:00Z", "2026-10-05T00:00:00Z"].map((t) => policyModeAtTime(multi, t)), ["unknown", "daily", "new_customer", "daily", "none"]);
  // เคส Codex: เปลี่ยนมือเป็น new_customer แล้วตรวจวันที่เคย daily → ต้องไม่ได้ new_customer ทั้งวัน
  const wrongBefore = resolvePolicyWindowsForDay(multi, { startIso: "2026-09-22T17:00:00Z", endIso: "2026-09-23T17:00:00Z" });
  assert.deepEqual(wrongBefore.windows.map((w) => w.mode), ["daily"]);
});

test("windows ของวัน: 16 ต.ค. = daily (มี audit) / unknown (ไม่มี audit) · วันคร่อมเวลามีผล = 2 ช่วง · ก่อนประวัติ = unknown · pending ถึงเวลาแต่ยังไม่ apply นับเป็นการเปลี่ยน", () => {
  const p16 = resolvePolicyWindowsForDay(tlReal, day16);
  assert.deepEqual(p16.windows.map((w) => w.mode), ["daily"]); assert.match(p16.summary, /ฟรีรายวัน/); assert.match(p16.summary, /ห้ามใช้กติกาใหม่ตัดสินวันนี้/);
  const p16u = resolvePolicyWindowsForDay(tlNoAudit, day16);
  assert.deepEqual(p16u.windows.map((w) => w.mode), ["unknown"]); assert.match(p16u.summary, /ไม่ทราบ/); assert.match(p16u.summary, /ห้ามตัดสินเรื่องสิทธิ์ฟรีจากข้อความ/);
  const p19 = resolvePolicyWindowsForDay(tlReal, day19);
  assert.deepEqual(p19.windows.map((w) => w.mode), ["new_customer"]); assert.match(p19.summary, /ไม่มีฟรีรายวัน/); assert.match(p19.summary, /ทดลองรวม 2 ครั้ง/);
  const dayX = { startIso: "2026-10-18T12:00:00Z", endIso: "2026-10-19T12:00:00Z" };
  const px = resolvePolicyWindowsForDay(tlReal, dayX);
  assert.deepEqual(px.windows.map((w) => w.mode), ["daily", "new_customer"]); assert.equal(Date.parse(px.changedAtIso), Date.parse(EFFECTIVE)); assert.match(px.summary, /ตัดสินข้อความตามเวลาที่ตอบ/);
  assert.deepEqual(resolvePolicyWindowsForDay(tlReal, day14).windows.map((w) => w.mode), ["unknown"]);
  assert.deepEqual(resolvePolicyWindowsForDay(buildPolicyTimeline({}), day19).windows.map((w) => w.mode), ["unknown"]);
  const pend = buildPolicyTimeline({ status: { mode: "new_customer", stored_mode: "daily", last_applied: null, schedule: { id: 1, status: "pending", target_mode: "new_customer", effective_at: EFFECTIVE } }, audit: auditReal.slice(0, 1), now: NOW });
  assert.deepEqual(resolvePolicyWindowsForDay(pend, day19).windows.map((w) => w.mode), ["new_customer"]);
  assert.deepEqual(resolvePolicyWindowsForDay(pend, day18).windows.map((w) => w.mode), ["daily"]);
  // รับ status เดี่ยว (ไม่มี audit) ได้ — เท่ากับ timeline ไม่มีประวัติ
  assert.deepEqual(resolvePolicyWindowsForDay(statusAfter, day19).windows.map((w) => w.mode), ["new_customer"]);
});

/* ---------- เคส 1 (16 ต.ค. 07:12–07:13, ลูกค้าเก่ามี 15 รายงาน): ถามของที่ส่งไปแล้ว → paywall "พรุ่งนี้ยังมีฟรี" ---------- */
const case1 = [
  at("2026-10-16T00:12:10Z", "user", "ที่ส่งไปชิ้นไหนคุ้มครองดีบ้าง"),
  at("2026-10-16T00:13:02Z", "bot", "วันนี้สิทธิ์ฟรีครบแล้วครับ พรุ่งนี้ยังมีฟรีอีก 1 ครั้ง หรือเปิดสิทธิ์เพิ่ม 49 บาทดูได้ทันทีครับ",
    { speakerRole: "admin", replyType: "single_offer_paywall_unclear_full", source: "flow" }),
];

test("เคส 1: ถามผลเก่า/เปรียบเทียบ → ตอบ paywall = ตอบไม่ตรงคำถาม (จับเสมอ ไม่ขึ้นกับนโยบาย) · 16 ต.ค. daily → 'พรุ่งนี้ยังมีฟรี' ไม่ใช่ข้อมูลผิด", () => {
  assert.match("ที่ส่งไปชิ้นไหนคุ้มครองดีบ้าง", OLD_RESULT_QUESTION_RE);
  const f = detectOldResultAnsweredWithPaywall(case1);
  assert.equal(f.length, 1); assert.equal(f[0].kind, "old_result_paywall"); assert.equal(f[0].severity, "high"); assert.equal(f[0].source, "template");
  assert.match(f[0].problem, /ผลเก่าของเจ้าของดูได้เสมอ/); assert.match(f[0].problem, /ไม่เดาคะแนน ไม่เร่งขาย/);
  const pol = resolvePolicyWindowsForDay(tlReal, day16);
  assert.equal(policyModeAt("2026-10-16T00:13:02Z", pol.windows), "daily");
  assert.deepEqual(detectDailyPromiseAgainstPolicy(case1, pol.windows), []);
  assert.deepEqual(kinds(runDeterministicChecks(case1, { policyWindows: pol.windows })), ["old_result_paywall"]);
  // ไม่มีประวัติ (unknown) → งดตัดสินเรื่องสิทธิ์ แต่ตอบไม่ตรงคำถามยังจับ
  const polU = resolvePolicyWindowsForDay(tlNoAudit, day16);
  assert.deepEqual(kinds(runDeterministicChecks(case1, { policyWindows: polU.windows })), ["old_result_paywall"]);
});

test("เคสเดียวกันหลังเปลี่ยนโหมด (19 ต.ค.): 'พรุ่งนี้ยังมีฟรี' = ข้อมูลสิทธิ์ผิด high · โหมด none ก็จับ · mode unknown ไม่จับ", () => {
  const rows = case1.map((r) => ({ ...r, created_at: r.created_at.replace("2026-10-16", "2026-10-19") }));
  const pol = resolvePolicyWindowsForDay(tlReal, day19);
  const f = detectDailyPromiseAgainstPolicy(rows, pol.windows);
  assert.equal(f.length, 1); assert.equal(f[0].kind, "daily_promise_policy_mismatch"); assert.equal(f[0].severity, "high");
  assert.match(f[0].problem, /ฟรีเฉพาะบัญชีใหม่ที่เข้าเกณฑ์ทดลองรวม 2 ครั้ง/);
  assert.deepEqual(kinds(runDeterministicChecks(rows, { policyWindows: pol.windows })).sort(), ["daily_promise_policy_mismatch", "old_result_paywall"]);
  const bad = [at("2026-10-19T02:00:00Z", "bot", "รอหลังเที่ยงคืนสิทธิ์ฟรีจะรีเซ็ตให้ใหม่ครับ", { speakerRole: "admin", replyType: "free_quota_exhausted_deterministic", source: "flow" })];
  const g = detectDailyPromiseAgainstPolicy(bad, [{ fromIso: day19.startIso, toIso: day19.endIso, mode: "none" }]);
  assert.equal(g.length, 1); assert.match(g[0].problem, /ปิดสิทธิ์ฟรี/);
  assert.deepEqual(detectDailyPromiseAgainstPolicy(bad, [{ fromIso: day19.startIso, toIso: day19.endIso, mode: "unknown" }]), [], "unknown ไม่ใช่ความผิด (Codex รอบ 2)");
  assert.deepEqual(detectDailyPromiseAgainstPolicy(bad, []), []);
});

/* ---------- ข้อ 6: false positive ใหม่ของ regex ---------- */
test("hasDailyFreePromise: ปฏิเสธ/แพ็ก/ทดลอง ไม่ใช่คำสัญญา · คำสัญญาจริงยังจับ", () => {
  for (const t of ["พรุ่งนี้ไม่มีฟรีรายวันแล้วครับ", "สิทธิ์ทดลองไม่รีเซ็ตหลังเที่ยงคืนครับ", "แพ็กนี้ใช้ได้วันละ 4 ครั้งครับ",
    "ตอนนี้ไม่มีฟรีรายวันแล้วครับ บัญชีใหม่ที่เข้าเกณฑ์ทดลองฟรีได้รวม 2 ครั้ง", "ยกเลิกฟรีรายวันแล้วครับ ตอนนี้ฟรีเฉพาะบัญชีใหม่", "ตอนนี้ไม่มีฟรีวันนี้แล้วนะครับ",
    "บัญชีใหม่ทดลองฟรีได้ 2 ครั้งครับ", "ฟรีรายวันสิ้นสุดแล้วครับ"]) assert.equal(hasDailyFreePromise(t), false, t);
  for (const t of ["พรุ่งนี้มาสแกนฟรีได้อีกครับ", "วันนี้สิทธิ์ฟรีครบแล้ว รอรีเซ็ตสิทธิ์หลังเที่ยงคืนครับ", "พรุ่งนี้ยังมีฟรีอีก 1 ครั้งครับ", "สแกนฟรีได้วันละ 1 ครั้งครับ"]) assert.equal(hasDailyFreePromise(t), true, t);
  const pol = resolvePolicyWindowsForDay(tlReal, day19);
  const ok = [at("2026-10-19T02:00:00Z", "bot", "ตอนนี้ไม่มีฟรีรายวันแล้วครับ บัญชีใหม่ที่เข้าเกณฑ์ทดลองฟรีได้รวม 2 ครั้ง หลังจากนั้นเปิดสิทธิ์เพิ่มได้ครับ", { speakerRole: "consult", replyType: "gemini_front_consult", source: "llm" })];
  assert.deepEqual(detectDailyPromiseAgainstPolicy(ok, pol.windows), []);
});

test("ถามผลเก่า vs ขอสแกนใหม่/ถามราคา: 'อยากส่งรูปใหม่มาเปรียบเทียบ ต้องจ่ายเท่าไหร่' → ตอบราคา = ปกติ ไม่จับ", () => {
  const price = [
    at("2026-10-16T01:00:00Z", "user", "อยากส่งรูปใหม่มาเปรียบเทียบ ต้องจ่ายเท่าไหร่"),
    at("2026-10-16T01:00:02Z", "bot", "เปิดสิทธิ์เพิ่มได้ 49 บาทต่อครั้งครับ", { replyType: "single_offer_paywall", source: "flow" }),
  ];
  assert.deepEqual(detectOldResultAnsweredWithPaywall(price), []);
  const newScan = [at("2026-10-16T01:10:00Z", "user", "สแกนชิ้นนี้ให้หน่อยครับ"), at("2026-10-16T01:10:02Z", "bot", "วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ เปิดสิทธิ์เพิ่มได้ 49 บาทครับ", { replyType: "free_quota_exhausted_deterministic", source: "flow" })];
  assert.deepEqual(detectOldResultAnsweredWithPaywall(newScan), []);
  const good = [at("2026-10-16T01:20:00Z", "user", "ที่ส่งไปชิ้นไหนคุ้มครองดีบ้าง"), at("2026-10-16T01:20:03Z", "bot", "จากรายงานเดิม 3 ชิ้น ชิ้นที่เด่นคุ้มครองสุดคือสมเด็จวัดระฆัง 82 คะแนนครับ", { speakerRole: "ajarn", replyType: "gemini_front_consult", source: "llm" })];
  assert.deepEqual(detectOldResultAnsweredWithPaywall(good), []);
  const late = [at("2026-10-16T01:30:00Z", "user", "ผลเก่าของผมเป็นไงบ้าง"), at("2026-10-16T01:30:02Z", "bot", "ขอเวลาดูรายงานเดิมแปปครับ", { replyType: "gemini_front_consult" }), at("2026-10-16T01:35:00Z", "bot", "เปิดสิทธิ์เพิ่ม 49 บาทครับ", { replyType: "single_offer_paywall" })];
  assert.deepEqual(detectOldResultAnsweredWithPaywall(late), [], "คำตอบแรกไม่ใช่ paywall = ไม่นับ");
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
  const all = runDeterministicChecks(case2, { policyWindows: resolvePolicyWindowsForDay(tlReal, day16).windows });
  assert.deepEqual(kinds(all), ["old_result_paywall"], JSON.stringify(all));
  assert.match(all[0].quote, /ใช้สิทธิ์ฟรีครบแล้ว/);
  const tx = buildTranscript(case2, "STATE: x", classifyBotSource);
  assert.match(tx, /\[pre_scan_object_info_ack\] \[template\]: รับข้อมูลชิ้นนี้/); assert.match(tx, /\[scan_result\] \[template\]/); assert.doesNotMatch(tx, /ลูกค้า[^\n]*\[template\]/);
});

/* ---------- ข้อ 7: แหล่งข้อความตามผู้สร้างจริง ---------- */
test("classifyBotSource: paywall_question_consult (runGeminiConsult) = llm · gemini_front_help_deterministic = template · source llm/human ประทับจาก gateway · แอดมินคนจริงไม่ถูกตรวจ", () => {
  assert.equal(classifyBotSource(at("x", "bot", "y", { replyType: "paywall_question_consult", source: "flow" })), "llm", "เรียกโมเดลจริง แม้ source flow (แถวเก่า)");
  assert.equal(classifyBotSource(at("x", "bot", "y", { replyType: "gemini_front_help_deterministic", source: "flow" })), "template", "ข้อความตายตัวแม้ชื่อมี gemini");
  assert.equal(classifyBotSource(at("x", "bot", "y", { replyType: "free_quota_exhausted_deterministic" })), "template");
  for (const rt of LLM_REPLY_TYPES) assert.equal(classifyBotSource(at("x", "bot", "y", { replyType: rt, source: "flow" })), "llm", rt);
  assert.equal(classifyBotSource(at("x", "bot", "y", { replyType: "waiting_birthdate_guidance", source: "llm" })), "llm", "template ที่ถูก rephrase ด้วยโมเดล (conv surface) → gateway ประทับ llm");
  assert.equal(classifyBotSource(at("x", "bot", "y", { replyType: "admin_assist_reply", source: "human" })), "human");
  assert.equal(classifyBotSource(at("x", "bot", "y", { speakerRole: "consult", replyType: "consult_unavailable", source: "flow" })), "template", "speakerRole consult ไม่ใช่หลักฐานว่าเป็นโมเดล");
  assert.equal(classifyBotSource(at("x", "bot", "y", { replyType: "scan_result", source: "worker" })), "template");
  assert.equal(classifyBotSource(at("x", "bot", "y")), "unknown"); assert.equal(classifyBotSource(at("x", "user", "y")), null);
  assert.equal(isLlmReplyType("gemini_front_help"), true); assert.equal(isLlmReplyType("gemini_front_help_deterministic"), false);
  // แอดมินคนจริงพูดเรื่องเงินในเสียงอาจารย์ → ไม่ใช่ผลงานบอท ไม่จับ
  const human = [at("2026-10-16T02:00:00Z", "bot", "ค่าครู 49 บาทครับ โอนแล้วส่งสลิปมา", { speakerRole: "ajarn", replyType: "admin_assist_reply", source: "human" })];
  assert.deepEqual(runDeterministicChecks(human), []);
  const tx = buildTranscript([...human, at("2026-10-16T02:01:00Z", "bot", "ตอบจากโมเดล", { replyType: "paywall_question_consult", source: "llm" })], "", classifyBotSource);
  assert.match(tx, /\[admin_assist_reply\] \[human\]/); assert.match(tx, /\[paywall_question_consult\] \[llm\]/);
});

test("gateway ประทับ source ตามผู้สร้างจริง (static): textSource=llm จาก conv surface · replyType ในรายชื่อ LLM · อื่น = flow · admin assist = human", () => {
  const gw = readFileSync("src/services/nonScanReply.gateway.js", "utf8");
  assert.match(gw, /import \{ isLlmReplyType \} from "\.\/chatQuality\/botSource\.util\.js"/);
  assert.match(gw, /const source = textSource === "llm" \|\| isLlmReplyType\(rt\) \? "llm" : "flow";/);
  assert.match(gw, /textSource: usedAi \? "llm" : base\.textSource \?\? null/);
  assert.ok((gw.match(/speakerMetaFor\(rt, speakerRoleOverride, textSource\)/g) || []).length >= 2);
  assert.match(readFileSync("src/routes/lineWebhook.js", "utf8"), /replyType: "admin_assist_reply", source: "human"/);
  const bs = readFileSync("src/services/chatQuality/botSource.util.js", "utf8");
  assert.ok(!/process\.env|supabase|fetch\(/.test(bs), "pure");
});

/* ---------- เคส 3 + prompt สอดคล้อง (ข้อ 7c/7d) ---------- */
test("prompt: กฎเดียวเรื่องตัวตน (ไม่ประกาศเอง · ตอบจริงเมื่อถูกถาม = ไม่ผิด) · template ยังถูกตรวจ timing/off-question/วน · นโยบาย ณ เวลาที่ตอบ · ผลเก่า · ไม่มีกฎเก่าที่ขัด", () => {
  assert.ok(!ANALYZER_SYSTEM.includes("Customers must never know"), "กฎเก่า 'ห้ามรู้ว่าเป็น AI ทุกกรณี' ต้องถูกแทน ไม่ใช่เติมกฎใหม่ท้ายคำสั่ง");
  assert.ok(!/revealing it is AI\/บอท\/"ระบบ" \(any self-reference as a system\), OR/.test(ANALYZER_SYSTEM));
  assert.match(ANALYZER_SYSTEM, /IDENTITY \(กบ 21 ก\.ค\. \+ Codex 19 ต\.ค\. 2026 — one consistent rule\)/);
  assert.match(ANALYZER_SYSTEM, /DIRECTLY asks whether this is AI\/บอท, a brief truthful answer is acceptable and is NOT an error/);
  assert.match(ANALYZER_SYSTEM, /"คลัง" \(the customer's collection feature\)/);
  assert.match(ANALYZER_SYSTEM, /\[template\][^\n]*DO still flag a template when it is WRONG IN CONTEXT: wrong timing, off-question[^\n]*repetition\/loop/);
  assert.match(ANALYZER_SYSTEM, /\[human\] = a real human admin typed it → not bot output, never judge it/);
  assert.match(ANALYZER_SYSTEM, /policy IN EFFECT AT THE TIME OF THE REPLY/); assert.match(ANALYZER_SYSTEM, /never by today's policy/);
  assert.match(ANALYZER_SYSTEM, /If POLICY says "ไม่ทราบ" for that time, do not judge free-quota statements at all/);
  assert.match(ANALYZER_SYSTEM, /does NOT prove remaining quota/);
  assert.match(ANALYZER_SYSTEM, /ข้อมูลสิทธิ์ผิด/); assert.match(ANALYZER_SYSTEM, /บัญชีใหม่ที่เข้าเกณฑ์ทดลองรวม 2 ครั้ง/);
  assert.match(ANALYZER_SYSTEM, /NEVER a reason to block or deflect the owner's old results/); assert.match(ANALYZER_SYSTEM, /ตอบไม่ตรงคำถาม \(ผลเก่า\)/); assert.match(ANALYZER_SYSTEM, /no guessed scores, no selling/);
  assert.match(ANALYZER_SYSTEM, /"ส่งให้อาจารย์แล้ว\/ส่งต่อแล้ว" must be checked against STATE jobs/);
  // กฎเดิมคงอยู่ (flowRole 26 ส.ค. / 11 ส.ค.)
  assert.match(ANALYZER_SYSTEM, /คำว่า "ระบบ" ใน customer-visible text/); assert.match(ANALYZER_SYSTEM, /never flag admin voice as persona break/); assert.match(ANALYZER_SYSTEM, /อาจารย์พูดเรื่องเงิน/);
  const breach = ANALYZER_SYSTEM.split("\n").find((l) => l.startsWith("- หลุดบท"));
  assert.match(breach, /unprompted/); assert.match(breach, /NOT a break/);
  assert.equal((ANALYZER_SYSTEM.match(/SYSTEM PAYWALL TEXT/g) || []).length, 1);
});

test("STATE header: POLICY + USER ณ สิ้นวัน (วันเริ่มบัญชี/เกณฑ์ใหม่/job ฟรีก่อนสิ้นวัน/ชำระก่อนสิ้นวัน) ไม่มียอดแพ็ก-โบนัสปัจจุบัน · ไม่มี RPC ก็ไม่พัง", async () => {
  const chain = (data, single = null) => { const o = { select: () => o, eq: () => o, gte: () => o, lt: () => o, order: () => o, limit: async () => ({ data }), maybeSingle: async () => ({ data: single }) }; return o; };
  const seen = [];
  const fake = {
    from: (t) => { seen.push(t); return t === "app_users" ? chain(null, { created_at: "2026-03-01T03:00:00Z", paid_until: "2026-09-11T00:00:00Z", paid_remaining_scans: 0, bonus_scans: 3 })
      : t === "scan_jobs" ? chain([{ id: "j1" }, { id: "j2" }]) : chain([{ id: "p1" }]); },
    rpc: async (fn) => ({ data: fn === "new_customer_trial_status" ? { enabled: true, eligible_since: EFFECTIVE, used: 0, pending: 0 } : null }),
  };
  const pol = resolvePolicyWindowsForDay(tlReal, day19);
  const h = await buildStateHeader("Uxxxx", day19, { supabase: fake, policy: pol });
  assert.match(h, /^STATE:\nPOLICY \(ณ วันนั้น\): ไม่มีฟรีรายวัน/);
  assert.match(h, /USER \(ณ สิ้นวันนั้น\): .*ลูกค้าเก่า ไม่เข้าเกณฑ์บัญชีใหม่.*job สแกนฟรีที่สร้างก่อนสิ้นวัน 2 · การชำระสำเร็จก่อนสิ้นวัน 1/);
  assert.match(h, /ห้ามฟันธงว่า "สิทธิ์ยังไม่หมด\/หมดแล้ว"/);
  assert.doesNotMatch(h, /โบนัส|แพ็ก เหลือ|หมดอายุ/, "ไม่ใช้ยอดปัจจุบันตัดสินข้อความเก่า");
  const fakeNew = { ...fake, from: (t) => t === "app_users" ? chain(null, { created_at: "2026-10-19T01:00:00Z" }) : chain([]) };
  const h2 = await buildStateHeader("Uyyyy", day19, { supabase: fakeNew, policy: pol });
  assert.match(h2, /เข้าเกณฑ์บัญชีใหม่ตาม cutoff.*job สแกนฟรีที่สร้างก่อนสิ้นวัน 0/); assert.match(h2, /\(no scan job \/ payment today\)/);
  const fakeNoRpc = { from: () => chain([]) };
  const h3 = await buildStateHeader("Uzzzz", day19, { supabase: fakeNoRpc, policy: pol });
  assert.match(h3, /POLICY/); assert.doesNotMatch(h3, /USER/);
  assert.equal(await buildStateHeader("Uzzzz", day19, { supabase: fakeNoRpc }), "STATE: (no scan job / payment today)");
});

test("static: sweep อ่าน status (anon) + audit ผ่าน client จำกัด · timeline → policyWindows → deterministic + classify → transcript · สรุปนโยบายขึ้นหัวรายงาน · อ่านอย่างเดียว", () => {
  const src = readFileSync("src/services/chatQualityDailyReport.service.js", "utf8");
  assert.match(src, /supabase\.rpc\("free_policy_status", \{ p_line_user_id: null \}\)/);
  assert.match(src, /freePolicyDbClient\(\)\.rpc\("free_policy_audit_recent", \{ p_limit: 200 \}\)/);
  assert.match(src, /resolvePolicyWindowsForDay\(buildPolicyTimeline\(\{ status: ps, audit, now: Date\.now\(\) \}\), dayRange\)/);
  assert.match(src, /runDeterministicChecks\(convRows, \{ policyWindows: policy\.windows \}\)/);
  assert.match(src, /buildTranscript\(convRows, stateHeader, classifyBotSource\)/);
  assert.match(src, /policySummary: policy\.summary/);
  assert.doesNotMatch(src, /set_free_policy_mode|free_policy_schedule_set|set_new_customer_trial_policy|\.update\(|\.insert\(|\.delete\(/, "report service อ่านอย่างเดียว");
  const det = readFileSync("src/services/chatQualityDeterministic.util.js", "utf8");
  assert.doesNotMatch(det, /supabase|fetch\(|process\.env/, "deterministic util ไม่แตะ DB/เน็ต/env");
});
