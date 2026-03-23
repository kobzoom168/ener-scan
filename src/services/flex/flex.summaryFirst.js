/**
 * Phase 2.3: summary-first LINE Flex — one primary bubble aligned with ReportPayload,
 * optional second bubble for full HTML report (feature-flagged).
 *
 * Does not replace legacy {@link buildScanFlex} until FLEX_SCAN_SUMMARY_FIRST is enabled.
 */
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";
import { parseScanText } from "./flex.parser.js";
import {
  pickMainEnergyColor,
  normalizeScore,
  getEnergyShortLabel,
  safeWrapText,
  clampToFlexLines,
  wrapFlexTextNoTruncate,
} from "./flex.utils.js";
import {
  prepareScanFlexDisplay,
  buildScanFlexAltText,
  FLEX_SPLIT_WARN_THRESHOLD,
  splitSentencesForFlex,
} from "./flex.display.js";
import {
  generateScanCopy,
  SCAN_COPY_CONFIG_VERSION,
} from "./scanCopy.generator.js";
import {
  createTopAccent,
  createCardShell,
  createMainTitle,
  createMetricCard,
  createMainEnergyMetricCard,
  createProgressBar,
  buildReportLinkBubble,
} from "./flex.components.js";

/**
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null} reportPayload
 * @param {{ overviewForFlex?: string }} [display]
 * @returns {string}
 */
function summaryLineForFirstFlex(reportPayload, display) {
  const fromPayload = String(reportPayload?.summary?.summaryLine || "").trim();
  if (fromPayload) {
    const wrapped = safeWrapText(fromPayload, 400);
    return clampToFlexLines(wrapped, 6, 36).join("\n");
  }
  const ov = String(display?.overviewForFlex || "").trim();
  if (ov) {
    return clampToFlexLines(ov, 6, 36).join("\n");
  }
  return "สแกนเสร็จแล้ว — แตะด้านล่างเพื่ออ่านรายงานฉบับเต็มเมื่อพร้อม";
}

/**
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null} reportPayload
 * @param {string} fallbackCompat
 */
function compatibilityLabelForFlex(reportPayload, fallbackCompat) {
  const p = reportPayload?.summary?.compatibilityPercent;
  if (p != null && Number.isFinite(Number(p))) {
    return `${Math.round(Number(p))}%`;
  }
  return String(fallbackCompat || "-").trim() || "-";
}

/**
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null} reportPayload
 * @param {string} energyScoreText
 * @returns {ReturnType<typeof normalizeScore>}
 */
function scoreNormalizedForFlex(reportPayload, energyScoreText) {
  const n = reportPayload?.summary?.energyScore;
  if (n != null && Number.isFinite(Number(n))) {
    return normalizeScore(String(n));
  }
  return normalizeScore(energyScoreText);
}

/**
 * Primary bubble: metrics + short summary (ReportPayload when available).
 * @param {object} p
 */
function buildSummaryFirstBodyBubble({
  accentColor,
  score,
  mainEnergy,
  compatibility,
  scanCopy,
  reportPayload,
  display,
  reportUrl,
  embedReportButtonInFooter,
}) {
  const summaryLine = summaryLineForFirstFlex(reportPayload, display);
  const compatLabel = compatibilityLabelForFlex(reportPayload, compatibility);
  const mainLabel =
    String(reportPayload?.summary?.mainEnergyLabel || "").trim() ||
    scanCopy?.summary?.mainEnergyLabel ||
    wrapFlexTextNoTruncate(
      getEnergyShortLabel(mainEnergy || "พลังทั่วไป"),
      32,
    );

  const hasObjectImage =
    Boolean(String(reportPayload?.object?.objectImageUrl || "").trim()) ||
    false;

  const bodyContents = [
    createTopAccent(accentColor),
    createMainTitle(
      "สรุปผลการสแกน",
      String(reportPayload?.object?.objectLabel || "").trim() ||
        "โดย อาจารย์ Ener",
    ),
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
          text: mainLabel,
          size: "sm",
          color: "#ECECEC",
          wrap: true,
          maxLines: 4,
        },
        ...(scanCopy?.goals?.goalHeadline
          ? [
              {
                type: "text",
                text: safeWrapText(scanCopy.goals.goalHeadline, 96),
                size: "xs",
                color: "#8F8F95",
                wrap: true,
                maxLines: 3,
                margin: "sm",
              },
            ]
          : []),
        createProgressBar(score.percent || "50%", accentColor),
      ],
      {
        backgroundColor: "#151515",
        borderColor: "#262629",
        cornerRadius: "18px",
        paddingAll: "16px",
        spacing: "sm",
      },
    ),
    {
      type: "box",
      layout: "horizontal",
      spacing: "md",
      contents: [
        createMainEnergyMetricCard(mainEnergy || "-", scanCopy?.summary || null),
        createMetricCard("เข้ากับคุณ", compatLabel),
      ],
    },
    {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "text",
          text: "โดยสรุป",
          weight: "bold",
          size: "md",
          color: "#FFFFFF",
        },
        {
          type: "text",
          text: summaryLine,
          size: "sm",
          color: "#C8C8CE",
          wrap: true,
          maxLines: 8,
        },
        ...(hasObjectImage
          ? [
              {
                type: "text",
                text: "รูปวัตถุอยู่ในรายงานฉบับเต็ม",
                size: "xs",
                color: "#8F8F95",
                wrap: true,
                maxLines: 2,
                margin: "md",
              },
            ]
          : []),
      ],
    },
  ];

  const url = String(reportUrl || "").trim();
  const showFooterButton = Boolean(url) && embedReportButtonInFooter;

  const footer = showFooterButton
    ? {
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
            style: "primary",
            color: accentColor,
            height: "sm",
            action: {
              type: "uri",
              label: "ดูรายงานฉบับเต็ม",
              uri: url,
            },
          },
        ],
      }
    : undefined;

  /** @type {Record<string, unknown>} */
  const bubble = {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "md",
      backgroundColor: "#101010",
      contents: bodyContents,
    },
    styles: {
      body: {
        backgroundColor: "#101010",
      },
    },
  };

  if (footer) {
    bubble.footer = footer;
    bubble.styles.footer = { backgroundColor: "#101010" };
  }

  return bubble;
}

/**
 * @param {string} rawText
 * @param {{
 *   birthdate?: string|null,
 *   reportUrl?: string|null,
 *   reportPayload?: import("../reports/reportPayload.types.js").ReportPayload | null,
 *   scanToneLevel?: string,
 *   appendReportBubble?: boolean,
 * }} [options]
 */
export function buildScanSummaryFirstFlex(rawText, options = {}) {
  const birthdate = options.birthdate ?? null;
  const reportUrl = options.reportUrl ?? null;
  const reportPayload = options.reportPayload ?? null;
  const appendReportBubble = Boolean(options.appendReportBubble);
  const embedReportButtonInFooter = !appendReportBubble;

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
  } = display;

  const score = scoreNormalizedForFlex(reportPayload, energyScore);

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
  const splitOverview = splitSentencesForFlex(overviewRaw).length;

  console.log(
    JSON.stringify({
      event: "FLEX_SUMMARY_FIRST",
      schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
      flexPresentationMode: appendReportBubble
        ? "summary_first_append"
        : "summary_first_footer",
      scanCopyConfigVersion: SCAN_COPY_CONFIG_VERSION,
      altText,
      hasReportPayload: Boolean(reportPayload),
      hasReportUrl: Boolean(String(reportUrl || "").trim()),
      appendReportBubble,
      flexSplitCounts: { overview: splitOverview, warnThreshold: FLEX_SPLIT_WARN_THRESHOLD },
    }),
  );

  const primary = buildSummaryFirstBodyBubble({
    accentColor,
    score,
    mainEnergy,
    compatibility,
    scanCopy,
    reportPayload,
    display,
    reportUrl,
    embedReportButtonInFooter,
  });

  const carouselContents = [primary];

  const url = String(reportUrl || "").trim();
  if (appendReportBubble && url) {
    carouselContents.push(
      buildReportLinkBubble({ reportUrl: url, accentColor }),
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
