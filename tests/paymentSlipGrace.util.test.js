import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearSlipGracePayIntentForUser,
  getSlipGracePayIntentSnapshot,
  pollAwaitingPaymentForSlipGrace,
  recordSlipGracePayIntentFromUserText,
  shouldOfferSlipPaymentGraceHold,
  slipImageSoftLikelyForGrace,
  textMatchesSlipGracePayIntent,
} from "../src/utils/paymentSlipGrace.util.js";
import {
  clearPaymentState,
  setAwaitingPayment,
} from "../src/stores/manualPaymentAccess.store.js";

test("textMatchesSlipGracePayIntent", () => {
  assert.equal(textMatchesSlipGracePayIntent("จ่ายเงิน", "จ่ายเงิน"), true);
  assert.equal(textMatchesSlipGracePayIntent("โอนแล้วครับ", "โอนแล้วครับ"), true);
  assert.equal(textMatchesSlipGracePayIntent("ส่งสลิป", "ส่งสลิป"), true);
  assert.equal(textMatchesSlipGracePayIntent("ทดสอบ", "ทดสอบ"), false);
});

test("recordSlipGracePayIntentFromUserText + snapshot", () => {
  const uid = "U_grace_test_1";
  clearSlipGracePayIntentForUser(uid);
  recordSlipGracePayIntentFromUserText(uid, "จ่ายเงินครับ", "จ่ายเงินครับ");
  const s = getSlipGracePayIntentSnapshot(uid);
  assert.equal(s.active, true);
  assert.ok(typeof s.ageMs === "number");
  clearSlipGracePayIntentForUser(uid);
  assert.equal(getSlipGracePayIntentSnapshot(uid).active, false);
});

test("shouldOfferSlipPaymentGraceHold: no hold when paid entitlement routes scan first", () => {
  const buf = Buffer.alloc(9000, 0xab);
  assert.equal(
    shouldOfferSlipPaymentGraceHold({
      accessReason: "payment_required",
      routeObjectToScanFirst: true,
      pendingPaymentRow: null,
      userId: "u1",
      imageBuffer: buf,
    }),
    false,
  );
});

test("shouldOfferSlipPaymentGraceHold: memory awaiting_slip", () => {
  const uid = "U_grace_test_mem";
  setAwaitingPayment(uid);
  const buf = Buffer.alloc(500); // too small for soft slip
  const r = shouldOfferSlipPaymentGraceHold({
    accessReason: "payment_required",
    routeObjectToScanFirst: false,
    pendingPaymentRow: null,
    userId: uid,
    imageBuffer: buf,
  });
  assert.ok(r && r.reason === "memory_awaiting_slip");
  clearPaymentState(uid);
});

test("slipImageSoftLikelyForGrace: large non-chat buffer", () => {
  const buf = Buffer.alloc(9000, 0xab);
  assert.equal(slipImageSoftLikelyForGrace(buf), true);
});

test("pollAwaitingPaymentForSlipGrace resolves when row appears", async () => {
  let calls = 0;
  const row = { id: "p1", status: "awaiting_payment" };
  const out = await pollAwaitingPaymentForSlipGrace(
    "u",
    async () => {
      calls += 1;
      return calls >= 2 ? row : null;
    },
    {
      maxMs: 5000,
      pollMs: 5,
      sleepFn: (ms) => new Promise((r) => setTimeout(r, ms)),
    },
  );
  assert.deepEqual(out, row);
  assert.ok(calls >= 2);
});
