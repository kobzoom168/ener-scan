// P2 (Codex 21 ต.ค. 2026): คำถาม "ฟรีไหม" ตอบจากนโยบาย+สิทธิ์รายคน AI=0 · 2 แง่เสมอ (ผลเก่าฟรี / สแกนใหม่ตามสิทธิ์จริง) · อ่านล้ม = ไม่เดาว่าไม่มีสิทธิ์ · router แคบ · ไม่ส่งการ์ดขาย
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchFreeQuestion, buildFreeQuestionText, handleFreeQuestion } from "../src/services/lineWebhook/freeQuestionReply.util.js";
import { resolveEntitlementState } from "../src/services/entitlementCopy.service.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("match: คำถามสิทธิ์ฟรี = true · 'ฟรี' ในบริบทอื่น/สลิป/โอน/ชวนเพื่อน/ประโยคยาว = false", () => {
  for (const t of ["ดูฟรีไหมครับ", "สแกนฟรีมั้ย", "ฟรีไหม", "ยังฟรีอยู่ไหม", "มีฟรีไหมคะ", "ลองฟรีได้ไหม", "ใช้ฟรีได้ป่ะ", "ฟรีหรือเปล่า", "วันนี้สแกนฟรีได้ยัง"]) assert.equal(matchFreeQuestion(t), true, t);
  for (const t of ["ฟรี", "โอนแล้ว ฟรีไหม", "ส่งสลิปแล้วฟรีมั้ย", "ชวนเพื่อนได้ฟรีไหม", "มีโปรโมชั่นฟรีไหม", "ของฟรีไม่มีในโลก", "ราคาเท่าไหร่", "", "ฟรีไหม " + "ก".repeat(60)]) assert.equal(matchFreeQuestion(t), false, t);
});

const base = { allowed: false, reason: "payment_required", freePolicy: "new_customer", remaining: 0, paidUntil: null, bonusScansAvailable: 0, freeScansRemaining: 0, freeScansLimit: 2, trialEligible: false };
const text = (access, now = new Date("2026-10-20T00:00:00Z")) => buildFreeQuestionText(resolveEntitlementState(access, { now }), { thaiDate: (s) => `[${String(s).slice(0, 10)}]` });

test("build: ทุกสถานะมีบรรทัด 'ผลเก่าดูฟรี' + บรรทัดสแกนใหม่ตามสิทธิ์จริง · ไม่มีราคา/การ์ด · ไม่สัญญาฟรีนอกโหมด", () => {
  const cases = [
    ["old account, new_customer policy", { ...base }, /ทดลองฟรีมีเฉพาะบัญชีใหม่ บัญชีนี้ไม่เข้าเกณฑ์/],
    ["trial left 1/2", { ...base, trialEligible: true, freeScansRemaining: 1, freeScansLimit: 2 }, /ทดลองฟรีเหลือ 1 จาก 2 ครั้ง/],
    ["trial exhausted", { ...base, trialEligible: true, freeScansRemaining: 0 }, /ทดลองฟรี 2 ครั้งใช้ครบแล้ว/],
    ["paid 3 left until", { ...base, allowed: true, reason: "paid", remaining: 3, paidUntil: "2026-10-25T10:00:00Z" }, /มีแพ็กเปิดอยู่ เหลือ 3 ครั้ง ใช้ได้ถึง \[2026-10-25\]/],
    ["paid unlimited", { ...base, allowed: true, reason: "paid", remaining: 999999, paidUntil: "2026-11-01T00:00:00Z" }, /แพ็กไม่จำกัดเปิดอยู่ ใช้ได้ถึง \[2026-11-01\]/],
    ["bonus only (policy none)", { ...base, freePolicy: "none", bonusScansAvailable: 2 }, /สิทธิ์โบนัสเหลือ 2 ครั้ง.*ไม่ต้องซื้อแพ็ก/],
    ["paid expired (policy none)", { ...base, freePolicy: "none", paidUntil: "2026-08-11T18:35:26Z" }, /แพ็กเดิมหมดอายุแล้ว \(\[2026-08-11\]\)/],
    ["none no rights", { ...base, freePolicy: "none" }, /ตอนนี้ไม่มีสิทธิ์ฟรีครับ ถ้าต้องการสแกนเพิ่มต้องใช้แพ็ก/],
    ["daily left 1 of 1", { ...base, freePolicy: "daily", freeScansRemaining: 1, freeScansLimit: 1 }, /ฟรีวันละ 1 ครั้ง วันนี้ยังเหลือ 1 ครั้ง/],
    ["daily exhausted", { ...base, freePolicy: "daily", freeScansRemaining: 0, freeScansLimit: 1 }, /ฟรีวันละ 1 ครั้ง วันนี้ใช้ครบแล้ว.*พรุ่งนี้ใช้ได้อีก/],
  ];
  for (const [name, access, re] of cases) {
    const t = text(access);
    assert.match(t, /^ผลสแกนเดิมของคุณเปิดดูได้ฟรีเสมอครับ กดเมนู ดูผลเก่า ได้เลย\n/, name + ": บรรทัดผลเก่า");
    assert.match(t, re, name); assert.match(t, /\nสแกนใหม่: /, name + ": แง่สแกนใหม่");
    assert.doesNotMatch(t, /บาท|ค่าครู|ตอบคำถามนี้ไม่ได้/, name + ": ไม่มีราคา/ไม่ปัด");
    if (access.freePolicy !== "daily") assert.doesNotMatch(t, /พรุ่งนี้|วันละ/, name + ": ห้ามสัญญาฟรีรายวันนอกโหมด daily");
  }
  // โบนัสควบกับสถานะอื่น (new_customer เก่า + โบนัส 1)
  assert.match(text({ ...base, bonusScansAvailable: 1 }), /สิทธิ์โบนัสเหลือ 1 ครั้ง/);
});

test("build: access null/อ่านล้ม = ตอบเฉพาะที่ทราบ (ผลเก่าฟรี) + บอกว่าตรวจสิทธิ์สแกนใหม่ไม่ได้ · ห้ามบอกว่าไม่มีสิทธิ์", () => {
  for (const t of [buildFreeQuestionText(null), text(null), buildFreeQuestionText({ state: "unavailable" })]) {
    assert.match(t, /ผลสแกนเดิมของคุณเปิดดูได้ฟรีเสมอ/); assert.match(t, /ตรวจให้ไม่ได้ชั่วคราว/); assert.doesNotMatch(t, /ไม่มีสิทธิ์|ต้องใช้แพ็ก|ใช้ครบแล้ว/);
  }
});

test("handle: ส่งครั้งเดียว replyType free_question_entitlement ไม่มี quickReply/การ์ด · checkScanAccess throw → ยังตอบ (ส่วนที่ทราบ) · ไม่ match = false", async () => {
  const sent = [];
  const deps = { sendNonScanReply: async (p) => { sent.push(p); return { sent: true }; }, checkScanAccess: async () => ({ ...base, trialEligible: true, freeScansRemaining: 2, freeScansLimit: 2 }), resolveEntitlementState, thaiDate: (s) => s };
  assert.equal(await handleFreeQuestion({ client: {}, userId: "U1", replyToken: "rt", text: "ดูฟรีไหมครับ", deps }), true);
  assert.equal(sent.length, 1); assert.equal(sent[0].replyType, "free_question_entitlement"); assert.equal(sent[0].quickReply, undefined); assert.match(sent[0].text, /ทดลองฟรีเหลือ 2 จาก 2/);
  const oe = console.error; console.error = () => {};
  let r; try { r = await handleFreeQuestion({ client: {}, userId: "U1", replyToken: "rt", text: "สแกนฟรีมั้ย", deps: { ...deps, checkScanAccess: async () => { throw new Error("db down"); } } }); } finally { console.error = oe; }
  assert.equal(r, true); assert.equal(sent.length, 2); assert.match(sent[1].text, /ตรวจให้ไม่ได้ชั่วคราว/); assert.doesNotMatch(sent[1].text, /ไม่มีสิทธิ์/);
  assert.equal(await handleFreeQuestion({ client: {}, userId: "U1", replyToken: "rt", text: "สวัสดี", deps }), false); assert.equal(sent.length, 2);
});

test("static: webhook เรียก router ก่อน semantic/orchestrator (หลัง info command ก่อน profile edit) · ข้าม awaiting_slip · util ไม่ import AI/DB · ไม่มี LLM call", () => {
  const wh = read("src/routes/lineWebhook.js");
  const a = wh.indexOf("fq.matchFreeQuestion(text)"); const b = wh.indexOf("handlePendingProfileEditValue(userId, text)"); const c = wh.indexOf("matchDeterministicInfoCommand(text)");
  assert.ok(c > 0 && a > c && b > a, "ลำดับ: info command → free question → profile edit → … → AI");
  assert.match(wh, /if \(getPaymentState\(userId\)\.state !== "awaiting_slip"\) \{\s*\n\s*const fq = await import\("\.\.\/services\/lineWebhook\/freeQuestionReply\.util\.js"\)/);
  const util = read("src/services/lineWebhook/freeQuestionReply.util.js");
  assert.doesNotMatch(util, /gemini|openai|llm|supabase|from\(|quickReply|flex/i, "util ต้องไม่แตะ AI/DB/การ์ด");
  assert.match(read("package.json"), /tests\/freeQuestionReply\.util\.test\.js/);
});
