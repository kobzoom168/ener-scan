/**
 * Hard chat tone contract (กบ 21 ส.ค. 2026 — จาก raw Pro audit 20-21 ส.ค.)
 *
 * โทนใหม่แบบเด็ดขาด: สั้น แข็ง ตรง — ห้าม "ครับ" ทุกข้อความที่ลูกค้าเห็น ·
 * คำเดียวพอ = คำเดียว · ไม่ขอบคุณกลับ ไม่สาธุกลับ ไม่ชม ไม่ปลอบ ไม่อวย ·
 * ไม่แนะนำถ้าไม่ได้ถาม · ไม่ชวนคุยต่อ ไม่ปิดด้วย CTA
 *
 * ใช้ 2 ทาง:
 * 1) validator กลางสำหรับ tests — ตรวจ copy ทุก surface (source of truth เดียว)
 * 2) runtime guard ก่อน customer send — static copy ต้องผ่านตั้งแต่ source แล้ว
 *    (ห้าม sanitize ทีหลัง) · LLM output ที่ไม่ผ่าน = regenerate → factual fallback
 */

/** คำต้องห้ามเด็ดขาดในข้อความลูกค้าเห็น */
export const BANNED_TOKENS = [
  "ครับ", "คับ", "ค่ะ", "นะคะ",
  "เดี๋ยว", "รบกวน", "ได้เลย", "ปกติ",
  "ขอบคุณ", "สาธุ", "ยินดี", "ขออภัย", "ขอโทษ",
];

/** วลีอวย/ปลอบ/ชวนคุยต่อ (โทนผิด) */
export const BANNED_PHRASES = [
  "สุดยอด", "เยี่ยม", "สวยมาก", "พลังแรงมาก", "หายากมาก", "เป็นบุญ",
  "ไม่ต้องกังวล", "สบายใจได้", "อย่ากังวล",
  "มีอะไรถามได้", "สอบถามเพิ่มเติม", "ยินดีให้บริการ", "แล้วคุยกันใหม่",
];

/** สัญญาเวลา — ระบบพิสูจน์ไม่ได้ ห้ามพูด */
export const TIME_PROMISE_RE = /\d+\s*[-–]?\s*\d*\s*(นาที|ชม\.|ชั่วโมง|วินาที)|ไม่เกิน\s*\d+|อีกสัก|สักครู่|รอแป[ปั]/;

const DEFAULT_MAX_CHARS = 40;
const STEP_MAX_LINES = 2;

/** ตัดอักขระซ่อน (zero-width/NBSP/BOM) ก่อนตรวจทุกครั้ง — เคสจริง "ขอบคุณ​ครับ​" */
export function normalizeInvisible(text) {
  return String(text || "")
    .replace(/[​-‍⁠﻿ 　]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ตรวจข้อความที่ลูกค้าเห็น 1 ก้อน
 * @param {string} text
 * @param {{ kind?: "reply"|"step"|"bundle", maxChars?: number }} [opts]
 *   reply = คำตอบทั่วไป (≤40 ตัว 1 บรรทัด) · step = ขั้นตอนจำเป็น (≤2 บรรทัด)
 *   bundle = payment/รายการ (ยกเว้นความยาว แต่คำต้องห้ามยังบังคับ)
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function checkHardTone(text, opts = {}) {
  const raw = String(text || "");
  const t = normalizeInvisible(raw);
  const violations = [];
  if (!t) return { ok: true, violations };

  for (const w of BANNED_TOKENS) if (t.includes(w)) violations.push(`banned_token:${w}`);
  for (const p of BANNED_PHRASES) if (t.includes(p)) violations.push(`banned_phrase:${p}`);
  if (TIME_PROMISE_RE.test(t)) violations.push("time_promise");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✅✨❌]/u.test(raw)) violations.push("emoji");
  if (/[—–]/.test(raw)) violations.push("ai_dash");
  if (/[“”"]/.test(raw)) violations.push("ai_quote");

  const kind = opts.kind || "reply";
  const lines = raw.split("\n").filter((l) => l.trim());
  if (kind === "reply") {
    const max = Number(opts.maxChars) > 0 ? Number(opts.maxChars) : DEFAULT_MAX_CHARS;
    if (t.length > max) violations.push(`too_long:${t.length}>${max}`);
    if (lines.length > 1) violations.push(`too_many_lines:${lines.length}`);
  } else if (kind === "step") {
    if (lines.length > STEP_MAX_LINES) violations.push(`too_many_lines:${lines.length}`);
  }
  return { ok: violations.length === 0, violations };
}

/** true = ผ่าน contract (ใช้ใน assertion สั้น ๆ) */
export function isHardTone(text, opts) {
  return checkHardTone(text, opts).ok;
}
