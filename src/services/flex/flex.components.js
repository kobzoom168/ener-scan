import {
  safeWrapText,
  buildEnergyLines,
  getEnergyShortLabel,
  formatMainEnergyForCard,
  sanitizeBulletLines,
  clampToFlexLines,
} from "./flex.utils.js";
import {
  FLEX_OVERVIEW_DISPLAY_MAX,
  FLEX_FIT_DISPLAY_MAX,
  FLEX_CLOSING_MAX_CHARS,
} from "./flex.display.js";

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
        text: clampToFlexLines(safeWrapText(value || "-", 48), 2, 20).join("\n"),
        size: "md",
        weight: "bold",
        color: "#FFFFFF",
        wrap: true,
        maxLines: 2,
        margin: "sm",
      },
    ],
  };
}

/** Narrow card: category + short hint — avoids one long truncated line for พลังหลัก */
export function createMainEnergyMetricCard(mainEnergy) {
  const formatted = formatMainEnergyForCard(mainEnergy || "-");
  const parts = String(formatted)
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  const valueContents =
    parts.length >= 2
      ? [
          {
            type: "text",
            text: clampToFlexLines(parts[0], 1, 22)[0] || parts[0] || "—",
            size: "md",
            weight: "bold",
            color: "#FFFFFF",
            wrap: true,
            maxLines: 1,
          },
          {
            type: "text",
            text:
              clampToFlexLines(
                String(parts[1] || "").replace(/^\(|\)$/g, "").trim(),
                1,
                18,
              )[0] ||
              parts[1] ||
              "—",
            size: "xs",
            color: "#B8B8BE",
            wrap: true,
            maxLines: 1,
            margin: "xs",
          },
        ]
      : [
          {
            type: "text",
            text: clampToFlexLines(formatted, 2, 22).join("\n") || "—",
            size: "md",
            weight: "bold",
            color: "#FFFFFF",
            wrap: true,
            maxLines: 2,
          },
        ];

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
        text: "พลังหลัก",
        size: "xs",
        color: "#8F8F95",
      },
      {
        type: "box",
        layout: "vertical",
        spacing: "xs",
        margin: "sm",
        contents: valueContents,
      },
    ],
  };
}

export function createEnergyLine(text) {
  const body =
    clampToFlexLines(String(text || "-"), 2, 18).join("\n") || "—";

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
        text: body,
        size: "sm",
        color: "#F2F2F2",
        wrap: true,
        maxLines: 2,
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
        text: safeWrapText(text || "-", FLEX_CLOSING_MAX_CHARS),
        size: "sm",
        color,
        wrap: true,
        maxLines: 4,
      },
    ],
  };
}

function createBulletBlock(title, lines = [], backgroundColor = "#152017") {
  const normalizedLines = sanitizeBulletLines(
    Array.isArray(lines) && lines.length > 0 ? lines : [],
  );

  const bulletRows =
    normalizedLines.length > 0
      ? normalizedLines.map((line) => ({
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            {
              type: "text",
              text: "•",
              size: "sm",
              color: "#A8C9B8",
              flex: 0,
            },
            {
              type: "text",
              text: line,
              size: "sm",
              color: "#E3E3E3",
              wrap: true,
              maxLines: 2,
              flex: 1,
            },
          ],
        }))
      : [
          {
            type: "text",
            text: "—",
            size: "sm",
            color: "#8A8A8E",
          },
        ];

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
      ...bulletRows,
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
              text: clampToFlexLines(
                getEnergyShortLabel(mainEnergy || "พลังทั่วไป"),
                2,
                26,
              ).join("\n"),
              size: "sm",
              color: "#ECECEC",
              wrap: true,
              maxLines: 2,
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
            createMainEnergyMetricCard(mainEnergy || "-"),
            createMetricCard("เข้ากับคุณ", compatibility || "-"),
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

const DEFAULT_OVERVIEW_FLEX = "เด่นในเชิงใช้งานและจังหวะชีวิต";
const DEFAULT_FIT_FLEX = "โยงกับเจ้าของเรื่องจังหวะและความนิ่ง";
const DEFAULT_CLOSING_FLEX = "มีอีกชิ้น ส่งมาเทียบกันได้ครับ";

export function buildReadingBubble({
  overview,
  fitReason,
  closing,
  accentColor
}) {
  const cleanOverview = String(overview || "").trim() || DEFAULT_OVERVIEW_FLEX;
  const cleanFitReason = String(fitReason || "").trim() || DEFAULT_FIT_FLEX;

  const overviewText = safeWrapText(cleanOverview, FLEX_OVERVIEW_DISPLAY_MAX);
  const fitText = safeWrapText(cleanFitReason, FLEX_FIT_DISPLAY_MAX);

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
              text: overviewText,
              size: "sm",
              color: "#E3E3E3",
              wrap: true,
              maxLines: 8,
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
          fitText,
          "#141C22",
          FLEX_FIT_DISPLAY_MAX
        ),

        createSoftNote(
          String(closing || "").trim() || DEFAULT_CLOSING_FLEX,
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
      : ["หนุนจังหวะตัดสินใจ", "รับแรงกดดันได้ดีขึ้น"];

  const suitableLines =
    Array.isArray(suitable) && suitable.length > 0
      ? suitable.slice(0, 2)
      : ["ต้องการความชัดหรือนิ่งในงาน", "วันที่ต้องคุมสถานการณ์"];

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