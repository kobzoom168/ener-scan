import test from "node:test";
import assert from "node:assert/strict";
import {
  validateProposedAction,
  allowedActionsForPhase1State,
} from "../src/core/conversation/geminiFront/geminiActionValidator.js";

test("validateProposedAction: rejects unknown action for phase1", () => {
  const r = validateProposedAction({
    phase1State: "pending_verify",
    proposed_action: "send_qr_bundle",
    confidence: 0.99,
  });
  assert.equal(r.ok, false);
  assert.equal(r.resolved_action, "noop_phrase_only");
});

test("validateProposedAction: allows noop with confidence", () => {
  const r = validateProposedAction({
    phase1State: "payment_package_selected",
    proposed_action: "send_qr_bundle",
    confidence: 0.99,
  });
  assert.equal(r.ok, true);
  assert.equal(r.resolved_action, "send_qr_bundle");
});

test("validateProposedAction: low confidence downgrades", () => {
  const r = validateProposedAction({
    phase1State: "awaiting_slip",
    proposed_action: "get_payment_status",
    confidence: 0.1,
  });
  assert.equal(r.ok, false);
});

test("allowedActionsForPhase1State includes core tools", () => {
  const a = allowedActionsForPhase1State("waiting_birthdate");
  assert.ok(a.includes("set_birthdate"));
  assert.ok(a.includes("noop_phrase_only"));
});
