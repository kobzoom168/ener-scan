/**
 * Crystal-bracelet-only summary-first Flex — copy from payload slice only (no generic crystal copy).
 */
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";
import { normalizeScore } from "./flex.utils.js";
import { buildScanFlexAltText } from "./flex.display.js";
import { SCAN_COPY_CONFIG_VERSION } from "./scanCopy.generator.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  computeCrystalBraceletAlignmentAxisKey,
  computeCrystalBraceletOwnerAxisScoresV1,
  crystalBraceletCompatibilityBandFromPercent,
} from "../../crystalBracelet/crystalBraceletScores.util.js";

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

/** Slightly slim bar + looser row gaps keeps 6 rows readable without crowding labels. */
const LIFE_AREA_BAR_HEIGHT = "6px";
const LIFE_AREA_LABEL_COL_WIDTH = "112px";
const LIFE_AREA_SCORE_COL_WIDTH = "44px";
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
        color: "#475569",
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
 * @param {string} scoreDisplay
 * @param {string} compatPctStr
 * @param {string} [compatBandStr]
 * @param {number|null} [alignBarScore0to100] — bracelet score on the align axis (0–100), same as graph summary / HTML; when set, main figure is this value and overall % is shown below
 */
function createScoreRowTwoUp(
  scoreDisplay,
  compatPctStr,
  compatBandStr = "",
  alignBarScore0to100 = null,
) {
  const levelValue = `${String(scoreDisplay || "-").trim() || "-"} / 10`;
  const pct = String(compatPctStr || "-").trim().replace(/\s+/g, "");
  const band = String(compatBandStr || "").trim();
  const useAlignBar =
    alignBarScore0to100 != null &&
    Number.isFinite(Number(alignBarScore0to100));
  const barStr = useAlignBar
    ? String(
        Math.max(
          0,
          Math.min(100, Math.round(Number(alignBarScore0to100))),
        ),
      )
    : "";
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
      text: useAlignBar ? barStr : pct,
      size: "xxl",
      weight: "bold",
      color: CB_ACCENT,
      margin: "xs",
      wrap: false,
    },
  ];
  if (useAlignBar && pct && pct !== "-") {
    compatContents.push({
      type: "text",
      text: `โดยรวม ${pct}`,
      size: "sm",
      color: FLEX_TEXT_SECONDARY,
      wrap: true,
      maxLines: 2,
      margin: "xs",
    });
  }
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
 * Bracelet score on the align axis — same seed/session/compat + min-|stone−owner| as HTML radar/graph.
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null | undefined} reportPayload
 * @returns {number|null}
 */
function crystalBraceletAlignBarScoreFromPayload(reportPayload) {
  const cb = reportPayload?.crystalBraceletV1;
  if (!cb || typeof cb !== "object") return null;
  const axes = cb.axes;
  if (!axes || typeof axes !== "object") return null;

  /** @type {Record<string, number>} */
  const stoneScores = {};
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const sc = axes[k]?.score;
    stoneScores[k] =
      sc != null && Number.isFinite(Number(sc))
        ? Math.max(0, Math.min(100, Math.round(Number(sc))))
        : 0;
  }

  const reportId = String(reportPayload?.reportId || "").trim();
  const scanReqId = String(reportPayload?.scanId || "").trim();
  const seedKey =
    String(cb.context?.ownerAxisSeedKey || "").trim() ||
    reportId ||
    scanReqId ||
    String(cb.context?.scanResultIdPrefix || "cb");
  const sessionKey =
    String(cb.context?.ownerAxisSessionKey || "").trim() ||
    reportId ||
    scanReqId ||
    String(cb.context?.scanResultIdPrefix || "session");

  const ownerFitFromCb =
    cb.ownerFit &&
    typeof cb.ownerFit === "object" &&
    cb.ownerFit.score != null &&
    Number.isFinite(Number(cb.ownerFit.score))
      ? Number(cb.ownerFit.score)
      : null;
  const ownerFitFromSummary =
    reportPayload?.summary?.compatibilityPercent != null &&
    Number.isFinite(Number(reportPayload.summary.compatibilityPercent))
      ? Math.round(Number(reportPayload.summary.compatibilityPercent))
      : null;
  const ownerFitInput = ownerFitFromSummary ?? ownerFitFromCb ?? 66;

  const ownerScores = computeCrystalBraceletOwnerAxisScoresV1(
    seedKey,
    sessionKey,
    stoneScores,
    ownerFitInput,
  );
  const alignKey = computeCrystalBraceletAlignmentAxisKey(
    stoneScores,
    ownerScores,
  );
  const sc = axes[alignKey]?.score;
  if (sc == null || !Number.isFinite(Number(sc))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(sc))));
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
  const alignBarScore = crystalBraceletAlignBarScoreFromPayload(reportPayload);

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
    createScoreRowTwoUp(
      score.display || "-",
      compatPctStr,
      compatBandStr,
      alignBarScore,
    ),
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
