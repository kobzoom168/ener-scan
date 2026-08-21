/**
 * Intent contract (Codex P0-4 + B1 รอบสอง/สาม): แยก "จำแนก intent จากข้อความ+state"
 * ออกจาก "ตัด role จาก evidence จริง" — caller ห้ามเดา role เอง
 *
 * ลำดับความสำคัญ (Codex รอบสาม): payment/registration state ชนะ energy cue ทั่วไป
 * · "ดีไหม/ดีมั้ย" ลอย ๆ ไม่ใช่คำถามพลัง ต้องมี context วัตถุ/พลัง
 * · requiredNextAction ห้าม derive จาก state ทั้งก้อน — มาจาก "คำตอบนี้ต้องสั่งทำขั้นตอน" เท่านั้น
 */

const ADVICE_RE = /ควรทำไง|ควรทำอย่างไร|แนะนำ|ทำไงดี|ควรพก|เลือกอันไหน|ควรเลือก|พกยังไง|บูชายังไง/u;
/** cue พลังที่ชัดด้วยตัวเอง */
const ENERGY_STRONG_RE = /พลัง|ดวง|เข้ากับ|เด่นด้าน|สายไหน|แรงกว่า|แรงสุด|คะแนน/u;
/** cue คลุมเครือ ("ดีไหม") ต้องเจอ object context ในประโยคเดียวกัน */
const ENERGY_WEAK_RE = /ดีไหม|ดีมั้ย|ดีป่ะ/u;
const OBJECT_CONTEXT_RE = /องค์|ชิ้น|พระ|เหรียญ|หิน|กำไล|เครื่องราง|ตะกรุด|ของ(?:ที่)?ส่ง|รายงาน/u;
/** คำเงิน/แพ็ก/สิทธิ์ — ชนะ energy cue ทุกกรณี */
const MONEY_RE = /แพ็ก|แพค|โปร|ค่าครู|ราคา|กี่บาท|จ่าย|โอน|สลิป|สิทธิ์|ฟรี|เปิดใช้|ซื้อ/u;
const PAYMENT_STATE_RE = /paywall|payment|slip|verify|awaiting/i;
const REGISTRATION_STATE_RE = /registration|onboard/i;

/**
 * @returns {{ userIntent: string, userAskedAdvice: boolean, requiredNextAction: boolean, allowQuestion: boolean, moneyOrFlow: boolean }}
 */
export function classifyUserIntent(text, phase1 = null) {
  const t = String(text || "");
  const state = String(phase1 || "");
  const inPayment = PAYMENT_STATE_RE.test(state);
  const inRegistration = REGISTRATION_STATE_RE.test(state);
  const moneyWord = MONEY_RE.test(t);
  const energyAsk =
    ENERGY_STRONG_RE.test(t) || (ENERGY_WEAK_RE.test(t) && OBJECT_CONTEXT_RE.test(t));

  let userIntent;
  if (moneyWord || inPayment) userIntent = "payment_question";
  else if (inRegistration) userIntent = "registration_flow";
  else if (energyAsk) userIntent = "energy_question";
  else userIntent = "general";

  const moneyOrFlow = userIntent === "payment_question" || userIntent === "registration_flow";
  return {
    userIntent,
    userAskedAdvice: ADVICE_RE.test(t),
    // คำถามเงิน/ระบบ "ไม่ได้" แปลว่าคำตอบต้องสั่งทำขั้นตอน — ผู้เรียกที่รู้ว่า reply นี้
    // เป็น action จริง (เช่น QR/slip instruction) ค่อย set เองผ่าน withRequiredAction()
    requiredNextAction: false,
    allowQuestion: false,
    moneyOrFlow,
  };
}

/** ผู้เรียกที่ route เป็น action จริง (ส่ง QR / ขอสลิป / ขอวันเกิด) ประกาศเอง */
export function withRequiredAction(contract) {
  return { ...(contract || classifyUserIntent("")), requiredNextAction: true };
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
