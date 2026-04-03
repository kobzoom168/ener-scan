/**
 * Blocklist for energy summary copy (headline / fit / bullets / short labels / offline fallback).
 * Keep aligned with product copy policy — not a general profanity filter.
 */

/** @type {readonly string[]} */
export const ENERGY_COPY_AVOID_WORDS = Object.freeze([
  "ใจนิ่ง",
  "มั่นใจ",
  "คิดเยอะ",
  "ใจแกว่ง",
  "ฟุ้ง",
  "ว้าวุ่น",
  "อยากนิ่งขึ้น",
  "ตั้งหลักไว",
  "คุมตัวเอง",
  "ดึงสติกลับ",
  "ไม่หลุดง่าย",
  "focus",
  "relief",
  "โฟกัส",
]);

/**
 * @param {string} line
 * @returns {boolean}
 */
export function lineContainsEnergyCopyAvoidWord(line) {
  const s = String(line || "");
  if (!s) return false;
  for (const w of ENERGY_COPY_AVOID_WORDS) {
    if (/^[a-z]+$/i.test(w)) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(s)) return true;
    } else if (s.includes(w)) return true;
  }
  return false;
}

/**
 * @param {readonly string[]} lines
 * @returns {boolean}
 */
export function anyLineContainsEnergyCopyAvoidWord(lines) {
  return lines.some((x) => lineContainsEnergyCopyAvoidWord(x));
}
