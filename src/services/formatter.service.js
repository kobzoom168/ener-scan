import { clampTextLength, normalizeWhitespace } from "../utils/text.js";

export function formatScanOutput(rawText) {
  let text = normalizeWhitespace(rawText);

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
    .replace("หมายเหตุ", "\nหมายเหตุ")
    .replace("ปิดท้าย", "\nปิดท้าย");

  text = text.replace(/\n{3,}/g, "\n\n");

  text = clampTextLength(text, 900);

  return text.trim();
}