import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminResetScanAbuseState,
  registerScanAbuse,
  registerPaymentAbuse,
  registerTextEvent,
  getAbuseState,
  HARD_BLOCK_THRESHOLD,
  checkScanAbuseStatus,
  checkGlobalAbuseStatus,
  checkPaymentAbuseStatus,
  getHandleEventAbuseGateDiagnostics,
} from "../src/stores/abuseGuard.store.js";

test("adminResetScanAbuseState clears scan spam, lock windows, image windows; keeps payment scores", () => {
  const uid = `adm_quota_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const now = Date.now();
  registerPaymentAbuse(uid, "pay", 5, now);
  registerScanAbuse(uid, "s", 9, now);
  assert.equal(getAbuseState(uid).paymentSpamScore, 5);
  assert.ok(getAbuseState(uid).scanSpamScore >= 9);

  adminResetScanAbuseState(uid, now);

  assert.equal(getAbuseState(uid).scanSpamScore, 0);
  assert.equal(getAbuseState(uid).paymentSpamScore, 5);
  assert.equal(getAbuseState(uid).recentScanTimestamps.length, 0);
  assert.equal(getAbuseState(uid).recentImageTimestamps.length, 0);
});

test("adminResetScanAbuseState clears hard block when only scan score crossed threshold", () => {
  const uid = `adm_hb_scan_${Date.now()}`;
  const now = Date.now();
  registerScanAbuse(uid, "s", HARD_BLOCK_THRESHOLD + 2, now);
  assert.equal(checkGlobalAbuseStatus(uid, now).isHardBlocked, true);
  adminResetScanAbuseState(uid, now);
  assert.equal(checkGlobalAbuseStatus(uid, now).isHardBlocked, false);
});

test("adminResetScanAbuseState does not clear payment-driven hard block", () => {
  const uid = `adm_hb_pay_${Date.now()}`;
  const now = Date.now();
  registerPaymentAbuse(uid, "p", 20, now);
  assert.equal(checkGlobalAbuseStatus(uid, now).isHardBlocked, true);
  adminResetScanAbuseState(uid, now);
  assert.equal(checkGlobalAbuseStatus(uid, now).isHardBlocked, true);
  assert.equal(getAbuseState(uid).paymentSpamScore, 20);
});

test("adminResetScanAbuseState clears scan temp lock (user can pass scan abuse gate again)", () => {
  const uid = `adm_lock_${Date.now()}`;
  const now = Date.now();
  registerScanAbuse(uid, "s", 10, now);
  assert.equal(checkScanAbuseStatus(uid, now).isLocked, true);
  adminResetScanAbuseState(uid, now);
  assert.equal(checkScanAbuseStatus(uid, now).isLocked, false);
  assert.equal(checkScanAbuseStatus(uid, now).scanSpamScore, 0);
});

test("quota-only path (no store call): scan abuse state unchanged — documented baseline", () => {
  const uid = `adm_noop_${Date.now()}`;
  const now = Date.now();
  registerScanAbuse(uid, "s", 12, now);
  const before = getAbuseState(uid).scanSpamScore;
  assert.equal(getAbuseState(uid).scanSpamScore, before);
  assert.ok(before >= 12);
});

test("adminResetScanAbuseState keeps payment temp lock and payment spam", () => {
  const uid = `adm_pay_lock_${Date.now()}`;
  const now = Date.now();
  registerPaymentAbuse(uid, "p", 7, now);
  assert.equal(checkPaymentAbuseStatus(uid, now).isLocked, true);
  registerScanAbuse(uid, "s", 8, now);

  adminResetScanAbuseState(uid, now);

  assert.equal(getAbuseState(uid).paymentSpamScore, 7);
  assert.equal(checkPaymentAbuseStatus(uid, now).isLocked, true);
  assert.equal(getAbuseState(uid).scanSpamScore, 0);
});

test("after combined scan-abuse reset, handleEvent gate is open (no hard block, no scan lock)", () => {
  const uid = `adm_gate_${Date.now()}`;
  const now = Date.now();
  registerScanAbuse(uid, "s", HARD_BLOCK_THRESHOLD + 1, now);
  const d0 = getHandleEventAbuseGateDiagnostics(uid, now);
  assert.equal(d0.isHardBlocked, true);

  adminResetScanAbuseState(uid, now);

  const d1 = getHandleEventAbuseGateDiagnostics(uid, now);
  assert.equal(d1.isHardBlocked, false);
  assert.equal(d1.hardBlockReason, null);
  assert.equal(d1.scanSpamScore, 0);
  assert.equal(checkScanAbuseStatus(uid, now).isLocked, false);
});

test("hard block from text+payment persists after scan reset; gate log explains total_score", () => {
  const uid = `adm_hb_mixed_${Date.now()}`;
  const base = Date.now();
  for (let i = 0; i < 6; i += 1) {
    registerTextEvent(uid, "!!!", base + i);
  }
  registerPaymentAbuse(uid, "p", 10, base);
  assert.equal(checkGlobalAbuseStatus(uid, base).isHardBlocked, true);

  adminResetScanAbuseState(uid, base);

  assert.equal(checkGlobalAbuseStatus(uid, base).isHardBlocked, true);
  const d = getHandleEventAbuseGateDiagnostics(uid, base);
  assert.equal(d.isHardBlocked, true);
  assert.equal(d.hardBlockReason?.code, `total_score_ge_${HARD_BLOCK_THRESHOLD}`);
  assert.equal(d.scanSpamScore, 0);
  assert.ok(d.textSpamScore >= 1);
  assert.equal(d.paymentSpamScore, 10);
});

test("adminResetScanAbuseState returns new scan and lock snapshot fields", () => {
  const uid = `adm_ret_${Date.now()}`;
  const now = Date.now();
  registerScanAbuse(uid, "s", 10, now);
  const r = adminResetScanAbuseState(uid, now);
  assert.equal(r.newScanSpamScore, 0);
  assert.equal(r.newIsHardBlocked, false);
  assert.equal(r.newLockState.scanLocked, false);
  assert.ok(r.previousScanSpamScore >= 10);
});
