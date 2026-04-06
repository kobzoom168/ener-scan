/**
 * Moldavite-only summary-first Flex — does not call resolveEnergyCopyForFlex (isolated hero copy).
 */
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";
import { MOLDAVITE_VISIBLE_LABEL_FALLBACK } from "../../moldavite/moldaviteDisplayNaming.util.js";
import { normalizeScore } from "./flex.utils.js";
import { buildScanFlexAltText } from "./flex.display.js";
import { SCAN_COPY_CONFIG_VERSION } from "./scanCopy.generator.js";

/**
 * Moldavite-only palette — dark card + green accents (LINE-safe hex).
 * Strong mood; keep contrast for body copy and bar track vs fill.
 */
const FLEX_CARD_BG = "#0f1115";
const FLEX_BOX_BG = "#1a1f26";
/** Simulated progress track / fill (LINE has no real bar — nested box + flex 0–3 only). */
const LIFE_AREA_BAR_TRACK_BG = "#374151";
const LIFE_AREA_BAR_FILL = "#22c55e";
const MOLDAVITE_ACCENT = "#4ade80";
const MOLDAVITE_ACCENT_DIM = "#86efac";
const MOLDAVITE_PILL_BORDER = "#166534";
const MOLDAVITE_PILL_BG = "#052e16";
/** CTA — saturated green on dark for tap contrast. */
const MOLDAVITE_CTA_BG = "#16a34a";
const FLEX_ACCENT = MOLDAVITE_CTA_BG;
const FLEX_TEXT_PRIMARY = "#f3f4f6";
const FLEX_TEXT_SECONDARY = "#9ca3af";
const FLEX_TEXT_CAPTION = "#9ca3af";
/** Tagline under title — softer than body so headline stays primary. */
const MOLDAVITE_TITLE_TAGLINE_COLOR = "#71717a";
/** Life-area helper line — dimmer than captions; metadata only. */
const LIFE_AREA_HELPER_TEXT_COLOR = "#52525b";
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

/** Known keys for moldavite life areas (display-only sort; not score math). */
const LIFE_AREA_ROW_KEYS = /** @type {const} */ ([
  "work",
  "relationship",
  "money",
]);

const LIFE_AREA_BAR_HEIGHT = "8px";
/** Fixed label column so bar tracks share the same x-range (LINE `width` on box; px is supported). */
const LIFE_AREA_LABEL_COL_WIDTH = "120px";
/** Fixed score column so numbers align; long scores still fit. */
const LIFE_AREA_SCORE_COL_WIDTH = "48px";

/**
 * LINE Flex allows `flex` on box only in 0–3 (project + API guardrail).
 * Approximate fill ratio ≈ score/100 with two horizontal segments (green | track).
 *
 * @param {number|null|undefined} score0to100
 * @returns {{ greenFlex: number, emptyFlex: number }}
 */
function lifeAreaBarFlexPair(score0to100) {
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
 * Horizontal bar-style rows: [label] [track with green|empty flex] [score].
 * `flex` only on box nodes; text has no flex.
 *
 * @param {Record<string, { score?: number, labelThai?: string }>|null|undefined} lifeAreas
 */
function createLifeAreasBarBlock(lifeAreas) {
  if (!lifeAreas || typeof lifeAreas !== "object") return null;

  /** @type {{ label: string, score: number|null }[]} */
  const rows = [];
  for (const k of LIFE_AREA_ROW_KEYS) {
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
    rows.push({ label: label || "—", score: scoreOk });
  }
  rows.sort((a, b) => {
    if (a.score == null && b.score == null) return 0;
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score;
  });

  /** @type {object[]} */
  const rowBoxes = rows.map(({ label, score }) => {
    const { greenFlex, emptyFlex } = lifeAreaBarFlexPair(score);
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
              backgroundColor: LIFE_AREA_BAR_FILL,
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
              color: MOLDAVITE_ACCENT,
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
        text: "พลังไปออกกับเรื่องไหน",
        size: "xs",
        color: MOLDAVITE_ACCENT_DIM,
        weight: "bold",
        wrap: true,
        margin: "none",
      },
      {
        type: "text",
        text: "เรียงจากคะแนนสูงไปต่ำ",
        size: "xs",
        color: LIFE_AREA_HELPER_TEXT_COLOR,
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

  const lifeAreasBlock = createLifeAreasBarBlock(mv.lifeAreas);

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
