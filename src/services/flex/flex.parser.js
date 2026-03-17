import { cleanLine, stripBullet } from "./flex.utils.js";

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[：﹕]/g, ":")
    .replace(/\t/g, " ")
    .trim();
}

function forceHeadingLineBreaks(text) {
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
    const regex = new RegExp(`\\s*${escaped}\\s*`, "g");
    result = result.replace(regex, `\n${heading}\n`);
  }

  return result;
}

function normalizeLines(rawText) {
  return forceHeadingLineBreaks(normalizeText(rawText))
    .split("\n")
    .map((line) => cleanLine(line))
    .filter((line) => line !== "");
}

function normalizeTitle(text) {
  return cleanLine(text)
    .replace(/\s*:\s*$/, "")
    .trim();
}

function startsWithAnyTitle(line, titles = []) {
  const normalizedLine = normalizeTitle(line);
  return titles.some((title) => normalizedLine === normalizeTitle(title));
}

function findLineByPrefixes(lines, prefixes = []) {
  for (const line of lines) {
    const normalizedLine = cleanLine(line);

    for (const prefix of prefixes) {
      const normalizedPrefix = cleanLine(prefix);
      if (normalizedLine.startsWith(normalizedPrefix)) {
        return normalizedLine;
      }
    }
  }

  return null;
}

function getLineValue(lines, prefixes = [], fallback = "-") {
  const found = findLineByPrefixes(lines, prefixes);
  if (!found) return fallback;

  for (const prefix of prefixes) {
    const normalizedPrefix = cleanLine(prefix);
    if (found.startsWith(normalizedPrefix)) {
      const value = found.slice(normalizedPrefix.length).trim();
      return value || fallback;
    }
  }

  return fallback;
}

function findSectionStartIndex(lines, titles = []) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = cleanLine(lines[i]);
    if (startsWithAnyTitle(line, titles)) {
      return i;
    }
  }

  return -1;
}

function isStopTitle(line, stopTitles = []) {
  return startsWithAnyTitle(line, stopTitles);
}

function sanitizeSectionLines(collected = []) {
  return collected
    .map((line) => cleanLine(line))
    .filter(Boolean);
}

function extractSection(lines, startTitles = [], stopTitles = []) {
  const startIndex = findSectionStartIndex(lines, startTitles);
  if (startIndex === -1) return "";

  const collected = [];

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = cleanLine(lines[i]);

    if (!line) continue;
    if (isStopTitle(line, stopTitles)) break;

    collected.push(line);
  }

  return sanitizeSectionLines(collected).join("\n").trim();
}

function extractBulletSection(lines, startTitles = [], stopTitles = [], limit = 2) {
  const raw = extractSection(lines, startTitles, stopTitles);

  if (!raw) return [];

  return raw
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .map((line) => `• ${stripBullet(line)}`)
    .slice(0, limit);
}

function extractSingleLineAfterTitle(
  lines,
  startTitles = [],
  stopTitles = [],
  fallback = "-"
) {
  const section = extractSection(lines, startTitles, stopTitles);

  if (!section) return fallback;

  const firstLine = section
    .split("\n")
    .map((line) => cleanLine(line))
    .find(Boolean);

  return firstLine || fallback;
}

function findFallbackMainEnergy(rawText) {
  const text = normalizeText(rawText);

  if (text.includes("พลังปกป้อง")) return "พลังปกป้อง";
  if (text.includes("พลังอำนาจ")) return "พลังอำนาจ";
  if (text.includes("พลังโชคลาภ")) return "พลังโชคลาภ";
  if (text.includes("พลังสมดุล")) return "พลังสมดุล";
  if (text.includes("พลังเมตตา")) return "พลังเมตตา";
  if (text.includes("พลังดึงดูด")) return "พลังดึงดูด";

  return "-";
}

export function parseScanText(rawText) {
  const lines = normalizeLines(rawText);

  const energyScore = getLineValue(lines, [
    "ระดับพลัง:",
    "ระดับพลัง :",
    "คะแนนพลัง:",
    "คะแนนพลัง :",
  ]);

  const parsedMainEnergy = getLineValue(lines, [
    "พลังหลัก:",
    "พลังหลัก :",
    "ประเภทพลัง:",
    "ประเภทพลัง :",
  ]);

  const mainEnergy =
    parsedMainEnergy && parsedMainEnergy !== "-"
      ? parsedMainEnergy
      : findFallbackMainEnergy(rawText);

  const compatibility = getLineValue(lines, [
    "ความสอดคล้องกับเจ้าของ:",
    "ความสอดคล้องกับเจ้าของ :",
    "ความสอดคล้อง:",
    "ความสอดคล้อง :",
  ]);

  const personality = getLineValue(lines, [
    "• บุคลิก:",
    "• บุคลิก :",
    "บุคลิก:",
    "บุคลิก :",
  ]);

  const tone = getLineValue(lines, [
    "• โทนพลัง:",
    "• โทนพลัง :",
    "โทนพลัง:",
    "โทนพลัง :",
  ]);

  const hidden = getLineValue(lines, [
    "• พลังซ่อน:",
    "• พลังซ่อน :",
    "พลังซ่อน:",
    "พลังซ่อน :",
  ]);

  const overview =
    extractSection(
      lines,
      ["ภาพรวม", "คำอ่านพลัง", "สรุปภาพรวม"],
      [
        "เหตุผลที่เข้ากับเจ้าของ",
        "เหตุผลที่เข้ากับเจ้าของ:",
        "ชิ้นนี้หนุนเรื่อง",
        "ชิ้นนี้หนุนเรื่อง:",
        "เหมาะใช้เมื่อ",
        "เหมาะใช้เมื่อ:",
        "เหมาะใช้เมื่อ :",
        "เหมาะในช่วง",
        "เหมาะกับจังหวะ",
        "อาจไม่เด่นเมื่อ",
        "อาจไม่เด่นเมื่อ:",
        "อาจไม่เด่นเมื่อ :",
        "ไม่เด่นเมื่อ",
        "ควรระวังเมื่อ",
        "ควรใช้แบบไหน",
        "ควรใช้แบบไหน:",
        "ปิดท้าย",
        "ปิดท้าย:",
        "ปิดท้าย :",
      ]
    ) || "-";

  const fitReason =
    extractSection(
      lines,
      ["เหตุผลที่เข้ากับเจ้าของ", "เหตุผลที่เข้ากับเจ้าของ:"],
      [
        "ชิ้นนี้หนุนเรื่อง",
        "ชิ้นนี้หนุนเรื่อง:",
        "เหมาะใช้เมื่อ",
        "เหมาะใช้เมื่อ:",
        "อาจไม่เด่นเมื่อ",
        "อาจไม่เด่นเมื่อ:",
        "ควรใช้แบบไหน",
        "ควรใช้แบบไหน:",
        "ปิดท้าย",
        "ปิดท้าย:",
      ]
    ) || "-";

  const supportTopics = extractBulletSection(
    lines,
    ["ชิ้นนี้หนุนเรื่อง", "ชิ้นนี้หนุนเรื่อง:"],
    [
      "เหมาะใช้เมื่อ",
      "เหมาะใช้เมื่อ:",
      "อาจไม่เด่นเมื่อ",
      "อาจไม่เด่นเมื่อ:",
      "ควรใช้แบบไหน",
      "ควรใช้แบบไหน:",
      "ปิดท้าย",
      "ปิดท้าย:",
    ],
    2
  );

  const suitable = extractBulletSection(
    lines,
    ["เหมาะใช้เมื่อ", "เหมาะใช้เมื่อ:", "เหมาะในช่วง", "เหมาะกับจังหวะ"],
    [
      "อาจไม่เด่นเมื่อ",
      "อาจไม่เด่นเมื่อ:",
      "ไม่เด่นเมื่อ",
      "ควรระวังเมื่อ",
      "ควรใช้แบบไหน",
      "ควรใช้แบบไหน:",
      "ปิดท้าย",
      "ปิดท้าย:",
    ],
    2
  );

  const notStrong = extractSingleLineAfterTitle(
    lines,
    [
      "อาจไม่เด่นเมื่อ",
      "อาจไม่เด่นเมื่อ:",
      "ไม่เด่นเมื่อ",
      "ควรระวังเมื่อ",
    ],
    ["ควรใช้แบบไหน", "ควรใช้แบบไหน:", "ปิดท้าย", "ปิดท้าย:"],
    "-"
  );

  const usageGuide = extractSingleLineAfterTitle(
    lines,
    ["ควรใช้แบบไหน", "ควรใช้แบบไหน:"],
    ["ปิดท้าย", "ปิดท้าย:"],
    "-"
  );

  const closing =
    extractSection(
      lines,
      ["ปิดท้าย", "ปิดท้าย:", "คำแนะนำเพิ่มเติม", "ข้อแนะนำเพิ่มเติม"],
      []
    ) || "-";

  return {
    energyScore: energyScore || "-",
    mainEnergy: mainEnergy || "-",
    compatibility: compatibility || "-",
    personality: personality || "-",
    tone: tone || "-",
    hidden: hidden || "-",
    overview,
    fitReason,
    supportTopics: supportTopics.length > 0 ? supportTopics : [],
    suitable: suitable.length > 0 ? suitable : [],
    notStrong: notStrong || "-",
    usageGuide: usageGuide || "-",
    closing: closing || "-",
  };
}