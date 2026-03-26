import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_AUDIT_EXEMPT_REASONS,
  AuditExemptReason,
  auditExemptEnter,
  auditExemptExit,
  getAuditDepthsForTest,
  resetAuditExemptCountsForTest,
  resetAuditExemptStackForTest,
  resetGatewayPathDepthForTest,
  resetScanPathDepthForTest,
  scanPathEnter,
  scanPathExit,
  withAuditExempt,
  withScanPath,
} from "../src/services/lineReplyAudit.context.js";

test("AuditExemptReason set is closed and enumerable", () => {
  const vals = Object.values(AuditExemptReason);
  assert.ok(vals.length >= 3);
  for (const v of vals) {
    assert.ok(ALL_AUDIT_EXEMPT_REASONS.has(v), v);
  }
  assert.equal(ALL_AUDIT_EXEMPT_REASONS.size, vals.length);
});

test("audit exempt enter/exit increments per-reason counts and emits depth", () => {
  resetAuditExemptCountsForTest();
  auditExemptEnter(AuditExemptReason.LINE_WEBHOOK_MISSING_USER_ID);
  auditExemptEnter(AuditExemptReason.SCAN_PAYMENT_GATE_NO_USER_ID);
  let d = getAuditDepthsForTest();
  assert.equal(d.auditExemptDepth, 2);
  assert.equal(d.auditExemptEnterCounts[AuditExemptReason.LINE_WEBHOOK_MISSING_USER_ID], 1);
  assert.equal(d.auditExemptEnterCounts[AuditExemptReason.SCAN_PAYMENT_GATE_NO_USER_ID], 1);
  auditExemptExit();
  auditExemptExit();
  d = getAuditDepthsForTest();
  assert.equal(d.auditExemptDepth, 0);
  resetAuditExemptCountsForTest();
});

test("nested audit exempt stack unwinds LIFO", () => {
  resetAuditExemptStackForTest();
  resetAuditExemptCountsForTest();
  auditExemptEnter(AuditExemptReason.LINE_WEBHOOK_MISSING_USER_ID);
  auditExemptEnter(AuditExemptReason.SCAN_PAYMENT_GATE_NO_USER_ID);
  let d = getAuditDepthsForTest();
  assert.equal(d.auditExemptDepth, 2);
  auditExemptExit();
  d = getAuditDepthsForTest();
  assert.equal(d.auditExemptDepth, 1);
  auditExemptExit();
  assert.equal(getAuditDepthsForTest().auditExemptDepth, 0);
});

test("withAuditExempt exits on thrown error", async () => {
  resetAuditExemptStackForTest();
  await assert.rejects(
    async () =>
      withAuditExempt(AuditExemptReason.LINE_WEBHOOK_EVENT_ERROR_NO_USER, async () => {
        throw new Error("boom");
      }),
    /boom/,
  );
  assert.equal(getAuditDepthsForTest().auditExemptDepth, 0);
});

test("scanPathEnter/Exit balances and withScanPath clears on throw", async () => {
  resetScanPathDepthForTest();
  scanPathEnter();
  scanPathEnter();
  assert.equal(getAuditDepthsForTest().scanPathDepth, 2);
  scanPathExit();
  scanPathExit();
  assert.equal(getAuditDepthsForTest().scanPathDepth, 0);

  await assert.rejects(
    async () =>
      withScanPath(async () => {
        throw new Error("scan-boom");
      }),
    /scan-boom/,
  );
  assert.equal(getAuditDepthsForTest().scanPathDepth, 0);
  resetGatewayPathDepthForTest();
});
