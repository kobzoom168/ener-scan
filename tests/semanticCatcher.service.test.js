import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSemanticCatcherJson,
  runSemanticCatcher,
  SEMANTIC_CATCHER_CONSUME_THRESHOLD_STRICT,
  SEMANTIC_CATCHER_CONSUME_THRESHOLD_RELAXED,
} from "../src/core/conversation/semanticCatcher/semanticCatcher.service.js";

test("parseSemanticCatcherJson: parses strict contract", () => {
  const parsed = parseSemanticCatcherJson(`{
    "intent":"provide_birthdate",
    "confidence":0.9,
    "safe_to_consume":true,
    "state_guess":"waiting_birthdate",
    "extracted":{"birthdate_candidate":"14/10/2519","package_candidate_text":null,"status_phrase":null},
    "reason_short":"ok"
  }`);
  assert.ok(parsed);
  assert.equal(parsed.intent, "provide_birthdate");
  assert.equal(parsed.extracted.birthdate_candidate, "14/10/2519");
});

test("runSemanticCatcher: invalid JSON from model -> fallback deterministic", async () => {
  const out = await runSemanticCatcher({
    userId: "U_sem_invalid_json",
    activeState: "paywall_offer_single",
    text: "ข้อความที่ไม่ชัดเจน",
    runModel: async () => "not-json",
  });
  assert.equal(out.safe_to_consume, false);
  assert.equal(out.meta.source, "fallback");
});

test("runSemanticCatcher: timeout from model -> fallback deterministic", async () => {
  const out = await runSemanticCatcher({
    userId: "U_sem_timeout",
    activeState: "awaiting_slip",
    text: "ข้อความไม่ชัด",
    runModel: async () => {
      throw new Error("gemini_timeout");
    },
  });
  assert.equal(out.safe_to_consume, false);
  assert.equal(out.meta.source, "fallback");
});

test("runSemanticCatcher: low confidence model output rejected", async () => {
  const out = await runSemanticCatcher({
    userId: "U_sem_low_conf",
    activeState: "paywall_offer_single",
    text: "ข้อความไม่ชัด",
    runModel: async () =>
      JSON.stringify({
        intent: "pay_intent",
        confidence: 0.4,
        safe_to_consume: true,
        state_guess: "paywall_offer_single",
        extracted: {
          birthdate_candidate: null,
          package_candidate_text: null,
          status_phrase: null,
        },
        reason_short: "low_conf",
      }),
  });
  assert.equal(out.safe_to_consume, false);
  assert.ok(out.confidence < SEMANTIC_CATCHER_CONSUME_THRESHOLD_RELAXED);
});

test("runSemanticCatcher: state mismatch rejected even high confidence", async () => {
  const out = await runSemanticCatcher({
    userId: "U_sem_state_mismatch",
    activeState: "waiting_birthdate",
    text: "จ่ายเงิน",
    runModel: async () =>
      JSON.stringify({
        intent: "pay_intent",
        confidence: 0.99,
        safe_to_consume: true,
        state_guess: "paywall_offer_single",
        extracted: {
          birthdate_candidate: null,
          package_candidate_text: null,
          status_phrase: null,
        },
        reason_short: "mismatch",
      }),
  });
  assert.equal(out.safe_to_consume, false);
  assert.equal(out.intent, "pay_intent");
});

test("threshold constants remain conservative", () => {
  assert.equal(SEMANTIC_CATCHER_CONSUME_THRESHOLD_STRICT, 0.82);
  assert.equal(SEMANTIC_CATCHER_CONSUME_THRESHOLD_RELAXED, 0.78);
});

