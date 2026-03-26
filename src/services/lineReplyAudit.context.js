/**
 * Call-path depth for audit: non-scan text should go through nonScanReply.gateway
 * when not in scan delivery. Scan paths call scanPathEnter/Exit around outbound.
 */

let scanPathDepth = 0;
let gatewayPathDepth = 0;
/** LINE replies with no userId (cannot go through user-scoped gateway). */
let auditExemptDepth = 0;

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

export function auditExemptEnter() {
  auditExemptDepth += 1;
}

export function auditExemptExit() {
  auditExemptDepth = Math.max(0, auditExemptDepth - 1);
}

export function isAuditNonScanBypassSuspect() {
  return (
    auditExemptDepth === 0 &&
    gatewayPathDepth === 0 &&
    scanPathDepth === 0
  );
}

export function getAuditDepthsForTest() {
  return { scanPathDepth, gatewayPathDepth };
}
