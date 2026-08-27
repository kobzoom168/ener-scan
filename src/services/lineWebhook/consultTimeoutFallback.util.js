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
 * @param {{ hasReport?: boolean, latestScore?: number|null, latestPower?: string|null, latestCompat?: number|null }} ev
 * @returns {{ text: string, via: "evidence" | "honest" }}
 */
export function buildConsultUnavailableText(ev = {}) {
  const score = Number(ev.latestScore);
  const power = String(ev.latestPower || "").trim();
  const compat = Number(ev.latestCompat);
  if (ev.hasReport && Number.isFinite(score) && power) {
    // ข้อเท็จจริงจากรายงานล่าสุดของลูกค้าเอง (เสียงอาจารย์ ไม่แต่งเพิ่ม)
    const compatPart = Number.isFinite(compat) ? ` เข้ากับคุณ ${compat}%` : "";
    return {
      text: `จากผลอ่านชิ้นล่าสุดของคุณ พลังเด่นด้าน${power} คะแนน ${score}/10${compatPart} รายละเอียดอยู่ในรายงานครับ`,
      via: "evidence",
    };
  }
  return { text: CONSULT_UNAVAILABLE_TEXT, via: "honest" };
}
