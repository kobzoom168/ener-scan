function pickMainEnergyColor(text) {
  if (text.includes("พลังปกป้อง")) return "#D4AF37";
  if (text.includes("พลังอำนาจ")) return "#C62828";
  if (text.includes("พลังโชคลาภ")) return "#2E7D32";
  if (text.includes("พลังสมดุล")) return "#1565C0";
  if (text.includes("พลังเมตตา")) return "#8E24AA";
  if (text.includes("พลังดึงดูด")) return "#AD1457";
  return "#D4AF37";
}

function extractField(text, label) {
  const regex = new RegExp(`${label}:\\s*(.+)`);
  const match = text.match(regex);
  return match ? match[1].trim() : "-";
}

function extractSection(text, sectionName, nextSections = []) {
  const escapedSection = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextPattern = nextSections
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const regex = nextPattern
    ? new RegExp(`${escapedSection}\\n([\\s\\S]*?)(?=\\n(?:${nextPattern})\\b|$)`)
    : new RegExp(`${escapedSection}\\n([\\s\\S]*)`);

  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function toBulletLines(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith("•") ? line : `• ${line}`));
}

function safeWrapText(text, maxLength = 220) {
  const clean = String(text || "").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

export function buildScanFlex(rawText) {
  const accentColor = pickMainEnergyColor(rawText);

  const energyScore = extractField(rawText, "ระดับพลัง");
  const mainEnergy = extractField(rawText, "พลังหลัก");
  const compatibility = extractField(rawText, "ความสอดคล้องกับเจ้าของ");

  const personality = rawText.match(/•\s*บุคลิก:\s*(.+)/)?.[1]?.trim() || "-";
  const tone = rawText.match(/•\s*โทนพลัง:\s*(.+)/)?.[1]?.trim() || "-";
  const hidden = rawText.match(/•\s*พลังซ่อน:\s*(.+)/)?.[1]?.trim() || "-";

  const overview = extractSection(rawText, "ภาพรวม", [
    "เหมาะใช้เมื่อ",
    "อาจไม่เด่นเมื่อ",
    "ปิดท้าย",
  ]);

  const suitable = extractSection(rawText, "เหมาะใช้เมื่อ", [
    "อาจไม่เด่นเมื่อ",
    "ปิดท้าย",
  ]);

  const notStrong = extractSection(rawText, "อาจไม่เด่นเมื่อ", [
    "ปิดท้าย",
  ]);

  const closing = extractSection(rawText, "ปิดท้าย");

  const suitableLines = toBulletLines(suitable).slice(0, 2);

  return {
    type: "flex",
    altText: `ผลการตรวจพลังวัตถุ: ${mainEnergy} (${energyScore})`,
    contents: {
      type: "bubble",
      size: "giga",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        backgroundColor: "#1F1F1F",
        contents: [
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
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
            margin: "md",
            spacing: "sm",
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
                text: safeWrapText(overview, 260),
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
                text: line,
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
                text: safeWrapText(notStrong, 140),
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
            paddingAll: "12px",
            backgroundColor: "#2A2A2A",
            cornerRadius: "12px",
            contents: [
              {
                type: "text",
                text: safeWrapText(closing, 120),
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