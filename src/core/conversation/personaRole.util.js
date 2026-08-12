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
 * ความเสี่ยง "อาจารย์พูดเงิน": มีคำการเงิน แต่ไม่มีเสียงแอดมิน (ผม) กำกับเลย
 * — กติกา: ทุกการพูดเรื่องเงินต้องออกจากปากแอดมินเท่านั้น
 * @param {string} text
 */
export function ajarnMoneyRisk(text) {
  const t = String(text || "");
  return AJARN_MONEY_RE.test(t) && !ADMIN_SELF_RE.test(t);
}

/** fallback ปลอดภัยเมื่อ regenerate แล้วยังเสี่ยง — เสียงแอดมินล้วน ไม่มีตัวเลข */
export const SAFE_ADMIN_MONEY_FALLBACK =
  "เรื่องค่าครูเดี๋ยวผมดูแลให้เองครับ สนใจแบบไหนบอกผมได้เลย เดี๋ยวมีตัวเลือกเด้งให้แตะครับ";
