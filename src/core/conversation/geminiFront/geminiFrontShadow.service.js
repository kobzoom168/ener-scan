import { env } from "../../../config/env.js";
import { getGeminiFrontMode } from "./geminiFront.featureFlags.js";
import { buildPlannerContextPayload } from "./geminiPlannerContext.builder.js";
import { runGeminiPlannerWithMeta } from "./geminiPlanner.service.js";
import {
  validateProposedAction,
  allowedActionsForPhase1State,
} from "./geminiActionValidator.js";
import {
  TelemetryEvents,
  logTelemetryEvent,
} from "../../telemetry/telemetryEvents.js";

/** Phase-1 shadow observability: excludes waiting_birthdate (optional later). */
export const SHADOW_SCOPE_PHASE1_STATES = new Set([
  "paywall_selecting_package",
  "payment_package_selected",
  "awaiting_slip",
  "pending_verify",
]);

/**
 * @param {import('./geminiFront.featureFlags.js').GeminiPhase1StateKey | null} phase1
 * @returns {boolean}
 */
export function isShadowPhase1Eligible(phase1) {
  return Boolean(phase1 && SHADOW_SCOPE_PHASE1_STATES.has(phase1));
}

/**
 * Spec vocabulary for `wouldHandle` (not raw tool names).
 * wouldHandle = planner ok AND validator ok AND specFinal NOT IN { noop, reply_same_state, clarify_same_state }
 */
export const SPEC_NON_HANDLING_FINAL_ACTIONS = new Set([
  "noop",
  "reply_same_state",
  "clarify_same_state",
]);

/**
 * Map validator `resolved_action` to spec `finalAction` for metrics.
 * @param {string} resolvedAction
 * @returns {string}
 */
export function mapResolvedActionToSpecFinalAction(resolvedAction) {
  const a = String(resolvedAction || "").trim();
  if (a === "noop_phrase_only") return "noop";
  if (a === "get_conversation_context") return "clarify_same_state";
  if (a === "send_help_reply") return "reply_same_state";
  return a;
}

/** Planner outcome families for branch disagreement checks. */
const ACTION_FAMILY = {
  guidance_recovery: "guidance_recovery",
  payment_qr: "payment_qr",
  package_pick: "package_pick",
  profile_birthdate: "profile_birthdate",
  slip_pending: "slip_pending",
  status_lookup: "status_lookup",
  slip_vision: "slip_vision",
  scan_handoff: "scan_handoff",
  other: "other",
};

/**
 * @param {string} resolvedAction
 * @returns {string}
 */
export function resolvedActionFamily(resolvedAction) {
  const a = String(resolvedAction || "").trim();
  const spec = mapResolvedActionToSpecFinalAction(a);
  if (SPEC_NON_HANDLING_FINAL_ACTIONS.has(spec)) return ACTION_FAMILY.guidance_recovery;
  if (a === "send_qr_bundle" || a === "create_or_reuse_payment") {
    return ACTION_FAMILY.payment_qr;
  }
  if (a === "select_package") return ACTION_FAMILY.package_pick;
  if (a === "set_birthdate") return ACTION_FAMILY.profile_birthdate;
  if (a === "mark_pending_verify") return ACTION_FAMILY.slip_pending;
  if (a === "get_payment_status") return ACTION_FAMILY.status_lookup;
  if (a === "run_slip_gate") return ACTION_FAMILY.slip_vision;
  if (a === "handoff_to_scan") return ACTION_FAMILY.scan_handoff;
  return ACTION_FAMILY.other;
}

/**
 * For each deterministic recovery branch, which planner action families agree with that path
 * (same-state guidance only — anything outside is a disagreement for observability).
 * @type {Record<string, ReadonlySet<string>>}
 */
export const SHADOW_BRANCH_EXPECTED_FAMILIES = {
  paywall_selecting_unclear: new Set([ACTION_FAMILY.guidance_recovery]),
  payment_package_selected_unclear: new Set([ACTION_FAMILY.guidance_recovery]),
  paywall_selecting_date_wrong: new Set([ACTION_FAMILY.guidance_recovery]),
  payment_package_selected_date_wrong: new Set([ACTION_FAMILY.guidance_recovery]),
  awaiting_slip_default: new Set([ACTION_FAMILY.guidance_recovery]),
  pending_verify_default: new Set([ACTION_FAMILY.guidance_recovery]),
};

/**
 * @param {import('./geminiPlanner.types.js').GeminiPlannerOutput | null} plan
 * @param {{ ok: boolean, resolved_action: string, deny_reason: string | null }} validation
 * @returns {boolean}
 */
export function computePhase1ShadowWouldHandle(plan, validation) {
  if (!plan) return false;
  if (!validation.ok) return false;
  const specFinal = mapResolvedActionToSpecFinalAction(validation.resolved_action);
  if (SPEC_NON_HANDLING_FINAL_ACTIONS.has(specFinal)) return false;
  return true;
}

/**
 * @param {string} deterministicBranch
 * @param {string} resolvedAction
 * @param {string} [_plannerIntent]
 */
export function computeShadowDisagrees(
  deterministicBranch,
  resolvedAction,
  _plannerIntent = "",
) {
  const branch = String(deterministicBranch || "").trim();
  const allowed = SHADOW_BRANCH_EXPECTED_FAMILIES[branch];
  if (!allowed) return false;
  const fam = resolvedActionFamily(resolvedAction);
  return !allowed.has(fam);
}

/**
 * @typedef {{
 *   userId: string,
 *   text: string,
 *   deterministicBranch: string,
 *   phase1State: import('./geminiFront.featureFlags.js').GeminiPhase1StateKey | null,
 *   conversationOwner: string,
 *   paymentState: string,
 *   flowState: string,
 *   accessState: string,
 *   pendingPaymentStatus: string | null,
 *   selectedPackageKey: string | null,
 * }} InvokePhase1GeminiShadowInput
 */

/**
 * @typedef {{
 *   logTelemetryEvent?: (event: string, payload?: Record<string, unknown>) => void,
 *   getGeminiFrontMode?: () => import('./geminiFront.featureFlags.js').GeminiFrontMode,
 *   runGeminiPlannerWithMeta?: typeof import('./geminiPlanner.service.js').runGeminiPlannerWithMeta,
 *   bypassEnabledGate?: boolean,
 *   bypassModeGate?: boolean,
 * }} Phase1GeminiShadowDeps
 */

/**
 * Fire-and-forget shadow run: never throws to caller; never mutates state or sends replies.
 * @param {InvokePhase1GeminiShadowInput} ctx
 */
export function invokePhase1GeminiShadow(ctx) {
  void runPhase1GeminiShadowPipeline(ctx).catch((e) => {
    logTelemetryEvent(TelemetryEvents.GEMINI_FRONT_SHADOW_FAILED, {
      userId: ctx.userId,
      stateOwner: ctx.conversationOwner,
      mode: "shadow",
      model: env.GEMINI_FRONT_MODEL,
      deterministicBranch: ctx.deterministicBranch,
      lastUserText: ctx.text,
      message: e?.message || String(e),
      ts: Date.now(),
    });
  });
}

/**
 * @param {InvokePhase1GeminiShadowInput} ctx
 * @param {Phase1GeminiShadowDeps} [deps]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function runPhase1GeminiShadowPipeline(ctx, deps = {}) {
  const log = deps.logTelemetryEvent ?? logTelemetryEvent;
  const getMode = deps.getGeminiFrontMode ?? getGeminiFrontMode;
  const runMeta = deps.runGeminiPlannerWithMeta ?? runGeminiPlannerWithMeta;

  const bypassEnabled = Boolean(deps.bypassEnabledGate);
  const bypassMode = Boolean(deps.bypassModeGate);

  if (!bypassEnabled && !env.GEMINI_FRONT_ORCHESTRATOR_ENABLED) {
    return { skipped: true, reason: "disabled" };
  }
  if (!bypassMode && getMode() !== "shadow") {
    return { skipped: true, reason: "not_shadow_mode" };
  }

  const phase1 = ctx.phase1State;
  if (!isShadowPhase1Eligible(phase1)) {
    return { skipped: true, reason: "ineligible_state" };
  }

  const allowedActions = allowedActionsForPhase1State(phase1);
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
  });
  const plannerJson = JSON.stringify(plannerPayload);

  log(TelemetryEvents.GEMINI_FRONT_SHADOW_REQUESTED, {
    userId: ctx.userId,
    stateOwner: ctx.conversationOwner,
    mode: "shadow",
    model: env.GEMINI_FRONT_MODEL,
    lastUserText: ctx.text,
    deterministicBranch: ctx.deterministicBranch,
    ts: Date.now(),
  });

  let meta;
  try {
    meta = await runMeta(plannerJson, { silent: true });
  } catch (e) {
    log(TelemetryEvents.GEMINI_FRONT_SHADOW_FAILED, {
      userId: ctx.userId,
      stateOwner: ctx.conversationOwner,
      mode: "shadow",
      model: env.GEMINI_FRONT_MODEL,
      deterministicBranch: ctx.deterministicBranch,
      lastUserText: ctx.text,
      message: e?.message || String(e),
      ts: Date.now(),
    });
    return { ok: false, reason: "planner_threw" };
  }

  if (meta.outcome === "error") {
    log(TelemetryEvents.GEMINI_FRONT_SHADOW_FAILED, {
      userId: ctx.userId,
      stateOwner: ctx.conversationOwner,
      mode: "shadow",
      model: env.GEMINI_FRONT_MODEL,
      deterministicBranch: ctx.deterministicBranch,
      lastUserText: ctx.text,
      message: meta.errorMessage || "planner_error",
      ts: Date.now(),
    });
    return { ok: false, reason: "planner_error" };
  }

  const plan = meta.plan;
  if (!plan) {
    log(TelemetryEvents.GEMINI_FRONT_SHADOW_RESULT, {
      userId: ctx.userId,
      stateOwner: ctx.conversationOwner,
      mode: "shadow",
      model: env.GEMINI_FRONT_MODEL,
      lastUserText: ctx.text,
      deterministicBranch: ctx.deterministicBranch,
      plannerIntent: null,
      plannerAction: null,
      confidence: null,
      validatorAccepted: false,
      validatorRejectReason: null,
      resolvedAction: null,
      wouldHandle: false,
      shadowDisagrees: false,
      plannerOutcome: meta.outcome,
      ts: Date.now(),
    });
    return { ok: true, wouldHandle: false, shadowDisagrees: false };
  }

  const v = validateProposedAction({
    phase1State: phase1,
    proposed_action: plan.proposed_action,
    confidence: plan.confidence,
  });

  const wouldHandle = computePhase1ShadowWouldHandle(plan, v);
  const specFinalAction = mapResolvedActionToSpecFinalAction(v.resolved_action);
  const specActionFamily = resolvedActionFamily(v.resolved_action);
  const shadowDisagrees = computeShadowDisagrees(
    ctx.deterministicBranch,
    v.resolved_action,
    plan.intent,
  );

  log(TelemetryEvents.GEMINI_FRONT_SHADOW_RESULT, {
    userId: ctx.userId,
    stateOwner: ctx.conversationOwner,
    mode: "shadow",
    model: env.GEMINI_FRONT_MODEL,
    lastUserText: ctx.text,
    deterministicBranch: ctx.deterministicBranch,
    plannerIntent: plan.intent,
    plannerAction: plan.proposed_action,
    state_guess: plan.state_guess,
    confidence: plan.confidence,
    validatorAccepted: v.ok,
    validatorRejectReason: v.deny_reason,
    resolvedAction: v.resolved_action,
    specFinalAction,
    specActionFamily,
    wouldHandle,
    shadowDisagrees,
    ts: Date.now(),
  });

  return { ok: true, wouldHandle, shadowDisagrees };
}
