import { loadActiveScanOffer } from "../../../services/scanOffer.loader.js";
import { getDefaultPackage, findPackageByKey } from "../../../services/scanOffer.packages.js";

/**
 * Builds a compact JSON-serializable object for the planner (no secrets).
 * For `phase1State` `scan_ready_idle` / `idle`, `p.allowedActions` must be `["noop_phrase_only"]` (see allowedActionsForPhase1State).
 * @param {{
 *   userId: string,
 *   text: string,
 *   phase1State: import('./geminiFront.featureFlags.js').GeminiPhase1StateKey,
 *   conversationOwner: string,
 *   paymentState: string,
 *   flowState: string,
 *   accessState: string,
 *   pendingPaymentStatus: string | null,
 *   selectedPackageKey: string | null,
 *   allowedActions: string[],
 *   conversationHistory?: { role: 'user'|'bot', text: string }[],
 * }} p
 */
export function buildPlannerContextPayload(p) {
  const offer = loadActiveScanOffer();
  const defaultPkg = getDefaultPackage(offer);
  const selectedPkg = p.selectedPackageKey
    ? findPackageByKey(offer, p.selectedPackageKey)
    : null;

  const conversationHistory = Array.isArray(p.conversationHistory)
    ? p.conversationHistory
    : [];

  return {
    v: 1,
    user_id_prefix: String(p.userId || "").slice(0, 8),
    user_text: String(p.text || "").slice(0, 500),
    phase1_state: p.phase1State,
    conversation_history: conversationHistory,
    truth: {
      conversation_owner: p.conversationOwner,
      payment_state: p.paymentState,
      flow_state: p.flowState,
      access_state: p.accessState,
      pending_payment_status: p.pendingPaymentStatus,
      selected_package_key: p.selectedPackageKey,
      offer: {
        default_package_key: defaultPkg?.key ?? null,
        price_thb: defaultPkg?.priceThb ?? offer.paidPriceThb,
        scan_count: defaultPkg?.scanCount ?? offer.paidScanCount,
        window_hours: defaultPkg?.windowHours ?? offer.paidWindowHours,
      },
      selected_package: selectedPkg
        ? {
            key: selectedPkg.key,
            price_thb: selectedPkg.priceThb,
          }
        : null,
    },
    allowed_actions: p.allowedActions,
  };
}
