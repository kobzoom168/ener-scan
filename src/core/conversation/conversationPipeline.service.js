import { env } from "../../config/env.js";
import { allowedFactsFromPaymentTruth } from "../payments/paymentTruth.service.js";
import { legacyReplyTypeToPhaseA } from "./phaseALegacyReplyBridge.js";
import { buildReplyContract } from "./replyContractBuilder.js";
import { buildLLMSurfaceInput } from "./conversationContextBuilder.js";
import { rephraseWithConversationModel } from "./conversationSurface.service.js";
import { validateConversationOutput } from "./conversationOutputValidator.js";
import { TelemetryEvents, logTelemetryEvent } from "../telemetry/telemetryEvents.js";

/** @param {"full"|"short"|"micro"|string} tier */
export function tierStringToGuidanceNumeric(tier) {
  if (tier === "short") return 2;
  if (tier === "micro") return 3;
  return 1;
}

/**
 * @param {NonNullable<ReturnType<typeof legacyReplyTypeToPhaseA>>} bridge
 * @param {Parameters<typeof allowedFactsFromPaymentTruth>[0]} paymentTruth
 */
export function buildAllowedFactsForBridge(bridge, paymentTruth) {
  if (!bridge) return [];
  const st = bridge.stateOwner;
  if (st === "waiting_birthdate") {
    return [];
  }
  return allowedFactsFromPaymentTruth({
    priceThb: paymentTruth.priceThb,
    currency: paymentTruth.currency,
    paymentRef: paymentTruth.paymentRef,
    packageLabel: paymentTruth.packageLabel,
    paymentStatusVerbal: paymentTruth.paymentStatusVerbal || "none",
  });
}

/**
 * @typedef {object} PhaseAConvSurfaceInput
 * @property {string} userId
 * @property {string} legacyReplyType
 * @property {string} lastUserText
 * @property {string} deterministicPrimary
 * @property {string[]} [deterministicAlternates]
 * @property {"full"|"short"|"micro"|string} [tierString]
 * @property {Parameters<typeof allowedFactsFromPaymentTruth>[0]} [paymentTruth]
 */

/**
 * @param {PhaseAConvSurfaceInput} input
 */
export async function preparePhaseAHumanizedSendTexts(input) {
  if (!env.CONV_AI_ENABLED) {
    logTelemetryEvent(TelemetryEvents.CONV_AI_SKIPPED, {
      userId: input.userId,
      legacyReplyType: input.legacyReplyType,
      reason: "conv_ai_disabled",
    });
    return { ok: false, reason: "conv_ai_disabled" };
  }

  const primary = String(input.deterministicPrimary || "").trim();
  if (!primary) {
    return { ok: false, reason: "empty_deterministic" };
  }
  if ((primary.match(/\n/g) || []).length > 4) {
    logTelemetryEvent(TelemetryEvents.CONV_AI_SKIPPED, {
      userId: input.userId,
      legacyReplyType: input.legacyReplyType,
      reason: "multi_line_skip",
    });
    return { ok: false, reason: "multi_line_skip" };
  }

  const bridge = legacyReplyTypeToPhaseA(input.legacyReplyType);
  if (!bridge) {
    logTelemetryEvent(TelemetryEvents.CONV_AI_SKIPPED, {
      userId: input.userId,
      legacyReplyType: input.legacyReplyType,
      reason: "not_phase_a_legacy_type",
    });
    return { ok: false, reason: "not_phase_a_legacy_type" };
  }

  const guidanceTier = tierStringToGuidanceNumeric(input.tierString || "full");
  const paymentTruth = input.paymentTruth || {};
  if (
    bridge.stateOwner === "paywall_selecting_package" ||
    bridge.stateOwner === "payment_package_selected"
  ) {
    const hasPrice =
      paymentTruth.priceThb != null &&
      Number.isFinite(Number(paymentTruth.priceThb));
    if (!hasPrice) {
      logTelemetryEvent(TelemetryEvents.CONV_AI_SKIPPED, {
        userId: input.userId,
        reason: "missing_price_truth_paywall_or_package_selected",
      });
      return { ok: false, reason: "missing_price_truth_paywall_or_package_selected" };
    }
  }
  const allowedFacts = buildAllowedFactsForBridge(bridge, paymentTruth);
  const contract = buildReplyContract({
    stateOwner: bridge.stateOwner,
    replyType: bridge.phaseReplyType,
    allowedFacts,
    nextStep: bridge.nextStep,
    guidanceTier,
    microIntent: bridge.microIntent,
  });

  if (!contract.llmEnabled) {
    return { ok: false, reason: "state_not_llm_enabled" };
  }

  logTelemetryEvent(TelemetryEvents.CONV_AI_REQUESTED, {
    userId: input.userId,
    stateOwner: contract.stateOwner,
    replyType: contract.replyType,
    microIntent: contract.microIntent,
    legacyReplyType: input.legacyReplyType,
  });

  let modelUsed = null;
  let llmText = "";
  try {
    const surfaceInput = buildLLMSurfaceInput(
      contract,
      primary,
      input.lastUserText || "",
    );
    const out = await rephraseWithConversationModel(surfaceInput);
    llmText = out.text;
    modelUsed = out.model;
  } catch (err) {
    logTelemetryEvent(TelemetryEvents.CONV_AI_FALLBACK, {
      userId: input.userId,
      stateOwner: contract.stateOwner,
      replyType: contract.replyType,
      fallbackReason: err?.message || "conv_ai_error",
    });
    return { ok: false, reason: err?.message || "conv_ai_error" };
  }

  const v = validateConversationOutput(llmText, contract, primary);
  if (!v.valid) {
    logTelemetryEvent(TelemetryEvents.CONV_AI_REJECTED, {
      userId: input.userId,
      stateOwner: contract.stateOwner,
      replyType: contract.replyType,
      violations: v.violations,
      fallbackReason: v.fallbackReason,
      modelUsed,
    });
    return { ok: false, reason: v.fallbackReason || "validation_failed" };
  }

  logTelemetryEvent(TelemetryEvents.CONV_AI_VALIDATED, {
    userId: input.userId,
    stateOwner: contract.stateOwner,
    replyType: contract.replyType,
    modelUsed,
  });

  logTelemetryEvent(TelemetryEvents.CONV_COST, {
    userId: input.userId,
    layer: "conv_ai_surface",
    modelUsed,
    approxOutChars: String(v.sanitizedText || "").length,
  });

  return {
    ok: true,
    primaryText: v.sanitizedText || "",
    usedAi: true,
    modelUsed,
  };
}
