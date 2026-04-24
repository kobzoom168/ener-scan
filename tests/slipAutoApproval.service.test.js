import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSlipAutoApproval } from "../src/core/payments/slipCheck/slipAutoApproval.service.js";
import { runSlipAutoApprovalAfterGateAccept } from "../src/core/payments/slipCheck/slipAutoApprovalOrchestrator.service.js";
import { env } from "../src/config/env.js";

function basePayment() {
  return {
    id: "pay-1",
    status: "pending_verify",
    created_at: "2026-04-24T10:00:00.000Z",
    expected_amount: 49,
  };
}

function baseOcr() {
  return {
    amount: 49,
    confidence: 0.95,
    slipRef: "REF-001",
    transferredAtIso: "2026-04-24T10:10:00.000Z",
    receiverName: "Ener Scan Co",
    receiverAccountLast4: "1689",
    receiverPromptPay: "0812345678",
    senderName: "A",
    bankName: "X",
    rawText: "x",
  };
}

test("slip auto approval: missing slipRef => manual_review_required", async () => {
  const result = await evaluateSlipAutoApproval({
    payment: basePayment(),
    ocrResult: { ...baseOcr(), slipRef: null },
    checkDuplicateSlipRef: async () => false,
  });
  assert.equal(result.decision, "manual_review_required");
  assert.ok(result.reasons.includes("missing_slip_ref"));
});

test("slip auto approval: duplicate slipRef => manual_review_required", async () => {
  const result = await evaluateSlipAutoApproval({
    payment: basePayment(),
    ocrResult: baseOcr(),
    checkDuplicateSlipRef: async () => true,
  });
  assert.equal(result.decision, "manual_review_required");
  assert.ok(result.reasons.includes("duplicate_slip_ref"));
});

test("slip auto approval: amount mismatch => manual_review_required", async () => {
  const result = await evaluateSlipAutoApproval({
    payment: basePayment(),
    ocrResult: { ...baseOcr(), amount: 99 },
    checkDuplicateSlipRef: async () => false,
  });
  assert.equal(result.decision, "manual_review_required");
  assert.ok(result.reasons.includes("amount_mismatch"));
});

test("slip auto approval: low confidence => manual_review_required", async () => {
  const result = await evaluateSlipAutoApproval({
    payment: basePayment(),
    ocrResult: { ...baseOcr(), confidence: 0.1 },
    checkDuplicateSlipRef: async () => false,
  });
  assert.equal(result.decision, "manual_review_required");
  assert.ok(result.reasons.includes("low_confidence"));
});

test("slip auto approval: transferredAt before payment.created_at => manual_review_required", async () => {
  const result = await evaluateSlipAutoApproval({
    payment: basePayment(),
    ocrResult: { ...baseOcr(), transferredAtIso: "2026-04-24T09:00:00.000Z" },
    checkDuplicateSlipRef: async () => false,
  });
  assert.equal(result.decision, "manual_review_required");
  assert.ok(result.reasons.includes("transfer_before_payment_created"));
});

test("slip auto approval orchestrator: OCR fail => manual_review", async () => {
  /** @type {Record<string, unknown>[]} */
  const patches = [];
  const out = await runSlipAutoApprovalAfterGateAccept({
    userId: "U1",
    paymentId: "pay-1",
    imageBuffer: Buffer.from([1, 2, 3]),
    payment: basePayment(),
    updatePaymentFields: async (_id, patch) => {
      patches.push(patch);
    },
    extract: async () => {
      throw new Error("ocr_failed");
    },
  });
  assert.equal(out.mode, "manual_review");
  assert.equal(String(patches[0]?.slip_verify_status || ""), "manual_review");
});

test("slip auto approval orchestrator: dry-run pass => no real approve side effects", async () => {
  const prevEnabled = env.SLIP_AUTO_APPROVE_ENABLED;
  const prevDry = env.SLIP_AUTO_APPROVE_DRY_RUN;
  env.SLIP_AUTO_APPROVE_ENABLED = false;
  env.SLIP_AUTO_APPROVE_DRY_RUN = true;
  try {
    /** @type {Record<string, unknown>[]} */
    const patches = [];
    const out = await runSlipAutoApprovalAfterGateAccept({
      userId: "U1",
      paymentId: "pay-1",
      imageBuffer: Buffer.from([1, 2, 3]),
      payment: basePayment(),
      updatePaymentFields: async (_id, patch) => {
        patches.push(patch);
      },
      extract: async () => baseOcr(),
      evaluate: async () => ({
        decision: "would_auto_approve",
        reasons: [],
        matched: {
          amount: true,
          receiver: true,
          time: true,
          slipRef: true,
          paymentState: true,
          confidence: true,
        },
      }),
    });
    assert.equal(out.mode, "dry_run_would_auto_approve");
    assert.equal(String(patches[0]?.slip_verify_status || ""), "dry_run_would_auto_approve");
  } finally {
    env.SLIP_AUTO_APPROVE_ENABLED = prevEnabled;
    env.SLIP_AUTO_APPROVE_DRY_RUN = prevDry;
  }
});

test("slip auto approval orchestrator: enabled + non-dry => auto_approved", async () => {
  const prevEnabled = env.SLIP_AUTO_APPROVE_ENABLED;
  const prevDry = env.SLIP_AUTO_APPROVE_DRY_RUN;
  env.SLIP_AUTO_APPROVE_ENABLED = true;
  env.SLIP_AUTO_APPROVE_DRY_RUN = false;
  try {
    /** @type {Record<string, unknown>[]} */
    const patches = [];
    const out = await runSlipAutoApprovalAfterGateAccept({
      userId: "U1",
      paymentId: "pay-1",
      imageBuffer: Buffer.from([1, 2, 3]),
      payment: basePayment(),
      updatePaymentFields: async (_id, patch) => {
        patches.push(patch);
      },
      extract: async () => baseOcr(),
      evaluate: async () => ({
        decision: "would_auto_approve",
        reasons: [],
        matched: {
          amount: true,
          receiver: true,
          time: true,
          slipRef: true,
          paymentState: true,
          confidence: true,
        },
      }),
    });
    assert.equal(out.mode, "auto_approved");
    assert.equal(String(patches[0]?.slip_verify_status || ""), "auto_approved");
  } finally {
    env.SLIP_AUTO_APPROVE_ENABLED = prevEnabled;
    env.SLIP_AUTO_APPROVE_DRY_RUN = prevDry;
  }
});
