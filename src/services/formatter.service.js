import { clampTextLength, normalizeWhitespace } from "../utils/text.js";

export function formatScanOutput(rawText) {
  let text = normalizeWhitespace(rawText);

  text = text.replace(/\n{3,}/g, "\n\n");

  if (!text.startsWith("🔮")) {
    text = `🔮 ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener\n\n${text}`;
  }

  text = clampTextLength(text, 900);

  return text.trim();
}