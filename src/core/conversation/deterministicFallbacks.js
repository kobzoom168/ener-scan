/**
 * Deterministic Thai copy for Phase A replyType keys (fail-closed baseline).
 * No payment truth — caller passes safe interpolated strings only.
 * Tone: calm LINE operator — acknowledge / confirm / handoff (no command lists).
 */

/** @typedef {import("./contracts.types.js").GuidanceTierNumeric} Tier */

const SHORT = {
  wb_ask_birthdate_again: "บอกวันเกิดอีกครั้ง เช่น 19/08/2528",
  wb_defer_pay_collect_bd:
    "ขอวันเกิดก่อน เช่น 19/08/2528",
  wb_ack_remind_birthdate: "โอเค รอวันเกิด",
  wb_guidance_birthdate_micro: "ขอวันเกิด",
  pw_date_wrong_state:
    "วันเกิดใช้ตอนสแกน เปิดสิทธิ์พิมพ์ เปิดสิทธิ์",
  pw_pay_intent_before_ack:
    "ยึดรายการที่แจ้งไว้ พิมพ์บอกเมื่อพร้อม",
  pw_hesitation_nudge: "พิมพ์บอกเมื่อพร้อม",
  pw_ack_continue: "โอเค พิมพ์บอกเมื่อพร้อม",
  pw_guidance_micro: "พิมพ์บอกเมื่อพร้อม",
  pp_no_package_change: "รายการนี้เป็นชุดเดียว โอนแล้วส่งสลิป",
  pp_hesitation: "พิมพ์บอกเมื่อพร้อมโอน",
  pp_status_misroute_nudge: "อยู่ช่วงรอชำระ",
  pp_date_wrong_state:
    "วันเกิดใช้ตอนสแกน เปิดสิทธิ์พิมพ์ เปิดสิทธิ์",
  pp_remind_pay: "พิมพ์ เปิดสิทธิ์ เพื่อรับรายการชำระ",
  slip_resend_qr: "พิมพ์ ขอคิวอาร์ เพื่อรับใหม่",
  slip_status_micro: "รอสลิป แนบในแชตนี้",
  slip_remind_micro: "แนบสลิปในแชตนี้",
  slip_ack_micro: "โอเค",
  pv_status_micro: "กำลังตรวจสลิป",
  pv_reassure: "ได้รับสลิปแล้ว กำลังตรวจ",
  pv_ack_micro: "รับทราบ",
  pv_wait_micro: "จะแจ้งผลในแชตนี้",
};

/**
 * @param {string} replyType
 * @param {{ tier?: Tier, paymentRefLine?: string, priceLine?: string, userHint?: string }} [ctx]
 */
export function getDeterministicFallback(replyType, ctx = {}) {
  const tier = ctx.tier ?? 1;
  const ref = ctx.paymentRefLine ? `\n\n${ctx.paymentRefLine}` : "";
  const price = ctx.priceLine || "";

  switch (replyType) {
    case "wb_accept_date_continue_scan":
      return ctx.userHint || "รับวันเกิดแล้ว";
    case "wb_ask_birthdate_again":
      return tier >= 3 ? SHORT.wb_guidance_birthdate_micro : SHORT.wb_ask_birthdate_again;
    case "wb_defer_pay_collect_bd":
      return tier >= 3 ? "ขอวันเกิดก่อน" : SHORT.wb_defer_pay_collect_bd;
    case "wb_ack_remind_birthdate":
      return tier >= 3 ? SHORT.wb_guidance_birthdate_micro : SHORT.wb_ack_remind_birthdate;
    case "wb_guidance_birthdate":
      return tier >= 3
        ? SHORT.wb_guidance_birthdate_micro
        : "ขอวันเกิด เช่น 19/08/2528";

    case "pw_package_selected":
      return price
        ? `ยึดรายการนี้ ${price}`
        : "ยึดรายการนี้ จะเปิดรายการชำระให้";

    case "pw_pay_intent_before_ack":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pw_pay_intent_before_ack;
    case "pw_date_wrong_state":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pw_date_wrong_state;
    case "pw_hesitation_nudge":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pw_hesitation_nudge;
    case "pw_ack_continue":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pw_ack_continue;
    case "pw_guidance":
      return tier >= 3 ? SHORT.pw_guidance_micro : "ใช้ต่อ พิมพ์ เปิดสิทธิ์";

    case "pp_show_payment_flow":
      return "โอเค จะแนบรายละเอียด" + ref;

    case "pp_no_package_change":
      return tier >= 3 ? SHORT.pp_remind_pay : SHORT.pp_no_package_change;
    case "pp_hesitation":
      return tier >= 3 ? SHORT.pp_remind_pay : SHORT.pp_hesitation;
    case "pp_status_misroute_nudge":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pp_status_misroute_nudge;
    case "pp_remind_pay":
      return tier >= 3 ? "พิมพ์บอกเมื่อพร้อม" : SHORT.pp_remind_pay;
    case "pp_date_wrong_state":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pp_date_wrong_state;
    case "pp_selected_guidance":
      return tier >= 3 ? SHORT.pw_guidance_micro : "ใช้ต่อ พิมพ์ เปิดสิทธิ์";

    case "slip_resend_qr":
      return SHORT.slip_resend_qr + ref;
    case "slip_status_hint":
      return tier >= 3
        ? `รอสลิป${ref}`
        : `รอสลิป แนบในแชตนี้${ref}`;
    case "slip_ack":
      return tier >= 3 ? SHORT.slip_ack_micro : `แนบสลิปในแชตนี้${ref}`;
    case "slip_remind":
      return tier >= 3 ? SHORT.slip_remind_micro : `โอนแล้วแนบสลิป${ref}`;

    case "pv_status":
      return tier >= 3 ? SHORT.pv_status_micro : `กำลังตรวจสลิป${ref}`;
    case "pv_reassure":
      return SHORT.pv_reassure + ref;
    case "pv_ack":
      return tier >= 3 ? SHORT.pv_ack_micro : `รับทราบ จะแจ้งในแชตนี้${ref}`;
    case "pv_wait":
      return tier >= 3 ? SHORT.pv_wait_micro : `รอตรวจสลิป จะแจ้งในแชตนี้${ref}`;

    default:
      return "พิมพ์บอกได้";
  }
}

