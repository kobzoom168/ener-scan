import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyReplyTypeToPhaseA } from "../src/core/conversation/phaseALegacyReplyBridge.js";

test("bridge maps paywall ack to phase contract key", () => {
  const b = legacyReplyTypeToPhaseA("single_offer_paywall_ready_ack");
  assert.ok(b);
  assert.equal(b.stateOwner, "paywall_selecting_package");
  assert.equal(b.phaseReplyType, "pw_package_selected");
});

test("bridge maps pending verify status", () => {
  const b = legacyReplyTypeToPhaseA("pending_verify_status");
  assert.ok(b);
  assert.equal(b.stateOwner, "pending_verify");
  assert.equal(b.phaseReplyType, "pv_status");
});

test("bridge returns null for unmapped type", () => {
  assert.equal(legacyReplyTypeToPhaseA("idle_post_scan"), null);
});

test("bridge maps package-selected pay_now to payment_package_selected", () => {
  const b = legacyReplyTypeToPhaseA("package_selected_pay_now");
  assert.ok(b);
  assert.equal(b.stateOwner, "payment_package_selected");
  assert.equal(b.phaseReplyType, "pp_show_payment_flow");
});

test("bridge maps package-selected ack to remind_pay contract", () => {
  const b = legacyReplyTypeToPhaseA("package_selected_ack_full");
  assert.ok(b);
  assert.equal(b.stateOwner, "payment_package_selected");
  assert.equal(b.phaseReplyType, "pp_remind_pay");
});

test("bridge maps package-selected wait_tomorrow to status-like phase key", () => {
  const b = legacyReplyTypeToPhaseA("package_selected_wait_tomorrow");
  assert.ok(b);
  assert.equal(b.stateOwner, "payment_package_selected");
  assert.equal(b.phaseReplyType, "pp_status_misroute_nudge");
});

test("bridge maps package-selected date_wrong to pp copy family", () => {
  const b = legacyReplyTypeToPhaseA("package_selected_date_wrong_state");
  assert.ok(b);
  assert.equal(b.stateOwner, "payment_package_selected");
  assert.equal(b.phaseReplyType, "pp_date_wrong_state");
});

test("bridge maps package-selected unclear to pp_selected_guidance", () => {
  const b = legacyReplyTypeToPhaseA("package_selected_unclear_full");
  assert.ok(b);
  assert.equal(b.stateOwner, "payment_package_selected");
  assert.equal(b.phaseReplyType, "pp_selected_guidance");
});
