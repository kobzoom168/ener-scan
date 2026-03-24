function pickColorByEnergy(text) {
  if (text.includes("ปกป้อง")) return "#D4AF37";
  if (text.includes("อำนาจ")) return "#C62828";
  if (text.includes("โชคลาภ")) return "#2E7D32";
  if (text.includes("สมดุล")) return "#1565C0";
  if (text.includes("เมตตา")) return "#8E24AA";
  if (text.includes("ดึงดูด")) return "#AD1457";
  return "#D4AF37";
}

import { formatBangkokDateTime } from "../../utils/dateTime.util.js";

function buildHistoryBubble(item, index) {
  const accent = pickColorByEnergy(item.mainEnergy || "");

  return {
    type: "bubble",
    size: "micro",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      spacing: "sm",
      backgroundColor: "#141414",
      contents: [
        {
          type: "text",
          text: `#${index + 1}`,
          size: "xs",
          color: "#9E9E9E",
        },
        {
          type: "text",
          text: item.mainEnergy || "-",
          weight: "bold",
          size: "md",
          color: accent,
          wrap: true,
        },
        {
          type: "text",
          text: `พลัง ${item.energyScore || "-"} / 10`,
          size: "sm",
          color: "#FFFFFF",
        },
        {
          type: "text",
          text: `สอดคล้อง ${item.compatibility || "-"}`,
          size: "sm",
          color: "#CFCFCF",
        },
        {
          type: "separator",
          margin: "md",
          color: "#2E2E2E",
        },
        {
          type: "text",
          text: formatBangkokDateTime(item.time),
          size: "xs",
          color: "#A8A8A8",
          wrap: true,
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

export function buildHistoryFlex(history) {
  return {
    type: "flex",
    altText: "ประวัติการสแกนล่าสุด",
    contents: {
      type: "carousel",
      contents: history.slice(0, 10).map((item, index) => buildHistoryBubble(item, index)),
    },
  };
}