import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSlipOcrResult,
  extractSlipOcrFromImage,
} from "../src/core/payments/slipCheck/slipOcrExtractor.service.js";

test("normalizeSlipOcrResult: parse Thai BE transferredAtText", () => {
  const out = normalizeSlipOcrResult({
    amount: 49,
    currency: "THB",
    transferredAtText: "24/04/2569 17:23",
    transferredAtIso: null,
    confidence: 0.9,
  });
  assert.equal(out.amount, 49);
  assert.equal(out.currency, "THB");
  assert.ok(out.transferredAtIso);
  assert.equal(out.confidence, 0.9);
});

test("extractSlipOcrFromImage: parse JSON output_text", async () => {
  const fake = async () => ({
    output_text:
      '{"amount":49,"currency":"THB","transferredAtIso":"2026-04-24T10:00:00.000Z","receiverName":"Ener","receiverAccountLast4":"1689","receiverPromptPay":"0812345678","senderName":"A","bankName":"B","slipRef":"REF1","confidence":0.93,"rawText":"x"}',
  });
  const out = await extractSlipOcrFromImage({
    imageBuffer: Buffer.from([1, 2, 3]),
    createResponses: fake,
  });
  assert.equal(out.amount, 49);
  assert.equal(out.slipRef, "REF1");
  assert.equal(out.confidence, 0.93);
});

test("extractSlipOcrFromImage: fallback fills missing key fields from rawText", async () => {
  const fake = async () => ({
    output_text:
      '{"amount":49,"currency":"THB","transferredAtText":null,"transferredAtIso":null,"receiverName":null,"receiverAccountLast4":null,"receiverPromptPay":null,"senderName":"A","bankName":"B","slipRef":null,"confidence":0.93,"rawText":"วันที่ทำรายการ 24/04/2569 17:23 ผู้รับเงิน Ener Scan Co บัญชีผู้รับ xxx-x-x1689 เลขอ้างอิง TXN-ABC123456789"}',
  });
  const out = await extractSlipOcrFromImage({
    imageBuffer: Buffer.from([1, 2, 3]),
    createResponses: fake,
  });
  assert.equal(out.slipRef, "TXN-ABC123456789");
  assert.equal(out.receiverAccountLast4, "1689");
  assert.ok(out.receiverName);
  assert.ok(out.transferredAtIso);
});
