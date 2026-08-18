/**
 * Paywall defer resolver (Codex รอบ 2): delivery evidence นำ เวลาเป็น safety bound
 * — behavior tests ทุกกิ่ง ไม่ใช่ source invariant อย่างเดียว
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePaywallDeferDecision,
  PAYWALL_DEFER_SAFETY_BOUND_MS,
  PAYWALL_DEFER_TEXT,
} from "../src/services/lineWebhook/paywallDefer.util.js";

test("pending ทุกสถานะ → defer · delivered → paywall", () => {
  for (const status of ["queued", "processing", "claimed", "completed", "delivery_queued"]) {
    const r = resolvePaywallDeferDecision({ inFlightActive: false, job: { status, ageMs: 60000 } });
    assert.equal(r.decision, "defer", status);
  }
  assert.equal(
    resolvePaywallDeferDecision({ inFlightActive: false, job: { status: "delivered", ageMs: 60000 } }).decision,
    "paywall",
  );
});

test("in-flight active → defer แม้ DB error", () => {
  assert.equal(resolvePaywallDeferDecision({ inFlightActive: true, job: null }).decision, "defer");
  assert.equal(resolvePaywallDeferDecision({ inFlightActive: true, job: null, dbError: true }).decision, "defer");
});

test("DB error และไม่มี evidence → fail-open paywall ตามเดิม", () => {
  const r = resolvePaywallDeferDecision({ inFlightActive: false, job: null, dbError: true });
  assert.equal(r.decision, "paywall");
  assert.equal(r.reason, "db_error_no_evidence");
  assert.equal(resolvePaywallDeferDecision({ inFlightActive: false, job: null }).decision, "paywall");
});

test("policy งานค้างเกิน safety bound (30 นาที) → ไม่บล็อกขายต่อ", () => {
  const over = resolvePaywallDeferDecision({
    inFlightActive: false,
    job: { status: "queued", ageMs: PAYWALL_DEFER_SAFETY_BOUND_MS + 1 },
  });
  assert.equal(over.decision, "paywall");
  assert.equal(over.reason, "stale_pending_over_bound");
  const within = resolvePaywallDeferDecision({
    inFlightActive: false,
    job: { status: "queued", ageMs: PAYWALL_DEFER_SAFETY_BOUND_MS - 1 },
  });
  assert.equal(within.decision, "defer");
});

test("failed/cancelled/unknown → paywall (ไม่มีผลจะถึงมืออยู่แล้ว)", () => {
  for (const status of ["failed", "cancelled", "weird_status", ""]) {
    assert.equal(
      resolvePaywallDeferDecision({ inFlightActive: false, job: { status, ageMs: 1000 } }).decision,
      "paywall",
      status,
    );
  }
});

test("copy: ไม่อ้างว่ากำลังอ่าน ไม่มีคำสัญญาเวลา ไม่มีเรื่องเงิน", () => {
  assert.doesNotMatch(PAYWALL_DEFER_TEXT, /กำลังอ่าน|เดี๋ยว|นาที/);
  assert.doesNotMatch(PAYWALL_DEFER_TEXT, /บาท|จ่าย|ค่าครู|แพ็ก/);
  assert.match(PAYWALL_DEFER_TEXT, /รับรูปชิ้นนี้ไว้แล้ว/);
});
