/**
 * Crystal-bracelet-only summary-first Flex — copy from payload slice only (no generic crystal copy).
 */
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";
import { normalizeScore } from "./flex.utils.js";
import { buildScanFlexAltText } from "./flex.display.js";
import { SCAN_COPY_CONFIG_VERSION } from "./scanCopy.generator.js";
import { CRYSTAL_BRACELET_AXIS_ORDER } from "../../crystalBracelet/crystalBraceletScores.util.js";

const FLEX_CARD_BG = "#0f1415";
const FLEX_BOX_BG = "#1a2330";
const LIFE_AREA_BAR_TRACK_BG = "#334155";
const CB_BAR_FILL = "#38bdf8";
const CB_ACCENT = "#7dd3fc";
const CB_ACCENT_DIM = "#bae6fd";
const CB_PILL_BORDER = "#0369a1";
const CB_PILL_BG = "#0c4a6e";
const CB_CTA_BG = "#0ea5e9";
const FLEX_ACCENT = CB_CTA_BG;
const FLEX_TEXT_PRIMARY = "#f1f5f9";
const FLEX_TEXT_SECONDARY = "#94a3b8";
const FLEX_TEXT_CAPTION = "#94a3b8";
const CB_TITLE_TAGLINE_COLOR = "#64748b";

const LIFE_AREA_BAR_HEIGHT = "8px";
const LIFE_AREA_LABEL_COL_WIDTH = "120px";
const LIFE_AREA_SCORE_COL_WIDTH = "48px";
const MAIN_ENERGY_PILL_MAX_LEN = 22;

/**
 * @param {string} text
 * @param {number} [maxLen]
 */
function truncateEnergyBadgeLabel(text, maxLen = 14) {
  const s = String(text || "").trim();
  if (!s) return "-";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * @param {number|null|undefined} score0to100
 * @returns {{ greenFlex: number, emptyFlex: number }}
 */
function axisBarFlexPair(score0to100) {
  if (score0to100 == null || !Number.isFinite(Number(score0to100))) {
    return { greenFlex: 0, emptyFlex: 3 };
  }
  const r = Math.max(0, Math.min(100, Number(score0to100))) / 100;
  let bestG = 0;
  let bestE = 3;
  let bestErr = 1;
  for (let g = 0; g <= 3; g++) {
    for (let e = 0; e <= 3; e++) {
      if (g === 0 && e === 0) continue;
      const ratio = g / (g + e);
      const err = Math.abs(ratio - r);
      if (err < bestErr - 1e-9) {
        bestErr = err;
        bestG = g;
        bestE = e;
      }
    }
  }
  return { greenFlex: bestG, emptyFlex: bestE };
}

/**
 * @param {Record<string, { score?: number, labelThai?: string }>|null|undefined} axes
 */
function createCrystalBraceletAxesBarBlock(axes) {
  if (!axes || typeof axes !== "object") return null;

  /** @type {{ label: string, score: number|null }[]} */
  const rows = [];
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const entry = axes[k];
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
    rows.push({ label: label || "—", score: scoreOk });
  }
  rows.sort((a, b) => {
    if (a.score == null && b.score == null) return 0;
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score;
  });

  const topRows = rows.slice(0, 4);

  /** @type {object[]} */
  const rowBoxes = topRows.map(({ label, score }) => {
    const { greenFlex, emptyFlex } = axisBarFlexPair(score);
    const scoreText = score == null ? "—" : String(score);
    return {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      margin: "xs",
      contents: [
        {
          type: "box",
          layout: "vertical",
          width: LIFE_AREA_LABEL_COL_WIDTH,
          justifyContent: "center",
          contents: [
            {
              type: "text",
              text: label,
              size: "xs",
              color: FLEX_TEXT_SECONDARY,
              wrap: true,
              maxLines: 2,
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          flex: 1,
          spacing: "none",
          paddingAll: "2px",
          cornerRadius: "sm",
          backgroundColor: LIFE_AREA_BAR_TRACK_BG,
          contents: [
            {
              type: "box",
              layout: "horizontal",
              flex: greenFlex,
              height: LIFE_AREA_BAR_HEIGHT,
              backgroundColor: CB_BAR_FILL,
              cornerRadius: "sm",
              contents: [],
            },
            {
              type: "box",
              layout: "horizontal",
              flex: emptyFlex,
              height: LIFE_AREA_BAR_HEIGHT,
              contents: [],
            },
          ],
        },
        {
          type: "box",
          layout: "vertical",
          width: LIFE_AREA_SCORE_COL_WIDTH,
          justifyContent: "center",
          contents: [
            {
              type: "text",
              text: scoreText,
              size: "sm",
              weight: "bold",
              color: CB_ACCENT,
              wrap: false,
              align: "end",
            },
          ],
        },
      ],
    };
  });

  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: "พลังเด่นของกำไล",
        size: "xs",
        color: CB_ACCENT_DIM,
        weight: "bold",
        wrap: true,
        margin: "none",
      },
      {
        type: "text",
        text: "แสดง 4 พลังที่เด่นสุด",
        size: "xxs",
        color: "#475569",
        wrap: true,
        margin: "xs",
      },
      {
        type: "box",
        layout: "vertical",
        spacing: "none",
        margin: "none",
        contents: rowBoxes,
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
      color: CB_ACCENT,
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
            color: CB_ACCENT,
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
        text: "โทนหลัก",
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
            borderColor: CB_PILL_BORDER,
            backgroundColor: CB_PILL_BG,
            contents: [
              {
                type: "text",
                text: truncateEnergyBadgeLabel(
                  String(mainLabel || "-").trim(),
                  MAIN_ENERGY_PILL_MAX_LEN,
                ),
                size: "sm",
                weight: "bold",
                color: CB_ACCENT,
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

/** Default identity under headline — matches crystal bracelet payload tagline. */
const IDENTITY_LINE_DEFAULT = "กำไลหินคริสตัล · อ่านจากพลังรวม";

/**
 * @param {string} rawText unused — kept for signature parity with summary-first
 * @param {{
 *   birthdate?: string|null,
 *   reportUrl?: string|null,
 *   reportPayload?: import("../reports/reportPayload.types.js").ReportPayload | null,
 *   appendReportBubble?: boolean,
 * }} [options]
 */
export async function buildCrystalBraceletSummaryFirstFlex(rawText, options = {}) {
  void rawText;
  const reportPayload = options.reportPayload ?? null;
  const reportUrl = options.reportUrl ?? null;
  const cb = reportPayload?.crystalBraceletV1;
  if (!cb || typeof cb !== "object") {
    throw new Error("CRYSTAL_BRACELET_FLEX_MISSING_PAYLOAD");
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

  const fs = cb.flexSurface;
  const headlineText = String(fs?.headline || "").trim() || "กำไลหินคริสตัล";
  const taglineText =
    String(fs?.tagline || "").trim() || IDENTITY_LINE_DEFAULT;
  const fitLine = String(fs?.fitLine || "").trim();
  const bulletLines = Array.isArray(fs?.bullets)
    ? fs.bullets
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const mainPill =
    String(fs?.mainEnergyShort || "").trim() || "พลังรวมของกำไล";

  const imgUrl = String(reportPayload?.object?.objectImageUrl || "").trim();
  const heroOk = /^https:\/\//i.test(imgUrl);
  const url = String(reportUrl || "").trim();

  const axesBlock = createCrystalBraceletAxesBarBlock(cb.axes);

  const altMain = headlineText.split("\n")[0].trim() || "กำไลหินคริสตัล";
  const altText = buildScanFlexAltText({
    mainEnergyLabel: altMain,
    scoreDisplay: score.display || "-",
  });

  console.log(
    JSON.stringify({
      event: "FLEX_CRYSTAL_BRACELET_SUMMARY_FIRST",
      schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
      scanCopyConfigVersion: SCAN_COPY_CONFIG_VERSION,
      scoringMode: cb.scoringMode,
      crystalBraceletVersion: cb.version,
      flexHeroCopySource: "crystal_bracelet_v1_summary_first",
      appendReportBubbleLegacyIgnored: Boolean(options.appendReportBubble),
    }),
  );

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
    color: CB_TITLE_TAGLINE_COLOR,
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
          maxLines: 3,
          lineSpacing: "3px",
          margin: "xl",
        }
      : null;

  const bulletRows = bulletLines.map((line) => ({
    type: "text",
    text: `› ${line}`,
    size: "sm",
    color: FLEX_TEXT_SECONDARY,
    wrap: true,
    maxLines: 2,
    lineSpacing: "3px",
    margin: "xs",
  }));

  const bodyContents = [
    headlineBlock,
    taglineBlock,
    createScoreRowTwoUp(score.display || "-", compatPctStr, compatBandStr),
    ...(axesBlock ? [axesBlock] : []),
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
        label: String(fs?.ctaLabel || "").trim() || "ดูรายงานพลังของกำไลเส้นนี้",
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
      aspectRatio: "20:9",
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
