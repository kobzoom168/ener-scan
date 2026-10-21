/**
 * P1 (chat-quality 20 ต.ค. 2026 เคส A · Codex 21 ต.ค.): ลูกค้าบอก "ไว้ก่อน" ใน true idle
 *  - เดิม: intent wait_tomorrow ถูก consume เฉพาะ state paywall → idle ไหลไป consult → consult ไม่ตอบ → fallback "ส่งรูปมาได้เลย" (ขัดบริบท)
 *  - ใหม่: deterministic AI=0 ตอบพักสนทนาแบบกลาง ๆ ไม่ชวนส่งรูป ไม่ขายแพ็ก ไม่สัญญาฟรีพรุ่งนี้ ไม่ยกเลิกงาน/การชำระใด ๆ
 *  - ใช้เฉพาะจุด true idle (ท้าย handleTextMessage) — state อื่นมี handler ของตัวเองอยู่แล้ว
 */
export const IDLE_DEFERRAL_TEXT = "ได้ครับ ไว้สะดวกค่อยกลับมาคุยกันครับ";
export const IDLE_DEFERRAL_REPLY_TYPE = "idle_deferral_ack";

const DEFER_RE = /(ไว้ก่อน|เอาไว้ก่อน|ไว้ทีหลัง|ไว้วันหลัง|ไว้คราวหน้า|เดี๋ยวค่อย|ยังไม่เอา|ไม่เอาตอนนี้|ขอพักก่อน|พักก่อน|ขอคิดดูก่อน|คิดดูก่อน|ยังก่อน)/u;
/** กันจับผิด: ปฏิเสธการพัก / สั่งทำต่อ / ถามเรื่องอื่นในประโยคเดียว */
const NEGATE_RE = /(ไม่ต้องไว้ก่อน|ไม่ไว้ก่อน|ไม่ต้องพัก|ไม่พัก|ทำต่อ|ต่อเลย|เอาเลย|สแกนเลย|ไปต่อ|ลุยเลย|เริ่มเลย|ส่งเลย|ดูเลย)/u;

/** @param {string} text @returns {boolean} true = ข้อความพักสนทนาแบบไม่มีเงื่อนไข (สั้น ≤ 40 ตัวอักษร) */
export function matchIdleDeferral(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 40) return false;
  if (NEGATE_RE.test(t)) return false;
  return DEFER_RE.test(t);
}

/**
 * Terminal handler — deterministic ล้วน ไม่แตะ AI ไม่แตะ state/payment/job
 * @param {{ client: any, userId: string, replyToken: string, text: string, deps: { sendNonScanReply: Function } }} p
 * @returns {Promise<boolean>} true = จบเทิร์น
 */
export async function handleIdleDeferral({ client, userId, replyToken, text, deps }) {
  if (!matchIdleDeferral(text)) return false;
  await deps.sendNonScanReply({
    client, userId, replyToken,
    replyType: IDLE_DEFERRAL_REPLY_TYPE, semanticKey: IDLE_DEFERRAL_REPLY_TYPE,
    text: IDLE_DEFERRAL_TEXT, alternateTexts: [],
    speakerRoleOverride: "admin",
  });
  return true;
}
