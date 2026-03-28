import { env } from "../../../config/env.js";

/** @typedef {'off' | 'shadow' | 'active'} GeminiFrontMode */

/**
 * @returns {GeminiFrontMode}
 */
export function getGeminiFrontMode() {
  if (!env.GEMINI_FRONT_ORCHESTRATOR_ENABLED) return "off";
  const m = String(env.GEMINI_FRONT_ORCHESTRATOR_MODE || "off")
    .trim()
    .toLowerCase();
  if (m === "shadow" || m === "active") return m;
  return "off";
}

/**
 * Phase-1 state keys for Gemini-first routing (must match planner contract).
 * @typedef {'waiting_birthdate' | 'paywall_selecting_package' | 'payment_package_selected' | 'awaiting_slip' | 'pending_verify' | 'scan_ready_idle' | 'hard_blocked' | 'soft_locked' | 'idle' | null} GeminiPhase1StateKey
 */

/**
 * @param {{
 *   session: { pendingImage?: unknown },
 *   paymentState: string,
 *   flowState: string,
 *   hasPendingVerify: boolean,
 *   hasAwaitingSlip: boolean,
 *   paymentMemoryState: string,
 *   selectedPackageKey: string | null,
 *   canonicalStateOwner?: string | null,
 * }} s
 * When `GEMINI_FRONT_PHASE1_ONLY` is off, returns `null` (deterministic routing only).
 * When on, always returns a non-null key; final fallback is `"idle"`.
 *
 * @returns {GeminiPhase1StateKey}
 */
export function resolveGeminiPhase1StateKey(s) {
  if (!env.GEMINI_FRONT_PHASE1_ONLY) return null;

  if (s.hasPendingVerify) return "pending_verify";
  if (s.hasAwaitingSlip || s.paymentMemoryState === "awaiting_slip") {
    return "awaiting_slip";
  }
  if (s.paymentState === "paywall_offer_single") {
    if (s.selectedPackageKey) return "payment_package_selected";
    return "paywall_selecting_package";
  }
  if (s.flowState === "waiting_birthdate" && s.paymentState === "none") {
    return "waiting_birthdate";
  }
  if (s.canonicalStateOwner === "hard_blocked") {
    return "hard_blocked";
  }
  if (s.canonicalStateOwner === "soft_locked") {
    return "soft_locked";
  }
  if (s.canonicalStateOwner === "paid_active_scan_ready") {
    return "scan_ready_idle";
  }
  return "idle";
}
