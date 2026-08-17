/**
 * สติกเกอร์ ≠ เจตนาเรื่องเงิน (กบ 17 ส.ค. เคส Marut): ทวงสลิปจากสติกเกอร์ได้
 * เฉพาะรายการชำระที่เพิ่งสร้างภายใน 60 นาที — เก่ากว่านั้นตอบแบบสติกเกอร์ปกติ
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRemindSlipOnSticker } from "../src/handlers/stickerMessage.handler.js";

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
