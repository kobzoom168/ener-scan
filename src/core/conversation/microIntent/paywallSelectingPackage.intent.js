import { loadActiveScanOffer } from "../../../services/scanOffer.loader.js";
import {
  parsePackageSelectionFromText,
  isSingleOfferPriceToken,
} from "../../../services/scanOffer.packages.js";
import {
  isGenericAckText,
  isUnclearNoiseText,
  isPackageSelectedHesitation,
  isPackageChangeIntentPhrase,
} from "../../../utils/stateMicroIntent.util.js";
import { isPaymentCommand } from "../../../utils/webhookText.util.js";
import { looksLikeBirthdateInput } from "../../../utils/birthdateParse.util.js";

/**
 * @param {string} text
 * @param {{ lowerText?: string }} opts
 * @returns {import("../contracts.types.js").MicroIntentResult}
 */
export function resolvePaywallSelectingPackageMicroIntent(text, opts = {}) {
  const t = String(text || "").trim();
  const lowerText = String(opts.lowerText || t.toLowerCase()).trim();
  const offer = loadActiveScanOffer();

  if (
    isSingleOfferPriceToken(t, offer) ||
    parsePackageSelectionFromText(t, offer, {
      thaiRelativeAliases: true,
      allowEoaPricePhrase: true,
    })
  ) {
    return {
      microIntent: "choose_49",
      confidence: "high",
      safeToConsume: true,
      reason: "single_offer_price_or_package_token",
    };
  }

  if (isPaymentCommand(t, lowerText)) {
    return {
      microIntent: "pay_too_early",
      confidence: "high",
      safeToConsume: true,
      reason: "pay_intent_before_ack",
    };
  }

  if (looksLikeBirthdateInput(t)) {
    return {
      microIntent: "wrong_state_date",
      confidence: "high",
      safeToConsume: true,
      reason: "date_like_while_paywall",
    };
  }

  if (isPackageSelectedHesitation(t)) {
    return {
      microIntent: "hesitation",
      confidence: "high",
      safeToConsume: true,
      reason: "hesitation_phrase",
    };
  }

  if (isPackageChangeIntentPhrase(t)) {
    return {
      microIntent: "hesitation",
      confidence: "medium",
      safeToConsume: true,
      reason: "package_change_unavailable",
    };
  }

  if (isGenericAckText(t)) {
    return {
      microIntent: "generic_ack",
      confidence: "high",
      safeToConsume: true,
      reason: "ack",
    };
  }

  if (isUnclearNoiseText(t)) {
    return {
      microIntent: "unclear_noise",
      confidence: "medium",
      safeToConsume: true,
      reason: "noise",
    };
  }

  return {
    microIntent: "unclear_noise",
    confidence: "low",
    safeToConsume: true,
    reason: "default_unclear",
  };
}
