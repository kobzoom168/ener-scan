import { clampTextLength, normalizeWhitespace } from "../utils/text.js";

const MAX_SCAN_OUTPUT_LENGTH = 1200;

function cleanupRepeatedPhrases(text) {
  return text
    .replace(/แสงจันทร์ที่นุ่มนวล/gi, "แสงอ่อนที่พาใจนิ่ง")
    .replace(/สงบลุ่มลึก/gi, "นิ่งลึก")
    .replace(/นิ่งแต่หนักแน่น/gi, "หนักแน่น")
    .replace(/เปลวไฟอุ่น/gi, "แรงอุ่น")
    .replace(/สายน้ำที่ไหล/gi, "แรงที่เคลื่อนอย่างต่อเนื่อง");
}

function ensureSectionSpacing(text) {
  const headings = [
    "ลักษณะพลัง",
    "ภาพรวม",
    "เหตุผลที่เข้ากับเจ้าของ",
    "ชิ้นนี้หนุนเรื่อง",
    "เหมาะใช้เมื่อ",
    "อาจไม่เด่นเมื่อ",
    "ควรใช้แบบไหน",
    "ปิดท้าย",
  ];

  let result = String(text || "");

  for (const heading of headings) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    result = result.replace(
      new RegExp(`(^|\\n)\\s*${escaped}\\s*:??\\s*`, "g"),
      `$1${heading}\n`
    );

    result = result.replace(
      new RegExp(`([^\\n])\\s+${escaped}\\s*:??\\s*`, "g"),
      `$1\n${heading}\n`
    );
  }

  return result;
}

export function formatScanOutput(rawText) {
  let text = normalizeWhitespace(rawText);

  text = cleanupRepeatedPhrases(text);

  if (!text.startsWith("🔮")) {
    text = `🔮 ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener\n\n${text}`;
  }

  text = ensureSectionSpacing(text);

  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{2,}/g, " ");

  text = clampTextLength(text, MAX_SCAN_OUTPUT_LENGTH);

  return text.trim();
}