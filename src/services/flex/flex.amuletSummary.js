/**
 * Sacred amulet lane — summary-first Flex (gold/dark theme). Parallel to Moldavite Flex; does not use legacy thai_amulet pools.
 *
 * Typography: LINE renders Flex with the client’s system fonts (no @font-face). The HTML report uses
 * `--mv2-font-th` in `amuletReportV2.template.js` for a unified Thai stack; visual parity with Flex is
 * approximate — keep the same size/weight *roles* (headline md bold, tagline xs, body xs) here.
 */
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";
const AMULET_VISIBLE_LABEL_FALLBACK = "พระเครื่อง";
import { normalizeScore } from "./flex.utils.js";
import { buildScanFlexAltText } from "./flex.display.js";
import { SCAN_COPY_CONFIG_VERSION } from "./scanCopy.generator.js";

/** Dark + gold — sacred amulet lane (LINE-safe hex). */
const FLEX_CARD_BG = "#0c0a08";
const FLEX_BOX_BG = "#1a1510";
/** Pill meter track — inset, rounded; pair with LIFE_AREA_BAR_FILL (distinct from header accent hex). */
const LIFE_AREA_BAR_TRACK_BG = "#1c1812";
const LIFE_AREA_BAR_FILL = "#c9a227";
const AMULET_ACCENT = "#e8c547";
const AMULET_ACCENT_DIM = "#d4af37";
const AMULET_CTA_BG = "#b8860b";
const FLEX_ACCENT = AMULET_CTA_BG;
const FLEX_TEXT_PRIMARY = "#f3f4f6";
const FLEX_TEXT_SECONDARY = "#9ca3af";
/** Tagline under title — softer than body so headline stays primary. */
const AMULET_TITLE_TAGLINE_COLOR = "#a8a29e";
/** Life-area helper line — dimmer than captions; metadata only. */
const LIFE_AREA_HELPER_TEXT_COLOR = "#52525b";
/** Fallback when power rows are missing (Flex display only). */
const AMULET_TITLE_TAGLINE = "พระเครื่อง · หกมิติพลัง";

/** Bar score numerals — quieter than labels (read dimension + bar first). */
const LIFE_AREA_BAR_SCORE_COLOR = "#5f5a4f";
/** Summary body line under `ตอนนี้เด่นสุด` — subordinate to label, still readable. */
const AMULET_SUMMARY_VALUE_COLOR = "#b4aea3";

/** Flex summary: show only top N dimensions after score sort (full data stays in HTML). */
const AMULET_FLEX_BARS_TOP_N = 4;
/** Flex-only: cap formatted `ตอนนี้เด่นสุด` value (payload/HTML unchanged). */
const AMULET_FLEX_SUMMARY_VALUE_MAX_CHARS = 52;
/** Flex-only: max chars per side when fitLine uses `A → B` (teaser sharpen; payload unchanged). */
const AMULET_FLEX_SUMMARY_ARROW_PART_MAX = 22;
/** Flex tagline: max Thai chars for “เด่น{มิติ}” segment after `พระเครื่อง · `. */
const AMULET_FLEX_TAGLINE_DIM_MAX_CHARS = 18;

/**
 * Flex-only: shorter display strings for tagline + summary (not bars/HTML/payload).
 * Long canonical `labelThai` → alias; unknown labels pass through.
 */
const AMULET_FLEX_POWER_LABEL_ALIAS = /** @type {const} */ ({
  คุ้มครองป้องกัน: "คุ้มครอง",
  เมตตาและคนเอ็นดู: "เมตตา",
  บารมีและอำนาจนำ: "บารมี",
  โชคลาภและการเปิดทาง: "โชคลาภ",
  หนุนดวงและการตั้งหลัก: "หนุนดวง",
  งานเฉพาะทาง: "งานเฉพาะ",
});

/** @type {string[]} longest first — prefix match after exact tries */
const AMULET_FLEX_ALIAS_KEYS_SORTED = Object.keys(AMULET_FLEX_POWER_LABEL_ALIAS).sort(
  (a, b) => b.length - a.length,
);

/**
 * @param {string} raw
 * @returns {string}
 */
function applyAmuletFlexLabelAlias(raw) {
  const t = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  const withoutParen = t.replace(/\s*\([^)]*\)\s*$/u, "").trim();
  const tryKeys = [t, withoutParen];
  for (const c of tryKeys) {
    if (Object.prototype.hasOwnProperty.call(AMULET_FLEX_POWER_LABEL_ALIAS, c)) {
      return AMULET_FLEX_POWER_LABEL_ALIAS[/** @type {keyof typeof AMULET_FLEX_POWER_LABEL_ALIAS} */ (c)];
    }
  }
  for (const key of AMULET_FLEX_ALIAS_KEYS_SORTED) {
    for (const c of tryKeys) {
      if (c === key) {
        return AMULET_FLEX_POWER_LABEL_ALIAS[/** @type {keyof typeof AMULET_FLEX_POWER_LABEL_ALIAS} */ (key)];
      }
      if (c.startsWith(key) && (c.length === key.length || /[\s(]/.test(c[key.length]))) {
        return AMULET_FLEX_POWER_LABEL_ALIAS[/** @type {keyof typeof AMULET_FLEX_POWER_LABEL_ALIAS} */ (key)];
      }
    }
  }
  return t;
}

/** Six power categories — display order for bar row iteration; sort is by score. */
const AMULET_POWER_ROW_KEYS = /** @type {const} */ ([
  "protection",
  "metta",
  "baramee",
  "luck",
  "fortune_anchor",
  "specialty",
]);

const LIFE_AREA_BAR_HEIGHT = "10px";
/** Fixed score column on the meter row (label is full-width on its own line above). */
const LIFE_AREA_SCORE_COL_WIDTH = "44px";

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
 * @param {string} raw
 * @returns {{ label: string, value: string }|null}
 */
function parseFitLineToSummaryBlock(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/^ตอนนี้เด่นสุด\s*:\s*(.+)$/s);
  if (m) {
    const value = String(m[1] || "").trim();
    return { label: "ตอนนี้เด่นสุด", value: value || "—" };
  }
  return { label: "ตอนนี้เด่นสุด", value: s };
}

/**
 * Teaser-only truncation for summary value (Moldavite-style: Flex shell, HTML = artifact).
 * @param {string} raw
 */
function truncateFlexSummaryValueForTeaser(raw) {
  const t = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "—";
  const max = AMULET_FLEX_SUMMARY_VALUE_MAX_CHARS;
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * @param {string} s
 * @param {number} maxLen
 */
function shortenThaiSnippet(s, maxLen) {
  const t = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/**
 * Same ordering as bars: score desc, all six keys, then slice for top-N in bar block only.
 *
 * @param {Record<string, { score?: number, labelThai?: string }>|null|undefined} powerCategories
 * @returns {{ label: string, score: number|null }[]}
 */
function sortAmuletPowerCategoryRows(powerCategories) {
  if (!powerCategories || typeof powerCategories !== "object") return [];
  /** @type {{ label: string, score: number|null }[]} */
  const rows = [];
  for (const k of AMULET_POWER_ROW_KEYS) {
    const entry = powerCategories[k];
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
  return rows;
}

/**
 * Flex-only tagline from #1 power dimension label (payload.tagline not used for Flex body).
 *
 * @param {{ powerCategories?: Record<string, { labelThai?: string, score?: number }> } | null | undefined} mv
 */
function buildAmuletFlexTaglineDisplay(mv) {
  const rows = sortAmuletPowerCategoryRows(mv?.powerCategories);
  const top = rows[0];
  const lab = top ? String(top.label || "").trim() : "";
  if (!lab || lab === "—") return AMULET_TITLE_TAGLINE;
  const dimRaw = applyAmuletFlexLabelAlias(lab);
  const dim = shortenThaiSnippet(dimRaw || lab, AMULET_FLEX_TAGLINE_DIM_MAX_CHARS);
  return `พระเครื่อง · เด่น${dim}`;
}

/**
 * Flex-only: sharpen fitLine value (arrow → เด่น/รอง); does not change payload.
 *
 * @param {string} raw
 */
function formatFlexSummaryValueForDisplay(raw) {
  const v = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!v || v === "—") return "—";
  const parts = v
    .split(/\s*→\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const a0 = applyAmuletFlexLabelAlias(parts[0]) || parts[0];
    const b0 = applyAmuletFlexLabelAlias(parts[1]) || parts[1];
    const a = shortenThaiSnippet(a0, AMULET_FLEX_SUMMARY_ARROW_PART_MAX);
    const b = shortenThaiSnippet(b0, AMULET_FLEX_SUMMARY_ARROW_PART_MAX);
    return `เด่น${a} รอง${b}`;
  }
  const single = applyAmuletFlexLabelAlias(v);
  return single !== v ? single : v;
}

/**
 * Power category meters: each item is two rows — (1) full-width Thai label,
 * (2) horizontal pill track + fixed-width score. Sort/top-N/flex ratio unchanged.
 *
 * @param {Record<string, { score?: number, labelThai?: string }>|null|undefined} powerCategories
 */
function createPowerCategoryBarBlock(powerCategories) {
  if (!powerCategories || typeof powerCategories !== "object") return null;

  const rows = sortAmuletPowerCategoryRows(powerCategories);
  const topRows = rows.slice(0, AMULET_FLEX_BARS_TOP_N);

  /** @type {object[]} */
  const rowBoxes = topRows.map(({ label, score }) => {
    const { greenFlex, emptyFlex } = lifeAreaBarFlexPair(score);
    const scoreText = score == null ? "—" : String(score);
    const meterTrack = {
      type: "box",
      layout: "horizontal",
      flex: 1,
      spacing: "none",
      paddingAll: "4px",
      cornerRadius: "xl",
      backgroundColor: LIFE_AREA_BAR_TRACK_BG,
      contents: [
        {
          type: "box",
          layout: "horizontal",
          flex: greenFlex,
          height: LIFE_AREA_BAR_HEIGHT,
          backgroundColor: LIFE_AREA_BAR_FILL,
          cornerRadius: "lg",
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
    };
    return {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "xs",
      contents: [
        {
          type: "text",
          text: label,
          size: "xs",
          color: FLEX_TEXT_PRIMARY,
          wrap: true,
          maxLines: 3,
          margin: "none",
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "xs",
          margin: "none",
          contents: [
            meterTrack,
            {
              type: "box",
              layout: "vertical",
              width: LIFE_AREA_SCORE_COL_WIDTH,
              justifyContent: "center",
              contents: [
                {
                  type: "text",
                  text: scoreText,
                  size: "xxs",
                  color: LIFE_AREA_BAR_SCORE_COLOR,
                  weight: "regular",
                  wrap: false,
                  align: "end",
                },
              ],
            },
          ],
        },
      ],
    };
  });

  return {
    type: "box",
    layout: "vertical",
    margin: "sm",
    spacing: "none",
    paddingBottom: "lg",
    contents: [
      {
        type: "box",
        layout: "vertical",
        spacing: "none",
        margin: "none",
        contents: [
          {
            type: "text",
            text: "พลังไปออกกับมิติไหน",
            size: "xs",
            color: AMULET_ACCENT_DIM,
            weight: "bold",
            wrap: true,
            margin: "none",
          },
          {
            type: "text",
            text: "เรียงจากคะแนนสูงไปต่ำ",
            size: "xxs",
            color: LIFE_AREA_HELPER_TEXT_COLOR,
            wrap: true,
            margin: "none",
          },
        ],
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
      color: AMULET_ACCENT,
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
        cornerRadius: "md",
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
            color: AMULET_ACCENT,
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
        cornerRadius: "md",
        backgroundColor: FLEX_BOX_BG,
        contents: compatContents,
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
export async function buildAmuletSummaryFirstFlex(rawText, options = {}) {
  void rawText;
  const reportPayload = options.reportPayload ?? null;
  const reportUrl = options.reportUrl ?? null;
  const mv = reportPayload?.amuletV1;
  if (!mv || typeof mv !== "object") {
    throw new Error("AMULET_FLEX_MISSING_PAYLOAD");
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
    AMULET_VISIBLE_LABEL_FALLBACK;
  const fitLine = String(mv.flexSurface?.fitLine || "").trim();

  const imgUrl = String(reportPayload?.object?.objectImageUrl || "").trim();
  const heroOk = /^https:\/\//i.test(imgUrl);
  const url = String(reportUrl || "").trim();

  const lifeAreasBlock = createPowerCategoryBarBlock(mv.powerCategories);

  const taglineText = buildAmuletFlexTaglineDisplay(mv);

  const altMain =
    headlineText.split("\n")[0].trim() || AMULET_VISIBLE_LABEL_FALLBACK;
  const altText = buildScanFlexAltText({
    mainEnergyLabel: altMain,
    scoreDisplay: score.display || "-",
  });

  console.log(
    JSON.stringify({
      event: "FLEX_AMULET_SUMMARY_FIRST",
      schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
      scanCopyConfigVersion: SCAN_COPY_CONFIG_VERSION,
      scoringMode: mv.scoringMode,
      amuletVersion: mv.version,
      flexHeroCopySource: "amulet_v1_summary_first",
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
    color: AMULET_TITLE_TAGLINE_COLOR,
    wrap: true,
    maxLines: 1,
    margin: "xs",
  };

  const fitParsed = parseFitLineToSummaryBlock(fitLine);
  const summaryValueDisplay = fitParsed
    ? truncateFlexSummaryValueForTeaser(
        formatFlexSummaryValueForDisplay(fitParsed.value),
      )
    : "";
  const fitBlock =
    fitParsed != null
      ? {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "md",
          paddingAll: "12px",
          backgroundColor: FLEX_BOX_BG,
          cornerRadius: "md",
          contents: [
            {
              type: "text",
              text: fitParsed.label,
              size: "xxs",
              color: AMULET_ACCENT_DIM,
              weight: "bold",
              wrap: true,
            },
            {
              type: "text",
              text: summaryValueDisplay,
              size: "xs",
              color: AMULET_SUMMARY_VALUE_COLOR,
              weight: "regular",
              wrap: true,
              maxLines: 2,
              lineSpacing: "4px",
            },
          ],
        }
      : null;

  const scoreRowBlock = createScoreRowTwoUp(
    score.display || "-",
    compatPctStr,
    compatBandStr,
  );

  /** @type {object[]} */
  const bodyContents = [
    headlineBlock,
    taglineBlock,
    scoreRowBlock,
    ...(lifeAreasBlock ? [lifeAreasBlock] : []),
    ...(fitBlock ? [fitBlock] : []),
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
      margin: "md",
      action: {
        type: "uri",
        label: String(mv.flexSurface?.ctaLabel || "").trim() || "เปิดรายงานฉบับเต็ม",
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
      gravity: "center",
      backgroundColor: FLEX_CARD_BG,
    };
  }

  return {
    type: "flex",
    altText,
    contents: bubble,
  };
}
