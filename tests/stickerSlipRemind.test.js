/**
 * สติกเกอร์ ≠ เจตนาเรื่องเงิน (กบ 17 ส.ค. เคส Marut): ทวงสลิปจากสติกเกอร์ได้
 * เฉพาะรายการชำระที่เพิ่งสร้างภายใน 60 นาที — เก่ากว่านั้นตอบแบบสติกเกอร์ปกติ
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRemindSlipOnSticker, handleStickerLikeInput } from "../src/handlers/stickerMessage.handler.js";

test("ทวงเฉพาะรายการสด (≤60 นาที) · เก่า/ไม่มีเวลา/ไม่ได้อยู่ awaiting_slip = ไม่ทวง", () => {
  const now = Date.now();
  assert.equal(
    shouldRemindSlipOnSticker({ awaitingSlip: true, paymentCreatedAtMs: now - 10 * 60000, nowMs: now }),
    true,
  );
  // เคสจริง Marut: สร้างรายการใน LIFF แล้ว 100 นาทีค่อยส่งสติกเกอร์ → ห้ามทวง
  assert.equal(
    shouldRemindSlipOnSticker({ awaitingSlip: true, paymentCreatedAtMs: now - 100 * 60000, nowMs: now }),
    false,
  );
  assert.equal(
    shouldRemindSlipOnSticker({ awaitingSlip: true, paymentCreatedAtMs: null, nowMs: now }),
    false,
  );
  assert.equal(
    shouldRemindSlipOnSticker({ awaitingSlip: false, paymentCreatedAtMs: now, nowMs: now }),
    false,
  );
});


test("boundary (Codex): 0 นาที / 60 พอดี = ทวง · 60+1ms / อนาคต = ไม่ทวง", () => {
  const now = 1_000_000_000_000;
  const M = 60000;
  assert.equal(shouldRemindSlipOnSticker({ awaitingSlip: true, paymentCreatedAtMs: now, nowMs: now }), true);
  assert.equal(shouldRemindSlipOnSticker({ awaitingSlip: true, paymentCreatedAtMs: now - 60 * M, nowMs: now }), true);
  assert.equal(shouldRemindSlipOnSticker({ awaitingSlip: true, paymentCreatedAtMs: now - 60 * M - 1, nowMs: now }), false);
  // timestamp อนาคต = ไม่ใช่รายการสด
  assert.equal(shouldRemindSlipOnSticker({ awaitingSlip: true, paymentCreatedAtMs: now + 5 * M, nowMs: now }), false);
});

/* ---------------- behavior tests ระดับ handler ผ่าน DI (Codex 18 ส.ค.) ---------------- */

function makeDeps({ paymentState, row, dbThrows = false, sent }) {
  return {
    getPaymentState: () => ({ state: paymentState }),
    getLatestAwaitingPaymentForLineUserId: async () => {
      if (dbThrows) throw new Error("db down");
      return row;
    },
    ensurePaymentRefForPaymentId: async () => "PAY-TEST",
    buildAwaitingSlipReminderText: async () => "รอสลิปโอนอยู่ครับ ส่งสลิปมาได้เลย",
    buildPendingVerifyReminderText: async () => "สลิปกำลังตรวจอยู่ครับ",
    buildWaitingBirthdateGuidanceText: async () => "ขอวันเกิดครับ",
    getBirthdateChangeFlowState: () => null,
    getSavedBirthdate: async () => null,
    sendNonScanReply: async (p) => {
      sent.push({ semanticKey: p.semanticKey, text: p.text });
      return { sent: true };
    },
    incrementCounterWithTtl: async () => 1,
    now: () => Date.parse("2026-08-18T10:00:00Z"),
  };
}

const baseOpts = (deps) => ({
  client: {},
  event: { replyToken: "rt" },
  userId: "U1",
  session: {},
  source: "sticker",
  deps,
});

test("behavior: fresh awaiting → slip reminder ครั้งเดียว", async () => {
  const sent = [];
  const now = Date.parse("2026-08-18T10:00:00Z");
  await handleStickerLikeInput(baseOpts(makeDeps({
    paymentState: "awaiting_slip",
    row: { id: "p1", status: "awaiting_payment", payment_ref: "PAY-1", created_at: new Date(now - 10 * 60000).toISOString() },
    sent,
  })));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].semanticKey, "sticker_awaiting_slip");
});

test("behavior: stale awaiting → idle sticker ครั้งเดียว ไม่มีคำทวงสลิป", async () => {
  const sent = [];
  const now = Date.parse("2026-08-18T10:00:00Z");
  await handleStickerLikeInput(baseOpts(makeDeps({
    paymentState: "awaiting_slip",
    row: { id: "p1", status: "awaiting_payment", payment_ref: "PAY-1", created_at: new Date(now - 100 * 60000).toISOString() },
    sent,
  })));
  assert.equal(sent.length, 1); // ห้าม double reply
  assert.doesNotMatch(sent[0].text, /สลิป/);
});

test("behavior: DB query throw → idle sticker ครั้งเดียว", async () => {
  const sent = [];
  await handleStickerLikeInput(baseOpts(makeDeps({
    paymentState: "awaiting_slip",
    row: null,
    dbThrows: true,
    sent,
  })));
  assert.equal(sent.length, 1);
  assert.doesNotMatch(sent[0].text, /สลิป/);
});

test("behavior: stale awaiting แต่ row เป็น pending_verify จริง → pending-verify reply ตามสถานะ", async () => {
  const sent = [];
  const now = Date.parse("2026-08-18T10:00:00Z");
  await handleStickerLikeInput(baseOpts(makeDeps({
    paymentState: "awaiting_slip",
    row: { id: "p1", status: "pending_verify", payment_ref: "PAY-1", created_at: new Date(now - 100 * 60000).toISOString() },
    sent,
  })));
  assert.equal(sent.length, 1); // ไม่ซ้อนสองข้อความ
  assert.equal(sent[0].semanticKey, "sticker_pending_verify");
});
