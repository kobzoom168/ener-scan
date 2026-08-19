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

/* ---------------- Codex รอบ 7: อายุ pending_verify vs awaiting_payment ---------------- */

import { hasActivePaymentForLineUserId } from "../src/stores/payments.db.js";

function fakePayments(rows) {
  // rows: [{status, ageMs}] — จำลอง PostgREST chain แบบ eq/gte
  return {
    from: () => {
      const q = { _status: null, _minCreated: null };
      const api = {
        select: () => api,
        eq: (col, val) => { if (col === "status") q._status = val; return api; },
        gte: (_col, iso) => { q._minCreated = Date.parse(iso); return api; },
        limit: () => api,
        maybeSingle: async () => {
          const hit = rows.find((r) => {
            if (r.status !== q._status) return false;
            if (q._minCreated == null) return true;
            return Date.now() - r.ageMs >= q._minCreated;
          });
          return { data: hit ? { id: 1, status: hit.status } : null, error: null };
        },
      };
      return api;
    },
  };
}

test("pending_verify อายุ 25 ชม. ยัง active (ไม่ auto-expire) → 'รอนานแล้ว' เป็นเรื่องเงิน", async () => {
  const db = fakePayments([{ status: "pending_verify", ageMs: 25 * 3600 * 1000 }]);
  const ev = await hasActivePaymentForLineUserId("U1", { dbClient: db });
  assert.deepEqual({ ok: ev.ok, active: ev.active }, { ok: true, active: true });
  const r = await resolveResultStatusRouting({ text: "รอนานแล้วครับ", getPaymentEvidence: async () => ev });
  assert.equal(r.handle, false);
  assert.equal(r.reason, "pending_payment");
});

test("awaiting_payment ภายใน 24 ชม. = active · เกิน 24 ชม. = หมดอายุ (ไม่ใช่ active)", async () => {
  const fresh = await hasActivePaymentForLineUserId("U1", {
    dbClient: fakePayments([{ status: "awaiting_payment", ageMs: 2 * 3600 * 1000 }]),
  });
  assert.equal(fresh.active, true);
  const stale = await hasActivePaymentForLineUserId("U1", {
    dbClient: fakePayments([{ status: "awaiting_payment", ageMs: 30 * 3600 * 1000 }]),
  });
  assert.equal(stale.ok, true);
  assert.equal(stale.active, false, "awaiting_payment เกิน TTL ต้องไม่ถือว่ายังค้าง");
  // ไม่มีเงินค้างแล้ว → scan status รับได้
  const r = await resolveResultStatusRouting({ text: "รอนานแล้วครับ", getPaymentEvidence: async () => stale });
  assert.equal(r.handle, true);
});

test("payments อ่านไม่ได้ ({error}) → ok:false และ routing fail-closed", async () => {
  const errDb = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: { message: "down" } }) }) }) }) }) }) };
  const ev = await hasActivePaymentForLineUserId("U1", { dbClient: errDb });
  assert.equal(ev.ok, false);
  const r = await resolveResultStatusRouting({ text: "รอนานแล้วครับ", getPaymentEvidence: async () => ev });
  assert.equal(r.handle, false);
  assert.equal(r.reason, "payment_evidence_unavailable");
});

test("ไม่มี payment เลย → active:false และ scan status รับได้", async () => {
  const ev = await hasActivePaymentForLineUserId("U1", { dbClient: fakePayments([]) });
  assert.deepEqual({ ok: ev.ok, active: ev.active }, { ok: true, active: false });
  const r = await resolveResultStatusRouting({ text: "รอนานแล้วครับ", getPaymentEvidence: async () => ev });
  assert.equal(r.handle, true);
});
