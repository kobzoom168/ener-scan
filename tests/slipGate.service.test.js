import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSlipGate } from "../src/core/payments/slipCheck/slipGate.service.js";

/** 1×1 PNG — patch IHDR for square dimensions; pad for byte size */
const PNG_1X1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function squarePngBufferOverMin() {
  const core = Buffer.from(PNG_1X1_B64, "base64");
  core.writeUInt32BE(400, 16);
  core.writeUInt32BE(400, 20);
  return Buffer.concat([core, Buffer.alloc(2000, 0)]);
}

const allSignalsTrue = {
  amountVisible: true,
  dateTimeVisible: true,
  bankOrWalletUi: true,
  referenceLikeText: true,
};

test("slip gate: chat-like likely_slip + line_ui hard negative cannot accept", async () => {
  const imageBuffer = squarePngBufferOverMin();
  const gate = await evaluateSlipGate(
    {
      imageBuffer,
      lineUserId: "U_test",
      paymentId: 1,
      stateOwner: "awaiting_slip",
    },
    {
      visionClassifyOverride: async () => ({
        slipLabel: "likely_slip",
        evidenceScore: 0.99,
        hardNegatives: ["line_ui", "chat_bubbles"],
        signals: { ...allSignalsTrue },
      }),
    },
  );
  assert.notEqual(gate.decision, "accept");
  assert.equal(gate.decision, "reject");
  assert.equal(gate.rejectReason, "vision_hard_negative_instant");
});

test("slip gate: object-photo-like likely_slip + physical_product hard negative cannot accept", async () => {
  const imageBuffer = squarePngBufferOverMin();
  const gate = await evaluateSlipGate(
    {
      imageBuffer,
      lineUserId: "U_test",
      paymentId: 2,
      stateOwner: "awaiting_slip",
    },
    {
      visionClassifyOverride: async () => ({
        slipLabel: "likely_slip",
        evidenceScore: 0.99,
        hardNegatives: ["physical_product", "single_object_focus"],
        signals: { ...allSignalsTrue },
      }),
    },
  );
  assert.notEqual(gate.decision, "accept");
  assert.equal(gate.decision, "reject");
  assert.equal(gate.rejectReason, "vision_hard_negative_instant");
});
