import { parseScanText } from "./flex.parser.js";
import {
  pickMainEnergyColor,
  normalizeScore,
  getEnergyShortLabel,
} from "./flex.utils.js";
import {
  prepareScanFlexDisplay,
  buildScanFlexAltText,
  splitSentencesForFlex,
  FLEX_SPLIT_WARN_THRESHOLD,
} from "./flex.display.js";

import {
  buildSummaryBubble,
  buildReadingBubble,
  buildUsageBubble,
  buildReportLinkBubble,
} from "./flex.components.js";
import {
  generateScanCopy,
  SCAN_COPY_CONFIG_VERSION,
} from "./scanCopy.generator.js";

/**
 * @param {string} rawText
 * @param {{ birthdate?: string|null, reportUrl?: string|null }} [options]
 */
export function buildScanFlex(rawText, options = {}) {
  const birthdate = options.birthdate ?? null;
  const reportUrl = options.reportUrl ?? null;

  const accentColor = pickMainEnergyColor(rawText);

  const parsed = parseScanText(rawText);
  const display = prepareScanFlexDisplay(parsed);

  const {
    energyScore,
    mainEnergy,
    compatibility,
    personality,
    tone,
    hidden,
    supportTopics,
    suitable,
    notStrong,
    usageGuide,
  } = display;

  const score = normalizeScore(energyScore);

  const scanCopy = generateScanCopy({
    mainEnergy,
    energyScore,
    scoreNumeric: score.numeric,
    compatibility,
    personality,
    tone,
    hidden,
    birthdate,
    display,
    scanToneLevel: options.scanToneLevel,
  });

  const altText = buildScanFlexAltText({
    mainEnergyLabel:
      scanCopy.summary.mainEnergyLabelAlt ||
      scanCopy.summary.mainEnergyLabel ||
      getEnergyShortLabel(mainEnergy || "-"),
    scoreDisplay: score.display || String(energyScore || "").trim(),
  });

  const overviewRaw =
    parsed.overview === "-" ? "" : String(parsed.overview || "");
  const fitRaw =
    parsed.fitReason === "-" ? "" : String(parsed.fitReason || "");

  const splitOverview = splitSentencesForFlex(overviewRaw).length;
  const splitFit = splitSentencesForFlex(fitRaw).length;

  console.log("[FLEX_RAW_TEXT]", rawText);

  console.log("[FLEX_PARSE]", {
    energyScore,
    mainEnergy,
    compatibility,
    personality,
    tone,
    hidden,
    overview: parsed.overview,
    fitReason: parsed.fitReason,
    overviewForFlex: display.overviewForFlex,
    fitReasonForFlex: display.fitReasonForFlex,
    supportTopics,
    suitable,
    notStrong,
    usageGuide,
    closing: parsed.closing,
    closingForFlex: display.closingForFlex,
    /** QA: segment counts after split (if ≥ warn, check for over-fragmentation) */
    flexSplitCounts: {
      overview: splitOverview,
      fitReason: splitFit,
      warnThreshold: FLEX_SPLIT_WARN_THRESHOLD,
    },
    flexSplitHighFragmentCount:
      splitOverview >= FLEX_SPLIT_WARN_THRESHOLD ||
      splitFit >= FLEX_SPLIT_WARN_THRESHOLD,
    /** Per-field: scoresByIndex, rankByScoreDesc vs pickedOriginalIndices, laterOutperformsEarlier */
    flexInsightDebug: display.flexInsightDebug,
    altText,
    scanCopyConfigVersion: SCAN_COPY_CONFIG_VERSION,
    scanCopySummary: scanCopy.summary,
    scanCopyTraits: scanCopy.traits,
    scanCopyGoals: scanCopy.goals
      ? {
          clarity: scanCopy.goals.clarity,
          clarityLabelThai: scanCopy.goals.clarityLabelThai,
        }
      : null,
    scanToneLevel: scanCopy.retention?.scanToneLevel,
  });

  const carouselContents = [
    buildSummaryBubble({
      accentColor,
      score,
      mainEnergy,
      compatibility,
      personality,
      tone,
      hidden,
      scanCopy,
    }),
    buildReadingBubble({
      overview: display.overviewForFlex,
      fitReason: display.fitReasonForFlex,
      closing: display.closingForFlex,
      retentionHook: scanCopy.retention?.retentionHook,
      accentColor,
    }),
    buildUsageBubble({
      supportTopics,
      suitable,
      notStrong,
      accentColor,
      nextScanCta: scanCopy.retention?.nextScanCta,
    }),
  ];

  if (reportUrl && String(reportUrl).trim()) {
    carouselContents.push(
      buildReportLinkBubble({ reportUrl: String(reportUrl).trim(), accentColor }),
    );
  }

  return {
    type: "flex",
    altText,
    contents: {
      type: "carousel",
      contents: carouselContents,
    },
  };
}