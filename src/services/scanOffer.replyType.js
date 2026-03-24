/**
 * Reply types for scan-offer copy + non-scan gateway (PR2).
 * @readonly
 */
export const SCAN_OFFER_REPLY_TYPES = Object.freeze([
  "free_quota_exhausted",
  "free_quota_low",
  "paid_quota_exhausted",
  "offer_intro",
  "approved_intro",
]);

/**
 * Map access scenario + gate to a template pool key.
 *
 * @param {import("./scanOfferAccess.resolver.js").ScanOfferAccessContext} accessContext
 * @param {{ allowed: boolean, reason: string }} gate
 * @returns {string|null} template key; null = no scan-offer bubble for this state
 */
export function chooseScanOfferReplyType(accessContext, gate) {
  const scenario = accessContext?.scenario;
  const allowed = Boolean(gate?.allowed);
  const reason = String(gate?.reason || "");

  if (allowed) {
    if (scenario === "free_quota_low") return "free_quota_low";
    return null;
  }

  if (reason === "payment_required") {
    if (scenario === "free_quota_exhausted") return "free_quota_exhausted";
    if (scenario === "paid_quota_exhausted") return "paid_quota_exhausted";
    return "free_quota_exhausted";
  }

  return null;
}
