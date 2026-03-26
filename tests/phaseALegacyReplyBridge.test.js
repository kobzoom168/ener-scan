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
