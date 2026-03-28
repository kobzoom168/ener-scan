/**
 * Parsed headings must match `ensureSectionSpacing` / section order in `formatter.service.js`
 * and the model contract in `deepScan.prompt.js` so Flex sections align with stored text.
 */
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

    result = result.replace(
      new RegExp(`(^|\\n)\\s*${escaped}\\s*:?\\s*`, "g"),
      `$1${heading}\n`
    );

    result = result.replace(
      new RegExp(`([^\\n])\\s+${escaped}\\s*:?\\s*`, "g"),
      `$1\n${heading}\n`
    );
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

/** Deep-scan dimension lines: `• คุ้มกัน: ★★★☆☆ — 3/5 ดาว` */
const SCAN_DIMENSION_KEYS = ["คุ้มกัน", "สมดุล", "อำนาจ", "เมตตา", "ดึงดูด"];

/**
 * @param {string[]} lines normalized scan lines
 * @returns {Record<string, number>}
 */
export function parseScanDimensionScores(lines) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of SCAN_DIMENSION_KEYS) {
    const prefixes = [`• ${k}:`, `• ${k} :`];
    const found = findLineByPrefixes(lines, prefixes);
    if (!found) continue;
    const slash = found.match(/(\d+)\s*\/\s*5\s*ดาว/);
    if (slash) {
      const n = Number(slash[1]);
      if (Number.isFinite(n)) {
        out[k] = Math.min(5, Math.max(1, Math.round(n)));
        continue;
      }
    }
    const filled = (found.match(/★/g) || []).length;
    if (filled >= 1) {
      out[k] = Math.min(5, Math.max(1, filled));
    }
  }
  return out;
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
    .filter((line) => line && line !== "-" && !/^[:\-–—•]+$/.test(line))
    .map((line) => stripBullet(line))
    .filter(
      (line) =>
        line &&
        line !== "-" &&
        !/^[•\-\–\—\s]+$/.test(line),
    )
    .map((line) => `• ${line}`)
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

  const extractedLines = section
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .slice(0, 2);

  if (extractedLines.length === 0) return fallback;

  return extractedLines.join(" ");
}

function findFallbackMainEnergy(rawText) {
  const text = normalizeText(rawText);

  if (text.includes("พลังปกป้อง") || text.includes("ปกป้อง") || text.includes("คุ้มครอง")) {
    return "พลังปกป้อง";
  }

  if (text.includes("พลังอำนาจ") || text.includes("อำนาจ") || text.includes("บารมี")) {
    return "พลังอำนาจ";
  }

  if (text.includes("พลังโชคลาภ") || text.includes("โชคลาภ") || text.includes("โชค")) {
    return "พลังโชคลาภ";
  }

  if (text.includes("พลังสมดุล") || text.includes("สมดุล") || text.includes("นิ่ง")) {
    return "พลังสมดุล";
  }

  if (text.includes("พลังเมตตา") || text.includes("เมตตา")) {
    return "พลังเมตตา";
  }

  if (text.includes("พลังดึงดูด") || text.includes("ดึงดูด") || text.includes("เสน่ห์")) {
    return "พลังดึงดูด";
  }

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

  const secondaryEnergy = getLineValue(lines, [
    "พลังเสริม:",
    "พลังเสริม :",
  ]);
  const dimensions = parseScanDimensionScores(lines);

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
    secondaryEnergy,
    dimensions,
  };
}