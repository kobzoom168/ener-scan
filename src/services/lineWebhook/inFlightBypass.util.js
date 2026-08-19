/**
 * In-flight gate bypass (Codex รอบ 6): ระหว่างอาจารย์กำลังสแกน ข้อความทั่วไปจะถูก
 * กลืน (ตอบ "รอสักครู่") แต่คำสั่งเป๊ะจากเมนู/ปุ่มต้องได้ของทันที —
 * เคสจริง: "ประวัติ"/"จัดชุด" (17 ส.ค.) และ "วิธีใช้"/"สแกนพลังงาน" (19 ส.ค.)
 * แยกเป็น util เพื่อทดสอบพฤติกรรมจริง ไม่ใช่ตรวจลำดับบรรทัด
 */

/**
 * @param {string} text
 * @param {{ matchExactUtilityCommand?: Function, matchDeterministicInfoCommand?: Function, resumeRe?: RegExp }} [deps]
 * @returns {Promise<boolean>} true = ข้าม gate (คำสั่งเมนู deterministic)
 */
export async function shouldBypassInFlightGate(text, deps = {}) {
  const t = String(text || "").trim();
  if (!t) return false;
  try {
    const matchUtility =
      deps.matchExactUtilityCommand ||
      (await import("../utilityCommands/exactUtilityCommand.service.js")).matchExactUtilityCommand;
    if (matchUtility(t)) return true;

    const matchInfo =
      deps.matchDeterministicInfoCommand ||
      (await import("./deterministicInfoCommand.util.js")).matchDeterministicInfoCommand;
    if (matchInfo(t)) return true;

    const resumeRe =
      deps.resumeRe ||
      (await import("../welcome/registrationOnboarding.logic.js")).RESUME_COMMAND_RE;
    if (resumeRe?.test?.(t)) return true;
  } catch {
    return false; // เช็คพลาด = พฤติกรรมเดิม (โดน gate)
  }
  return false;
}
