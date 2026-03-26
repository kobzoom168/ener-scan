/**
 * Canonical deterministic micro-intent resolution per Phase A state owner.
 * Used for telemetry + replyTypeResolver; transactional routing stays in lineWebhook.
 */

import { getSelectedPaymentPackageKey } from "../../stores/session.store.js";
import { resolveWaitingBirthdateMicroIntent } from "./microIntent/waitingBirthdate.intent.js";
import { resolvePaywallSelectingPackageMicroIntent } from "./microIntent/paywallSelectingPackage.intent.js";
import { resolvePaymentPackageSelectedMicroIntent } from "./microIntent/paymentPackageSelected.intent.js";
import { resolveAwaitingSlipMicroIntent } from "./microIntent/awaitingSlip.intent.js";
import { resolvePendingVerifyMicroIntent } from "./microIntent/pendingVerify.intent.js";

/**
 * Map webhook payment / session context to canonical `StateOwner` for micro-intent families.
 *
 * @param {object} ctx
 * @param {string} ctx.paymentState
 * @param {string} [ctx.paymentMemoryState]
 * @param {string} ctx.userId
 * @returns {import("./contracts.types.js").StateOwner | null}
 */
export function mapWebhookContextToStateOwner(ctx) {
  const paymentState = String(ctx.paymentState || "");
  const mem = String(ctx.paymentMemoryState || "");
  const userId = String(ctx.userId || "");

  if (paymentState === "pending_verify") return "pending_verify";
  if (paymentState === "awaiting_slip" || mem === "awaiting_slip") {
    return "awaiting_slip";
  }
  if (paymentState === "paywall_offer_single") {
    return getSelectedPaymentPackageKey(userId)
      ? "payment_package_selected"
      : "paywall_selecting_package";
  }
  return null;
}

/**
 * @param {import("./contracts.types.js").StateOwner} stateOwner
 * @param {string} text
 * @param {{ lowerText?: string }} [opts]
 * @returns {import("./contracts.types.js").MicroIntentResult}
 */
export function resolveStateMicroIntent(stateOwner, text, opts = {}) {
  switch (stateOwner) {
    case "waiting_birthdate":
      return resolveWaitingBirthdateMicroIntent(text, opts);
    case "paywall_selecting_package":
      return resolvePaywallSelectingPackageMicroIntent(text, opts);
    case "payment_package_selected":
      return resolvePaymentPackageSelectedMicroIntent(text, opts);
    case "awaiting_slip":
      return resolveAwaitingSlipMicroIntent(text, opts);
    case "pending_verify":
      return resolvePendingVerifyMicroIntent(text, opts);
    default:
      return {
        microIntent: "unknown",
        confidence: "low",
        safeToConsume: false,
        reason: "unsupported_state_owner",
      };
  }
}
