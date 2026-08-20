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

/* ---------------- normalization (Codex P1-4, raw log 19-20 ส.ค.) ----------------
 * เคสจริงที่หลุด: "สาธุๆๆคับผมท่านอาจารย์" → เข้า consult AI ฟรี 2 calls
 * ต้องรองรับ: ๆ ซ้ำ · คับ/ครับ ทุก variant · คำเรียกท้าย (ผม/ท่านอาจารย์) ·
 * เครื่องหมาย/emoji แต่ง — แต่ข้อความมีคำถามพ่วงห้ามเงียบเด็ดขาด */

const QUESTION_HINT_RE =
  /[?？]|ไหม|มั้ย|เหรอ|หรอ|รึเปล่า|หรือเปล่า|หรือยัง|ยังไง|อย่างไร|เมื่อไหร่|เมื่อไร|ทำไม|อะไร|ที่ไหน|กี่|ใคร|ช่วย|ขอ(?!บ)/;

const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}️‍\s]+$/u;

/** ตัดตัวแต่ง: ไม้ยมก/เครื่องหมาย/emoji → เหลือคำจริง */
function stripDecorations(text) {
  return String(text || "")
    .replace(/ๆ+/g, "")
    .replace(/[\p{Extended_Pictographic}️‍]/gu, "")
    .replace(/[!.。…~_*"'“”()\[\]-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TRAILING_SUFFIX_RE =
  /(ครับผม|คร้าบผม|คร้าบ|ครับ|คับผม|คับ|ค่ะ|คะ|จ้า|จ๊ะ|นะ|น้า|ผม|ท่านอาจารย์|อาจารย์|ท่าน|มาก|เลย|ด้วย)$/;

/** ตัดคำลงท้าย/คำเรียกซ้ำ ๆ ท้ายประโยค (คับผมท่านอาจารย์ → หมด) */
function stripTrailingSuffixes(text) {
  let s = String(text || "").trim();
  for (let i = 0; i < 10; i += 1) {
    const next = s.replace(TRAILING_SUFFIX_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

const UNCONDITIONAL_BASES = new Set(["ขอบคุณ", "ขอบใจ", "ขอบพระคุณ", "สาธุ", "อนุโมทนา"]);
const CONTEXTUAL_BASES = new Set([
  "", // เหลือแต่คำลงท้าย เช่น "ครับผม" ล้วน ๆ
  "โอเค", "โอเช", "ok", "okay", "thx", "thanks", "thank you",
  "โชคดี", "ราตรีสวัสดิ์", "ฝันดี", "หลับฝันดี", "บาย", "รับทราบ", "ได้",
]);

/** base คำซ้ำ เช่น "สาธุสาธุ" (หลังตัด ๆ) → "สาธุ" */
function collapseRepeatedBase(s) {
  for (const base of UNCONDITIONAL_BASES) {
    if (s && s.split(base).join("").trim() === "") return base;
  }
  return s;
}

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
  if (!t || t.length > 40) return null;
  // คำถามพ่วง = ต้องตอบเสมอ ห้ามเงียบ (Codex P1-4 acceptance)
  if (QUESTION_HINT_RE.test(t)) return null;
  if (UNCONDITIONAL_RES.some((re) => re.test(t))) return "unconditional";
  if (CONTEXTUAL_RES.some((re) => re.test(t))) return "contextual";
  if (EMOJI_ONLY_RE.test(t)) return "unconditional"; // emoji reaction ล้วน
  // เส้น normalize: ๆ ซ้ำ / คับ-ครับ variant / คำเรียกท้าย / เครื่องหมาย+emoji แต่ง
  const base = collapseRepeatedBase(stripTrailingSuffixes(stripDecorations(t)).toLowerCase());
  if (UNCONDITIONAL_BASES.has(base)) return "unconditional";
  if (CONTEXTUAL_BASES.has(base)) return "contextual";
  return null;
}

/* ---------------- greeting deterministic (Codex P1-4: AI=0) ---------------- */

const GREETING_BASES = new Set(["สวัสดี", "หวัดดี", "ฮัลโหล", "ฮัลโล", "hello", "hi", "ดีจ้า"]);

/**
 * ทักทายล้วน (ไม่มีเรื่อง/คำถามพ่วง) — ให้ webhook ตอบ deterministic ไม่ต้องเข้า
 * consult AI (raw log 19-20 ส.ค.: greeting เข้าฟรี consult 3 calls · ~4.8s vs 1.1s)
 * @param {string} text
 */
export function isPureGreeting(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 25) return false;
  if (QUESTION_HINT_RE.test(t)) return false;
  const base = stripTrailingSuffixes(stripDecorations(t)).toLowerCase();
  return GREETING_BASES.has(base);
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
