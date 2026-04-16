import test from "node:test";
import assert from "node:assert/strict";
import {
  STATE_SAFE_CLARIFIER_SAFE_THRESHOLD,
  composeStateSafeClarifierText,
  parseStateSafeClarifierJson,
  runStateSafeClarifier,
} from "../src/core/conversation/stateSafeClarifier/stateSafeClarifier.service.js";

test("parseStateSafeClarifierJson parses strict contract", () => {
  const parsed = parseStateSafeClarifierJson(`{
    "intent":"explain_offer_value",
    "confidence":0.9,
    "safe_to_answer":true,
    "answer_short":"แพ็กนี้ใช้สแกนเพิ่มได้ 4 ครั้ง ภายใน 24 ชั่วโมงครับ",
    "bridge_back_to":"pay_intent",
    "reason_short":"ok"
  }`);
  assert.ok(parsed);
  assert.equal(parsed.intent, "explain_offer_value");
  assert.equal(parsed.bridge_back_to, "pay_intent");
});

test("paywall side questions: brief answer + bridge back to pay", async () => {
  const facts = { priceThb: 49, scanCount: 4, windowHours: 24, one_image_rule: true };
  const cases = [
    ["49 บาทได้อะไรบ้าง", "explain_offer_value", "pay_intent", "4 ครั้ง"],
    ["ต้องโอนยังไง", "explain_next_step", "pay_intent", "คิวอาร์"],
    ["ผมมีหลายชิ้น", "explain_single_image_rule", "pay_intent", "ทีละ 1 รูป"],
    ["ดวงผมเหมาะกับเครื่องรางแบบไหน", "recommendation_question", "pay_intent", "ทีละชิ้น"],
    ["แอปใช้งานยังไง", "explain_how_scan_works", "pay_intent", "ส่งรูปวัตถุมา 1 รูป"],
    ["ยังงง", "off_topic_recoverable", "pay_intent", "49 บาท"],
  ];
  for (const [text, expectedIntent, expectedBridge, needle] of cases) {
    const out = await runStateSafeClarifier({
      userId: "U_paywall_clarifier",
      activeState: "paywall_offer_single",
      text,
      facts,
    });
    assert.equal(out.intent, expectedIntent);
    assert.equal(out.safe_to_answer, true);
    assert.ok(out.confidence >= STATE_SAFE_CLARIFIER_SAFE_THRESHOLD);
    assert.equal(out.bridge_back_to, expectedBridge);
    const finalText = composeStateSafeClarifierText(out);
    assert.ok(finalText.includes(String(needle)));
    assert.ok(finalText.includes('ตอบว่า "จ่าย"'));
  }
});

test("waiting_birthdate side questions: bridge back to provide_birthdate", async () => {
  const cases = ["ต้องทำยังไง", "ผมมีหลายชิ้น", "ส่งรูปแล้วนะ"];
  for (const text of cases) {
    const out = await runStateSafeClarifier({
      userId: "U_wait_bd_clarifier",
      activeState: "waiting_birthdate",
      text,
      facts: { expected_input: "birthdate_dd_mm_yyyy" },
    });
    assert.equal(out.safe_to_answer, true);
    assert.equal(out.bridge_back_to, "provide_birthdate");
    const finalText = composeStateSafeClarifierText(out);
    assert.ok(finalText.includes("ขอวันเกิดก่อน"));
  }
});

test("awaiting_slip side questions: bridge to slip upload or qr resend", async () => {
  const a = await runStateSafeClarifier({
    userId: "U_awaiting_slip_clarifier",
    activeState: "awaiting_slip",
    text: "ต้องทำยังไงต่อ",
    facts: { expected_input: "slip_image_or_resend_qr" },
  });
  assert.equal(a.safe_to_answer, true);
  assert.equal(a.bridge_back_to, "upload_slip");
  assert.ok(composeStateSafeClarifierText(a).includes("ส่งรูปสลิป"));

  const b = await runStateSafeClarifier({
    userId: "U_awaiting_slip_clarifier",
    activeState: "awaiting_slip",
    text: "โอนตรงไหน",
    facts: { expected_input: "slip_image_or_resend_qr" },
  });
  assert.equal(b.safe_to_answer, true);
  assert.ok(["upload_slip", "resend_qr"].includes(b.bridge_back_to));
});

test("pending_verify side questions: always bridge to wait_status", async () => {
  const cases = ["ตอนนี้ต้องทำอะไร", "ผมส่งแล้วนะ", "เรื่องอื่น"];
  for (const text of cases) {
    const out = await runStateSafeClarifier({
      userId: "U_pending_verify_clarifier",
      activeState: "pending_verify",
      text,
      facts: { expected_input: "wait_for_verification" },
    });
    assert.equal(out.safe_to_answer, true);
    assert.equal(out.bridge_back_to, "wait_status");
    assert.ok(composeStateSafeClarifierText(out).includes("รอแอดมินตรวจสลิป"));
  }
});

test("unsupported state is fail-closed", async () => {
  const out = await runStateSafeClarifier({
    userId: "U_other",
    activeState: "idle",
    text: "49 บาทได้อะไรบ้าง",
    facts: {},
  });
  assert.equal(out.safe_to_answer, false);
});
