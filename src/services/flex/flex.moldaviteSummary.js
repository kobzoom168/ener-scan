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
const MOLDAVITE_ACCENT = "#4ADE80";
const MOLDAVITE_ACCENT_DIM = "#5ee0a0";
const MOLDAVITE_PILL_BORDER = "#3d5248";
const MOLDAVITE_PILL_BG = "#0a1410";
/** CTA: slightly deeper green for contrast on mobile tap targets. */
const MOLDAVITE_CTA_BG = "#22C55E";
const FLEX_ACCENT = MOLDAVITE_CTA_BG;
const FLEX_TEXT_PRIMARY = "#ffffff";
const FLEX_TEXT_SECONDARY = "#a1a8b3";
const FLEX_TEXT_MUTED = "#6b7280";
const FLEX_TEXT_CAPTION = "#5c6468";
/** Tagline under title — intentionally quiet vs headline. */
const MOLDAVITE_TITLE_TAGLINE_COLOR = "#6d7a74";
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
 * Life-area scores — vertical text only (same semantics as old ranked rows).
 * Matches generic summary-first patterns: no horizontal text+flex rows, no justifyContent/alignItems
 * (those differ from the known-good Thai/generic card and have triggered LINE 400 in prod).
 *
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

  /** @type {object[]} */
  const lines = [
    {
      type: "text",
      text: "มิติที่โทนไปออกแรงสุด",
      size: "xs",
      color: MOLDAVITE_ACCENT_DIM,
      wrap: true,
      margin: "sm",
    },
    {
      type: "text",
      text: "เรียงจากมากไปน้อย",
      size: "xs",
      color: FLEX_TEXT_CAPTION,
      wrap: true,
      margin: "xs",
    },
  ];
  for (const r of rows) {
    lines.push({
      type: "text",
      text: `${r.label} · ${String(Math.round(r.score))}`,
      size: "sm",
      color: FLEX_TEXT_SECONDARY,
      wrap: true,
      margin: "xs",
    });
  }

  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    spacing: "xs",
    contents: lines,
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

  const taglineText =
    String(mv.flexSurface?.tagline || "").trim() || MOLDAVITE_TITLE_TAGLINE;

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
    color: "#cccccc",
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
