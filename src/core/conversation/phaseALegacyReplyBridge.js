/**
 * Bridges legacy LINE replyType strings (observability labels) to Phase A
 * `{ stateOwner, phaseReplyType, nextStep, microIntent }` for humanizer contracts.
 * Returns null when this reply must stay purely deterministic (fail closed).
 */

/** @typedef {import("./contracts.types.js").StateOwner} StateOwner */

const WAIT_BIRTHDATE = "waiting_birthdate";
const PAYWALL = "paywall_selecting_package";
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
