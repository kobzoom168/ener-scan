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
    suitable,
    notStrong,
    closing,
  } = parseScanText(rawText);

  const score = normalizeScore(energyScore);

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
          closing,
        }),
        buildUsageBubble({
          suitable,
          notStrong,
          accentColor,
        }),
      ],
    },
  };

}