import { logGeminiValidation } from "./geminiFront.telemetry.js";

/** Closed set aligned with rollout (expand with tools). */
export const ALL_PHASE1_ACTIONS = [
  "noop_phrase_only",
  "get_conversation_context",
  "set_birthdate",
  "select_package",
  "create_or_reuse_payment",
  "send_qr_bundle",
  "run_slip_gate",
  "mark_pending_verify",
  "get_payment_status",
  "handoff_to_scan",
  "send_help_reply",
];

/**
 * @param {import('./geminiFront.featureFlags.js').GeminiPhase1StateKey} phase1
 */
export function allowedActionsForPhase1State(phase1) {
  switch (phase1) {
    case "waiting_birthdate":
      return [
        "noop_phrase_only",
        "set_birthdate",
        "send_help_reply",
        "get_conversation_context",
        "handoff_to_scan",
      ];
    case "paywall_selecting_package":
      return [
        "noop_phrase_only",
        "select_package",
        "create_or_reuse_payment",
        "send_qr_bundle",
        "send_help_reply",
        "get_conversation_context",
        "get_payment_status",
      ];
    case "payment_package_selected":
      return [
        "noop_phrase_only",
        "create_or_reuse_payment",
        "send_qr_bundle",
        "send_help_reply",
        "get_conversation_context",
        "get_payment_status",
      ];
    case "awaiting_slip":
      return [
        "noop_phrase_only",
        "get_payment_status",
        "send_help_reply",
        "get_conversation_context",
        "mark_pending_verify",
      ];
    case "pending_verify":
      return [
        "noop_phrase_only",
        "get_payment_status",
        "send_help_reply",
        "get_conversation_context",
      ];
    default:
      return ["noop_phrase_only", "send_help_reply"];
  }
}

/**
 * Image-only actions must never be validated as success for text turns.
 * @param {string} action
 */
export function isImageOnlyAction(action) {
  return action === "run_slip_gate";
}

/**
 * @param {{
 *   phase1State: import('./geminiFront.featureFlags.js').GeminiPhase1StateKey,
 *   proposed_action: string,
 *   confidence: number,
 *   minConfidence?: number,
 * }} p
 * @returns {{ ok: boolean, resolved_action: string, deny_reason: string | null }}
 */
export function validateProposedAction(p) {
  const minC = p.minConfidence ?? 0.35;
  const action = String(p.proposed_action || "").trim();
  const allowed = allowedActionsForPhase1State(p.phase1State);

  if (!allowed.includes(action)) {
    logGeminiValidation({
      ok: false,
      reason: "not_in_allowed_list",
      proposed_action: action,
      phase1: p.phase1State,
    });
    return {
      ok: false,
      resolved_action: "noop_phrase_only",
      deny_reason: "not_in_allowed_list",
    };
  }

  if (isImageOnlyAction(action)) {
    logGeminiValidation({
      ok: false,
      reason: "image_only_action_on_text_turn",
      proposed_action: action,
    });
    return {
      ok: false,
      resolved_action: "noop_phrase_only",
      deny_reason: "image_only",
    };
  }

  if (Number(p.confidence) < minC) {
    logGeminiValidation({
      ok: false,
      reason: "low_confidence",
      confidence: p.confidence,
    });
    return {
      ok: false,
      resolved_action: "noop_phrase_only",
      deny_reason: "low_confidence",
    };
  }

  logGeminiValidation({
    ok: true,
    resolved_action: action,
    phase1: p.phase1State,
  });
  return { ok: true, resolved_action: action, deny_reason: null };
}
