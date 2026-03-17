import {
  safeWrapText,
  stripBullet,
  buildEnergyLines,
  getEnergyShortLabel
} from "./flex.utils.js";

function createTopAccent(accentColor) {
  return {
    type: "box",
    layout: "vertical",
    height: "6px",
    backgroundColor: accentColor,
    cornerRadius: "12px",
    contents: [],
  };
}

function createMainTitle(title, subtitle) {
  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    spacing: "xs",
    contents: [
      {
        type: "text",
        text: title,
        weight: "bold",
        size: "xl",
        color: "#F8F8F8",
        wrap: true,
      },
      {
        type: "text",
        text: subtitle,
        size: "sm",
        color: "#A4A4A8",
        wrap: true,
      },
    ],
  };
}

function createSectionTitle(text) {
  return {
    type: "text",
    text,
    weight: "bold",
    size: "md",
    color: "#FFFFFF",
  };
}

function createCardShell(contents, options = {}) {
  const {
    backgroundColor = "#151515",
    borderColor = "#262629",
    cornerRadius = "18px",
    paddingAll = "16px",
    spacing = "sm",
  } = options;

  return {
    type: "box",
    layout: "vertical",
    backgroundColor,
    cornerRadius,
    borderWidth: "1px",
    borderColor,
    paddingAll,
    spacing,
    contents,
  };
}

function createProgressBar(percent = "50%", accentColor = "#D4AF37") {
  return {
    type: "box",
    layout: "vertical",
    margin: "sm",
    backgroundColor: "#2B2B2E",
    cornerRadius: "8px",
    height: "10px",
    contents: [
      {
        type: "box",
        layout: "vertical",
        width: percent,
        backgroundColor: accentColor,
        cornerRadius: "8px",
        height: "10px",
        contents: [],
      },
    ],
  };
}

export function createMetricCard(label, value) {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "14px",
    backgroundColor: "#18181A",
    cornerRadius: "16px",
    borderWidth: "1px",
    borderColor: "#2A2A2D",
    flex: 1,
    contents: [
      {
        type: "text",
        text: label,
        size: "xs",
        color: "#8F8F95",
      },
      {
        type: "text",
        text: safeWrapText(value || "-", 40),
        size: "lg",
        weight: "bold",
        color: "#FFFFFF",
        wrap: true,
        margin: "sm",
      },
    ],
  };
}

export function createEnergyLine(text) {
  return {
    type: "box",
    layout: "horizontal",
    paddingAll: "12px",
    backgroundColor: "#171717",
    cornerRadius: "14px",
    borderWidth: "1px",
    borderColor: "#242427",
    contents: [
      {
        type: "text",
        text: "•",
        size: "sm",
        color: "#D4AF37",
        flex: 0,
      },
      {
        type: "text",
        text: safeWrapText(text || "-", 60),
        size: "sm",
        color: "#F2F2F2",
        wrap: true,
        margin: "sm",
        flex: 1,
      },
    ],
  };
}

export function createSectionCard(title, body, backgroundColor, maxLength = 180) {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "14px",
    backgroundColor,
    cornerRadius: "16px",
    spacing: "sm",
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
        text: safeWrapText(body || "-", maxLength),
        size: "sm",
        color: "#E3E3E3",
        wrap: true,
      },
    ],
  };
}

function createSoftNote(text, color = "#F4E3AE", backgroundColor = "#1D1A14") {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor,
    cornerRadius: "16px",
    paddingAll: "14px",
    contents: [
      {
        type: "text",
        text: safeWrapText(text || "-", 160),
        size: "sm",
        color,
        wrap: true,
      },
    ],
  };
}

function createBulletBlock(title, lines = [], backgroundColor = "#152017") {
  const normalizedLines =
    Array.isArray(lines) && lines.length > 0
      ? lines.filter(Boolean).slice(0, 2)
      : ["• -"];

  return {
    type: "box",
    layout: "vertical",
    paddingAll: "14px",
    backgroundColor,
    cornerRadius: "16px",
    spacing: "sm",
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
        text: normalizedLines
          .map((line) => `• ${stripBullet(line)}`)
          .join("\n"),
        size: "sm",
        color: "#E3E3E3",
        wrap: true,
      },
    ],
  };
}

function createFooterButton({
  label,
  text,
  style = "secondary",
  color,
}) {
  const button = {
    type: "button",
    style,
    action: {
      type: "message",
      label,
      text,
    },
  };

  if (color) {
    button.color = color;
  }

  return button;
}

export function buildSummaryBubble({
  accentColor,
  score,
  mainEnergy,
  compatibility,
  personality,
  tone,
  hidden
}) {
  const rawEnergyLines = buildEnergyLines({ personality, tone, hidden });
  const energyLines =
    Array.isArray(rawEnergyLines) && rawEnergyLines.length > 0
      ? rawEnergyLines
      : ["พลังนิ่ง", "โทนพลังเฉพาะทาง"];

  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "md",
      backgroundColor: "#101010",
      contents: [
        createTopAccent(accentColor),

        createMainTitle("ผลการตรวจพลังวัตถุ", "โดย อาจารย์ Ener"),

        createCardShell(
          [
            {
              type: "text",
              text: "ระดับพลัง",
              size: "sm",
              color: "#9B9BA1",
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                {
                  type: "text",
                  text: score.display || "-",
                  weight: "bold",
                  size: "4xl",
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
              text: getEnergyShortLabel(mainEnergy || "พลังทั่วไป"),
              size: "sm",
              color: "#ECECEC",
              wrap: true,
            },
            createProgressBar(score.percent || "50%", accentColor),
          ],
          {
            backgroundColor: "#151515",
            borderColor: "#262629",
            cornerRadius: "18px",
            paddingAll: "16px",
            spacing: "sm",
          }
        ),

        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [
            createMetricCard("พลังหลัก", mainEnergy || "-"),
            createMetricCard("ความสอดคล้อง", compatibility || "-"),
          ],
        },

        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            createSectionTitle("ลักษณะพลัง"),
            ...energyLines.map((line) => createEnergyLine(line)),
          ],
        },
      ],
    },
    styles: {
      body: {
        backgroundColor: "#101010",
      },
    },
  };
}

export function buildReadingBubble({
  overview,
  fitReason,
  closing,
  accentColor
}) {
  const cleanOverview =
    String(overview || "").trim() ||
    "วัตถุชิ้นนี้มีพลังบางอย่างที่เด่นในเชิงการใช้งานและการหนุนจังหวะชีวิต";

  const cleanFitReason =
    String(fitReason || "").trim() ||
    "ชิ้นนี้เข้ากับเจ้าของในเชิงหนุนความนิ่งและประคองจังหวะ มากกว่าการผลักให้พุ่งเร็วทันที";

  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "md",
      backgroundColor: "#101010",
      contents: [
        createTopAccent(accentColor),

        {
          type: "text",
          text: "คำอ่านพลัง",
          weight: "bold",
          size: "xl",
          color: "#F5F5F5",
          margin: "md",
        },

        createCardShell(
          [
            {
              type: "text",
              text: "ภาพรวม",
              weight: "bold",
              size: "sm",
              color: "#FFFFFF",
            },
            {
              type: "text",
              text: safeWrapText(cleanOverview, 280),
              size: "sm",
              color: "#E3E3E3",
              wrap: true,
            },
          ],
          {
            backgroundColor: "#161616",
            borderColor: "#262629",
            cornerRadius: "18px",
            paddingAll: "16px",
            spacing: "sm",
          }
        ),

        createSectionCard(
          "เหตุผลที่เข้ากับเจ้าของ",
          cleanFitReason,
          "#141C22",
          240
        ),

        createSoftNote(
          closing || "ถ้ามีอีกชิ้น ลองส่งมาเทียบกันได้ครับ จะเห็นมุมพลังที่ต่างกันชัดขึ้น",
          "#F4E3AE",
          "#1D1A14"
        ),
      ],
    },
    styles: {
      body: {
        backgroundColor: "#101010",
      },
    },
  };
}

export function buildUsageBubble({
  supportTopics,
  suitable,
  notStrong,
  usageGuide,
  accentColor
}) {
  const supportLines =
    Array.isArray(supportTopics) && supportTopics.length > 0
      ? supportTopics.slice(0, 2)
      : [
          "ใจนิ่งเวลาต้องตัดสินใจ",
          "รับแรงกดดันได้มั่นคงขึ้น",
        ];

  const suitableLines =
    Array.isArray(suitable) && suitable.length > 0
      ? suitable.slice(0, 2)
      : ["ใช้ในจังหวะที่ต้องการความชัดและความนิ่ง"];

  const cleanUsageGuide =
    String(usageGuide || "").trim() ||
    "เหมาะพกติดตัวในวันที่ต้องรับแรงกดดัน หรือใช้ต่อเนื่องเพื่อให้พลังค่อย ๆ หนุนจังหวะ";

  const cleanNotStrong =
    String(notStrong || "").trim() ||
    "อยู่ในช่วงที่ต้องการการเร่งผลทันทีหรือการเปลี่ยนแปลงรวดเร็ว";

  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "md",
      backgroundColor: "#101010",
      contents: [
        createTopAccent(accentColor),

        {
          type: "text",
          text: "ใช้ยังไงให้คุ้ม",
          weight: "bold",
          size: "xl",
          color: "#F5F5F5",
          margin: "md",
        },

        createBulletBlock(
          "ชิ้นนี้หนุนเรื่อง",
          supportLines,
          "#122817"
        ),

        createBulletBlock(
          "เหมาะใช้เมื่อ",
          suitableLines,
          "#0F2A23"
        ),

        createSectionCard(
          "อาจไม่เด่นเมื่อ",
          cleanNotStrong,
          "#2A1719",
          160
        ),

        createSectionCard(
          "ควรใช้แบบไหน",
          cleanUsageGuide,
          "#1B1830",
          180
        ),
      ],
    },

    footer: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#101010",
      paddingTop: "4px",
      paddingBottom: "14px",
      paddingStart: "18px",
      paddingEnd: "18px",
      spacing: "sm",
      contents: [
        createFooterButton({
          label: "ดูประวัติ",
          text: "history",
          style: "secondary",
        }),
        createFooterButton({
          label: "สแกนชิ้นต่อไป",
          text: "ขอสแกนชิ้นถัดไป",
          style: "primary",
          color: accentColor,
        }),
      ],
    },

    styles: {
      body: {
        backgroundColor: "#101010",
      },
      footer: {
        backgroundColor: "#101010",
      },
    },
  };
}