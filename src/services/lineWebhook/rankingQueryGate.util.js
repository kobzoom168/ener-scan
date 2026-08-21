/**
 * เกตคำถามจัดอันดับในแชท (กบ 18 ส.ค. — เคสจริงตี 1-5: ลูกค้าฟรีพิมพ์ถาม
 * "ชิ้นไหนคะแนนสูงสุด/อันดับ" เอาคำตอบที่รายงานเซ็นเซอร์ไว้ให้คนจ่าย)
 *
 * กติกา: ไม่มีประวัติจ่ายภายใน 3 วัน (SSOT = hasRecentPaidAccess ตัวเดียวกับ
 * ที่เซ็นเซอร์คลัง/อันดับบนหน้ารายงาน) → แชทห้ามตอบอันดับ/ชิ้นแรงสุด
 * ให้ชี้ไปรายงานหลัก "เลื่อนลงด้านล่างมีอันดับ" (ตรงนั้นเซ็นเซอร์+ชวนเปิดสิทธิ์เอง)
 */

/** คำถามเชิงจัดอันดับ/หาตัวท็อป — สั้นและเจาะจงพอที่จะเป็นคำถามอันดับจริง */
const RANKING_RE =
  /(แรงสุด|แรงที่สุด|สูงสุด|สูงที่สุด|ดีสุด|ดีที่สุด|เด่นสุด|เด่นที่สุด|อันดับ|จัดอันดับ|ท็อป|top\s*\d*|เทียบคะแนน|คะแนนเยอะสุด)/i;

/** @param {string} text */
export function isRankingQuery(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 60) return false;
  return RANKING_RE.test(t);
}

const THAI_ORDINAL = { หนึ่ง: 1, สอง: 2, สาม: 3, สี่: 4, ห้า: 5 };

/**
 * อันดับที่ลูกค้าถามถึง (Codex P0-1: semanticKey ต้องรวม requestedRank —
 * "อันดับ 1" กับ "อันดับ 2" คือคนละคำถาม ห้ามโดน semantic dedupe ยุบเป็นตัวเดียว)
 * @param {string} text
 * @returns {number|null} เลขอันดับ หรือ null เมื่อไม่ระบุ (เช่น "ชิ้นไหนแรงสุด")
 */
export function extractRequestedRank(text) {
  const t = String(text || "").trim();
  const m = t.match(/(?:อันดับ|ที่|ท็อป|top)\s*(\d{1,2})/i);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) && n >= 1 && n <= 99 ? n : null;
  }
  const w = t.match(/อันดับ\s*(หนึ่ง|สอง|สาม|สี่|ห้า)/);
  if (w) return THAI_ORDINAL[w[1]] || null;
  return null;
}

/** copy ชี้ทางไปรายงาน — ไม่มีตัวเลข/ชื่อชิ้น/คำเงิน (paywall บนหน้ารายงานทำหน้าที่เอง) */
export function buildRankingRedirectText(latestReportUrl) {
  const lines = [
    "อันดับและชิ้นเด่นของคลังคุณอยู่ในรายงานหลัก",
    "เปิดรายงานชิ้นล่าสุดแล้วเลื่อนลงด้านล่าง จะเห็นอันดับครบทุกด้าน",
  ];
  if (latestReportUrl) lines.push("", latestReportUrl);
  return lines.join("\n");
}
