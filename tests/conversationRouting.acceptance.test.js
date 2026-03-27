/**
 * Acceptance-oriented routing checks: state-scoped micro-intent + replyType + guidance tier.
 * Full LINE webhook integration stays in release/QA tests; this file locks core contracts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStateMicroIntent } from "../src/core/conversation/stateMicroIntentRouter.js";
import { resolveReplyType } from "../src/core/conversation/replyTypeResolver.js";
import { resolveActiveState } from "../src/core/conversation/activeStateResolver.js";

test("K: free exhausted / paywall — short ack “ครับ” → generic_ack, tier escalates with ack streak", () => {
  const m = resolveStateMicroIntent("paywall_selecting_package", "ครับ", {});
  assert.equal(m.microIntent, "generic_ack");
  const r1 = resolveReplyType("paywall_selecting_package", "generic_ack", {
    noProgressStreak: 1,
    ackStreak: 1,
  });
  assert.equal(r1.replyType, "pw_ack_continue");
  assert.equal(r1.guidanceTier, 1);
  const r3 = resolveReplyType("paywall_selecting_package", "generic_ack", {
    noProgressStreak: 1,
    ackStreak: 3,
  });
  assert.equal(r3.replyType, "pw_ack_continue");
  assert.equal(r3.guidanceTier, 3);
});

test("K: paywall — “จ่าย” before package ack → pay_too_early (same-state, not idle)", () => {
  const m = resolveStateMicroIntent("paywall_selecting_package", "จ่าย", {});
  assert.equal(m.microIntent, "pay_too_early");
  const r = resolveReplyType("paywall_selecting_package", "pay_too_early", {
    noProgressStreak: 2,
  });
  assert.equal(r.replyType, "pw_pay_intent_before_ack");
  assert.equal(r.nextStep, "select_package");
});

test("K: paywall — “อันถูก” → package selection intent (single-offer maps to choose_49)", () => {
  const m = resolveStateMicroIntent("paywall_selecting_package", "อันถูก", {});
  assert.equal(m.microIntent, "choose_49");
});

test("K: payment_package_selected — exact ack token “โอเค” → remind / not idle_generic", () => {
  const m = resolveStateMicroIntent("payment_package_selected", "โอเค", {});
  assert.equal(m.microIntent, "ack");
  const r = resolveReplyType("payment_package_selected", "ack", { noProgressStreak: 1 });
  assert.equal(r.replyType, "pp_remind_pay");
  assert.notEqual(r.replyType, "idle_generic");
});

test("K: awaiting_slip — “ครับ” → generic_ack", () => {
  const m = resolveStateMicroIntent("awaiting_slip", "ครับ", {});
  assert.equal(m.microIntent, "generic_ack");
  const r = resolveReplyType("awaiting_slip", "generic_ack", { ackStreak: 2 });
  assert.equal(r.replyType, "slip_ack");
});

test("K: pending_verify — “ยังไงต่อ” / status → status_check", () => {
  const m = resolveStateMicroIntent("pending_verify", "ยังไงต่อครับ", {});
  assert.equal(m.microIntent, "status_check");
});

test("K: waiting_birthdate — payment words → defer (not generic idle)", () => {
  const m = resolveStateMicroIntent("waiting_birthdate", "จ่ายเงิน", {});
  assert.equal(m.microIntent, "paymentish_text");
  const r = resolveReplyType("waiting_birthdate", "paymentish_text", {});
  assert.equal(r.replyType, "wb_defer_pay_collect_bd");
});

test("K: paywall — date-like while paywall → wrong_state_date", () => {
  const m = resolveStateMicroIntent("paywall_selecting_package", "14/09/1995", {});
  assert.equal(m.microIntent, "wrong_state_date");
});

test("replyType: choose_99 alias → same as choose_49 (multi-price future-safe)", () => {
  const r = resolveReplyType("paywall_selecting_package", "choose_99", {});
  assert.equal(r.replyType, "pw_package_selected");
});

test("resolveActiveState: optional noProgressStreak passthrough", () => {
  const r = resolveActiveState({
    userId: "u",
    hardBlocked: false,
    softLockedScan: false,
    hasAwaitingPaymentInteractive: true,
    paymentInteractiveKind: "paywall",
    waitingBirthdateForScan: false,
    accessPaidReady: false,
    explicitCommandOrUtility: false,
    noProgressStreak: 4,
  });
  assert.equal(r.stateOwner, "paywall_selecting_package");
  assert.equal(r.noProgressStreak, 4);
});
