/**
 * Status-query SSOT (Codex รอบ 4): ตัวจำแนก "ลูกค้าถามสถานะผล/บ่นรอนาน" ตัวเดียว
 * ใช้ร่วมกันทั้ง result-status router, troll guard และ repeat detector —
 * ห้ามให้แต่ละที่ถือ regex คนละชุดแล้วเงียบลูกค้าที่แค่รอผลอยู่
 */

/** exact/สั้น: คำถามสถานะตรงตัว (ของเดิมจาก router 17 ส.ค.) */
export const RESULT_STATUS_QUERY_RE =
  /^ผล(สแกน)?(ออก|เสร็จ|ได้)(มา)?(หรือ|รึ|แล้ว)?ยัง(ครับ|ค่ะ|คับ)?$|^(ออก|เสร็จ)(หรือ|รึ)?ยัง(ครับ|ค่ะ|คับ)?$/;

/** กว้าง: บ่นรอนาน/ถามความคืบหน้า — นับเป็นสัญญาณรอผล ไม่ใช่ troll */
const WAITING_RE =
  /(ผลออก|ผลสแกน|เสร็จยัง|ได้ยัง|ออกยัง|สถานะ|ถึงไหน|นานไหม|กี่นาที|อีกนาน|เมื่อไหร่(จะ)?(ได้|ออก|เสร็จ)|รอ(ผล|ตรวจ|สแกน|มา|อยู่)?\s*(นาน|หลาย|ตั้งนาน|\d+\s*(นาที|ชม|ชั่วโมง))|นานแล้ว(ครับ|ค่ะ|คับ|นะ)?$)/;

/**
 * @param {string} text
 * @returns {boolean} true = ปฏิบัติกับข้อความนี้แบบ "ถามสถานะผล"
 */
export function isStatusQueryText(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 80) return false;
  return RESULT_STATUS_QUERY_RE.test(t) || WAITING_RE.test(t);
}
