import { parseScanText } from "./flex.parser.js";
import { pickMainEnergyColor, normalizeScore } from "./flex.utils.js";

import {
  buildSummaryBubble,
  buildReadingBubble,
  buildUsageBubble
} from "./flex.components.js";

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
    fitReason,
    supportTopics,
    suitable,
    notStrong,
    usageGuide,
    closing,
  } = parseScanText(rawText);

  const score = normalizeScore(energyScore);

  console.log("[FLEX_RAW_TEXT]", rawText);

  console.log("[FLEX_PARSE]", {
    energyScore,
    mainEnergy,
    compatibility,
    personality,
    tone,
    hidden,
    overview,
    fitReason,
    supportTopics,
    suitable,
    notStrong,
    usageGuide,
    closing,
  });

  return {
    type: "flex",
    altText: `ผลการตรวจพลังวัตถุ: ${mainEnergy} ${score.raw || energyScore}`,
    contents: {
      type: "carousel",
      contents: [
        buildSummaryBubble({
          accentColor,
          score,
          mainEnergy,
          compatibility,
          personality,
          tone,
          hidden,
        }),
        buildReadingBubble({
          overview,
          fitReason,
          closing,
          accentColor,
        }),
        buildUsageBubble({
          supportTopics,
          suitable,
          notStrong,
          usageGuide,
          accentColor,
        }),
      ],
    },
  };
}