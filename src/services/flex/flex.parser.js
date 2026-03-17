import { cleanLine } from "./flex.utils.js";

function getLineValue(lines, prefix) {
  const found = lines.find((line) => line.startsWith(prefix));
  if (!found) return "-";
  return found.slice(prefix.length).trim() || "-";
}

function getBulletValue(lines, prefix) {
  const found = lines.find((line) => line.startsWith(prefix));
  if (!found) return "-";
  return found.slice(prefix.length).trim() || "-";
}

function extractSection(lines, startTitle, stopTitles = []) {
  const startIndex = lines.findIndex((line) => line === startTitle);
  if (startIndex === -1) return "";

  const collected = [];

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (stopTitles.includes(line)) break;
    if (!line) continue;
    collected.push(line);
  }

  return collected.join("\n").trim();
}

function extractBulletSection(lines, startTitle, stopTitles = []) {
  const raw = extractSection(lines, startTitle, stopTitles);

  return raw
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .map((line) => (line.startsWith("•") ? line : `• ${line}`))
    .slice(0, 2);
}

export function parseScanText(rawText) {

  const lines = String(rawText || "")
    .split("\n")
    .map((line) => cleanLine(line))
    .filter((line) => line !== "");

  return {
    energyScore: getLineValue(lines, "ระดับพลัง:"),
    mainEnergy: getLineValue(lines, "พลังหลัก:"),
    compatibility: getLineValue(lines, "ความสอดคล้องกับเจ้าของ:"),
    personality: getBulletValue(lines, "• บุคลิก:"),
    tone: getBulletValue(lines, "• โทนพลัง:"),
    hidden: getBulletValue(lines, "• พลังซ่อน:"),

    overview: extractSection(lines, "ภาพรวม", [
      "เหมาะใช้เมื่อ",
      "อาจไม่เด่นเมื่อ",
      "ปิดท้าย",
    ]),

    suitable: extractBulletSection(lines, "เหมาะใช้เมื่อ", [
      "อาจไม่เด่นเมื่อ",
      "ปิดท้าย",
    ]),

    notStrong: extractSection(lines, "อาจไม่เด่นเมื่อ", ["ปิดท้าย"]),

    closing: extractSection(lines, "ปิดท้าย"),
  };

}