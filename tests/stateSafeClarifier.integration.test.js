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
  assert.ok(src.includes("ค่าเปิดระบบวันนี้"));
  assert.ok(src.includes("ใช้สแกนเพิ่มได้"));
  assert.ok(src.includes("ภายใน"));
  assert.ok(src.includes("ตอบว่า 'จ่าย' ได้เลยครับ"));
});
