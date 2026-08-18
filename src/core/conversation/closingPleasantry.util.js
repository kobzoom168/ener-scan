/**
 * ข้อความปิดบทสนทนา (กบ 18 ส.ค. + Codex รอบ 2): เงียบเมื่อ "จบเรื่องจริง" เท่านั้น
 * ไม่ใช่แค่ดูคำ — แบ่งสองชั้น:
 *  - unconditional: ขอบคุณ/สาธุ/อนุโมทนา/emoji reaction → เงียบได้เสมอ (ในเลน idle)
 *  - contextual: ครับ/โอเค/โชคดี/ฝันดี/บาย → เงียบเฉพาะเมื่อข้อความล่าสุดของระบบ
 *    เป็น terminal reply (ผลส่งแล้ว/การ์ดจบเรื่อง) และไม่ใช่คำถาม/handoff ค้าง
 *  - "สวัสดี" = คำเปิดบท ห้ามเงียบทุกกรณี (Codex จับได้ — เอาออกจาก set แล้ว)
 */
import { HANDOFF_RE } from "../../services/chatQualityDeterministic.util.js";

const UNCONDITIONAL_RES = [
  /^(ขอบคุณ|ขอบใจ|ขอบพระคุณ)(มาก|มากๆ|มากครับ|ครับ|ค่ะ|คับ|นะครับ|นะคะ|จ้า|ๆ|\s)*$/,
  /^(สาธุ|อนุโมทนา)(ครับ|ค่ะ|สาธุ|\s)*$/,
  /^[🙏❤️😊😀🥰👍]+$/u,
];

const CONTEXTUAL_RES = [
  /^(ครับ|ค่ะ|คับ|ครับผม|คร้าบ|จ้า|โอเค|โอเช|ok|okay|thx|thanks|thank you)(ครับ|ค่ะ|ผม|\s)*$/i,
  /^(โชคดี|ราตรีสวัสดิ์|ฝันดี|หลับฝันดี|บาย)(ครับ|ค่ะ|นะครับ|นะคะ|นะ|\s)*$/,
];

/** reply types ที่ถือว่า "จบเรื่องแล้ว" — ครับ/โอเคหลังจากนี้คือรับทราบ ไม่ใช่คำตอบคำถาม */
export const TERMINAL_REPLY_TYPES = new Set([
  "scan_result",
  "myscans_card",
  "result_status_answer",
  "sticker_input",
  "sticker_placeholder_text",
]);

/** @param {string} text @returns {"unconditional" | "contextual" | null} */
export function classifyClosingPleasantry(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 30) return null;
  if (UNCONDITIONAL_RES.some((re) => re.test(t))) return "unconditional";
  if (CONTEXTUAL_RES.some((re) => re.test(t))) return "contextual";
  return null;
}

/** ข้อความบอทล่าสุดเป็นคำถาม/handoff ค้าง = ครับ/โอเค คือคำตอบ ไม่ใช่คำปิดบท */
function lastBotAwaitsAnswer(lastBotText) {
  const t = String(lastBotText || "");
  if (!t) return false;
  if (HANDOFF_RE.test(t)) return true;
  return /[?？]\s*$|ไหมครับ\s*$|ไหมคะ\s*$|ไหม\s*$|อะไรครับ\s*$|วัดไหน|พิมพ์ตอบ/.test(t);
}

/**
 * ตัดสินว่าเงียบได้ไหม — pure (Codex: behavior tests ได้ตรง ๆ)
 * @param {{ text: string, lastBotReplyType?: string | null, lastBotText?: string | null }} p
 * @returns {{ silent: boolean, tier: "unconditional" | "contextual" | null }}
 */
export function resolveClosingSilence({ text, lastBotReplyType = null, lastBotText = null }) {
  const tier = classifyClosingPleasantry(text);
  if (!tier) return { silent: false, tier: null };
  if (tier === "unconditional") return { silent: true, tier };
  const terminal =
    TERMINAL_REPLY_TYPES.has(String(lastBotReplyType || "")) &&
    !lastBotAwaitsAnswer(lastBotText);
  return { silent: terminal, tier };
}

/** @deprecated ใช้ resolveClosingSilence — คงไว้ให้ caller เก่า/เทสต์เดิม */
export function isClosingPleasantry(text) {
  return classifyClosingPleasantry(text) === "unconditional";
}
