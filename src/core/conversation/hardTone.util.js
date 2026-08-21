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
/** ระบุ "อายุสิทธิ์/ระยะเวลาใช้งาน" = ข้อเท็จจริง ไม่ใช่สัญญาว่าจะตอบเมื่อไร */
// ข้อเท็จจริงอายุแพ็ก (ไม่ใช่สัญญาเวลาตอบ): "ใช้ได้ 24 ชม." และรูปแบบการ์ด "4 ครั้ง · 24 ชม." / "ใน 24 ชม."
// (route replay 22 ส.ค.: paywall Flex จริงถูกบล็อกเพราะ mask ไม่ครอบรูปแบบการ์ด)
const VALIDITY_FACT_RE = /(?:(มีผล|ใช้ได้|ภายใน|อายุ|ตลอด|ถึง)\s*\d+\s*(นาที|ชม\.|ชั่วโมง|วัน)|\d+\s*ครั้ง\s*(?:[·•/]|ใน)\s*\d+\s*(ชม\.|ชั่วโมง|วัน))/u;

export function checkHardTone(text, opts = {}) {
  const raw = String(text || "");
  const t = normalizeInvisible(raw);
  const violations = [];
  if (!t) return { ok: true, violations };

  const m = POLITE_PARTICLE_RE.exec(` ${t} `);
  if (m) violations.push(`polite_particle:${m[1]}`);
  if (SOFT_NA_RE.test(t)) violations.push("soft_particle:นะ");
  for (const p of BANNED_PHRASES) if (t.includes(p)) violations.push(`banned_phrase:${p}`);
  // validity fact ถูก mask เฉพาะช่วงของมัน — ส่วนที่เหลือยังต้องตรวจสัญญาเวลา
  const masked = t.replace(new RegExp(VALIDITY_FACT_RE.source, "gu"), " ");
  if (TIME_PROMISE_RE.test(masked)) violations.push("time_promise");
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
 * Pre-send enforcement (Codex รอบสาม Blocker 1): ต้องเรียก "ก่อน" transport เสมอ —
 * ไม่ผ่าน = ห้ามส่ง (transport 0) ไม่ใช่ log ทีหลัง · ไม่แก้ข้อความ (ห้าม sanitize)
 * @param {string} text
 * @param {{ surface?: string, replyType?: string, kind?: "reply"|"step"|"bundle" }} meta
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function enforceHardToneBeforeSend(text, meta = {}) {
  const res = checkHardTone(text, { kind: meta.kind });
  if (!res.ok) {
    console.error(
      JSON.stringify({
        event: "HARD_TONE_BLOCKED_BEFORE_SEND",
        surface: meta.surface || "unknown",
        replyType: meta.replyType || null,
        violations: res.violations,
        sample: normalizeInvisible(text).slice(0, 60),
      }),
    );
  }
  return res;
}

/** @deprecated ใช้ enforceHardToneBeforeSend — คงไว้ให้ caller เก่าไม่พัง */
export function assertHardToneOrLog(text, meta = {}) {
  return enforceHardToneBeforeSend(text, meta);
}

/**
 * typed exemption: surface ที่ยกเว้นได้ พร้อมเหตุผล — "ชื่อ" อย่างเดียวไม่พอ
 * แต่ละตัวมีเงื่อนไขบังคับ (Codex P0-2): media_only ต้องเป็น payload สื่อล้วน ·
 * admin_command/admin_telegram ใช้ได้เฉพาะ admin boundary · scan_report_body
 * ใช้ได้เฉพาะ caller ที่อนุมัติ
 */
export const TONE_EXEMPT_SURFACES = Object.freeze({
  scan_report_body: "รายงานผลสแกน — เนื้อหาวิชา ไม่ใช่ข้อความสนทนา",
  admin_telegram: "แจ้งเตือนแอดมิน ไม่ใช่ลูกค้า",
  admin_command: "คำสั่งแอดมินใน LINE (ห้องแอดมินเท่านั้น)",
  media_only: "ข้อความสื่อ (เสียง/ภาพ) ที่ไม่มี chat copy",
  liff_page_html: "หน้าเว็บ LIFF (ไม่ใช่ข้อความแชท)",
});

/** เลือก kind ตาม replyType — bundle เฉพาะ payload ที่เป็นรายการ/เงิน (ไม่เดาจาก \n) */
const BUNDLE_REPLY_TYPES = /payment|paywall|quota_exhausted|offer|slip|qr|myscans|history|synergy_intro/i;
const REPLY_KIND_TYPES = /ack|greeting|closing|sticker|status|confirm/i;
export function toneKindForReplyType(replyType) {
  const rt = String(replyType || "");
  if (BUNDLE_REPLY_TYPES.test(rt)) return "bundle";
  if (REPLY_KIND_TYPES.test(rt)) return "reply";
  return "step";
}

/**
 * ดึงข้อความที่ลูกค้าเห็นทั้งหมดจาก Flex message (altText + text node + button label)
 * — Codex Blocker 4: nested text ต้องถูกตรวจ ไม่ใช่แค่ altText
 */
export function collectFlexTexts(flex) {
  const out = [];
  const seen = new Set();
  /** เก็บทุก key ที่เป็นข้อความลูกค้าเห็น — recursive เต็มรูป (Codex P0-3) */
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) return n.forEach(walk);
    // ข้อความที่ลูกค้าเห็นได้ทุกชนิด: altText / text (text+span) / label (button+quickReply)
    if (typeof n.altText === "string") out.push(n.altText);
    if ((n.type === "text" || n.type === "span") && typeof n.text === "string") out.push(n.text);
    if (typeof n.label === "string") out.push(n.label);
    if (n.action && typeof n.action === "object") {
      if (typeof n.action.label === "string") out.push(n.action.label);
      // displayText = ข้อความที่ LINE แสดงแทนผู้ใช้เมื่อกด action (ลูกค้าเห็น)
      if (typeof n.action.displayText === "string") out.push(n.action.displayText);
      if (typeof n.action.text === "string") out.push(n.action.text);
    }
    // เดินทุก property ที่เป็น object/array (carousel/bubble/box/contents/quickReply/items/...)
    for (const v of Object.values(n)) if (v && typeof v === "object") walk(v);
  };
  walk(flex);
  return out.filter((t) => String(t || "").trim());
}


/** payload สื่อล้วน (audio/image/video) ที่ไม่มี field ข้อความใด ๆ */
export function isMediaOnlyPayload(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  if (!list.length) return false;
  const TEXT_KEYS = ["text", "altText", "label", "displayText"];
  const hasTextField = (n) => {
    if (!n || typeof n !== "object") return typeof n === "string";
    if (Array.isArray(n)) return n.some(hasTextField);
    for (const k of TEXT_KEYS) if (typeof n[k] === "string" && n[k].trim()) return true;
    if (n.quickReply) return true; // quickReply มี label เสมอ = ไม่ใช่ media ล้วน
    return Object.values(n).some((v) => v && typeof v === "object" && hasTextField(v));
  };
  return list.every((m) => m && typeof m === "object" && ["audio", "image", "video"].includes(m.type) && !hasTextField(m));
}

/** surface ที่ต้องมาจาก admin boundary เท่านั้น */
export const ADMIN_ONLY_EXEMPT_SURFACES = new Set(["admin_command", "admin_telegram"]);
/** surface ที่ต้องมาจาก caller ที่อนุมัติเท่านั้น */
export const RESTRICTED_EXEMPT_CALLERS = Object.freeze({
  scan_report_body: new Set(["scan_result_delivery", "report_publish"]),
});

/**
 * ตัดสินว่า exemption ที่ caller อ้างใช้ได้จริงไหม (typed enforcement)
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function resolveExemption({ surface, messages, adminContext = false, callerId = null }) {
  const key = String(surface || "").trim();
  if (!key) return { allowed: false, reason: "no_exemption" };
  if (!TONE_EXEMPT_SURFACES[key]) return { allowed: false, reason: "unknown_exemption" };
  if (ADMIN_ONLY_EXEMPT_SURFACES.has(key) && adminContext !== true) {
    return { allowed: false, reason: "admin_context_required" };
  }
  if (key === "media_only" && !isMediaOnlyPayload(messages)) {
    return { allowed: false, reason: "not_media_only" };
  }
  const allowedCallers = RESTRICTED_EXEMPT_CALLERS[key];
  if (allowedCallers && !allowedCallers.has(String(callerId || ""))) {
    return { allowed: false, reason: "caller_not_approved" };
  }
  return { allowed: true };
}
