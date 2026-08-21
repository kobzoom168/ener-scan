/**
 * Intent contract (Codex P0-4 + B1): แยก "จำแนก intent จากข้อความ" ออกจาก
 * "ตัด role จาก evidence จริง" — caller ห้ามเดา role เอง
 */

const ADVICE_RE = /ควรทำไง|ควรทำอย่างไร|แนะนำ|ทำไงดี|ควรพก|เลือกอันไหน|ควรเลือก|พกยังไง|บูชายังไง/u;
const ENERGY_RE = /พลัง|ดวง|เข้ากับ|เด่นด้าน|สายไหน|แรงกว่า|แรงสุด|คะแนน|ดีไหม|ดีมั้ย/u;
const FLOW_STATE_RE = /paywall|payment|slip|verify|awaiting|registration/i;

/**
 * จำแนก intent จากข้อความ + state เท่านั้น (ไม่แตะ evidence ไม่ตัด role)
 * @returns {{ userIntent: string, userAskedAdvice: boolean, requiredNextAction: boolean, allowQuestion: boolean, moneyOrFlow: boolean }}
 */
export function classifyUserIntent(text, phase1 = null) {
  const t = String(text || "");
  const moneyOrFlow = FLOW_STATE_RE.test(String(phase1 || ""));
  const energyAsk = ENERGY_RE.test(t);
  return {
    userIntent: energyAsk ? "energy_question" : moneyOrFlow ? "service_flow" : "general",
    userAskedAdvice: ADVICE_RE.test(t),
    requiredNextAction: moneyOrFlow,
    allowQuestion: false,
    moneyOrFlow,
  };
}

/**
 * ตัด role จาก evidence จริง: เสียงอาจารย์ได้เฉพาะถามพลัง + มีรายงานจริง (มี ids)
 * เรื่องเงิน/ระบบ = แอดมิน · ที่เหลือ = consult (ห้ามตีความพลัง)
 */
export function resolveExpectedRole(contract, evidence) {
  if (!contract) return "consult";
  if (contract.moneyOrFlow === true || contract.requiredNextAction === true) return "admin";
  const hasReport = Array.isArray(evidence?.report?.ids) && evidence.report.ids.length > 0;
  const energy = /energy/.test(String(contract.userIntent || ""));
  return energy && hasReport ? "ajarn" : "consult";
}

/** intent ที่ใช้จริงหลังรู้ evidence: energy_question + มีรายงาน = energy_reading */
export function finalizeIntent(contract, evidence) {
  if (!contract) return null;
  const hasReport = Array.isArray(evidence?.report?.ids) && evidence.report.ids.length > 0;
  if (contract.userIntent === "energy_question" && hasReport) return "energy_reading";
  return contract.userIntent || null;
}
