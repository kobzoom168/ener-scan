/**
 * คำถาม identity: "คุยกับใคร / ใครตอบ / เป็นบอทไหม / เป็นแอดมินใช่ไหม / ใช่ AI ไหม"
 * (persona 2 ชั้น ข้อ 7 — กบ 11 ส.ค. 2026: ห้ามมีคำ AI/บอทหลุดจากปากเรา ไม่ยืนยัน ไม่ปฏิเสธยาว)
 * ตอบ deterministic ไม่พึ่ง LLM: สั้น ขำ ๆ แล้วพากลับไปที่งาน — เคสจริง 11 ส.ค.:
 * planner ตายแล้ว "ผมคุยกับใคร" โดน nudge สแกนสวน + Opus ตอบเองแล้วมีขยะท้ายข้อความ
 */
import { getValue, setLargeValueWithTtl } from "../../redis/scanV2Redis.js";

const IDENTITY_RE =
  /(คุยกับใคร|คุยอยู่กับใคร|ใครตอบ|ใครคุย|ใครดูแล|เป็น\s*(บอท|bot|ai|เอไอ|แอดมิน|admin|คนจริง|คนจริงๆ|คน)\s*(ใช่ไหม|ใช่มั้ย|ใช่ปะ|หรือเปล่า|รึเปล่า|หรอ|เหรอ|ป่าว|ไหม|มั้ย|ใช่ครับ|ใช่ไหมครับ)|บอทหรือคน|คนหรือบอท|ใช่\s*(ai|เอไอ|บอท|bot)|ai\s*(ใช่ไหม|หรือเปล่า|รึเปล่า))/i;

// กบ 11 ส.ค.: ไม่ใส่อีโมจิ พิมพ์เหมือนคน สั้น ๆ ยาวแล้วเว้นบรรทัด
const REPLIES = [
  "ผมแอดมินดูแลแชทนี้อยู่ครับ ส่วนคำอ่านพลังอาจารย์เป็นคนดูให้\nมีชิ้นไหนจะให้อาจารย์ดู ส่งรูปมาได้เลยครับ",
  "มีคนดูแลตลอดครับ ผมรับเรื่องให้ อาจารย์เป็นคนอ่าน\nติดตรงไหนถามผมได้เลยครับ",
  "แชทนี้ผมกับอาจารย์ดูแลกันอยู่ครับ\nลองส่งชิ้นแรกมาดูก่อนได้ เดี๋ยวรู้เลยว่าอ่านละเอียดแค่ไหน",
];

/** จับคำถาม identity — คืน true = ตอบแล้ว จบเลย อย่า route ต่อ */
export async function maybeHandleIdentityQuestion({ client, event, userId, text }) {
  const t = String(text || "").trim();
  if (t.length > 80 || !IDENTITY_RE.test(t)) return false;
  try {
    // สลับสำนวนต่อคน (ถามซ้ำได้คำตอบไม่ซ้ำเดิม)
    const key = `identity_q:idx:${userId}`;
    const prev = Number((await getValue(key)) || 0);
    const idx = prev % REPLIES.length;
    await setLargeValueWithTtl(key, String(prev + 1), 7 * 86400).catch(() => {});
    await client.replyMessage(event.replyToken, { type: "text", text: REPLIES[idx] });
    console.log(
      JSON.stringify({ event: "IDENTITY_QUESTION_ANSWERED", lineUserIdPrefix: String(userId).slice(0, 8), idx }),
    );
    try {
      const { insertLineConversationMessage } = await import("../../stores/conversationMessages.db.js");
      void insertLineConversationMessage(userId, "bot", REPLIES[idx], {
        speakerRole: "admin",
        replyType: "identity_question",
        source: "deterministic",
      });
    } catch { /* ignore */ }
    return true;
  } catch {
    return false;
  }
}
