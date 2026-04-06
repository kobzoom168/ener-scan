/**
 * Moldavite-only summary-first Flex — does not call resolveEnergyCopyForFlex (isolated hero copy).
 */
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";
import { MOLDAVITE_VISIBLE_LABEL_FALLBACK } from "../../moldavite/moldaviteDisplayNaming.util.js";
import { normalizeScore } from "./flex.utils.js";
import { buildScanFlexAltText } from "./flex.display.js";
import { SCAN_COPY_CONFIG_VERSION } from "./scanCopy.generator.js";

/**
 * Moldavite-only palette — light / white card + green accents (LINE-safe hex).
 * Distinct from Thai/gold cards; avoids dark-theme-only tokens.
 */
const FLEX_CARD_BG = "#ffffff";
const FLEX_BOX_BG = "#f3f4f6";
/** Segmented “tab” cells — light mint panels + green border. */
const FLEX_SEGMENT_BG = "#f0fdf4";
const FLEX_SEGMENT_BORDER = "#bbf7d0";
const MOLDAVITE_ACCENT = "#16a34a";
const MOLDAVITE_ACCENT_DIM = "#22c55e";
const MOLDAVITE_PILL_BORDER = "#86efac";
const MOLDAVITE_PILL_BG = "#f0fdf4";
/** CTA: deeper green on white for tap contrast. */
const MOLDAVITE_CTA_BG = "#16a34a";
const FLEX_ACCENT = MOLDAVITE_CTA_BG;
const FLEX_TEXT_PRIMARY = "#111827";
const FLEX_TEXT_SECONDARY = "#6b7280";
const FLEX_TEXT_CAPTION = "#6b7280";
/** Tagline under title — muted green-gray on white. */
const MOLDAVITE_TITLE_TAGLINE_COLOR = "#4b5563";
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

/** Fixed column order for segmented row (งาน → ความสัมพันธ์ → การเงิน). Not score math — display only. */
const LIFE_AREA_SEGMENT_KEYS = /** @type {const} */ ([
  "work",
  "relationship",
  "money",
]);

/**
 * Segmented 3-up “tab” row: horizontal `box` + three `box` children with `flex:1` only (LINE-safe).
 * True tabs are not available in Flex; this approximates segmented controls.
 *
 * @param {Record<string, { score?: number, labelThai?: string }>|null|undefined} lifeAreas
 */
function createLifeAreasSegmentedBlock(lifeAreas) {
  if (!lifeAreas || typeof lifeAreas !== "object") return null;

  /** @type {object[]} */
  const segments = [];
  for (const k of LIFE_AREA_SEGMENT_KEYS) {
    const entry = lifeAreas[k];
    const label =
      entry && typeof entry === "object"
        ? String(entry.labelThai || "").trim()
        : "";
    const scoreRaw =
      entry && typeof entry === "object" ? entry.score : undefined;
    const scoreOk =
      scoreRaw != null && Number.isFinite(Number(scoreRaw))
        ? Math.round(Number(scoreRaw))
        : null;

    segments.push({
      type: "box",
      layout: "vertical",
      flex: 1,
      paddingAll: "10px",
      spacing: "xs",
      borderWidth: "1px",
      borderColor: FLEX_SEGMENT_BORDER,
      cornerRadius: "md",
      backgroundColor: FLEX_SEGMENT_BG,
      contents: [
        {
          type: "text",
          text: label || "—",
          size: "xs",
          color: FLEX_TEXT_SECONDARY,
          wrap: true,
          maxLines: 2,
        },
        {
          type: "text",
          text: scoreOk == null ? "—" : String(scoreOk),
          size: "lg",
          weight: "bold",
          color: MOLDAVITE_ACCENT,
          wrap: false,
        },
      ],
    });
  }

  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: "มิติเชิงโฟกัส",
        size: "xs",
        color: MOLDAVITE_ACCENT_DIM,
        weight: "bold",
        wrap: true,
        margin: "none",
      },
      {
        type: "text",
        text: "งาน · ความสัมพันธ์ · การเงิน",
        size: "xs",
        color: FLEX_TEXT_CAPTION,
        wrap: true,
        margin: "xs",
      },
      {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: segments,
      },
    ],
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
    margin: "md",
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
    margin: "md",
    contents: [
      {
        type: "text",
        text: "พลังหลัก",
        size: "xs",
        color: FLEX_TEXT_CAPTION,
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
            borderColor: MOLDAVITE_PILL_BORDER,
            backgroundColor: MOLDAVITE_PILL_BG,
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

  const headlineText =
    String(mv.flexSurface?.headline || "").trim() ||
    MOLDAVITE_VISIBLE_LABEL_FALLBACK;
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

  const lifeAreasBlock = createLifeAreasSegmentedBlock(mv.lifeAreas);

  const taglineText =
    String(mv.flexSurface?.tagline || "").trim() || MOLDAVITE_TITLE_TAGLINE;

  const altMain =
    headlineText.split("\n")[0].trim() || MOLDAVITE_VISIBLE_LABEL_FALLBACK;
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

  /** Match generic summary-first headline shape (known-good LINE path). */
  const headlineBlock = {
    type: "text",
    text: headlineText,
    size: "md",
    weight: "bold",
    color: FLEX_TEXT_PRIMARY,
    wrap: true,
    maxLines: 2,
    lineSpacing: "4px",
    margin: "sm",
  };
  const taglineBlock = {
    type: "text",
    text: taglineText,
    size: "xs",
    color: MOLDAVITE_TITLE_TAGLINE_COLOR,
    wrap: true,
    margin: "xs",
  };

  const fitBlock =
    fitLine.length > 0
      ? {
          type: "text",
          text: fitLine,
          size: "xs",
          color: FLEX_TEXT_CAPTION,
          wrap: true,
          maxLines: 2,
          lineSpacing: "3px",
          margin: "md",
        }
      : null;

  const bulletRows = bulletLines.map((line) => ({
    type: "text",
    text: `› ${line}`,
    size: "sm",
    color: "#4b5563",
    wrap: true,
    maxLines: 2,
    lineSpacing: "3px",
    margin: "xs",
  }));

  const bodyContents = [
    headlineBlock,
    taglineBlock,
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
      spacing: "md",
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
