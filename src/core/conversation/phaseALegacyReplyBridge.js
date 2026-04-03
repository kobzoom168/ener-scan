/**
 * Bridges legacy LINE replyType strings (observability labels) to Phase A
 * `{ stateOwner, phaseReplyType, nextStep, microIntent }` for humanizer contracts.
 * Returns null when this reply must stay purely deterministic (fail closed).
 *
 * Copy family: `stateOwner === "payment_package_selected"` uses **pp\_*** phase keys only
 * (`getDeterministicFallback`), so humanized + deterministic tiers stay aligned by `phaseReplyType`.
 */

/** @typedef {import("./contracts.types.js").StateOwner} StateOwner */

const WAIT_BIRTHDATE = "waiting_birthdate";
const PAYWALL = "paywall_selecting_package";
const PACKAGE_SELECTED = "payment_package_selected";
const SLIP = "awaiting_slip";
const PV = "pending_verify";

/** @type {Record<string, { stateOwner: StateOwner, phaseReplyType: string, nextStep: string, microIntent: string }>} */
const LEGACY_MAP = {
  waiting_birthdate_wrong_state_redirect: {
    stateOwner: WAIT_BIRTHDATE,
    phaseReplyType: "wb_defer_pay_collect_bd",
    nextStep: "collect_birthdate",
    microIntent: "packageish_text",
  },
  waiting_birthdate_invalid_format: {
    stateOwner: WAIT_BIRTHDATE,
    phaseReplyType: "wb_ask_birthdate_again",
    nextStep: "collect_birthdate",
    microIntent: "invalid_date",
  },
  waiting_birthdate_invalid_date: {
    stateOwner: WAIT_BIRTHDATE,
    phaseReplyType: "wb_ask_birthdate_again",
    nextStep: "collect_birthdate",
    microIntent: "invalid_date",
  },
  waiting_birthdate_ambiguous_compact: {
    stateOwner: WAIT_BIRTHDATE,
    phaseReplyType: "wb_ask_birthdate_again",
    nextStep: "collect_birthdate",
    microIntent: "invalid_date",
  },

  single_offer_paywall_ready_ack: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_package_selected",
    nextStep: "await_pay_command",
    microIntent: "choose_49",
  },
  single_offer_paywall_hesitation: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_hesitation_nudge",
    nextStep: "select_package",
    microIntent: "hesitation",
  },
  single_offer_paywall_no_package_change: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_hesitation_nudge",
    nextStep: "select_package",
    microIntent: "hesitation",
  },
  single_offer_paywall_wait_tomorrow: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_guidance",
    nextStep: "select_package",
    microIntent: "hesitation",
  },
  single_offer_paywall_date_wrong_state: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_date_wrong_state",
    nextStep: "select_package",
    microIntent: "wrong_state_date",
  },
  single_offer_paywall_ack_full: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_ack_continue",
    nextStep: "select_package",
    microIntent: "generic_ack",
  },
  single_offer_paywall_ack_short: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_ack_continue",
    nextStep: "select_package",
    microIntent: "generic_ack",
  },
  single_offer_paywall_ack_micro: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_ack_continue",
    nextStep: "select_package",
    microIntent: "generic_ack",
  },
  single_offer_paywall_unclear_full: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_guidance",
    nextStep: "select_package",
    microIntent: "unclear_noise",
  },
  single_offer_paywall_unclear_short: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_guidance",
    nextStep: "select_package",
    microIntent: "unclear_noise",
  },
  single_offer_paywall_unclear_micro: {
    stateOwner: PAYWALL,
    phaseReplyType: "pw_guidance",
    nextStep: "select_package",
    microIntent: "unclear_noise",
  },

  /** Legacy reply surfaces after user acknowledged a package (payment_package_selected). */
  package_selected_pay_now: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_show_payment_flow",
    nextStep: "show_qr_or_await_slip",
    microIntent: "pay_intent",
  },
  package_selected_hesitation: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_hesitation",
    nextStep: "await_pay_command",
    microIntent: "hesitation",
  },
  package_selected_package_change: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_no_package_change",
    nextStep: "await_pay_command",
    microIntent: "package_change_intent",
  },
  /** “status-like” scheduling / deferral (e.g. wait until tomorrow). */
  package_selected_wait_tomorrow: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_status_misroute_nudge",
    nextStep: "await_pay_command",
    microIntent: "wait_for_free_tomorrow",
  },
  package_selected_date_wrong_state: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_date_wrong_state",
    nextStep: "await_pay_command",
    microIntent: "wrong_state_date",
  },
  package_selected_ack_full: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_remind_pay",
    nextStep: "await_pay_command",
    microIntent: "generic_ack",
  },
  package_selected_ack_short: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_remind_pay",
    nextStep: "await_pay_command",
    microIntent: "generic_ack",
  },
  package_selected_ack_micro: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_remind_pay",
    nextStep: "await_pay_command",
    microIntent: "generic_ack",
  },
  package_selected_unclear_full: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_selected_guidance",
    nextStep: "await_pay_command",
    microIntent: "unclear_noise",
  },
  package_selected_unclear_short: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_selected_guidance",
    nextStep: "await_pay_command",
    microIntent: "unclear_noise",
  },
  package_selected_unclear_micro: {
    stateOwner: PACKAGE_SELECTED,
    phaseReplyType: "pp_selected_guidance",
    nextStep: "await_pay_command",
    microIntent: "unclear_noise",
  },

  awaiting_slip_status_hint: {
    stateOwner: SLIP,
    phaseReplyType: "slip_status_hint",
    nextStep: "await_slip_image",
    microIntent: "status_check",
  },
  awaiting_slip_guidance: {
    stateOwner: SLIP,
    phaseReplyType: "slip_remind",
    nextStep: "await_slip_image",
    microIntent: "unrelated_same_state",
  },
  awaiting_slip_gentle_remind: {
    stateOwner: SLIP,
    phaseReplyType: "slip_remind",
    nextStep: "await_slip_image",
    microIntent: "unrelated_same_state",
  },

  pending_verify_reminder: {
    stateOwner: PV,
    phaseReplyType: "pv_wait",
    nextStep: "wait_admin",
    microIntent: "unrelated_same_state",
  },
  pending_verify_status: {
    stateOwner: PV,
    phaseReplyType: "pv_status",
    nextStep: "wait_admin",
    microIntent: "status_check",
  },
  pending_verify_guidance: {
    stateOwner: PV,
    phaseReplyType: "pv_wait",
    nextStep: "wait_admin",
    microIntent: "unrelated_same_state",
  },
  pending_verify_gentle_remind: {
    stateOwner: PV,
    phaseReplyType: "pv_wait",
    nextStep: "wait_admin",
    microIntent: "unrelated_same_state",
  },

  /** Object-check: inconclusive / timeout / weak signal — ask for a clearer retake (not hard unsupported). */
  object_inconclusive: {
    stateOwner: "object_gate",
    phaseReplyType: "og_object_inconclusive",
    nextStep: "send_new_image_same_chat",
    microIntent: "object_inconclusive_retake",
  },
  /** Strict gate said unclear / blurry — retake with same guidance family as inconclusive. */
  image_retake_required: {
    stateOwner: "object_gate",
    phaseReplyType: "og_image_retake_required",
    nextStep: "send_new_image_same_chat",
    microIntent: "image_unclear_retake",
  },
};

/**
 * @param {string} legacyReplyType
 * @returns {{ phaseReplyType: string, stateOwner: StateOwner, nextStep: string, microIntent: string }|null}
 */
export function legacyReplyTypeToPhaseA(legacyReplyType) {
  const k = String(legacyReplyType || "").trim();
  const row = LEGACY_MAP[k];
  if (!row) return null;
  return { ...row, phaseReplyType: row.phaseReplyType };
}
