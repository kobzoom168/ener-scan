import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAwaitingPaymentActionableForTextRouting,
  shouldEmitPayNotNeededForPaymentIntent,
} from "../src/utils/paymentConversationRouting.util.js";

test("isAwaitingPaymentActionable: pending_verify wins even when access allowed", () => {
  assert.equal(
    isAwaitingPaymentActionableForTextRouting({
      accessDecision: { allowed: true, reason: "free" },
      latestPaymentRow: { status: "pending_verify" },
      paymentMemoryState: "none",
    }),
    true,
  );
});

test("isAwaitingPaymentActionable: access allowed suppresses stale awaiting_payment", () => {
  assert.equal(
    isAwaitingPaymentActionableForTextRouting({
      accessDecision: { allowed: true, reason: "free" },
      latestPaymentRow: { status: "awaiting_payment" },
      paymentMemoryState: "awaiting_slip",
    }),
    false,
  );
});

test("isAwaitingPaymentActionable: awaiting_payment when access denied", () => {
  assert.equal(
    isAwaitingPaymentActionableForTextRouting({
      accessDecision: { allowed: false, reason: "payment_required" },
      latestPaymentRow: { status: "awaiting_payment" },
      paymentMemoryState: "none",
    }),
    true,
  );
});

test("isAwaitingPaymentActionable: memory awaiting_slip only when access denied (DB empty)", () => {
  assert.equal(
    isAwaitingPaymentActionableForTextRouting({
      accessDecision: { allowed: false, reason: "payment_required" },
      latestPaymentRow: null,
      paymentMemoryState: "awaiting_slip",
    }),
    true,
  );
  assert.equal(
    isAwaitingPaymentActionableForTextRouting({
      accessDecision: { allowed: true, reason: "free" },
      latestPaymentRow: null,
      paymentMemoryState: "awaiting_slip",
    }),
    false,
  );
});

test("shouldEmitPayNotNeeded: allowed + awaiting_payment (stale) → true", () => {
  assert.equal(
    shouldEmitPayNotNeededForPaymentIntent(
      { allowed: true, reason: "free" },
      { status: "awaiting_payment" },
    ),
    true,
  );
});

test("shouldEmitPayNotNeeded: allowed + pending_verify → false", () => {
  assert.equal(
    shouldEmitPayNotNeededForPaymentIntent(
      { allowed: true, reason: "free" },
      { status: "pending_verify" },
    ),
    false,
  );
});

test("shouldEmitPayNotNeeded: denied → false", () => {
  assert.equal(
    shouldEmitPayNotNeededForPaymentIntent(
      { allowed: false, reason: "payment_required" },
      { status: "awaiting_payment" },
    ),
    false,
  );
});
