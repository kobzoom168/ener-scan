/**
 * Summary-first LINE Flex — single bubble handoff card.
 * HTML report stays primary artifact; Flex is teaser only.
 */
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";
import { distillSummaryLine } from "../../utils/reports/reportSummaryText.util.js";
import { parseScanText } from "./flex.parser.js";
import {
  pickMainEnergyColor,
  normalizeScore,
  getEnergyShortLabel,
  safeWrapText,
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
import { ENERGY_TYPES } from "./scanCopy.config.js";
import { resolveEnergyType } from "./scanCopy.utils.js";
import { createTopAccent } from "./flex.components.js";

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
 * One sharp headline — prefer messagePoints[0], else distilled summaryLine.
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null} reportPayload
 */
function flexHeadlineFromPayload(reportPayload) {
  const mp = String(reportPayload?.sections?.messagePoints?.[0] || "").trim();
  if (mp) return safeWrapText(mp, 88);
  const d = distillSummaryLine(reportPayload?.summary?.summaryLine || "");
  if (d) return safeWrapText(d, 88);
  return "ภาพรวมใน LINE สั้นมาก — ฉบับเต็มมีเรื่องเล่าต่อ";
}

/**
 * Up to 2 short bullets: what the object “shines” at (from payload sections).
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null} reportPayload
 */
function flexTeaserBullets(reportPayload) {
  const w = reportPayload?.sections?.whatItGives;
  if (Array.isArray(w) && w.length) {
    return w
      .slice(0, 2)
      .map((x) => safeWrapText(String(x).trim(), 72))
      .filter(Boolean);
  }
  const m = reportPayload?.sections?.messagePoints;
  if (Array.isArray(m) && m.length >= 2) {
    return m
      .slice(1, 3)
      .map((x) => safeWrapText(String(x).trim(), 72))
      .filter(Boolean);
  }
  return [];
}

function createCompactMetricStrip({
  accentColor,
  scoreDisplay,
  compatLabel,
}) {
  const levelValue = `${String(scoreDisplay || "-").trim() || "-"} / 10`;
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    margin: "md",
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        paddingAll: "13px",
        backgroundColor: "#18181A",
        cornerRadius: "12px",
        borderWidth: "1px",
        borderColor: "#2A2A2D",
        contents: [
          { type: "text", text: "ระดับพลัง", size: "xs", color: "#8F8F95" },
          {
            type: "text",
            text: levelValue || "-",
            size: "md",
            weight: "bold",
            color: accentColor,
            wrap: true,
            maxLines: 1,
            margin: "sm",
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        paddingAll: "13px",
        backgroundColor: "#18181A",
        cornerRadius: "12px",
        borderWidth: "1px",
        borderColor: "#2A2A2D",
        contents: [
          { type: "text", text: "เข้ากับคุณ", size: "xs", color: "#8F8F95" },
          {
            type: "text",
            text: compatLabel || "-",
            size: "md",
            weight: "bold",
            color: "#E8E8EC",
            wrap: true,
            maxLines: 1,
            margin: "sm",
          },
        ],
      },
    ],
  };
}

const FAMILY_LABEL = {
  [ENERGY_TYPES.PROTECT]: "คุ้มกัน",
  [ENERGY_TYPES.BALANCE]: "สมดุล",
  [ENERGY_TYPES.POWER]: "อำนาจ",
  [ENERGY_TYPES.KINDNESS]: "เมตตา",
  [ENERGY_TYPES.ATTRACT]: "ดึงดูด",
  [ENERGY_TYPES.LUCK]: "โชคลาภ",
  [ENERGY_TYPES.BOOST]: "เสริมพลัง",
};

const FAMILY_POOL = [
  ENERGY_TYPES.PROTECT,
  ENERGY_TYPES.BALANCE,
  ENERGY_TYPES.POWER,
  ENERGY_TYPES.KINDNESS,
  ENERGY_TYPES.ATTRACT,
  ENERGY_TYPES.LUCK,
  ENERGY_TYPES.BOOST,
];

function stars(n) {
  const v = Math.max(1, Math.min(5, Math.round(Number(n) || 0)));
  return `${"★".repeat(v)}${"☆".repeat(5 - v)}`;
}

/**
 * Deterministic prominence mapping from main energy family.
 * Main family is always highest or tied-highest.
 * @param {string} resolvedType
 */
function buildAspectProminence(resolvedType) {
  /** @type {Record<string, number>} */
  const score = Object.fromEntries(FAMILY_POOL.map((k) => [k, 2]));
  const main = FAMILY_POOL.includes(resolvedType)
    ? resolvedType
    : ENERGY_TYPES.BOOST;
  score[main] = 5;
  const nearBy = {
    [ENERGY_TYPES.PROTECT]: [ENERGY_TYPES.BALANCE, ENERGY_TYPES.BOOST],
    [ENERGY_TYPES.BALANCE]: [ENERGY_TYPES.BOOST, ENERGY_TYPES.KINDNESS],
    [ENERGY_TYPES.POWER]: [ENERGY_TYPES.PROTECT, ENERGY_TYPES.ATTRACT],
    [ENERGY_TYPES.KINDNESS]: [ENERGY_TYPES.BALANCE, ENERGY_TYPES.ATTRACT],
    [ENERGY_TYPES.ATTRACT]: [ENERGY_TYPES.KINDNESS, ENERGY_TYPES.POWER],
    [ENERGY_TYPES.LUCK]: [ENERGY_TYPES.BOOST, ENERGY_TYPES.ATTRACT],
    [ENERGY_TYPES.BOOST]: [ENERGY_TYPES.BALANCE, ENERGY_TYPES.LUCK],
  };
  for (const k of nearBy[main] || []) {
    score[k] = Math.max(score[k], 4);
  }
  const aspects = [main, ...FAMILY_POOL.filter((k) => k !== main)].slice(0, 5);
  return aspects.map((family) => ({
    family,
    label: FAMILY_LABEL[family] || family,
    stars: score[family],
  }));
}

function createAspectStarsBlock(resolvedType) {
  const rows = buildAspectProminence(resolvedType);
  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    spacing: "xs",
    contents: [
      {
        type: "text",
        text: "ระดับเด่นของชิ้นนี้",
        size: "xs",
        color: "#9A9AA0",
      },
      ...rows.map((r) => ({
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "text",
            text: r.label,
            size: "xs",
            color: "#B8B8BE",
            flex: 2,
          },
          {
            type: "text",
            text: stars(r.stars),
            size: "xs",
            color: "#D4AF37",
            align: "end",
            flex: 3,
          },
        ],
      })),
    ],
  };
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
      flexPresentationMode: "single_page_handoff",
      scanCopyConfigVersion: SCAN_COPY_CONFIG_VERSION,
      altText,
      hasReportPayload: Boolean(reportPayload),
      hasReportUrl: Boolean(String(reportUrl || "").trim()),
      appendReportBubbleLegacyIgnored: Boolean(options.appendReportBubble),
      flexSplitCounts: {
        overview: splitOverview,
        warnThreshold: FLEX_SPLIT_WARN_THRESHOLD,
      },
    }),
  );

  const compatLabel = compatibilityLabelForFlex(reportPayload, compatibility);
  const mainLabel =
    String(reportPayload?.summary?.mainEnergyLabel || "").trim() ||
    scanCopy?.summary?.mainEnergyLabel ||
    wrapFlexTextNoTruncate(getEnergyShortLabel(mainEnergy || "พลังทั่วไป"), 32);
  const resolvedType = resolveEnergyType(
    String(reportPayload?.summary?.mainEnergyLabel || mainEnergy || "").trim(),
  );
  const headline = flexHeadlineFromPayload(reportPayload);
  let bullets = flexTeaserBullets(reportPayload);
  if (bullets.length === 0) {
    bullets = [
      "สรุปใน LINE เป็นภาพรวมสั้น ๆ เท่านั้น",
      "ฉบับเต็มมีรายละเอียดและบริบทเพิ่ม",
    ];
  } else if (bullets.length === 1) {
    bullets = [
      bullets[0],
      safeWrapText("ฉบับเต็มจะเล่าต่อในบริบทที่ชัดเจนกว่า", 72),
    ];
  }
  const objectLbl =
    String(reportPayload?.object?.objectLabel || "").trim() || "ชิ้นนี้";
  const imgUrl = String(reportPayload?.object?.objectImageUrl || "").trim();
  const heroOk = /^https:\/\//i.test(imgUrl);
  const url = String(reportUrl || "").trim();

  const bodyContents = [
    createTopAccent(accentColor),
    {
      type: "text",
      text: objectLbl,
      size: "xs",
      color: "#9A9AA0",
      wrap: true,
      maxLines: 1,
      margin: "md",
    },
    {
      type: "text",
      text: headline,
      weight: "bold",
      size: "md",
      color: "#E8E8EC",
      wrap: true,
      maxLines: 3,
    },
    createCompactMetricStrip({
      accentColor,
      scoreDisplay: score.display || "-",
      compatLabel,
    }),
    {
      type: "text",
      text: `พลังหลัก · ${safeWrapText(mainLabel, 28)}`,
      size: "xs",
      color: "#C8C8CE",
      wrap: true,
      maxLines: 2,
      margin: "xs",
    },
    createAspectStarsBlock(resolvedType),
    {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "sm",
      contents: bullets.slice(0, 2).map((b) => ({
        type: "text",
        text: `• ${b}`,
        size: "xs",
        color: "#B8B8BE",
        wrap: true,
        maxLines: 3,
      })),
    },
  ];
  if (!url) {
    bodyContents.push({
      type: "text",
      text: "ลิงก์รายงานยังไม่พร้อม — กลับไปที่แชทแล้วลองอีกครั้งเมื่อสะดวก",
      size: "xs",
      color: "#8F8F95",
      wrap: true,
      margin: "lg",
    });
  }
  const bubble = {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      backgroundColor: "#101010",
      contents: bodyContents,
    },
    styles: { body: { backgroundColor: "#101010" } },
  };
  if (heroOk) {
    bubble.hero = {
      type: "image",
      url: imgUrl,
      size: "full",
      aspectRatio: "20:13",
    };
  }
  if (url) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      backgroundColor: "#101010",
      paddingTop: "4px",
      paddingBottom: "16px",
      paddingStart: "20px",
      paddingEnd: "20px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: accentColor,
          height: "sm",
          action: { type: "uri", label: "ดูรายงานฉบับเต็ม", uri: url },
        },
      ],
    };
    bubble.styles.footer = { backgroundColor: "#101010" };
  }

  return {
    type: "flex",
    altText,
    contents: bubble,
  };
}
