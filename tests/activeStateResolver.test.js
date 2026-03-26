import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActiveState } from "../src/core/conversation/activeStateResolver.js";

test("active state: hard block wins", () => {
  const r = resolveActiveState({
    userId: "u1",
    hardBlocked: true,
    softLockedScan: false,
    hasAwaitingPaymentInteractive: true,
    paymentInteractiveKind: "pending_verify",
    waitingBirthdateForScan: true,
    accessPaidReady: false,
    explicitCommandOrUtility: false,
  });
  assert.equal(r.stateOwner, "hard_blocked");
});

test("active state: pending_verify over waiting_birthdate", () => {
  const r = resolveActiveState({
    userId: "u1",
    hardBlocked: false,
    softLockedScan: false,
    hasAwaitingPaymentInteractive: true,
    paymentInteractiveKind: "pending_verify",
    waitingBirthdateForScan: true,
    accessPaidReady: false,
    explicitCommandOrUtility: false,
  });
  assert.equal(r.stateOwner, "pending_verify");
});

test("active state: waiting_birthdate when only scan pending", () => {
  const r = resolveActiveState({
    userId: "u1",
    hardBlocked: false,
    softLockedScan: false,
    hasAwaitingPaymentInteractive: false,
    paymentInteractiveKind: "none",
    waitingBirthdateForScan: true,
    accessPaidReady: false,
    explicitCommandOrUtility: false,
  });
  assert.equal(r.stateOwner, "waiting_birthdate");
});
