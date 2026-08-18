/**
 * Paywall defer resolver (Codex รอบ 3): invariant "ต้องได้รับคุณค่าก่อนขาย"
 * outcome 3 ทาง defer|paywall|recovery — behavior tests ทุกกิ่ง
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePaywallDeferDecision,
  PAYWALL_DEFER_SAFETY_BOUND_MS,
  PAYWALL_DEFER_TEXT,
  PAYWALL_RECOVERY_TEXT,
} from "../src/services/lineWebhook/paywallDefer.util.js";

test("pending ทุกสถานะภายใน bound → defer (ไม่ว่าลูกค้าใหม่/เก่า) · delivered → paywall", () => {
  for (const status of ["queued", "processing", "claimed", "completed", "delivery_queued"]) {
    for (const hasVal of [true, false]) {
      const r = resolvePaywallDeferDecision({
        inFlightActive: false,
        job: { status, ageMs: 60000 },
        hasAnyDeliveredReport: hasVal,
      });
      assert.equal(r.decision, "defer", `${status} hasVal=${hasVal}`);
    }
  }
  assert.equal(
    resolvePaywallDeferDecision({ inFlightActive: false, job: { status: "delivered", ageMs: 60000 } }).decision,
    "paywall",
  );
});

test("ลูกค้าใหม่ (ไม่เคยได้ผล) + queued เกิน 30 นาที → recovery ไม่ใช่ paywall", () => {
  const r = resolvePaywallDeferDecision({
    inFlightActive: false,
    job: { status: "queued", ageMs: PAYWALL_DEFER_SAFETY_BOUND_MS + 1 },
    hasAnyDeliveredReport: false,
  });
  assert.equal(r.decision, "recovery");
  assert.equal(r.reason, "stale_pending_no_value");
});

test("ลูกค้าใหม่ + failed/cancelled → recovery ห้ามขาย", () => {
  for (const status of ["failed", "cancelled", "weird_status", ""]) {
    const r = resolvePaywallDeferDecision({
      inFlightActive: false,
      job: { status, ageMs: 1000 },
      hasAnyDeliveredReport: false,
    });
    assert.equal(r.decision, "recovery", status);
  }
});

test("ลูกค้าเก่า (เคย delivered แล้ว) + stale/failed/cancelled → paywall policy ปกติ", () => {
  assert.equal(
    resolvePaywallDeferDecision({
      inFlightActive: false,
      job: { status: "queued", ageMs: PAYWALL_DEFER_SAFETY_BOUND_MS + 1 },
      hasAnyDeliveredReport: true,
    }).decision,
    "paywall",
  );
  for (const status of ["failed", "cancelled"]) {
    assert.equal(
      resolvePaywallDeferDecision({
        inFlightActive: false,
        job: { status, ageMs: 1000 },
        hasAnyDeliveredReport: true,
      }).decision,
      "paywall",
      status,
    );
  }
});

test("ageMs invalid (NaN/ติดลบ/missing) → outcome ชัดเจน ไม่ defer ค้าง + reason invalid_job_age", () => {
  for (const ageMs of [NaN, -5000, undefined]) {
    const newCust = resolvePaywallDeferDecision({
      inFlightActive: false,
      job: { status: "queued", ageMs },
      hasAnyDeliveredReport: false,
    });
    assert.equal(newCust.decision, "recovery", String(ageMs));
    assert.equal(newCust.reason, "invalid_job_age");
    const oldCust = resolvePaywallDeferDecision({
      inFlightActive: false,
      job: { status: "queued", ageMs },
      hasAnyDeliveredReport: true,
    });
    assert.equal(oldCust.decision, "paywall", String(ageMs));
    assert.equal(oldCust.reason, "invalid_job_age");
  }
});

test("in-flight → defer เสมอ · dbError/ไม่มี job → fail-open paywall", () => {
  assert.equal(resolvePaywallDeferDecision({ inFlightActive: true, job: null }).decision, "defer");
  assert.equal(
    resolvePaywallDeferDecision({ inFlightActive: false, job: null, dbError: true }).decision,
    "paywall",
  );
  assert.equal(resolvePaywallDeferDecision({ inFlightActive: false, job: null }).decision, "paywall");
});

test("copy: defer/recovery ไม่มีเงิน-ราคา ไม่สัญญาว่าผลจะมาเอง", () => {
  for (const txt of [PAYWALL_DEFER_TEXT, PAYWALL_RECOVERY_TEXT]) {
    assert.doesNotMatch(txt, /บาท|จ่าย|ค่าครู|แพ็ก/);
    assert.doesNotMatch(txt, /เดี๋ยวผล|ผลจะมา|กำลังอ่าน|ไม่เกิน\s*\d/);
  }
  assert.match(PAYWALL_RECOVERY_TEXT, /อ่านไม่สำเร็จ/);
  assert.match(PAYWALL_RECOVERY_TEXT, /ส่งรูปชิ้นเดิมมาอีกครั้ง/);
});
