/**
 * Status-query SSOT (Codex รอบ 4→5): จำแนกแบบ typed ไม่ใช่ boolean กว้าง ๆ —
 * รอบก่อน "สถานะสลิป/สถานะการจ่ายเงิน/สถานะสมาชิก" โดน result-status router
 * (ซึ่งอยู่ก่อน payment flow) แย่งไปตอบสถานะสแกนผิดเรื่อง
 *
 * ใช้ร่วมกัน 3 จุด:
 * - result-status router: รับเฉพาะ scan_status · generic_wait รับได้เมื่อมี scan
 *   evidence และไม่มี pending payment (ดู shouldResultStatusRouterHandle)
 * - troll guard + repeat detector: ยกเว้นทุก kind ที่ไม่ใช่ "other"
 *   (broad waiting signal — ลูกค้ารออะไรสักอย่างอยู่ ไม่ใช่กวน)
 */

/** exact/สั้น: คำถามสถานะผลสแกนตรงตัว (ของเดิมจาก router 17 ส.ค.) */
export const RESULT_STATUS_QUERY_RE =
  /^ผล(สแกน)?(ออก|เสร็จ|ได้)(มา)?(หรือ|รึ|แล้ว)?ยัง(ครับ|ค่ะ|คับ)?$|^(ออก|เสร็จ)(หรือ|รึ)?ยัง(ครับ|ค่ะ|คับ)?$/;

const PAYMENT_TERM_RE = /(สลิป|slip|จ่าย|โอน|เงิน|ชำระ|ค่าครู|แพ็ก|package|payment|บิล|ใบเสร็จ)/i;
const ENTITLEMENT_TERM_RE = /(สมาชิก|สิทธิ์|สิทธิ|โควตา|เหลือกี่ครั้ง|กี่ครั้ง|วันหมด|หมดอายุ|ต่ออายุ)/i;
const SCAN_TERM_RE = /(ผล|สแกน|รายงาน|อ่านพลัง)/;
const WAIT_SIGNAL_RE =
  /(ออกยัง|เสร็จยัง|ได้ยัง|สถานะ|ถึงไหน|นานไหม|กี่นาที|อีกนาน|เมื่อไหร่(จะ)?(ได้|ออก|เสร็จ)|รอ(ผล|ตรวจ|สแกน|มา|อยู่)?\s*(นาน|หลาย|ตั้งนาน|\d+\s*(นาที|ชม|ชั่วโมง))|นานแล้ว(ครับ|ค่ะ|คับ|นะ)?$)/;

/**
 * @param {string} text
 * @returns {"scan_status" | "payment_status" | "entitlement_status" | "generic_wait" | "other"}
 */
export function classifyStatusQuery(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 80) return "other";
  const waiting = RESULT_STATUS_QUERY_RE.test(t) || WAIT_SIGNAL_RE.test(t);
  // เรื่องเงิน/สิทธิ์ชนะเสมอ — คำพวกนี้ห้ามหลุดไป scan route (Codex รอบ 5)
  // สัญญาณถามของสองกลุ่มนี้กว้างกว่า wait ปกติ (เช่น "สิทธิ์เหลือกี่ครั้ง")
  const askSignal = waiting || /(สถานะ|ยัง|กี่|เหลือ|เมื่อไหร่|รอ|ตรวจ|หมด|เช็ค|check)/i.test(t);
  if (PAYMENT_TERM_RE.test(t) && askSignal) return "payment_status";
  if (ENTITLEMENT_TERM_RE.test(t) && askSignal) return "entitlement_status";
  if (!waiting) return "other";
  if (RESULT_STATUS_QUERY_RE.test(t) || SCAN_TERM_RE.test(t)) return "scan_status";
  return "generic_wait";
}

/**
 * ตัดสินว่า result-status router (ตอบสถานะ scan job) ควรรับข้อความนี้ไหม
 * @param {{ kind: string, hasPendingPayment?: boolean }} p
 */
export function shouldResultStatusRouterHandle({ kind, hasPendingPayment = false }) {
  if (kind === "scan_status") return true;
  // generic_wait: รับเฉพาะเมื่อไม่มีเรื่องเงินค้าง (ลูกค้าอาจรอตรวจสลิปอยู่)
  if (kind === "generic_wait") return !hasPendingPayment;
  return false;
}

/**
 * broad signal สำหรับ troll/repeat exemption — "ลูกค้ากำลังรออะไรสักอย่าง"
 * (ห้ามใช้ตัวนี้ตัดสิน route — ใช้ classifyStatusQuery + shouldResultStatusRouterHandle)
 * @param {string} text
 */
export function isStatusQueryText(text) {
  return classifyStatusQuery(text) !== "other";
}
