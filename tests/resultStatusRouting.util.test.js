/**
 * Codex รอบ 6: behavior tests ของ routing decision จริง (ไม่ใช่ source-order)
 * เคสที่เคยพลาด: ลูกค้า pending_verify พิมพ์ "รอนานแล้วครับ" แล้วมี scan job ล่าสุด
 * → scan-status แย่งตอบ
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveResultStatusRouting } from "../src/services/scanV2/resultStatusRouting.util.js";
import { ACTIVE_PAYMENT_STATUSES } from "../src/stores/payments.db.js";

const evidence = (o) => async () => o;

test("pending_verify + 'รอนานแล้วครับ' → ไม่ให้ scan-status ตอบ (ไปเลน payment)", async () => {
  const r = await resolveResultStatusRouting({
    text: "รอนานแล้วครับ",
    getPaymentEvidence: evidence({ ok: true, active: true }),
  });
  assert.equal(r.handle, false);
  assert.equal(r.kind, "generic_wait");
  assert.equal(r.reason, "pending_payment");
});

test("awaiting_payment + 'รอนานแล้วครับ' → เหมือนกัน (ไม่แย่ง)", async () => {
  const r = await resolveResultStatusRouting({
    text: "รอนานแล้วครับ",
    getPaymentEvidence: evidence({ ok: true, active: true }),
  });
  assert.equal(r.handle, false);
});

test("ไม่มี payment ค้าง + รอนาน → scan status ตอบได้", async () => {
  const r = await resolveResultStatusRouting({
    text: "รอนานแล้วครับ",
    getPaymentEvidence: evidence({ ok: true, active: false }),
  });
  assert.equal(r.handle, true);
  assert.equal(r.kind, "generic_wait");
});

test("payment query error → fail-closed ห้าม claim scan status", async () => {
  const r = await resolveResultStatusRouting({
    text: "รอนานแล้วครับ",
    getPaymentEvidence: evidence({ ok: false, active: false }),
  });
  assert.equal(r.handle, false);
  assert.equal(r.reason, "payment_evidence_unavailable");
  // throw ก็ต้อง fail-closed เหมือนกัน
  const r2 = await resolveResultStatusRouting({
    text: "รอนานแล้วครับ",
    getPaymentEvidence: async () => { throw new Error("db down"); },
  });
  assert.equal(r2.handle, false);
});

test("ถามผลสแกนตรงตัว → ตอบได้แม้มี payment ค้าง (คนละเรื่องกัน)", async () => {
  const r = await resolveResultStatusRouting({
    text: "ผลออกยังครับ",
    getPaymentEvidence: evidence({ ok: true, active: true }),
  });
  assert.equal(r.handle, true);
  assert.equal(r.kind, "scan_status");
});

test("คำถามเรื่องเงิน/สิทธิ์ → ไม่แตะ payment evidence เลย และไม่รับ", async () => {
  let called = 0;
  for (const text of ["สถานะสลิป", "สถานะการจ่ายเงิน", "รอตรวจสลิปนานแล้ว", "สถานะสมาชิก"]) {
    const r = await resolveResultStatusRouting({
      text,
      getPaymentEvidence: async () => { called += 1; return { ok: true, active: false }; },
    });
    assert.equal(r.handle, false, text);
    assert.equal(r.reason, "belongs_to_payment_flow", text);
  }
  assert.equal(called, 0, "เคสเงิน/สิทธิ์ตัดสินได้โดยไม่ต้องอ่าน DB");
});

test("ข้อความทั่วไป → not_status_query", async () => {
  const r = await resolveResultStatusRouting({ text: "สวัสดีครับ", getPaymentEvidence: evidence({ ok: true, active: false }) });
  assert.equal(r.handle, false);
  assert.equal(r.kind, "other");
});

test("SSOT: payments store export ACTIVE_PAYMENT_STATUSES และ webhook ไม่เขียนลิสต์ซ้ำ", () => {
  assert.deepEqual(ACTIVE_PAYMENT_STATUSES, ["awaiting_payment", "pending_verify"]);
  const wh = fs.readFileSync("src/routes/lineWebhook.js", "utf8");
  const fn = wh.slice(
    wh.indexOf("async function maybeHandleResultStatusQuery"),
    wh.indexOf("async function", wh.indexOf("async function maybeHandleResultStatusQuery") + 10),
  );
  assert.ok(fn.includes("hasActivePaymentForLineUserId"), "ต้องใช้ helper จาก payments store");
  assert.ok(!fn.includes('"pending"'), "ห้ามมีลิสต์สถานะเขียนเองใน webhook");
  assert.ok(!fn.includes('"awaiting_payment"'), "ห้าม hardcode สถานะซ้ำ");
});
