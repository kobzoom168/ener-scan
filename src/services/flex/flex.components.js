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