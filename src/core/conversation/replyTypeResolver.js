import { guidanceTierFromNoProgressStreak, guidanceTierFromAckStreak } from "./stateModel.js";

/**
 * @param {import("./contracts.types.js").StateOwner} stateOwner
 * @param {string} microIntent
 * @param {{ noProgressStreak?: number, ackStreak?: number }} ctx
 * @returns {import("./contracts.types.js").ReplyTypeResult}
 */
export function resolveReplyType(stateOwner, microIntent, ctx = {}) {
  const np = guidanceTierFromNoProgressStreak(ctx.noProgressStreak ?? 1);
  const ack = guidanceTierFromAckStreak(ctx.ackStreak ?? 1);
  const tier = Math.max(np, ack);

  if (stateOwner === "waiting_birthdate") {
    if (microIntent === "valid_date") {
      return { replyType: "wb_accept_date_continue_scan", nextStep: "run_scan", guidanceTier: 1 };
    }
    if (microIntent === "invalid_date") {
      return { replyType: "wb_ask_birthdate_again", nextStep: "collect_birthdate", guidanceTier: tier };
    }
    if (microIntent === "change_birthdate") {
      return { replyType: "wb_change_birthdate_intent", nextStep: "collect_birthdate", guidanceTier: tier };
    }
    if (microIntent === "packageish_text" || microIntent === "paymentish_text") {
      return { replyType: "wb_defer_pay_collect_bd", nextStep: "collect_birthdate", guidanceTier: tier };
    }
    if (microIntent === "confirm_yes") {
      return { replyType: "wb_ack_remind_birthdate", nextStep: "collect_birthdate", guidanceTier: ack };
    }
    if (microIntent === "confirm_no") {
      return { replyType: "wb_guidance_birthdate", nextStep: "collect_birthdate", guidanceTier: tier };
    }
    if (microIntent === "ack") {
      return { replyType: "wb_ack_remind_birthdate", nextStep: "collect_birthdate", guidanceTier: ack };
    }
    if (microIntent === "unclear_noise" || microIntent === "unrelated_noise") {
      return { replyType: "wb_guidance_birthdate", nextStep: "collect_birthdate", guidanceTier: tier };
    }
    return { replyType: "wb_guidance_birthdate", nextStep: "collect_birthdate", guidanceTier: tier };
  }

  if (stateOwner === "paywall_selecting_package") {
    if (microIntent === "choose_49") {
      return { replyType: "pw_package_selected", nextStep: "await_pay_command", guidanceTier: 1 };
    }
    if (microIntent === "pay_too_early") {
      return { replyType: "pw_pay_intent_before_ack", nextStep: "select_package", guidanceTier: tier };
    }
    if (microIntent === "wrong_state_date") {
      return { replyType: "pw_date_wrong_state", nextStep: "select_package", guidanceTier: tier };
    }
    if (microIntent === "hesitation") {
      return { replyType: "pw_hesitation_nudge", nextStep: "select_package", guidanceTier: tier };
    }
    if (microIntent === "ask_price_again") {
      return { replyType: "pw_guidance", nextStep: "select_package", guidanceTier: tier };
    }
    if (microIntent === "generic_ack") {
      return { replyType: "pw_ack_continue", nextStep: "select_package", guidanceTier: ack };
    }
    return { replyType: "pw_guidance", nextStep: "select_package", guidanceTier: tier };
  }

  if (stateOwner === "payment_package_selected") {
    if (microIntent === "pay_now") {
      return { replyType: "pp_show_payment_flow", nextStep: "await_slip", guidanceTier: 1 };
    }
    if (microIntent === "resend_qr") {
      return { replyType: "pp_show_payment_flow", nextStep: "await_slip", guidanceTier: 1 };
    }
    if (microIntent === "package_change") {
      return { replyType: "pp_no_package_change", nextStep: "await_pay_command", guidanceTier: tier };
    }
    if (microIntent === "hesitation") {
      return { replyType: "pp_hesitation", nextStep: "await_pay_command", guidanceTier: tier };
    }
    if (microIntent === "status_like") {
      return { replyType: "pp_status_misroute_nudge", nextStep: "await_pay_command", guidanceTier: 2 };
    }
    return { replyType: "pp_remind_pay", nextStep: "await_pay_command", guidanceTier: tier };
  }

  if (stateOwner === "awaiting_slip") {
    if (microIntent === "resend_qr") {
      return { replyType: "slip_resend_qr", nextStep: "await_slip_image", guidanceTier: 1 };
    }
    if (microIntent === "status_check") {
      return { replyType: "slip_status_hint", nextStep: "await_slip_image", guidanceTier: tier };
    }
    if (microIntent === "slip_claim_but_no_image") {
      return { replyType: "slip_remind", nextStep: "await_slip_image", guidanceTier: tier };
    }
    if (microIntent === "generic_ack") {
      return { replyType: "slip_ack", nextStep: "await_slip_image", guidanceTier: ack };
    }
    return { replyType: "slip_remind", nextStep: "await_slip_image", guidanceTier: tier };
  }

  if (stateOwner === "pending_verify") {
    if (microIntent === "status_check") {
      return { replyType: "pv_status", nextStep: "wait_admin", guidanceTier: tier };
    }
    if (microIntent === "reassurance_needed") {
      return { replyType: "pv_reassure", nextStep: "wait_admin", guidanceTier: 2 };
    }
    if (microIntent === "hurry") {
      return { replyType: "pv_reassure", nextStep: "wait_admin", guidanceTier: 2 };
    }
    if (microIntent === "generic_ack") {
      return { replyType: "pv_ack", nextStep: "wait_admin", guidanceTier: ack };
    }
    return { replyType: "pv_wait", nextStep: "wait_admin", guidanceTier: tier };
  }

  return { replyType: "idle_generic", nextStep: "open", guidanceTier: 1 };
}
