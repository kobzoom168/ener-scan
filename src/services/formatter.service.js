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
  return text
    .replace(/ลักษณะพลัง/g, "\nลักษณะพลัง")
    .replace(/ภาพรวม/g, "\nภาพรวม")
    .replace(/เหตุผลที่เข้ากับเจ้าของ/g, "\nเหตุผลที่เข้ากับเจ้าของ")
    .replace(/ชิ้นนี้หนุนเรื่อง/g, "\nชิ้นนี้หนุนเรื่อง")
    .replace(/เหมาะใช้เมื่อ/g, "\nเหมาะใช้เมื่อ")
    .replace(/อาจไม่เด่นเมื่อ/g, "\nอาจไม่เด่นเมื่อ")
    .replace(/ควรใช้แบบไหน/g, "\nควรใช้แบบไหน")
    .replace(/ปิดท้าย/g, "\nปิดท้าย");
}

export function formatScanOutput(rawText) {
  let text = normalizeWhitespace(rawText);

  text = cleanupRepeatedPhrases(text);
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/ +/g, " ");

  if (!text.startsWith("🔮")) {
    text = `🔮 ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener\n\n${text}`;
  }

  text = ensureSectionSpacing(text);
  text = text.replace(/\n{3,}/g, "\n\n");

  text = clampTextLength(text, MAX_SCAN_OUTPUT_LENGTH);

  return text.trim();
}