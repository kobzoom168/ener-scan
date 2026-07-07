/**
 * Crystal-bracelet-only summary-first Flex — copy from payload slice only (no generic crystal copy).
 */
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";
import { normalizeScore } from "./flex.utils.js";
import { buildScanFlexAltText } from "./flex.display.js";
import { SCAN_COPY_CONFIG_VERSION } from "./scanCopy.generator.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  crystalBraceletCompatibilityBandFromPercent,
} from "../../crystalBracelet/crystalBraceletScores.util.js";

/* Feminine light theme — matches the bracelet HTML report (ชมพูพาสเทล-ลาเวนเดอร์). */
const FLEX_CARD_BG = "#fdf3f8";
const FLEX_BOX_BG = "#fbeaf3";
const LIFE_AREA_BAR_TRACK_BG = "#f0d7e6";
const CB_BAR_FILL = "#d97bb0";
const CB_ACCENT = "#b34d8f";
const CB_ACCENT_DIM = "#b34d8f";
const CB_CTA_BG = "#d97bb0";
const FLEX_ACCENT = CB_CTA_BG;
const FLEX_TEXT_PRIMARY = "#4a2b40";
const FLEX_TEXT_SECONDARY = "#8a6478";
const FLEX_TEXT_CAPTION = "#a988a0";
const CB_TITLE_TAGLINE_COLOR = "#a988a0";

/** Slightly slim bar + looser row gaps keeps 6 rows readable without crowding labels. */
const LIFE_AREA_BAR_HEIGHT = "6px";
const LIFE_AREA_LABEL_COL_WIDTH = "100px";
const LIFE_AREA_SCORE_COL_WIDTH = "38px";

/** Older payloads baked "กำไลหินคริสตัล" — display just "กำไล" (many bracelet kinds). */
function simplifyBraceletWord(t) {
  return String(t || "").split("กำไลหินคริสตัล").join("กำไล");
}

/**
 * @param {number|null|undefined} score0to100
 * @returns {{ greenFlex: number, emptyFlex: number }}
 */
function axisBarFlexPair(score0to100) {
  if (score0to100 == null || !Number.isFinite(Number(score0to100))) {
    return { greenFlex: 0, emptyFlex: 10 };
  }
  // Flex integers out of 10 → 10% bar resolution (was thirds; 69 vs 58 looked equal).
  const r = Math.max(0, Math.min(100, Number(score0to100))) / 100;
  const g = Math.max(0, Math.min(10, Math.round(r * 10)));
  return { greenFlex: g, emptyFlex: 10 - g };
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

  const visibleRows = rows;

  /** @type {object[]} */
  const rowBoxes = visibleRows.map(({ label, score }) => {
    const { greenFlex, emptyFlex } = axisBarFlexPair(score);
    const scoreText = score == null ? "—" : String(score);
    return {
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      margin: "none",
      paddingTop: "3px",
      paddingBottom: "3px",
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
          paddingAll: "3px",
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
              size: "xs",
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
        text: "มิติพลังของกำไล",
        size: "xs",
        color: CB_ACCENT_DIM,
        weight: "bold",
        wrap: true,
        margin: "none",
      },
      {
        type: "text",
        text: "เรียงจากพลังเด่นไปเบา",
        size: "xxs",
        color: "#a988a0",
        wrap: true,
        margin: "sm",
      },
      {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        margin: "none",
        paddingTop: "sm",
        paddingBottom: "md",
        contents: rowBoxes,
      },
    ],
  };
}

/**
 * Two stat boxes: ระดับพลัง x/10 + เข้ากับคุณ % (one clear number each —
 * the old version showed the align-axis score AND the overall % together,
 * which read as two conflicting numbers; same fix as the HTML report).
 * @param {string} scoreDisplay
 * @param {string} compatPctStr
 * @param {string} [compatBandStr]
 */
function createScoreRowTwoUp(scoreDisplay, compatPctStr, compatBandStr = "") {
  const levelValue = `${String(scoreDisplay || "-").trim() || "-"} / 10`;
  const pct = String(compatPctStr || "-").trim().replace(/\s+/g, "");
  const band = String(compatBandStr || "").trim();
  /** @type {object[]} */
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
      size: "xs",
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
        cornerRadius: "12px",
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
            size: "xxl",
            weight: "bold",
            color: CB_ACCENT,
            margin: "xs",
            wrap: true,
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        paddingAll: "14px",
        cornerRadius: "12px",
        backgroundColor: FLEX_BOX_BG,
        contents: compatContents,
      },
    ],
  };
}

function compatPercentAndBand(reportPayload, fallbackCompat) {
  const p = reportPayload?.summary?.compatibilityPercent;
  if (p != null && Number.isFinite(Number(p))) {
    const pctRounded = Math.round(Number(p));
    const bandExplicit = String(
      reportPayload?.summary?.compatibilityBand || "",
    ).trim();
    const bandStr =
      bandExplicit ||
      crystalBraceletCompatibilityBandFromPercent(pctRounded);
    return { pctStr: `${pctRounded}%`, bandStr };
  }
  const fb = String(fallbackCompat || "-").trim();
  const m = fb.match(/(\d+(?:\.\d+)?)/);
  if (m && Number.isFinite(Number(m[1]))) {
    const pctRounded = Math.round(Number(m[1]));
    const bandStr = crystalBraceletCompatibilityBandFromPercent(pctRounded);
    return { pctStr: `${pctRounded}%`, bandStr };
  }
  return { pctStr: "-", bandStr: "" };
}

/** Default identity under headline — matches crystal bracelet payload tagline. */
const IDENTITY_LINE_DEFAULT = "กำไล · อ่านจากพลังรวม";

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
  const headlineText =
    simplifyBraceletWord(String(fs?.headline || "").trim()) || "กำไล";
  const taglineText =
    simplifyBraceletWord(String(fs?.tagline || "").trim()) ||
    IDENTITY_LINE_DEFAULT;
  const fitLine = simplifyBraceletWord(String(fs?.fitLine || "").trim());
  const bulletLines = Array.isArray(fs?.bullets)
    ? fs.bullets
        .map((x) => simplifyBraceletWord(String(x || "").trim()))
        .filter(Boolean)
        .slice(0, 2)
    : [];

  const imgUrl = String(reportPayload?.object?.objectImageUrl || "").trim();
  const heroOk = /^https:\/\//i.test(imgUrl);
  const url = String(reportUrl || "").trim();

  const axesBlock = createCrystalBraceletAxesBarBlock(cb.axes);

  const altMain = headlineText.split("\n")[0].trim() || "กำไล";
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

  const teaserText = String(fs?.ownerProfileTeaser || "").trim();
  const ownerTeaserBlock =
    teaserText.length > 0
      ? {
          type: "text",
          text: teaserText,
          size: "xxs",
          color: FLEX_TEXT_CAPTION,
          wrap: true,
          maxLines: 2,
          lineSpacing: "2px",
          margin: "xs",
        }
      : null;

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
          margin: "xxl",
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
    ...(ownerTeaserBlock ? [ownerTeaserBlock] : []),
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
      margin: "xl",
    });
  } else {
    bodyContents.push({
      type: "button",
      style: "primary",
      color: FLEX_ACCENT,
      height: "md",
      margin: "xl",
      action: {
        type: "uri",
        label: String(fs?.ctaLabel || "").trim() || "ดูรายงานพลังของกำไลเส้นนี้",
        uri: url,
      },
    });
  }

  const bubble = {
    type: "bubble",
    /** Taller than `mega` so 6 axis rows + summary + CTA breathe on phones. */
    size: "giga",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "24px",
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
