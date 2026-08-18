/**
 * คำถาม identity: "คุยกับใคร / ใครตอบ / เป็นบอทไหม / เป็นแอดมินใช่ไหม / ใช่ AI ไหม"
 * (persona 2 ชั้น ข้อ 7 — กบ 11 ส.ค. 2026: ห้ามมีคำ AI/บอทหลุดจากปากเรา ไม่ยืนยัน ไม่ปฏิเสธยาว)
 * ตอบ deterministic ไม่พึ่ง LLM: สั้น ขำ ๆ แล้วพากลับไปที่งาน — เคสจริง 11 ส.ค.:
 * planner ตายแล้ว "ผมคุยกับใคร" โดน nudge สแกนสวน + Opus ตอบเองแล้วมีขยะท้ายข้อความ
 */
import { getValue, setLargeValueWithTtl } from "../../redis/scanV2Redis.js";

// รับคำสะกดเพี้ยนด้วย (เคสจริง 11 ส.ค.: "สรุป เป็น ai ใช้ไหม" — ใช้ไหม หลุด regex เดิม)
const Q_PART =
  "(ใช่ไหม|ใช่ใหม|ใช้ไหม|ใช่มั้ย|ใช้มั้ย|ใช่ปะ|ใช่ป่ะ|ป่ะ|หรือเปล่า|รึเปล่า|รึป่าว|หรอ|เหรอ|ป่าว|ไหม|มั้ย|ใช่ครับ|ใช่ไหมครับ)";
const IDENTITY_RE = new RegExp(
  `(คุยกับใคร|คุยอยู่กับใคร|ใครตอบ|ใครคุย|ใครดูแล|เป็น\\s*(บอท|bot|ai|เอไอ|โปรแกรม|แอดมิน|admin|คนจริง|คนจริงๆ|คน)\\s*${Q_PART}|บอทหรือคน|คนหรือบอท|ใช่\\s*(ai|เอไอ|บอท|bot|โปรแกรม)|(ai|บอท|bot)\\s*${Q_PART}|สรุป\\s*เป็น\\s*(ai|เอไอ|บอท|bot|โปรแกรม))`,
  "i",
);

// กบ 11 ส.ค.: ไม่ใส่อีโมจิ พิมพ์เหมือนคน ยาวแล้วเว้นบรรทัด · โทนจริงจัง นิ่ง ห้ามติดตลก
// โทนกบ (Codex รอบ 3): factual เดียว ไม่มี CTA ไม่มีคำฟุ่มเฟือย
const REPLIES = [
  "แอดมินรับเรื่องในแชท ส่วนคำอ่านพลังเป็นของอาจารย์",
  "แชทนี้แอดมินดูแล คำอ่านพลังมาจากอาจารย์",
];

/**
 * classify ชนิดคำถาม identity (Codex 18 ส.ค.): แจ้งแอดมินเฉพาะ ai_bot —
 * "คุยกับใคร" (who) / "เป็นแอดมินไหม" (admin_check) ไม่ต้องแจ้ง
 * @param {string} text
 * @returns {"ai_bot" | "who" | "admin_check" | null}
 */
export function classifyIdentityQuestion(text) {
  const t = String(text || "").trim();
  if (t.length > 80 || !IDENTITY_RE.test(t)) return null;
  if (/บอท|bot|\bai\b|เอไอ|โปรแกรม|chat\s*gpt|จีพีที|แชทบอท|คนตอบ.{0,8}(หรือ|รึ|ไหม)|ใคร.{0,6}ตอบ/i.test(t)) return "ai_bot";
  if (/แอดมิน|admin/i.test(t)) return "admin_check";
  return "who";
}

/** จับคำถาม identity — คืน true = ตอบแล้ว จบเลย อย่า route ต่อ */
export async function maybeHandleIdentityQuestion({ client, event, userId, text }) {
  const t = String(text || "").trim();
  const kind = classifyIdentityQuestion(t);
  if (!kind) return false;
  // แจ้งแอดมินเฉพาะถาม AI/บอท — ยิงก่อน reply เสมอ (Codex: alert ห้ามผูกกับ
  // ความสำเร็จของ reply ลูกค้า) · fire-and-forget ไม่หน่วงคำตอบ
  if (kind === "ai_bot") {
    void (async () => {
      const { sendCustomerAlert, redactForAlert, paidStatusForAlert } = await import(
        "../monitor/customerAlerts.service.js"
      );
      const paidStatus = await paidStatusForAlert(userId);
      const when = new Date(Date.now() + 7 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
      await sendCustomerAlert({
        type: "ai_question",
        userId,
        dedupeSec: 86400,
        telegramText:
          `[AI-QUESTION] ลูกค้าถามว่าเป็น AI/บอท\nเวลา: ${when} (ไทย)\nID: ${userId}\nสถานะ: ${paidStatus}\nข้อความ: "${redactForAlert(t)}"\n\nแบนได้ด้วยคำสั่ง: แบน ${userId}`,
        lineText: `ลูกค้าถามว่าเป็น AI/บอท\nID: ${userId}\n"${redactForAlert(t).slice(0, 100)}"`,
        lineClient: client,
      });
    })().catch(() => {});
  }
  try {
    // สลับสำนวนต่อคน (ถามซ้ำได้คำตอบไม่ซ้ำเดิม)
    const key = `identity_q:idx:${userId}`;
    const prev = Number((await getValue(key)) || 0);
    const idx = prev % REPLIES.length;
    await setLargeValueWithTtl(key, String(prev + 1), 7 * 86400).catch(() => {});
    await client.replyMessage(event.replyToken, { type: "text", text: REPLIES[idx] });
    console.log(
      JSON.stringify({ event: "IDENTITY_QUESTION_ANSWERED", lineUserIdPrefix: String(userId).slice(0, 8), idx, kind }),
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
