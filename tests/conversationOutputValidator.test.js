import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConversationOutput } from "../src/core/conversation/conversationOutputValidator.js";

test("validator: rejects invented price when facts constrain", () => {
  const contract = {
    stateOwner: "paywall_selecting_package",
    replyType: "pw_guidance",
    guidanceTier: 2,
    allowedFacts: [
      { key: "package_price_thb", value: "49", mustPreserveInOutput: true },
    ],
    nextStep: "select_package",
    microIntent: "",
  };
  const bad = validateConversationOutput("โปรโมชั่น 99 บาท รีบเลย", contract);
  assert.equal(bad.valid, false);
});

test("validator: accepts same price and preserves fact", () => {
  const contract = {
    stateOwner: "paywall_selecting_package",
    replyType: "pw_guidance",
    guidanceTier: 1,
    allowedFacts: [
      { key: "package_price_thb", value: "49", mustPreserveInOutput: true },
    ],
    nextStep: "select_package",
    microIntent: "",
  };
  const ok = validateConversationOutput("เปิดสิทธิ์ 49 บาท พิมพ์จ่ายเงินได้เลยครับ", contract);
  assert.equal(ok.valid, true);
  assert.ok(String(ok.sanitizedText || "").includes("49"));
});

test("validator: birthdate flow rejects price mentions", () => {
  const contract = {
    stateOwner: "waiting_birthdate",
    replyType: "wb_guidance_birthdate",
    guidanceTier: 1,
    allowedFacts: [],
    nextStep: "collect_birthdate",
    microIntent: "",
  };
  const bad = validateConversationOutput("พิมพ์วันเกิด 49 บาท", contract);
  assert.equal(bad.valid, false);
});

test("validator: rejects false success while pending", () => {
  const contract = {
    stateOwner: "pending_verify",
    replyType: "pv_status",
    guidanceTier: 1,
    allowedFacts: [
      { key: "payment_status", value: "pending_verify", mustPreserveInOutput: false },
    ],
    nextStep: "wait_admin",
    microIntent: "",
  };
  const bad = validateConversationOutput("ชำระสำเร็จแล้วครับ", contract);
  assert.equal(bad.valid, false);
});
