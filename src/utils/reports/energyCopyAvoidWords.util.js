/**
 * Blocklist for energy summary copy (headline / fit / bullets / short labels / offline fallback).
 * Keep aligned with product copy policy — not a general profanity filter.
 */

/**
 * Lines containing these phrases must not be rejected by the avoid-word guard
 * (spiritual_growth / chakra copy uses them by design).
 * @type {readonly string[]}
 */
export const ENERGY_COPY_SPIRITUAL_ALLOW_SUBSTRINGS = Object.freeze([
  "จักระที่ 6",
  "จักระที่ 7",
  "หยั่งรู้",
  "จิตวิญญาณ",
  "เร่งการเปลี่ยนแปลง",
  "พลังงานสูง",
]);

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
  if (
    ENERGY_COPY_SPIRITUAL_ALLOW_SUBSTRINGS.some((frag) => s.includes(frag))
  ) {
    return false;
  }
  const masked = s.replace(/ความมั่นใจ/g, "\uE000");
  for (const w of ENERGY_COPY_AVOID_WORDS) {
    if (/^[a-z]+$/i.test(w)) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(masked)) return true;
    } else if (masked.includes(w)) return true;
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
