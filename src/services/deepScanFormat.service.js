const REQUIRED_HEADINGS = [
  "ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener",
  "ระดับพลัง:",
  "พลังหลัก:",
  "ความสอดคล้องกับเจ้าของ:",
  "ลักษณะพลัง",
  "ภาพรวม",
  "เหตุผลที่เข้ากับเจ้าของ",
  "ชิ้นนี้หนุนเรื่อง",
  "เหมาะใช้เมื่อ",
  "อาจไม่เด่นเมื่อ",
  "ควรใช้แบบไหน",
  "ปิดท้าย",
];

export function isDeepScanFormatValid(text) {
  if (!text || typeof text !== "string") return false;
  return REQUIRED_HEADINGS.every((heading) => text.includes(heading));
}

export function normalizeDeepScanText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * First line containing `needle` (from that position to newline).
 * @param {string} text
 * @param {string} needle
 * @returns {string | null}
 */
function lineStartingWithNeedle(text, needle) {
  const t = String(text || "");
  const i = t.indexOf(needle);
  if (i < 0) return null;
  const rest = t.slice(i);
  const nl = rest.indexOf("\n");
  return nl < 0 ? rest.trim() : rest.slice(0, nl).trim();
}

/**
 * Heuristic: "พลังหลัก" + "บุคลิก" lines must include () human gloss.
 * โทนพลัง intentionally may omit () — meaning lives in ภาพรวม / เหมาะใช้เมื่อ.
 */
export function isDeepScanHumanReadable(text) {
  const t = String(text || "");
  if (!t.includes("(") || !t.includes(")")) return false;

  const pk = lineStartingWithNeedle(t, "พลังหลัก:");
  const bk = lineStartingWithNeedle(t, "บุคลิก:");

  if (!pk || !pk.includes("(")) return false;
  if (!bk || !bk.includes("(")) return false;

  return true;
}

/** Too many "(" → cluttered; prompts cap at 5 total opens */
export function isDeepScanTooDense(text) {
  const n = (String(text || "").match(/\(/g) || []).length;
  return n > 5;
}

/** Passes human gloss on key lines + not over-parenthesized */
export function isDeepScanPolished(text) {
  return isDeepScanHumanReadable(text) && !isDeepScanTooDense(text);
}

/** Alias for `isDeepScanHumanReadable` (safeguard name) */
export function ensureHumanReadable(text) {
  return isDeepScanHumanReadable(text);
}
