/**
 * Moldavite-only summary-first Flex — does not call resolveEnergyCopyForFlex (isolated hero copy).
 */
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";
import { normalizeScore } from "./flex.utils.js";
import { buildScanFlexAltText } from "./flex.display.js";
import { SCAN_COPY_CONFIG_VERSION } from "./scanCopy.generator.js";

/** Moldavite-only palette — green accent (distinct from Thai/gold cards). */
const FLEX_CARD_BG = "#000000";
const FLEX_BOX_BG = "#111111";
const FLEX_BOX_BG_ELEVATED = "#0f1412";
const MOLDAVITE_ACCENT = "#4ADE80";
const MOLDAVITE_ACCENT_SOFT = "#86EFAC";
const MOLDAVITE_BORDER_SUBTLE = "#1e3d2e";
const FLEX_ACCENT = MOLDAVITE_ACCENT;
const FLEX_TEXT_PRIMARY = "#ffffff";
const FLEX_TEXT_SECONDARY = "#9ca3af";
const FLEX_TEXT_MUTED = "#6b7280";
/** Static identity line under title (Flex-only; not detection logic). */
const MOLDAVITE_TITLE_TAGLINE = "หินเทคไทต์ · โทนเขียว";

/**
 * @param {string} text
 * @param {number} [maxLen]
 */
function truncateEnergyBadgeLabel(text, maxLen = 14) {
  const s = String(text || "").trim();
  if (!s) return "-";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

const MAIN_ENERGY_PILL_MAX_LEN = 22;

/**
 * Life-area scores (งาน / การเงิน / ความสัมพันธ์), ranked high → low for quick scan.
 * @param {Record<string, { score?: number, labelThai?: string }>|null|undefined} lifeAreas
 */
function createLifeAreasRankingBlock(lifeAreas) {
  if (!lifeAreas || typeof lifeAreas !== "object") return null;
  const orderKeys = /** @type {const} */ (["work", "money", "relationship"]);
  /** @type {{ label: string, score: number }[]} */
  const rows = [];
  for (const k of orderKeys) {
    const entry = lifeAreas[k];
    if (!entry || typeof entry !== "object") continue;
    const label = String(entry.labelThai || "").trim();
    const score = entry.score;
    if (!label || score == null || !Number.isFinite(Number(score))) continue;
    rows.push({ label, score: Number(score) });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.score - a.score);

  const headerBlock = {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    margin: "none",
    contents: [
      {
        type: "text",
        text: "มิติที่โทนไปออกแรงสุด",
        size: "xs",
        weight: "bold",
        color: MOLDAVITE_ACCENT_SOFT,
        wrap: true,
      },
      {
        type: "text",
        text: "เรียงจากมากไปน้อย",
        size: "xs",
        color: FLEX_TEXT_MUTED,
        wrap: true,
      },
    ],
  };

  /** @type {object[]} */
  const rowBoxes = [];
  for (const r of rows) {
    rowBoxes.push({
      type: "box",
      layout: "horizontal",
      spacing: "md",
      margin: "sm",
      justifyContent: "space-between",
      alignItems: "center",
      contents: [
        {
          type: "text",
          text: r.label,
          size: "sm",
          color: FLEX_TEXT_PRIMARY,
          flex: 4,
          wrap: true,
        },
        {
          type: "text",
          text: String(Math.round(r.score)),
          size: "xl",
          weight: "bold",
          color: MOLDAVITE_ACCENT,
          flex: 1,
          align: "end",
          wrap: false,
        },
      ],
    });
  }

  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    margin: "md",
    paddingAll: "16px",
    borderWidth: "1px",
    borderColor: MOLDAVITE_BORDER_SUBTLE,
    cornerRadius: "8px",
    backgroundColor: FLEX_BOX_BG_ELEVATED,
    contents: [headerBlock, ...rowBoxes],
  };
}

/**
 * @param {string} scoreDisplay
 * @param {string} compatPctStr
 * @param {string} [compatBandStr]
 */
function createScoreRowTwoUp(scoreDisplay, compatPctStr, compatBandStr = "") {
  const levelValue = `${String(scoreDisplay || "-").trim() || "-"} / 10`;
  const pct = String(compatPctStr || "-").trim().replace(/\s+/g, "");
  const band = String(compatBandStr || "").trim();
  const compatContents = [
    {
      type: "text",
      text: "เข้ากับคุณ",
      size: "xs",
      color: FLEX_TEXT_SECONDARY,
      wrap: true,
    },
    {
      type: "text",
      text: pct,
      size: "xxl",
      weight: "bold",
      color: MOLDAVITE_ACCENT,
      margin: "xs",
      wrap: false,
    },
  ];
  if (band) {
    compatContents.push({
      type: "text",
      text: band,
      size: "sm",
      color: FLEX_TEXT_SECONDARY,
      wrap: true,
      maxLines: 2,
      margin: "xs",
    });
  }
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    margin: "lg",
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        paddingAll: "14px",
        backgroundColor: FLEX_BOX_BG,
        contents: [
          {
            type: "text",
            text: "ระดับพลัง",
            size: "xs",
            color: FLEX_TEXT_SECONDARY,
            wrap: true,
          },
          {
            type: "text",
            text: levelValue,
            size: "xl",
            weight: "bold",
            color: MOLDAVITE_ACCENT,
            margin: "sm",
            wrap: true,
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        paddingAll: "14px",
        backgroundColor: FLEX_BOX_BG,
        contents: compatContents,
      },
    ],
  };
}

function createEnergyBadgePill(mainLabel) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    margin: "lg",
    contents: [
      {
        type: "text",
        text: "พลังหลัก",
        size: "xs",
        color: FLEX_TEXT_SECONDARY,
        wrap: true,
      },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            flex: 1,
            justifyContent: "center",
            paddingTop: "10px",
            paddingBottom: "10px",
            paddingStart: "14px",
            paddingEnd: "14px",
            borderWidth: "1px",
            borderColor: MOLDAVITE_ACCENT,
            backgroundColor: FLEX_BOX_BG,
            contents: [
              {
                type: "text",
                text: truncateEnergyBadgeLabel(
                  String(mainLabel || "-").trim(),
                  MAIN_ENERGY_PILL_MAX_LEN,
                ),
                size: "sm",
                weight: "bold",
                color: MOLDAVITE_ACCENT,
                align: "center",
                wrap: true,
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null} reportPayload
 * @param {string} fallbackCompat
 */
function compatPercentAndBand(reportPayload, fallbackCompat) {
  const p = reportPayload?.summary?.compatibilityPercent;
  const band =
    String(reportPayload?.summary?.compatibilityBand || "").trim() ||
    String(reportPayload?.compatibility?.band || "").trim();
  if (p != null && Number.isFinite(Number(p))) {
    return { pctStr: `${Math.round(Number(p))}%`, bandStr: band };
  }
  const fb = String(fallbackCompat || "-").trim();
  const m = fb.match(/(\d+(?:\.\d+)?)/);
  if (m && Number.isFinite(Number(m[1]))) {
    return { pctStr: `${Math.round(Number(m[1]))}%`, bandStr: band };
  }
  return { pctStr: "-", bandStr: band };
}

/**
 * @param {string} rawText unused — kept for signature parity with summary-first
 * @param {{
 *   birthdate?: string|null,
 *   reportUrl?: string|null,
 *   reportPayload?: import("../reports/reportPayload.types.js").ReportPayload | null,
 *   appendReportBubble?: boolean,
 * }} [options]
 */
export async function buildMoldaviteSummaryFirstFlex(rawText, options = {}) {
  void rawText;
  const reportPayload = options.reportPayload ?? null;
  const reportUrl = options.reportUrl ?? null;
  const mv = reportPayload?.moldaviteV1;
  if (!mv || typeof mv !== "object") {
    throw new Error("MOLDAVITE_FLEX_MISSING_PAYLOAD");
  }

  const s = reportPayload?.summary;
  const score = normalizeScore(
    s?.energyScore != null && Number.isFinite(Number(s.energyScore))
      ? String(s.energyScore)
      : "-",
  );

  const { pctStr: compatPctStr, bandStr: compatBandStr } = compatPercentAndBand(
    reportPayload,
    "-",
  );

  const headlineText = String(mv.flexSurface?.headline || "").trim() || "มอลดาไวต์";
  const fitLine = String(mv.flexSurface?.fitLine || "").trim();
  const bulletLines = Array.isArray(mv.flexSurface?.bullets)
    ? mv.flexSurface.bullets
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const mainPill =
    String(mv.flexSurface?.mainEnergyShort || "").trim() ||
    "เร่งการเปลี่ยนแปลง";

  const imgUrl = String(reportPayload?.object?.objectImageUrl || "").trim();
  const heroOk = /^https:\/\//i.test(imgUrl);
  const url = String(reportUrl || "").trim();

  const lifeAreasBlock = createLifeAreasRankingBlock(mv.lifeAreas);

  const altMain = headlineText.split("\n")[0].trim() || "มอลดาไวต์";
  const altText = buildScanFlexAltText({
    mainEnergyLabel: altMain,
    scoreDisplay: score.display || "-",
  });

  console.log(
    JSON.stringify({
      event: "FLEX_MOLDAVITE_SUMMARY_FIRST",
      schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
      scanCopyConfigVersion: SCAN_COPY_CONFIG_VERSION,
      scoringMode: mv.scoringMode,
      moldaviteVersion: mv.version,
      flexHeroCopySource: "moldavite_v1_summary_first",
      appendReportBubbleLegacyIgnored: Boolean(options.appendReportBubble),
    }),
  );

  const titleSection = {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    margin: "lg",
    contents: [
      {
        type: "text",
        text: headlineText,
        size: "lg",
        weight: "bold",
        color: FLEX_TEXT_PRIMARY,
        wrap: true,
        maxLines: 2,
        lineSpacing: "4px",
      },
      {
        type: "text",
        text: MOLDAVITE_TITLE_TAGLINE,
        size: "xs",
        color: MOLDAVITE_ACCENT_SOFT,
        wrap: true,
        lineSpacing: "3px",
      },
    ],
  };

  const fitBlock =
    fitLine.length > 0
      ? {
          type: "text",
          text: fitLine,
          size: "xs",
          color: FLEX_TEXT_SECONDARY,
          wrap: true,
          maxLines: 2,
          lineSpacing: "4px",
          margin: "lg",
        }
      : null;

  const bulletRows = bulletLines.map((line) => ({
    type: "text",
    text: `› ${line}`,
    size: "sm",
    color: "#cccccc",
    wrap: true,
    maxLines: 2,
    lineSpacing: "3px",
    margin: "xs",
  }));

  const bodyContents = [
    titleSection,
    createScoreRowTwoUp(
      score.display || "-",
      compatPctStr,
      compatBandStr,
    ),
    createEnergyBadgePill(mainPill),
    ...(lifeAreasBlock ? [lifeAreasBlock] : []),
    ...(fitBlock ? [fitBlock] : []),
    ...(bulletRows.length > 0
      ? [
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            contents: bulletRows,
          },
        ]
      : []),
  ];

  if (!url) {
    bodyContents.push({
      type: "text",
      text: "ลิงก์รายงานยังไม่พร้อม — กลับไปที่แชทแล้วลองอีกครั้งเมื่อสะดวก",
      size: "xs",
      color: FLEX_TEXT_SECONDARY,
      wrap: true,
      margin: "lg",
    });
  } else {
    bodyContents.push({
      type: "button",
      style: "primary",
      color: FLEX_ACCENT,
      height: "md",
      margin: "lg",
      action: {
        type: "uri",
        label: "เปิดรายงานฉบับเต็ม",
        uri: url,
      },
    });
  }

  const bubble = {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "lg",
      backgroundColor: FLEX_CARD_BG,
      contents: bodyContents,
    },
    styles: { body: { backgroundColor: FLEX_CARD_BG } },
  };
  if (heroOk) {
    bubble.hero = {
      type: "image",
      url: imgUrl,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
      backgroundColor: FLEX_CARD_BG,
    };
  }

  return {
    type: "flex",
    altText,
    contents: bubble,
  };
}
