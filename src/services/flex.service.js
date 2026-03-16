function pickMainEnergyColor(text) {
  if (text.includes("พลังปกป้อง")) return "#D4AF37";
  if (text.includes("พลังอำนาจ")) return "#C62828";
  if (text.includes("พลังโชคลาภ")) return "#2E7D32";
  if (text.includes("พลังสมดุล")) return "#1565C0";
  if (text.includes("พลังเมตตา")) return "#8E24AA";
  if (text.includes("พลังดึงดูด")) return "#AD1457";
  return "#D4AF37";
}

function cleanLine(line) {
  return String(line || "").trim();
}

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

  for (let i = startIndex + 1; i < lines.length; i++) {
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

function safeWrapText(text, maxLength = 300) {
  const clean = String(text || "").trim();
  if (!clean) return "-";
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

function parseScanText(rawText) {
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

export function buildScanFlex(rawText) {
  const accentColor = pickMainEnergyColor(rawText);

  const {
    energyScore,
    mainEnergy,
    compatibility,
    personality,
    tone,
    hidden,
    overview,
    suitable,
    notStrong,
    closing,
  } = parseScanText(rawText);

  const suitableLines =
    suitable.length > 0 ? suitable : ["• ใช้ในจังหวะที่ต้องการความชัดและความนิ่ง"];

  return {
    type: "flex",
    altText: `ผลการตรวจพลังวัตถุ: ${mainEnergy} ${energyScore}`,
    contents: {
      type: "bubble",
      size: "giga",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        spacing: "md",
        backgroundColor: "#1F1F1F",
        contents: [
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              {
                type: "text",
                text: "🔮 ผลการตรวจพลังวัตถุ",
                weight: "bold",
                size: "lg",
                color: "#FFFFFF",
                wrap: true,
              },
              {
                type: "text",
                text: "โดย อาจารย์ Ener",
                size: "sm",
                color: "#BDBDBD",
              },
            ],
          },
          {
            type: "separator",
            margin: "md",
            color: "#3A3A3A",
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "md",
            contents: [
              {
                type: "text",
                text: `ระดับพลัง: ${energyScore}`,
                weight: "bold",
                size: "xl",
                color: accentColor,
                wrap: true,
              },
              {
                type: "text",
                text: `พลังหลัก: ${mainEnergy}`,
                size: "md",
                color: "#FFFFFF",
                wrap: true,
              },
              {
                type: "text",
                text: `ความสอดคล้องกับเจ้าของ: ${compatibility}`,
                size: "md",
                color: "#E0E0E0",
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "ลักษณะพลัง",
                weight: "bold",
                size: "md",
                color: "#FFFFFF",
              },
              {
                type: "text",
                text: `• บุคลิก: ${personality}`,
                size: "sm",
                color: "#E0E0E0",
                wrap: true,
              },
              {
                type: "text",
                text: `• โทนพลัง: ${tone}`,
                size: "sm",
                color: "#E0E0E0",
                wrap: true,
              },
              {
                type: "text",
                text: `• พลังซ่อน: ${hidden}`,
                size: "sm",
                color: "#E0E0E0",
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "ภาพรวม",
                weight: "bold",
                size: "md",
                color: "#FFFFFF",
              },
              {
                type: "text",
                text: safeWrapText(overview, 420),
                size: "sm",
                color: "#E0E0E0",
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "เหมาะใช้เมื่อ",
                weight: "bold",
                size: "md",
                color: "#FFFFFF",
              },
              ...suitableLines.map((line) => ({
                type: "text",
                text: safeWrapText(line, 160),
                size: "sm",
                color: "#E0E0E0",
                wrap: true,
              })),
            ],
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "อาจไม่เด่นเมื่อ",
                weight: "bold",
                size: "md",
                color: "#FFFFFF",
              },
              {
                type: "text",
                text: safeWrapText(notStrong, 220),
                size: "sm",
                color: "#E0E0E0",
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            paddingAll: "12px",
            backgroundColor: "#2A2A2A",
            cornerRadius: "12px",
            contents: [
              {
                type: "text",
                text: safeWrapText(closing, 180),
                size: "sm",
                color: "#FFFFFF",
                wrap: true,
              },
            ],
          },
        ],
      },
      styles: {
        body: {
          backgroundColor: "#1F1F1F",
        },
      },
    },
  };
}