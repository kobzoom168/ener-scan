/**
 * Call-path depth for audit: non-scan text should go through nonScanReply.gateway
 * when not in scan delivery. Scan paths call scanPathEnter/Exit around outbound.
 */

import { TelemetryEvents, logTelemetryEvent } from "../core/telemetry/telemetryEvents.js";
import { env } from "../config/env.js";

let scanPathDepth = 0;
let gatewayPathDepth = 0;
/** LINE replies with no userId (cannot go through user-scoped gateway). */
let auditExemptDepth = 0;

/** @type {string[]} */
const auditExemptReasonStack = [];

/** @type {Map<string, number>} */
const auditExemptEnterCountsByReason = new Map();

/**
 * Closed set: every `auditExemptEnter` must use one of these (or tests flag new paths).
 * @readonly
 */
export const AuditExemptReason = Object.freeze({
  LINE_WEBHOOK_MISSING_USER_ID: "line_webhook_missing_user_id",
  LINE_WEBHOOK_EVENT_ERROR_NO_USER: "line_webhook_event_error_no_user",
  SCAN_PAYMENT_GATE_NO_USER_ID: "scan_payment_gate_no_user_id",
});

export const ALL_AUDIT_EXEMPT_REASONS = new Set(Object.values(AuditExemptReason));

export function scanPathEnter() {
  scanPathDepth += 1;
}

export function scanPathExit() {
  scanPathDepth = Math.max(0, scanPathDepth - 1);
}

export function gatewayPathEnter() {
  gatewayPathDepth += 1;
}

export function gatewayPathExit() {
  gatewayPathDepth = Math.max(0, gatewayPathDepth - 1);
}

function bumpExemptCount(reason) {
  const n = auditExemptEnterCountsByReason.get(reason) || 0;
  auditExemptEnterCountsByReason.set(reason, n + 1);
}

/**
 * @param {string} reason — must be a {@link AuditExemptReason} value
 */
export function auditExemptEnter(reason) {
  const r = String(reason || "").trim();
  if (!r) {
    const err = "auditExemptEnter_missing_reason";
    console.warn(JSON.stringify({ event: "NONSCAN_AUDIT_EXEMPT_UNREGISTERED_REASON", reason: err }));
    if (env.NONSCAN_AUDIT_EXEMPT_STRICT) throw new Error(err);
    return;
  }
  if (!ALL_AUDIT_EXEMPT_REASONS.has(r)) {
    console.warn(
      JSON.stringify({
        event: "NONSCAN_AUDIT_EXEMPT_UNREGISTERED_REASON",
        reason: r,
        hint: "Add to AuditExemptReason and ALL_AUDIT_EXEMPT_REASONS, update docs/non-scan-outbound-registry.md",
      }),
    );
    if (env.NONSCAN_AUDIT_EXEMPT_STRICT) {
      throw new Error(`unregistered audit exempt reason: ${r}`);
    }
  }
  auditExemptReasonStack.push(r);
  auditExemptDepth += 1;
  bumpExemptCount(r);
  logTelemetryEvent(TelemetryEvents.NONSCAN_AUDIT_EXEMPT, {
    action: "enter",
    reason: r,
    depthAfter: auditExemptDepth,
    enterCountForReason: auditExemptEnterCountsByReason.get(r) ?? 0,
  });
}

export function auditExemptExit() {
  const r = auditExemptReasonStack.pop() || "unknown_exit";
  auditExemptDepth = Math.max(0, auditExemptDepth - 1);
  logTelemetryEvent(TelemetryEvents.NONSCAN_AUDIT_EXEMPT, {
    action: "exit",
    reason: r,
    depthAfter: auditExemptDepth,
  });
}

export function isAuditNonScanBypassSuspect() {
  return (
    auditExemptDepth === 0 &&
    gatewayPathDepth === 0 &&
    scanPathDepth === 0
  );
}

/** @returns {{ scanPathDepth: number, gatewayPathDepth: number, auditExemptDepth: number, auditExemptEnterCounts: Record<string, number> }} */
export function getAuditDepthsForTest() {
  return {
    scanPathDepth,
    gatewayPathDepth,
    auditExemptDepth,
    auditExemptEnterCounts: Object.fromEntries(auditExemptEnterCountsByReason),
  };
}

/** Test helper: reset exempt counters (does not clear live depth stacks). */
export function resetAuditExemptCountsForTest() {
  auditExemptEnterCountsByReason.clear();
}

/**
 * Ensures `auditExemptExit` runs even when `fn` throws.
 * @template T
 * @param {string} reason
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withAuditExempt(reason, fn) {
  auditExemptEnter(reason);
  try {
    return await fn();
  } finally {
    auditExemptExit();
  }
}

/**
 * Ensures `scanPathExit` runs even when `fn` throws.
 * @template T
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withScanPath(fn) {
  scanPathEnter();
  try {
    return await fn();
  } finally {
    scanPathExit();
  }
}

/** Test-only: reset scan depth if a test leaked (does not clear gateway/exempt). */
export function resetScanPathDepthForTest() {
  scanPathDepth = 0;
}

/** Test-only: reset gateway path depth if a test leaked. */
export function resetGatewayPathDepthForTest() {
  gatewayPathDepth = 0;
}

/** Test-only: clear exempt stack + depth (use after forced leak simulation). */
export function resetAuditExemptStackForTest() {
  auditExemptReasonStack.length = 0;
  auditExemptDepth = 0;
}
