import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSemanticCatcher } from "../src/core/conversation/semanticCatcher/semanticCatcher.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("existing paywall intents still win (generic_ack/pay_intent/wait_tomorrow)", async () => {
  const genericAck = await runSemanticCatcher({
    userId: "U_bridge_ack",
    activeState: "paywall_offer_single",
    text: "โอเคครับ",
    runModel: async () => "{}",
  });
  assert.equal(genericAck.intent, "generic_ack");
  assert.equal(genericAck.safe_to_consume, true);

  const payIntent = await runSemanticCatcher({
    userId: "U_bridge_pay",
    activeState: "paywall_offer_single",
    text: "จ่าย",
    runModel: async () => "{}",
  });
  assert.equal(payIntent.intent, "pay_intent");
  assert.equal(payIntent.safe_to_consume, true);

  const waitTomorrow = await runSemanticCatcher({
    userId: "U_bridge_wait",
    activeState: "paywall_offer_single",
    text: "พรุ่งนี้ค่อยมา",
    runModel: async () => "{}",
  });
  assert.equal(waitTomorrow.intent, "wait_tomorrow");
  assert.equal(waitTomorrow.safe_to_consume, true);
});

test("lineWebhook inserts clarifier before same-state fallback", () => {
  const src = readFileSync(join(__dirname, "../src/routes/lineWebhook.js"), "utf8");
  assert.ok(src.includes("runStateSafeClarifierWithTelemetry"));
  assert.ok(src.includes('activeState: "paywall_offer_single"'));
  assert.ok(src.includes('replyType: "paywall_side_question_bridge_back"'));
  assert.ok(src.includes('replyType: "waiting_birthdate_side_question_bridge_back"'));
  assert.ok(src.includes('replyType: "awaiting_slip_side_question_bridge_back"'));
  assert.ok(src.includes('replyType: "pending_verify_side_question_bridge_back"'));
  assert.ok(src.includes("STATE_SAFE_CLARIFIER_REQUESTED"));
  assert.ok(src.includes("STATE_SAFE_CLARIFIER_PARSED"));
});

test("paywall deterministic copy refresh stays short and human", () => {
  const src = readFileSync(join(__dirname, "../src/utils/webhookText.util.js"), "utf8");
  assert.ok(src.includes("เปิดสิทธิ์เพิ่มวันนี้"));
  assert.ok(src.includes("ได้สแกนอีก"));
  assert.ok(src.includes("ชั่วโมง"));
  assert.ok(src.includes("พิมพ์ว่า จ่าย มาได้เลยครับ"));
  // persona guard: customer copy never says บอท/แอดมิน
  assert.ok(!src.includes("ที่บอทบอก"));
  assert.ok(!src.includes("แอดมินตรวจ"));
});
