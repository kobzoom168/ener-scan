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

function safeWrapText(text, maxLength = 300) {
  const clean = String(text || "").trim();
  if (!clean) return "-";
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

function stripBullet(text) {
  return String(text || "")
    .replace(/^•\s*/, "")
    .trim();
}

function normalizeScore(scoreText) {
  const raw = String(scoreText || "").trim();
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return {
      raw: raw || "-",
      numeric: null,
      display: raw || "-",
      percent: "50%",
    };
  }

  const numeric = Number(match[1]);
  const clamped = Number.isFinite(numeric)
    ? Math.max(0, Math.min(10, numeric))
    : null;

  const percent = clamped === null ? 50 : Math.round((clamped / 10) * 100);

  return {
    raw,
    numeric: clamped,
    display: match[1],
    percent: `${percent}%`,
  };
}

function getEnergyShortLabel(mainEnergy) {
  const value = String(mainEnergy || "").trim();

  if (value.includes("ปกป้อง")) return "พลังปกป้องเด่น";
  if (value.includes("อำนาจ")) return "พลังอำนาจเด่น";
  if (value.includes("โชคลาภ")) return "พลังโชคลาภเด่น";
  if (value.includes("สมดุล")) return "พลังสมดุลเด่น";
  if (value.includes("เมตตา")) return "พลังเมตตาเด่น";
  if (value.includes("ดึงดูด")) return "พลังดึงดูดเด่น";

  return value !== "-" ? value : "พลังเฉพาะทาง";
}

function createChip(text) {
  return {
    type: "box",
    layout: "vertical",
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingStart: "10px",
    paddingEnd: "10px",
    backgroundColor: "#262626",
    cornerRadius: "999px",
    contents: [
      {
        type: "text",
        text: safeWrapText(text, 60),
        size: "xs",
        color: "#EAEAEA",
        wrap: true,
      },
    ],
  };
}

function createMetricCard(label, value) {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    backgroundColor: "#1E1E1E",
    cornerRadius: "12px",
    flex: 1,
    contents: [
      {
        type: "text",
        text: label,
        size: "xs",
        color: "#9E9E9E",
      },
      {
        type: "text",
        text: safeWrapText(value, 60),
        size: "md",
        weight: "bold",
        color: "#FFFFFF",
        wrap: true,
        margin: "sm",
      },
    ],
  };
}

function createInfoCard(title, body, backgroundColor) {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "14px",
    backgroundColor,
    cornerRadius: "14px",
    flex: 1,
    contents: [
      {
        type: "text",
        text: title,
        weight: "bold",
        size: "sm",
        color: "#FFFFFF",
      },
      {
        type: "text",
        text: safeWrapText(body, 120),
        margin: "sm",
        size: "xs",
        color: "#DADADA",
        wrap: true,
      },
    ],
  };
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

  const score = normalizeScore(energyScore);
  const suitableLines =
    suitable.length > 0
      ? suitable
      : ["• ใช้ในจังหวะที่ต้องการความชัดและความนิ่ง"];

  const suitableLine1 = suitableLines[0] || "• ใช้ในจังหวะที่ต้องการความชัดและความนิ่ง";
  const suitableLine2 = suitableLines[1] || "";

  const chips = [
    createChip(`บุคลิก: ${stripBullet(personality) || "-"}`),
    createChip(`โทน: ${stripBullet(tone) || "-"}`),
  ];

  if (hidden && hidden !== "-") {
    chips.push(createChip(`พลังซ่อน: ${stripBullet(hidden)}`));
  }

  const suitableText = [suitableLine1, suitableLine2]
    .filter(Boolean)
    .map((line) => stripBullet(line))
    .join("\n• ");

  const suitableDisplay = suitableText ? `• ${suitableText}` : "• ใช้ในจังหวะที่ต้องการความชัดและความนิ่ง";

  return {
    type: "flex",
    altText: `ผลการตรวจพลังวัตถุ: ${mainEnergy} ${score.raw || energyScore}`,
    contents: {
      type: "bubble",
      size: "giga",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        backgroundColor: "#141414",
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
                color: "#F5F5F5",
                wrap: true,
              },
              {
                type: "text",
                text: "โดย อาจารย์ Ener",
                size: "sm",
                color: "#A8A8A8",
              },
            ],
          },
          {
            type: "separator",
            margin: "md",
            color: "#2E2E2E",
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "ระดับพลัง",
                size: "sm",
                color: "#9E9E9E",
              },
              {
                type: "box",
                layout: "baseline",
                spacing: "sm",
                contents: [
                  {
                    type: "text",
                    text: score.display,
                    weight: "bold",
                    size: "xxl",
                    color: accentColor,
                    flex: 0,
                  },
                  {
                    type: "text",
                    text: "/ 10",
                    size: "md",
                    color: "#D0D0D0",
                    flex: 0,
                  },
                ],
              },
              {
                type: "text",
                text: getEnergyShortLabel(mainEnergy),
                size: "sm",
                color: "#E6E6E6",
                wrap: true,
              },
              {
                type: "box",
                layout: "vertical",
                margin: "sm",
                backgroundColor: "#2A2A2A",
                cornerRadius: "8px",
                height: "8px",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    width: score.percent,
                    backgroundColor: accentColor,
                    cornerRadius: "8px",
                    height: "8px",
                    contents: [],
                  },
                ],
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "lg",
            spacing: "md",
            contents: [
              createMetricCard("พลังหลัก", mainEnergy),
              createMetricCard("ความสอดคล้อง", compatibility),
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
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: chips,
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
                type: "box",
                layout: "vertical",
                paddingAll: "14px",
                backgroundColor: "#1B1B1B",
                cornerRadius: "14px",
                contents: [
                  {
                    type: "text",
                    text: safeWrapText(overview, 260),
                    size: "sm",
                    color: "#E0E0E0",
                    wrap: true,
                  },
                ],
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "lg",
            spacing: "md",
            contents: [
              createInfoCard("เหมาะใช้เมื่อ", suitableDisplay, "#1D221C"),
              createInfoCard(
                "อาจไม่เด่นเมื่อ",
                notStrong || "อยู่ในช่วงที่ต้องการการเร่งผลทันทีหรือการเปลี่ยนแปลงรวดเร็ว",
                "#221D1D"
              ),
            ],
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            paddingAll: "14px",
            backgroundColor: "#242424",
            cornerRadius: "14px",
            contents: [
              {
                type: "text",
                text: safeWrapText(
                  closing || "หากมีหลายชิ้น ลองส่งชิ้นถัดไปเพื่อดูพลังที่ต่างกัน",
                  110
                ),
                size: "sm",
                color: "#FFFFFF",
                wrap: true,
              },
            ],
          },
          {
            type: "text",
            text: "ส่งภาพชิ้นถัดไปเพื่อดูพลังเพิ่มเติมได้",
            margin: "lg",
            size: "xs",
            align: "center",
            color: "#9E9E9E",
            wrap: true,
          },
        ],
      },
      styles: {
        body: {
          backgroundColor: "#141414",
        },
      },
    },
  };
}