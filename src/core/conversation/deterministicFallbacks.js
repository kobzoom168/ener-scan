/**
 * Deterministic Thai copy for Phase A replyType keys (fail-closed baseline).
 * No payment truth — caller passes safe interpolated strings only.
 * Tone: calm LINE operator — acknowledge / confirm / handoff (no command lists).
 */

/** @typedef {import("./contracts.types.js").GuidanceTierNumeric} Tier */

const SHORT = {
  wb_ask_birthdate_again: "ลองบอกวันเกิดอีกครั้งได้เลยครับ เช่น 19/08/2528",
  wb_defer_pay_collect_bd:
    "เรื่องชำระค่อยทำทีหลังได้ครับ ตอนนี้ขอวันเกิดก่อนนะครับ เช่น 19/08/2528",
  wb_ack_remind_birthdate: "ได้ครับ รอวันเกิดอยู่ครับ บอกผมได้เลยครับ",
  wb_guidance_birthdate_micro: "ขอวันเกิดหน่อยครับ",
  pw_date_wrong_state:
    "เดี๋ยววันเกิดค่อยใช้ตอนสแกนครับ ตอนนี้ถ้าจะเปิดสิทธิ์ แจ้งผมได้เลยครับ",
  pw_pay_intent_before_ack:
    "ตกลงแพ็กก่อนนะครับ ราคาแพ็กที่บอทบอก แล้วค่อยขอคิวชำระบอกผมได้เลยครับ",
  pw_hesitation_nudge: "ถ้าพร้อมเปิดสิทธิ์ แจ้งผมได้เลยครับ",
  pw_ack_continue: "ได้ครับ พร้อมเมื่อไหร่ขอคิวชำระบอกผมได้เลยครับ",
  pw_guidance_micro: "พร้อมเมื่อไหร่แจ้งได้ครับ",
  pp_no_package_change: "แพ็กนี้เป็นชุดเดียวครับ ถ้าพร้อมโอน แจ้งผมได้เลยครับ",
  pp_hesitation: "ถ้าพร้อมโอน แจ้งผมได้เลยครับ",
  pp_status_misroute_nudge: "ตอนนี้อยู่ช่วงรอชำระครับ แจ้งผมได้เลยครับ",
  pp_date_wrong_state:
    "เดี๋ยววันเกิดค่อยใช้ตอนสแกนครับ ตอนนี้ถ้าจะเปิดสิทธิ์ แจ้งผมได้เลยครับ",
  pp_remind_pay: "พร้อมเมื่อไหร่ขอคิวชำระบอกผมได้เลยครับ เดี๋ยวผมส่งรายละเอียดให้ครับ",
  slip_resend_qr: "ขอคิวอาร์อีกครั้งบอกผมได้เลยครับ",
  slip_status_micro: "รอสลิปอยู่ครับ แนบในแชตนี้ได้เลยครับ",
  slip_remind_micro: "แนบสลิปโอนมาในแชตนี้ได้เลยครับ",
  slip_ack_micro: "ได้ครับ",
  pv_status_micro: "กำลังตรวจสอบให้อยู่ครับ",
  pv_reassure: "รอแอดมินตรวจสลิปแป๊บนึงนะครับ",
  pv_ack_micro: "รับทราบครับ",
  pv_wait_micro: "เดี๋ยวผมแจ้งต่อในแชตนี้เลยครับ",
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
      return ctx.userHint || "รับวันเกิดแล้วครับ เดี๋ยวไปต่อให้";
    case "wb_ask_birthdate_again":
      return tier >= 3 ? SHORT.wb_guidance_birthdate_micro : SHORT.wb_ask_birthdate_again;
    case "wb_defer_pay_collect_bd":
      return tier >= 3 ? "ขอวันเกิดก่อนครับ" : SHORT.wb_defer_pay_collect_bd;
    case "wb_ack_remind_birthdate":
      return tier >= 3 ? SHORT.wb_guidance_birthdate_micro : SHORT.wb_ack_remind_birthdate;
    case "wb_guidance_birthdate":
      return tier >= 3
        ? SHORT.wb_guidance_birthdate_micro
        : "ขอวันเกิดที่ใช้ในระบบหน่อยครับ เช่น 19/08/2528 บอกผมได้เลยครับ";

    case "pw_package_selected":
      return price
        ? `ได้เลยครับ ${price} ยึดแพ็กนี้นะครับ\n\nเดี๋ยวผมเปิดรายการชำระให้ต่อได้ครับ`
        : "ได้เลยครับ ยึดแพ็กนี้นะครับ เดี๋ยวผมเปิดรายการชำระให้ต่อได้ครับ";

    case "pw_pay_intent_before_ack":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pw_pay_intent_before_ack;
    case "pw_date_wrong_state":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pw_date_wrong_state;
    case "pw_hesitation_nudge":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pw_hesitation_nudge;
    case "pw_ack_continue":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pw_ack_continue;
    case "pw_guidance":
      return tier >= 3 ? SHORT.pw_guidance_micro : "ถ้าจะใช้ต่อ แจ้งผมได้เลยครับ";

    case "pp_show_payment_flow":
      return "ได้ครับ เดี๋ยวผมแนบรายละเอียดให้ครับ" + ref;

    case "pp_no_package_change":
      return tier >= 3 ? SHORT.pp_remind_pay : SHORT.pp_no_package_change;
    case "pp_hesitation":
      return tier >= 3 ? SHORT.pp_remind_pay : SHORT.pp_hesitation;
    case "pp_status_misroute_nudge":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pp_status_misroute_nudge;
    case "pp_remind_pay":
      return tier >= 3 ? "พร้อมเมื่อไหร่แจ้งได้ครับ" : SHORT.pp_remind_pay;
    case "pp_date_wrong_state":
      return tier >= 3 ? SHORT.pw_guidance_micro : SHORT.pp_date_wrong_state;
    case "pp_selected_guidance":
      return tier >= 3 ? SHORT.pw_guidance_micro : "ถ้าจะใช้ต่อ แจ้งผมได้เลยครับ";

    case "slip_resend_qr":
      return SHORT.slip_resend_qr + ref;
    case "slip_status_hint":
      return tier >= 3
        ? `ตอนนี้รอสลิปอยู่ครับ${ref}`
        : `ตอนนี้ผมรอสลิปอยู่ครับ แนบในแชตนี้ได้เลยครับ${ref}`;
    case "slip_ack":
      return tier >= 3 ? SHORT.slip_ack_micro : `ได้ครับ แนบสลิปมาได้เลยครับ${ref}`;
    case "slip_remind":
      return tier >= 3 ? SHORT.slip_remind_micro : `ถ้าโอนแล้วแนบสลิปมาได้เลยครับ${ref}`;

    case "pv_status":
      return tier >= 3 ? SHORT.pv_status_micro : `ตอนนี้กำลังตรวจสอบสลิปให้อยู่นะครับ${ref}`;
    case "pv_reassure":
      return SHORT.pv_reassure + ref;
    case "pv_ack":
      return tier >= 3 ? SHORT.pv_ack_micro : `รับทราบครับ เดี๋ยวแจ้งในแชตนี้ให้ครับ${ref}`;
    case "pv_wait":
      return tier >= 3 ? SHORT.pv_wait_micro : `รอตรวจสลิปอยู่ครับ เดี๋ยวแจ้งในแชตนี้ให้ครับ${ref}`;

    default:
      return "บอกผมได้เลยครับ";
  }
}

