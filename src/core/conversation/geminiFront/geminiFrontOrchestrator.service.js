import { getGeminiFrontMode } from "./geminiFront.featureFlags.js";
import { buildPlannerContextPayload } from "./geminiPlannerContext.builder.js";
import { runGeminiPlanner } from "./geminiPlanner.service.js";
import {
  validateProposedAction,
  allowedActionsForPhase1State,
} from "./geminiActionValidator.js";
import { executeConversationAction } from "../../actions/conversationActions.js";
import {
  buildAllowedFactsForPhrasing,
  buildNextStepHint,
} from "./geminiPhrasingContext.builder.js";
import { runGeminiPhrasing } from "./geminiPhrasing.service.js";
import { logGeminiOrchestrator } from "./geminiFront.telemetry.js";
import { getGeminiConversationHistory } from "../../../utils/conversationHistory.util.js";

/**
 * @param {{
 *   userId: string,
 *   text: string,
 *   lowerText?: string,
 *   phase1State: import('./geminiFront.featureFlags.js').GeminiPhase1StateKey,
 *   conversationOwner: string,
 *   paymentState: string,
 *   flowState: string,
 *   accessState: string,
 *   pendingPaymentStatus: string | null,
 *   selectedPackageKey: string | null,
 *   noProgressStreak?: number,
 *   sendGatewayReply: (o: {
 *     replyType: string,
 *     semanticKey: string,
 *     text: string,
 *     alternateTexts?: string[],
 *   }) => Promise<void>,
 *   delegates: import('../../actions/conversationAction.types.js').GeminiFrontDelegates,
 * }} ctx
 * @returns {Promise<{ handled: boolean, mode?: string, reason?: string }>}
 */
export async function runGeminiFrontOrchestrator(ctx) {
  const mode = getGeminiFrontMode();
  if (mode === "off") {
    return { handled: false, reason: "flag_off", mode: "off" };
  }

  const phase1 = ctx.phase1State;
  if (!phase1) {
    return { handled: false, reason: "not_phase1" };
  }

  const allowedActions = allowedActionsForPhase1State(phase1);
  const conversationHistory = await getGeminiConversationHistory(ctx.userId, 8, 2000);
  const plannerPayload = buildPlannerContextPayload({
    userId: ctx.userId,
    text: ctx.text,
    phase1State: phase1,
    conversationOwner: ctx.conversationOwner,
    paymentState: ctx.paymentState,
    flowState: ctx.flowState,
    accessState: ctx.accessState,
    pendingPaymentStatus: ctx.pendingPaymentStatus,
    selectedPackageKey: ctx.selectedPackageKey,
    allowedActions,
    conversationHistory,
    noProgressStreak: ctx.noProgressStreak,
  });
  const plannerJson = JSON.stringify(plannerPayload);

  /** Shadow telemetry runs in `invokePhase1GeminiShadow` (webhook); no planner call here. */
  if (mode === "shadow") {
    return { handled: false, mode: "shadow", reason: "shadow_webhook" };
  }

  const plan = await runGeminiPlanner(plannerJson);
  if (!plan) {
    logGeminiOrchestrator({ mode: "active", reason: "planner_null" });
    return { handled: false, reason: "planner_null", mode: "active" };
  }

  const v = validateProposedAction({
    phase1State: phase1,
    proposed_action: plan.proposed_action,
    confidence: plan.confidence,
  });

  const resolved = v.resolved_action;
  const toolFirst = await executeConversationAction({
    resolvedAction: resolved,
    delegates: ctx.delegates,
  });
  if (toolFirst.handled) {
    logGeminiOrchestrator({
      mode: "active",
      handled: true,
      via: "tool",
      resolved,
    });
    return { handled: true, mode: "active" };
  }

  if (resolved === "send_help_reply") {
    const ph = await runGeminiPhrasing({
      allowedFacts: buildAllowedFactsForPhrasing({
        phase1State: phase1,
        planner: plan,
        payload: plannerPayload,
        validationDenyReason: v.deny_reason,
      }),
      nextStep: "ตอบคำถามช่วยเหลือสั้นๆ เป็นภาษาไทย ไม่สมมติสถานะการชำระเงิน",
      replyStyle: plan.reply_style,
      userText: ctx.text,
    });
    if (ph) {
      await ctx.sendGatewayReply({
        replyType: "gemini_front_help",
        semanticKey: `gemini_front_help:${phase1}`,
        text: ph.slice(0, 1200),
        alternateTexts: [],
      });
      logGeminiOrchestrator({ mode: "active", handled: true, via: "help_phrase" });
      return { handled: true, mode: "active" };
    }
  }

  const shouldPhrase =
    resolved === "noop_phrase_only" ||
    Boolean(v.deny_reason) ||
    resolved === "get_conversation_context" ||
    resolved === "handoff_to_scan";

  if (!shouldPhrase) {
    logGeminiOrchestrator({
      mode: "active",
      handled: false,
      reason: "unhandled_or_no_delegate",
      resolved,
    });
    return { handled: false, reason: "delegate_unimplemented", mode: "active" };
  }

  const ph = await runGeminiPhrasing({
    allowedFacts: buildAllowedFactsForPhrasing({
      phase1State: phase1,
      planner: plan,
      payload: plannerPayload,
      validationDenyReason: v.deny_reason,
    }),
    nextStep: buildNextStepHint(phase1, v.deny_reason),
    replyStyle: plan.reply_style,
    userText: ctx.text,
    conversationHistory,
  });

  if (!ph) {
    return { handled: false, reason: "phrasing_null", mode: "active" };
  }

  await ctx.sendGatewayReply({
    replyType: "gemini_front_reply",
    semanticKey: `gemini_front:${phase1}`,
    text: ph.slice(0, 1200),
    alternateTexts: [],
  });
  logGeminiOrchestrator({ mode: "active", handled: true, via: "noop_phrase" });
  return { handled: true, mode: "active" };
}
