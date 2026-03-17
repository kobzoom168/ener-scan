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

function createSectionTitle(text) {
  return {
    type: "text",
    text,
    weight: "bold",
    size: "md",
    color: "#FFFFFF",
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
        text: safeWrapText(text || "-", 44),
        size: "sm",
        color: "#F2F2F2",
        wrap: true,
        margin: "sm",
        flex: 1,
      },
    ],
  };
}

export function createSectionCard(title, body, backgroundColor, maxLength = 120) {
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
        text: safeWrapText(text || "-", 140),
        size: "sm",
        color,
        wrap: true,
      },
    ],
  };
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
  const energyLines = buildEnergyLines({ personality, tone, hidden });

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
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "xs",
          contents: [
            {
              type: "text",
              text: "ผลการตรวจพลังวัตถุ",
              weight: "bold",
              size: "xl",
              color: "#F8F8F8",
              wrap: true,
            },
            {
              type: "text",
              text: "โดย อาจารย์ Ener",
              size: "sm",
              color: "#A4A4A8",
            },
          ],
        },

        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#151515",
          cornerRadius: "18px",
          borderWidth: "1px",
          borderColor: "#262629",
          paddingAll: "16px",
          spacing: "sm",
          contents: [
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
            {
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
                  width: score.percent || "50%",
                  backgroundColor: accentColor,
                  cornerRadius: "8px",
                  height: "10px",
                  contents: [],
                },
              ],
            },
          ],
        },

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

export function buildReadingBubble({ overview, closing, accentColor }) {
  const cleanOverview =
    String(overview || "").trim() ||
    "วัตถุชิ้นนี้มีพลังบางอย่างที่เด่นในเชิงการใช้งานและการหนุนจังหวะชีวิต";

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

        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#161616",
          cornerRadius: "18px",
          borderWidth: "1px",
          borderColor: "#262629",
          paddingAll: "16px",
          spacing: "sm",
          contents: [
            {
              type: "text",
              text: "ภาพรวม",
              weight: "bold",
              size: "sm",
              color: "#FFFFFF",
            },
            {
              type: "text",
              text: cleanOverview,
              size: "sm",
              color: "#E3E3E3",
              wrap: true,
            },
          ],
        },

        createSoftNote(
          closing || "ลองส่งชิ้นถัดไปเพื่อเทียบพลังได้",
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
  suitable,
  notStrong,
  accentColor
}) {
  const suitableLines =
    Array.isArray(suitable) && suitable.length > 0
      ? suitable.slice(0, 2)
      : ["ใช้ในจังหวะที่ต้องการความชัดและความนิ่ง"];

  const suitableDisplay = suitableLines
    .filter(Boolean)
    .map((line) => `• ${stripBullet(line)}`)
    .join("\n");

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
          text: "จังหวะที่เหมาะ",
          weight: "bold",
          size: "xl",
          color: "#F5F5F5",
          margin: "md",
        },

        createSectionCard(
          "เหมาะใช้เมื่อ",
          suitableDisplay || "• ใช้ในจังหวะที่ต้องการความชัดและความนิ่ง",
          "#152017",
          180
        ),

        createSectionCard(
          "อาจไม่เด่นเมื่อ",
          notStrong || "อยู่ในช่วงที่ต้องการการเร่งผลทันทีหรือการเปลี่ยนแปลงรวดเร็ว",
          "#241919",
          140
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
        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "ดูประวัติ",
            text: "history"
          }
        },
        {
          type: "button",
          style: "primary",
          color: accentColor,
          action: {
            type: "message",
            label: "สแกนชิ้นต่อไป",
            text: "ขอสแกนชิ้นถัดไป"
          }
        }
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