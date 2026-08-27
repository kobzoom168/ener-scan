/**
 * บทบาทของคำตอบ consult ตัดสินจาก route/intent "ก่อน generate" (flow-role audit 26 ส.ค. — เคส 2/13)
 *
 * เดิม: resolveSpeakerRole อนุมานจากข้อความหลังโมเดลตอบ → คำแนะนำพระ/พลังถูกตอบเสียงแอดมิน
 * แล้วปิดด้วย "ส่งรูปมาให้อาจารย์ดู" · ตอนนี้: route ตัดว่า energy/amulet advice = ajarn
 * ก่อนเรียกโมเดล (ส่ง directive) · output ยัง handoff/เสียงแอดมิน → retry 1 ครั้ง ·
 * ยังผิด → deterministic role-safe fallback (ห้ามส่งของที่ reject ห้ามเงียบ)
 */

const MONEY_RE = /ค่าครู|ราคา|กี่บาท|บาท|จ่าย|โอน|สลิป|แพ็ก|แพค|โปร(?!ด)|สิทธิ์|เปิดใช้|ซื้อ|QR/iu;
const FLOW_RE = /วิธีใช้|ประวัติ|ยกเลิก|แก้วันเกิด|ลงทะเบียน|สถานะ|ผลยังไม่มา|ผลออกยัง|รอผล|คิว|ส่งรูปยัง/u;
const ENERGY_ADVICE_RE =
  /พลัง|ดวง|เข้ากับ|เด่นด้าน|สาย(?:เสน่ห|เมตตา|โชค|บารมี|คุ้มครอง|ค้าขาย|การเงิน|ปกป้อง|อำนาจ)|ควรพก|พกยังไง|บูชายังไง|เหมาะกับ|พุทธคุณ|เครื่องราง|พระ(?:แบบไหน|อะไร|องค์ไหน|ชิ้นไหน)|หินอะไร|กำไลแบบไหน|เสริม(?:ดวง|บารมี|โชค|เสน่ห์|การเงิน)|โชคลาภ|เมตตา|บารมี|คุ้มครอง|แคล้วคลาด|เสน่ห์|เสน่หา|มหานิยม|ห้อย(?:องค์|ชิ้น|อะไร)|องค์ไหนดี|ชิ้นไหนดี/u;

/**
 * @param {string} userText
 * @returns {"ajarn"|"admin"|null} null = ไม่บังคับ ให้โมเดลเลือกเสียงตาม prompt เดิม
 */
export function routeConsultRole(userText) {
  const t = String(userText || "").trim();
  if (!t) return null;
  if (MONEY_RE.test(t) || FLOW_RE.test(t)) return "admin";
  if (ENERGY_ADVICE_RE.test(t)) return "ajarn";
  return null;
}

/** directive ที่ต่อท้าย prompt เดิม (ไม่รื้อ prompt) */
export function roleDirectiveFor(role) {
  if (role === "ajarn") {
    return "คำถามนี้เป็นเรื่องพลัง/พระ/เครื่องราง → ตอบทั้งข้อความเป็นเสียงอาจารย์ (เรียกตัวเองว่า อาจารย์) ห้ามพูดว่า ส่งให้อาจารย์ดู/เดี๋ยวผมถามอาจารย์ เพราะอาจารย์คือคนตอบอยู่ตอนนี้ · ถ้าไม่มีผลอ่านจริงของลูกค้า ห้ามแต่งคะแนน/พลังเฉพาะชิ้น ให้ตอบความรู้ทั่วไปได้";
  }
  if (role === "admin") {
    return "คำถามนี้เป็นเรื่องเงิน/สิทธิ์/สถานะ → ตอบเป็นเสียงแอดมิน (ผม) ห้ามตีความพลัง";
  }
  return "";
}

/** วลี handoff ที่ผิดเมื่อผู้พูดควรเป็นอาจารย์เอง */
const HANDOFF_RE = /ส่ง(?:รูป)?(?:มา)?ให้อาจารย์|ให้อาจารย์(?:ดู|สแกน|อ่าน|เช็ค)|ผม(?:จะ)?(?:ถาม|เรียนถาม|ส่งต่อ)อาจารย์|เดี๋ยว(?:ผม)?ส่งให้อาจารย์|อาจารย์จะดูให้/u;
const ADMIN_SELF_RE = /(?:^|[^ก-๙])ผม(?:[^ก-๙]|$)/u;

/**
 * output ผิดบทเมื่อ route = ajarn: มี handoff หรือพูดเป็น "ผม"
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function checkAjarnVoice(text) {
  const t = String(text || "");
  if (HANDOFF_RE.test(t)) return { ok: false, reason: "handoff_phrase" };
  if (ADMIN_SELF_RE.test(t) && !/อาจารย์/u.test(t)) return { ok: false, reason: "admin_self_voice" };
  return { ok: true, reason: null };
}

/**
 * fallback เสียงอาจารย์ที่ไม่แต่งผล ไม่สัญญา (ใช้เมื่อ retry ยังผิดบท)
 * มีรายงานจริง → ชี้ไปที่รายงาน · ไม่มี → บอกตรง ๆ ว่าขอดูจากชิ้นจริง
 */
export function ajarnRoleSafeFallback({ hasReport = false } = {}) {
  return hasReport
    ? "อาจารย์ตอบจากผลอ่านของคุณได้ครับ ดูรายละเอียดพลังในรายงานชิ้นล่าสุดได้เลย"
    : "เรื่องนี้อาจารย์ขอดูจากชิ้นจริงก่อนครับ ถ้ามีชิ้นอยู่ ส่งรูปมาได้เลย";
}
