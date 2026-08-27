/**
 * consult ตอบไม่ได้ (timeout/ว่าง) ตอน idle (flow-role audit 26 ส.ค. — เคส 6:
 * "มีแบบพลังเต็มไหมครับ" → consult aborted 12 วิ → fallback เดิม "ส่งรูปมาได้เลย" ไม่ตอบคำถาม)
 *
 * กติกา (Codex): ห้ามสัญญาลอย ("ขอเวลาอาจารย์ดู…พิมพ์ถามอีกที") เพราะไม่มี durable owner
 * → ถ้ามี report evidence จริงและตอบ deterministic ได้ → ตอบจาก evidence ก่อน
 * → ไม่งั้นใช้ข้อความซื่อสัตย์ที่ไม่สัญญา
 */
const QUESTION_RE = /[?？]|ไหม|มั้ย|หรือเปล่า|รึเปล่า|ยังไง|อย่างไร|เท่าไหร่|เท่าไร|กี่|ทำไม|อะไร|ที่ไหน|เมื่อไหร่|ใช่ป่ะ|ดีป่ะ|แบบไหน|อันไหน|ชิ้นไหน|องค์ไหน/u;

/** @param {string} text */
export function isQuestionLike(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 200) return false;
  return QUESTION_RE.test(t);
}

export const CONSULT_UNAVAILABLE_TEXT = "ตอนนี้ยังตอบคำถามนี้ไม่ได้ครับ";

/**
 * ใช้ report evidence เฉพาะ (1) delivered จริง (2) คำถามเป็นเรื่องคะแนน/พลัง/ความเข้ากันของชิ้นล่าสุด
 * (3) มีค่าจริง (null ไม่กลายเป็น 0) — ไม่งั้น honest fallback (Codex รอบสอง #5)
 * @param {string} userText
 * @param {{ resultId?: string, score?: number|null, compat?: number|null, power?: string|null } | null} delivered
 * @returns {{ text: string, via: "evidence" | "honest" }}
 */
export function buildConsultUnavailableText(userText, delivered, deps = {}) {
  const isLatestQ = deps.isLatestReportQuestion || ((t) => /(?:องค์นี้|ชิ้นนี้|อันนี้|ล่าสุด)[^\n]{0,20}(?:คะแนน|พลัง|เข้ากับ|เด่นด้าน|เป็นไง|เป็นยังไง|ดีไหม)/u.test(String(t || "")));
  if (delivered && isLatestQ(userText)) {
    const parts = [];
    if (delivered.power) parts.push(`พลังเด่นด้าน${delivered.power}`);
    if (Number.isFinite(delivered.score)) parts.push(`คะแนน ${delivered.score}/10`);
    if (Number.isFinite(delivered.compat)) parts.push(`เข้ากับคุณ ${delivered.compat}%`);
    if (parts.length) return { text: `จากผลอ่านชิ้นล่าสุดของคุณ ${parts.join(" ")} รายละเอียดอยู่ในรายงานครับ`, via: "evidence" };
  }
  return { text: CONSULT_UNAVAILABLE_TEXT, via: "honest" };
}
