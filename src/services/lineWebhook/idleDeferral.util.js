/**
 * P1 (chat-quality 20 ต.ค. 2026 เคส A · Codex 21 ต.ค.): ลูกค้าบอก "ไว้ก่อน" ใน true idle
 *  - เดิม: intent wait_tomorrow ถูก consume เฉพาะ state paywall → idle ไหลไป consult → consult ไม่ตอบ → fallback "ส่งรูปมาได้เลย" (ขัดบริบท)
 *  - ใหม่: deterministic AI=0 ตอบพักสนทนาแบบกลาง ๆ ไม่ชวนส่งรูป ไม่ขายแพ็ก ไม่สัญญาฟรีพรุ่งนี้ ไม่ยกเลิกงาน/การชำระใด ๆ
 *  - ใช้เฉพาะจุด true idle (ท้าย handleTextMessage) — state อื่นมี handler ของตัวเองอยู่แล้ว
 */
export const IDLE_DEFERRAL_TEXT = "ได้ครับ ไว้สะดวกค่อยกลับมาคุยกันครับ";
export const IDLE_DEFERRAL_REPLY_TYPE = "idle_deferral_ack";

const DEFER_RE = /(เอาไว้ก่อน|ไว้ก่อน|ไว้ทีหลัง(?:ค่อย(?:ส่ง|ดู|มา|ทำ|คุย))?|ไว้วันหลัง(?:ค่อย(?:ส่ง|ดู|มา|ทำ|คุย))?|ไว้คราวหน้า|เดี๋ยวค่อย(?:ส่ง|ดู|มา|ทำ|คุย)?|ยังไม่เอา(?:ตอนนี้)?|ไม่เอาตอนนี้|ขอพักก่อน|พักก่อน|ขอคิดดูก่อน|คิดดูก่อน|ยังก่อน)/u;
/** กันจับผิด: ปฏิเสธการพัก / สั่งทำต่อ / ถามเรื่องอื่นในประโยคเดียว */
const NEGATE_RE = /(ไม่ต้องไว้ก่อน|ไม่ไว้ก่อน|ไม่ต้องพัก|ไม่พัก|ทำต่อ|ต่อเลย|เอาเลย|สแกนเลย|ไปต่อ|ลุยเลย|เริ่มเลย|ส่งเลย|ดูเลย)/u;

/** คำลงท้าย/คำเติมที่ไม่เปลี่ยนความหมาย — ตัดออกแล้วต้องไม่เหลืออะไรนอกจากวลีพัก (Codex รอบ 2: "ไว้ก่อน แพ็กหมดอายุเมื่อไหร่" / "ไม่เอาไว้ก่อนแล้ว" ต้องไม่จับ) */
const PARTICLE_RE = /(ขอบคุณ|ขอบใจ|นะครับ|นะคะ|ครับ|คับ|ค่ะ|คะ|นะ|น้า|จ้า|จ้ะ|เลย|แล้ว|ละ|ล่ะ|ก่อน|ตอนนี้|รูป|ขอ|ผม|ฉัน|เรา|โอเค|ok|okay|ได้|🙏|👍|[\s.,!~()\-]+)/giu;
const QUESTION_OR_REQUEST_RE = /(ไหม|มั้ย|หรือเปล่า|รึเปล่า|เมื่อไหร่|เมื่อไร|อะไร|ยังไง|อย่างไร|กี่|เท่าไหร่|เท่าไร|ทำไม|ที่ไหน|\?|ช่วย|แพ็ก|หมดอายุ|ราคา|ค่าครู|สิทธิ์|สลิป|โอน|จ่าย|เช็ค|ตรวจ)/u;

/** @param {string} text @returns {boolean} true = ข้อความพักสนทนาล้วน ๆ (ไม่มีคำถาม/คำขออื่นปน · สั้น ≤ 40 ตัวอักษร) */
export function matchIdleDeferral(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 40) return false;
  if (NEGATE_RE.test(t)) return false;
  if (!DEFER_RE.test(t)) return false;
  if (QUESTION_OR_REQUEST_RE.test(t)) return false; // พัก + ถาม/ขอในประโยคเดียว → ไปเส้นปกติ ให้ตอบคำถาม
  const remainder = t.replace(new RegExp(DEFER_RE.source, "gu"), "").replace(PARTICLE_RE, "");
  return remainder.length === 0; // เหลือคำอื่น (เช่น "ไม่เอา…แล้ว") = ไม่ใช่การพักล้วน
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
