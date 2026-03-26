/**
 * @param {import('./geminiFront.featureFlags.js').GeminiPhase1StateKey} phase1
 * @param {string} denyReason
 */
export function buildNextStepHint(phase1, denyReason) {
  if (denyReason === "low_confidence" || denyReason === "not_in_allowed_list") {
    return "สั้นๆ ช่วยชี้ทางต่ออย่างปลอดภัย โดยไม่สมมติข้อมูล";
  }
  switch (phase1) {
    case "waiting_birthdate":
      return "ขอวันเกิดเพื่อใช้ตอนสแกน ตามรูปที่ส่งมา";
    case "paywall_selecting_package":
      return "อธิบายแพ็กที่เปิดได้ และชวนเลือก/ยืนยันแพ็กก่อนชำระ";
    case "payment_package_selected":
      return "ชวนให้ขอคิวอาร์หรือยืนยันชำระเมื่อพร้อม";
    case "awaiting_slip":
      return "รอสลิปโอน หรือแจ้งสถานะสั้นๆ";
    case "pending_verify":
      return "แจ้งว่ารอตรวจสลิป/อนุมัติ ไม่ให้สมมติว่าอนุมัติแล้ว";
    default:
      return "ตอบสั้นๆ ช่วยผู้ใช้ต่อในขั้นตอนที่ถูกต้อง";
  }
}

/**
 * @param {{
 *   phase1State: import('./geminiFront.featureFlags.js').GeminiPhase1StateKey,
 *   planner: import('./geminiPlanner.types.js').GeminiPlannerOutput | null,
 *   payload: Record<string, unknown>,
 *   validationDenyReason: string | null,
 * }} p
 */
export function buildAllowedFactsForPhrasing(p) {
  return {
    phase1_state: p.phase1State,
    intent: p.planner?.intent ?? null,
    server_context: p.payload,
    validation_note: p.validationDenyReason,
  };
}
