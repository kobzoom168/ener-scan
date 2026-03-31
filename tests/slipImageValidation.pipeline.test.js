import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAwaitingPaymentSlipImage,
  buildSlipNotTransferReceiptText,
} from "../src/services/lineWebhook/slipImageValidation.service.js";

const buf = () => Buffer.alloc(500, 1);

test("buildSlipNotTransferReceiptText: deterministic copy", () => {
  const t = buildSlipNotTransferReceiptText();
  assert.ok(t.includes("ยังไม่ใช่สลิปการโอน"));
  assert.ok(t.includes("สลิปโอนเงิน"));
});

test("awaiting_payment slip: gate accept + object single_supported => not proceed (no slip)", async () => {
  const r = await evaluateAwaitingPaymentSlipImage(
    {
      imageBuffer: buf(),
      userId: "U_slip_test_1",
      paymentId: "pay-1",
      messageId: "m1",
      flowState: "awaiting_payment",
    },
    {
      runSlipGate: async () => ({
        decision: "accept",
        slipLabel: "likely_slip",
        slipEvidenceScore: 0.95,
        path: "vision",
      }),
      runObjectCheck: async () => "single_supported",
    },
  );
  assert.equal(r.proceed, false);
  assert.equal(r.rejectKind, "sacred_object_not_slip");
});

test("awaiting_payment slip: gate accept + object unclear => proceed", async () => {
  const r = await evaluateAwaitingPaymentSlipImage(
    {
      imageBuffer: buf(),
      userId: "U_slip_test_2",
      paymentId: "pay-2",
      messageId: "m2",
      flowState: "awaiting_payment",
    },
    {
      runSlipGate: async () => ({
        decision: "accept",
        slipLabel: "likely_slip",
        slipEvidenceScore: 0.9,
        path: "vision",
      }),
      runObjectCheck: async () => "unclear",
    },
  );
  assert.equal(r.proceed, true);
});

test("awaiting_payment slip: gate reject => not proceed", async () => {
  const r = await evaluateAwaitingPaymentSlipImage(
    {
      imageBuffer: buf(),
      userId: "U_slip_test_3",
      paymentId: "pay-3",
      messageId: "m3",
      flowState: "awaiting_payment",
    },
    {
      runSlipGate: async () => ({
        decision: "reject",
        slipLabel: "object_photo",
        slipEvidenceScore: 0.2,
        rejectReason: "vision_label_object_photo",
        path: "vision",
      }),
      runObjectCheck: async () => assert.fail("object check must not run"),
    },
  );
  assert.equal(r.proceed, false);
  assert.equal(r.rejectKind, "slip_gate_reject");
});

test("awaiting_payment slip: gate unclear => not proceed", async () => {
  const r = await evaluateAwaitingPaymentSlipImage(
    {
      imageBuffer: buf(),
      userId: "U_slip_test_4",
      paymentId: "pay-4",
      messageId: "m4",
      flowState: "awaiting_payment",
    },
    {
      runSlipGate: async () => ({
        decision: "unclear",
        slipLabel: "likely_slip",
        slipEvidenceScore: 0.3,
        rejectReason: "weak_evidence",
        path: "vision",
      }),
      runObjectCheck: async () => assert.fail("object check must not run"),
    },
  );
  assert.equal(r.proceed, false);
  assert.equal(r.rejectKind, "slip_gate_unclear");
});
