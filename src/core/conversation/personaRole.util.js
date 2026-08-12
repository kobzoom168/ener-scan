/**
 * Role router + pre-send money guard (persona hardening — Codex C2/C3, กบเคาะ 12 ส.ค. 2026)
 *
 * เส้นแบ่งเสียงตามกติกา persona: แอดมินเรียกตัวเองว่า "ผม" · อาจารย์เรียกตัวเองว่า
 * "อาจารย์" (ห้าม ผม) — ใช้เส้นนี้ resolve ว่าข้อความ LLM ขาออกเป็นเสียงใคร และบล็อก
 * "เสียงอาจารย์พูดเงิน" ก่อนถึงมือลูกค้า (เดิมมีแค่ Telegram แจ้งหลังส่ง)
 */
import { AJARN_MONEY_RE } from "../../stores/conversationMessages.db.js";

/** แอดมินเรียกตัวเอง ผม — ภาษาไทยเขียนติดกัน ("เดี๋ยวผม") ใช้ /ผม/ ตรง ๆ
 *  (คำที่มี ผม ปนอย่าง เส้นผม/สระผม โอกาสโผล่ในบริบทเงินต่ำมาก ยอม false pass ดีกว่า
 *  บล็อกคำตอบแอดมินที่ถูกกติกา) */
const ADMIN_SELF_RE = /ผม/;
/** ท่าพูดของอาจารย์ (อาจารย์+กริยาแสดงความเป็นผู้พูดเอง) */
const AJARN_VOICE_RE =
  /อาจารย์(มองว่า|ว่า|แนะนำ|ขอ|เห็นว่า|ไม่ฟันธง|ดูแล้ว|อ่านแล้ว|ฝากบอก|บอกได้เลย)|^📿/;

/**
 * resolve เสียงผู้พูดของข้อความ bot ขาออก
 * @param {string} text
 * @returns {"admin"|"ajarn"|"mixed"|"unknown"}
 */
export function resolveSpeakerRole(text) {
  const t = String(text || "");
  const admin = ADMIN_SELF_RE.test(t);
  const ajarn = AJARN_VOICE_RE.test(t);
  if (admin && ajarn) return "mixed";
  if (ajarn) return "ajarn";
  if (admin) return "admin";
  return "unknown";
}

/**
 * ความเสี่ยง "เงินนอกปากแอดมิน" (Codex รอบ 4): มีคำการเงิน และเสียงที่ resolve ได้
 * ไม่ใช่ admin ล้วน — mixed/ajarn/unknown ที่มีคำเงิน = block ทั้งหมด
 * (mixed = อาจารย์กับแอดมินปน bubble เดียว ก็ขัดกติกา ต้องแยกก่อน)
 * @param {string} text
 */
export function ajarnMoneyRisk(text) {
  const t = String(text || "");
  if (!AJARN_MONEY_RE.test(t)) return false;
  return resolveSpeakerRole(t) !== "admin";
}

/** intent เงินฝั่งลูกค้า — ใช้เลือกทาง fallback เมื่อ guard ตัดคำตอบทิ้ง */
export const USER_MONEY_INTENT_RE =
  /(ราคา|กี่บาท|ค่าครู|จ่าย|โอน|แพ็ก|เปิดสิทธิ์|สลิป|ชำระ|สมัคร)/;

/** neutral recovery — ห้ามชวนขาย และห้ามสัญญาว่าจะไปถามอาจารย์ (Codex รอบ 5:
 *  ประโยค "เดี๋ยวเรียนถามอาจารย์ให้" ไม่มีคำตอบตามจริง = สร้าง dangling handoff เอง) */
export const NEUTRAL_RECOVERY_FALLBACK =
  "เมื่อกี้คำตอบคลาดเคลื่อนไปครับ รบกวนถามเรื่องพลังอีกครั้งได้เลยครับ";

/**
 * Guard เงินสองชั้น (Codex รอบ 5):
 *  ชั้น 1 ใครพูด — เงินต้องออกจากเสียงแอดมินเท่านั้น (mixed/ajarn/unknown = block)
 *  ชั้น 2 ถูกจังหวะไหม — ลูกค้าไม่ได้ถามเงิน + ไม่ได้อยู่ paywall/payment state
 *  = เสนอขายเอง block แม้เสียงแอดมิน
 * @param {string} text
 * @param {{ userMoneyIntent?: boolean, inPaymentState?: boolean }} [ctx]
 * @returns {{ ok: true } | { ok: false, reason: "wrong_speaker" | "unsolicited" }}
 */
export function evaluateMoneyGuard(text, { userMoneyIntent = false, inPaymentState = false } = {}) {
  const t = String(text || "");
  if (!AJARN_MONEY_RE.test(t)) return { ok: true };
  if (resolveSpeakerRole(t) !== "admin") return { ok: false, reason: "wrong_speaker" };
  if (!userMoneyIntent && !inPaymentState) return { ok: false, reason: "unsolicited" };
  return { ok: true };
}
