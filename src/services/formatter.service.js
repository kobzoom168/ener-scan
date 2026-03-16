import { clampTextLength, normalizeWhitespace } from "../utils/text.js";

function cleanupRepeatedPhrases(text) {
  return text
    .replace(/แสงจันทร์ที่นุ่มนวล/gi, "แสงอ่อนที่พาใจนิ่ง")
    .replace(/สงบลุ่มลึก/gi, "นิ่งลึก")
    .replace(/นิ่งแต่หนักแน่น/gi, "หนักแน่น")
    .replace(/เปลวไฟอุ่น/gi, "แรงอุ่น")
    .replace(/สายน้ำที่ไหล/gi, "แรงที่เคลื่อนอย่างต่อเนื่อง");
}

export function formatScanOutput(rawText) {
  let text = normalizeWhitespace(rawText);

  text = cleanupRepeatedPhrases(text);

  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/ +/g, " ");

  if (!text.startsWith("🔮")) {
    text = `🔮 ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener\n\n${text}`;
  }

  text = text
    .replace("ลักษณะพลัง", "\nลักษณะพลัง")
    .replace("ภาพรวม", "\nภาพรวม")
    .replace("เหมาะใช้เมื่อ", "\nเหมาะใช้เมื่อ")
    .replace("อาจไม่เด่นเมื่อ", "\nอาจไม่เด่นเมื่อ")
    .replace("ปิดท้าย", "\nปิดท้าย");

  text = text.replace(/\n{3,}/g, "\n\n");

  text = clampTextLength(text, 700);

  return text.trim();
}