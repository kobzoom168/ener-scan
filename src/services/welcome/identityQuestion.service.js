/**
 * คำถาม identity: "คุยกับใคร / ใครตอบ / เป็นบอทไหม / เป็นแอดมินใช่ไหม / ใช่ AI ไหม"
 * (persona 2 ชั้น ข้อ 7 — กบ 11 ส.ค. 2026: ห้ามมีคำ AI/บอทหลุดจากปากเรา ไม่ยืนยัน ไม่ปฏิเสธยาว)
 * ตอบ deterministic ไม่พึ่ง LLM: สั้น ขำ ๆ แล้วพากลับไปที่งาน — เคสจริง 11 ส.ค.:
 * planner ตายแล้ว "ผมคุยกับใคร" โดน nudge สแกนสวน + Opus ตอบเองแล้วมีขยะท้ายข้อความ
 */
import { getValue, setLargeValueWithTtl } from "../../redis/scanV2Redis.js";

// classifier ตารางเดียว (Codex รอบ 4): เลิกใช้ outer regex ตัดก่อน — เคสจริงหลุด
// ("เป็น AI หรือคนตอบ", "ใช้ ChatGPT ไหม") และ "ใครตอบ" เคยโดนจัดผิดเป็น ai_bot
// รับคำสะกดเพี้ยนด้วย (เคสจริง 11 ส.ค.: "สรุป เป็น ai ใช้ไหม")
const Q_PART =
  "(?:ใช่ไหม|ใช่ใหม|ใช้ไหม|ใช่มั้ย|ใช้มั้ย|ใช่ปะ|ใช่ป่ะ|ป่ะ|หรือเปล่า|รึเปล่า|รึป่าว|หรอ|เหรอ|ป่าว|ไหม|มั้ย|ปะ|หรือ|รึ|ใช่|\\?)";
// คำที่แปลว่า AI/บอท — latin terms กันติดคำอื่นด้วยขอบ non-letter
const AI_TERM =
  "(?:บอท|แชทบอท|เอไอ|จีพีที|แชทจีพีที|โปรแกรมตอบ|โปรแกรม|ระบบอัตโนมัติ|หุ่นยนต์|(?<![a-z])(?:bot|a\\.?i\\.?|ai|gpt|chat\\s*gpt|chat\\s*bot)(?![a-z]))";
const HUMAN_TERM = "(?:คนจริง|คนตอบ|มนุษย์|คน)";
const AI_TERM_RE = new RegExp(AI_TERM, "i");
const Q_RE = new RegExp(Q_PART, "i");
const AI_VS_HUMAN_RE = new RegExp(`${AI_TERM}.{0,14}${HUMAN_TERM}|${HUMAN_TERM}.{0,14}${AI_TERM}`, "i");
const WHO_RE = /(คุยกับใคร|คุยอยู่กับใคร|ใครตอบ|ใครคุย|ใครดูแล|ใครเป็นคนตอบ|ใครอ่าน)/;
const ADMIN_RE = /(แอดมิน|admin)/i;

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
  if (!t || t.length > 80) return null;
  // ai_bot: มีคำ AI + (เป็นคำถาม หรือ เทียบกับ "คน" หรือขึ้นต้นเชิงยืนยัน/ถาม)
  if (AI_TERM_RE.test(t)) {
    if (Q_RE.test(t) || AI_VS_HUMAN_RE.test(t) || /^(เป็น|คือ|ใช้|ใช่|สรุป|นี่)/.test(t)) {
      return "ai_bot";
    }
    return null; // มีคำ AI แต่ไม่ใช่คำถาม identity (เช่นเล่าเรื่องอื่น)
  }
  if (ADMIN_RE.test(t) && Q_RE.test(t)) return "admin_check";
  if (WHO_RE.test(t)) return "who";
  return null;
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
