/**
 * Payment wording helpers only — no DB reads, no entitlement decisions.
 * Deterministic phrases for reuse by {@link ../conversation/deterministicFallbacks.js}.
 */

/** @param {string} ref */
export function slipResendHintTh(ref) {
  const r = String(ref || "").trim();
  return r ? `อ้างอิง ${r}` : "";
}
