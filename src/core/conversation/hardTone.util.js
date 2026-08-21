/**
 * Hard chat tone contract (กบ 21 ส.ค. 2026 — จาก raw Pro audit 20-21 ส.ค.)
 *
 * โทนใหม่แบบเด็ดขาด: สั้น แข็ง ตรง — ห้าม "ครับ" ทุกข้อความที่ลูกค้าเห็น ·
 * คำเดียวพอ = คำเดียว · ไม่ขอบคุณกลับ ไม่สาธุกลับ ไม่ชม ไม่ปลอบ ไม่อวย ·
 * ไม่แนะนำถ้าไม่ได้ถาม · ไม่ชวนคุยต่อ ไม่ปิดด้วย CTA · ไม่สัญญาเวลา/ผลอนาคต
 *
 * ตัวนี้เป็น source of truth เดียวของ "โทน" ใช้ 3 ทาง:
 * 1) inventory tests — สแกน static copy ทุก customer surface
 * 2) runtime guard ก่อน customer send (assertHardToneOrLog) — static copy ต้อง
 *    ผ่านตั้งแต่ source แล้ว (ห้าม sanitize ทีหลัง) · log violation เพื่อจับ regress
 * 3) LLM output contract (เฟส 2) — ไม่ผ่าน = regenerate → factual fallback
 *
 * Codex รอบสอง: token-aware (ห้าม substring กัดคำปกติเช่น "บังคับ") ·
 * step/bundle ต้องมีเพดานทั้งบรรทัดและความยาว · จับ malformed fragment
 */

/** particle/คำลงท้ายสุภาพ — ต่อท้ายคำได้ (ภาษาไทยเขียนติดกัน) แต่ห้ามกัดคำปกติ
 *  "คับ" ใช้ negative lookbehind กัน "บังคับ/กระชับ" · ตัวอื่นไม่มีคำไทยปกติลงท้ายแบบนั้น */
const POLITE_PARTICLE_RE =
  /(ครับผม|ครับ|คร้าบ|คับผม|ค่ะ|คะ|จ้า|จ๊ะ|ขอรับ|(?<!บัง)คับ)(?=$|[\s.,!?'"()\[\]\n])/u;

/** "นะ" แบบ particle เท่านั้น — ห้ามกัดคำปกติที่ลงท้าย "นะ" (สถานะ/ขณะ/ชนะ/ธุระ) */
const SOFT_NA_RE = new RegExp(
  "(?:^|\\s)นะ(?=$|[\\s.,!?\\n])" + // " นะ" เดี่ยว ๆ
    "|(?:แล้ว|ได้|ไป|มา|เลย|ก่อน|ใหม่|ซ้ำ|อีก|ที|หน่อย|ด้วย|กัน)นะ(?=$|[\\s.,!?\\n])",
  "u",
);

/** คำ/วลีต้องห้ามเชิงนโยบาย (ขอบคุณกลับ ปลอบ อวย ชวนคุยต่อ) */
export const BANNED_PHRASES = [
  "ขอบคุณ", "ขอบใจ", "สาธุ", "อนุโมทนา", "ยินดีให้บริการ", "ขออภัย", "ขอโทษ",
  "ไม่เป็นไร", "ไม่ต้องกังวล", "สบายใจได้", "อย่ากังวล", "ไม่รีบ",
  "สุดยอด", "เยี่ยม", "สวยมาก", "พลังแรงมาก", "หายากมาก", "เป็นบุญ", "ปัง",
  "มีอะไรถามได้", "สอบถามเพิ่มเติม", "แล้วคุยกันใหม่", "ยินดี",
  "รบกวน", "เดี๋ยว", "ได้เลย", "นิดเดียว", "แป๊บ", "แปป",
];

/** สัญญาเวลา/ผลอนาคตที่ระบบรับประกันไม่ได้ */
export const TIME_PROMISE_RE = new RegExp(
  [
    "\\d+\\s*[-–]?\\s*\\d*\\s*(นาที|ชม\\.|ชั่วโมง|วินาที)",
    "ไม่เกิน\\s*\\d+",
    "ใช้ประมาณ",
    "อีกสัก",
    "สักครู่",
    "ทันที",
    "ผลตามมา",
    "ผลจะ(?:มา|เข้า|ส่ง)",
    "จะ(?:ส่งผล|แจ้ง|เปิดสิทธิ์)ให้",
    "เสร็จแล้วแจ้ง",
    "รอ(?:แป|สัก)",
  ].join("|"),
  "u",
);

/** เศษประโยคจากการตัดคำแบบกลไก (ภาษาไทยเสียรูป) */
const MALFORMED_RES = [
  /(?:^|\s)(ทันที|แล้ว|จะ|ค่อย|อีก|ก็)\s+(รอ|แล้ว|ค่อย|อีก|ก็)(?:$|\s)/u, // "ทันที รอ"
  /(?:^|\s)อีก\s*ค่อย/u,                     // "อีกค่อยส่ง..."
  /[ \t]{2,}/,                                // ช่องว่างซ้อน (ไม่นับขึ้นบรรทัดใหม่)
  /(?:^|\s)(?:และ|หรือ|แต่|กับ|ให้|ที่|ของ|เพื่อ)\s*$/u, // คำเชื่อม/บุพบทลอยท้าย
  /^\s*(?:และ|หรือ|แต่|กับ|ก็|เลย)\s/u,      // ขึ้นต้นด้วยคำเชื่อม
];

const LIMITS = {
  reply: { maxChars: 40, maxLines: 1 },
  step: { maxChars: 120, maxLines: 2 },
  bundle: { maxChars: 320, maxLines: 8 },
};

/** ตัดอักขระซ่อน (zero-width/NBSP/BOM) ก่อนตรวจทุกครั้ง — เคสจริง "ขอบคุณ​ครับ​" */
export function normalizeInvisible(text) {
  return String(text || "")
    .replace(/[​-‍⁠﻿ 　]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * ตรวจข้อความที่ลูกค้าเห็น 1 ก้อน
 * @param {string} text
 * @param {{ kind?: "reply"|"step"|"bundle", maxChars?: number, maxLines?: number }} [opts]
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function checkHardTone(text, opts = {}) {
  const raw = String(text || "");
  const t = normalizeInvisible(raw);
  const violations = [];
  if (!t) return { ok: true, violations };

  const m = POLITE_PARTICLE_RE.exec(` ${t} `);
  if (m) violations.push(`polite_particle:${m[1]}`);
  if (SOFT_NA_RE.test(t)) violations.push("soft_particle:นะ");
  for (const p of BANNED_PHRASES) if (t.includes(p)) violations.push(`banned_phrase:${p}`);
  if (TIME_PROMISE_RE.test(t)) violations.push("time_promise");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}✅✨❌🙏]/u.test(raw)) violations.push("emoji");
  if (/[—–]/.test(raw)) violations.push("ai_dash");
  if (/[“”]/.test(raw)) violations.push("ai_quote");
  for (const re of MALFORMED_RES) if (re.test(t)) violations.push("malformed_fragment");

  const kind = LIMITS[opts.kind] ? opts.kind : "reply";
  const lim = LIMITS[kind];
  const maxChars = Number(opts.maxChars) > 0 ? Number(opts.maxChars) : lim.maxChars;
  const maxLines = Number(opts.maxLines) > 0 ? Number(opts.maxLines) : lim.maxLines;
  const lines = raw.split("\n").filter((l) => l.trim());
  if (t.length > maxChars) violations.push(`too_long:${t.length}>${maxChars}`);
  if (lines.length > maxLines) violations.push(`too_many_lines:${lines.length}>${maxLines}`);

  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}

/** true = ผ่าน contract */
export function isHardTone(text, opts) {
  return checkHardTone(text, opts).ok;
}

/**
 * Runtime guard ก่อน customer send — static copy ต้องผ่านตั้งแต่ source แล้ว
 * ตัวนี้ "ไม่แก้ข้อความ" (ห้าม sanitize ทีหลังตามสเปกกบ) แต่ log ให้จับ regress ได้
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function assertHardToneOrLog(text, meta = {}) {
  const res = checkHardTone(text, { kind: meta.kind });
  if (!res.ok) {
    console.log(
      JSON.stringify({
        event: "HARD_TONE_VIOLATION",
        surface: meta.surface || "unknown",
        replyType: meta.replyType || null,
        violations: res.violations,
        sample: normalizeInvisible(text).slice(0, 60),
      }),
    );
  }
  return res;
}
