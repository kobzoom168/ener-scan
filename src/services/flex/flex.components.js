import {
  safeWrapText,
  stripBullet,
  buildEnergyLines,
  getEnergyShortLabel
} from "./flex.utils.js";


export function createMetricCard(label, value) {
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


export function createEnergyLine(text) {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "12px",
    backgroundColor: "#1E1E1E",
    cornerRadius: "12px",
    contents: [
      {
        type: "text",
        text: safeWrapText(text, 40),
        size: "sm",
        color: "#F2F2F2",
        wrap: true,
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
    cornerRadius: "14px",
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
        text: safeWrapText(body, maxLength),
        margin: "sm",
        size: "xs",
        color: "#DADADA",
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
                }

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

            ...energyLines.map(line => createEnergyLine(line))

          ],
        },

      ],
    },

    styles: {
      body: {
        backgroundColor: "#141414",
      },
    },

  };

}


export function buildReadingBubble({ overview, closing }) {

  return {

    type: "bubble",
    size: "giga",

    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "md",
      backgroundColor: "#141414",

      contents: [

        {
          type: "text",
          text: "คำอ่านพลัง",
          weight: "bold",
          size: "lg",
          color: "#F5F5F5",
        },

        {
          type: "separator",
          margin: "md",
          color: "#2E2E2E",
        },

        {
          type: "box",
          layout: "vertical",
          margin: "md",
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
              paddingAll: "12px",
              backgroundColor: "#1B1B1B",
              cornerRadius: "14px",
              contents: [
                {
                  type: "text",
                  text: safeWrapText(overview, 220),
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
          layout: "vertical",
          margin: "md",
          paddingAll: "12px",
          backgroundColor: "#242424",
          cornerRadius: "14px",
          contents: [
            {
              type: "text",
              text: safeWrapText(
                closing || "ลองส่งชิ้นถัดไปเพื่อเทียบพลังได้",
                90
              ),
              size: "sm",
              color: "#FFFFFF",
              wrap: true,
            },
          ],
        },

      ],
    },

  };

}


export function buildUsageBubble({
  suitable,
  notStrong,
  accentColor
}) {

  const suitableLines =
    suitable.length > 0
      ? suitable.slice(0, 2)
      : ["• ใช้ในจังหวะที่ต้องการความชัดและความนิ่ง"];

  const suitableDisplay = suitableLines
    .filter(Boolean)
    .map(line => `• ${stripBullet(line)}`)
    .join("\n");


  return {

    type: "bubble",
    size: "giga",

    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "md",
      backgroundColor: "#141414",

      contents: [

        {
          type: "text",
          text: "จังหวะที่เหมาะ",
          weight: "bold",
          size: "lg",
          color: "#F5F5F5",
        },

        {
          type: "separator",
          margin: "md",
          color: "#2E2E2E",
        },

        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "md",
          contents: [

            createSectionCard(
              "เหมาะใช้เมื่อ",
              suitableDisplay || "• ใช้ในจังหวะที่ต้องการความชัดและความนิ่ง",
              "#1D221C",
              130
            ),

            createSectionCard(
              "อาจไม่เด่นเมื่อ",
              notStrong || "อยู่ในช่วงที่ต้องการการเร่งผลทันทีหรือการเปลี่ยนแปลงรวดเร็ว",
              "#221D1D",
              90
            ),

          ],
        },

      ],
    },


    footer: {

      type: "box",
      layout: "vertical",
      paddingAll: "14px",
      spacing: "sm",

      contents: [

        {
          type: "button",
          style: "secondary",
          action: {
            type: "message",
            label: "ประวัติการสแกนล่าสุด",
            text: "history"
          }
        },

        {
          type: "button",
          style: "primary",
          color: accentColor,
          action: {
            type: "message",
            label: "ส่งชิ้นถัดไป",
            text: "ขอสแกนชิ้นถัดไป"
          }
        }

      ],

    },

    styles: {
      body: {
        backgroundColor: "#141414",
      },
      footer: {
        backgroundColor: "#141414",
      },
    },

  };

}