/**
 * Summary-first LINE Flex — exactly 2 bubbles:
 * (1) teaser / summary from ReportPayload only — not the full HTML report.
 * (2) handoff / entry — curiosity toward the web artifact.
 *
 * Legacy {@link buildScanFlex} remains the fallback if this module throws.
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
import {
  createTopAccent,
  createCardShell,
  createMainTitle,
  createMetricCard,
  createMainEnergyMetricCard,
  createProgressBar,
} from "./flex.components.js";

/**
 * Page-2 copy candidates (product tuning). Implemented default: **A**.
 *
 * **A — สุภาพนิ่ง / clear**
 * "ผลใน LINE เป็นภาพรวมสั้น ๆ เท่านั้น"
 * "ฉบับเต็มจะเล่าต่อว่าชิ้นนี้หนุนคุณตรงไหน ใช้จังหวะใด และควรเปิดอ่านเมื่อใด"
 *
 * **B — ขลังนิด ๆ**
 * "สรุปใน LINE คือเงาแห่งจังหวะ"
 * "ฉบับเต็มคือแสงที่จะบอกว่าชิ้นนี้หนุนคุณตรงไหน — เปิดเมื่อพร้อมจะฟังลึกลงไป"
 *
 * **C — premium curiosity**
 * "ที่นี่มีแค่ทิศทาง"
 * "รายละเอียดของชิ้นจริงรออยู่ในฉบับเต็ม — ไม่ต้องรีบ แค่สงบ ๆ แล้วแตะเมื่ออยากรู้"
 */
const PAGE2_COPY_A = {
  title: "อ่านต่อบนเว็บ",
  lines: [
    "ผลใน LINE เป็นภาพรวมสั้น ๆ เท่านั้น",
    "ฉบับเต็มจะเล่าต่อว่าชิ้นนี้หนุนคุณตรงไหน ใช้จังหวะใด และควรเปิดอ่านเมื่อใด",
  ],
};

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

/**
 * Page 1 — Summary card (metrics + headline + max 2 bullets). ReportPayload is source of truth.
 * @param {object} p
 */
export function buildSummaryFlexPage1({
  accentColor,
  score,
  mainEnergy,
  compatibility,
  scanCopy,
  reportPayload,
}) {
  const compatLabel = compatibilityLabelForFlex(reportPayload, compatibility);
  const mainLabel =
    String(reportPayload?.summary?.mainEnergyLabel || "").trim() ||
    scanCopy?.summary?.mainEnergyLabel ||
    wrapFlexTextNoTruncate(
      getEnergyShortLabel(mainEnergy || "พลังทั่วไป"),
      32,
    );

  const objectLbl =
    String(reportPayload?.object?.objectLabel || "").trim() || "ชิ้นนี้";

  const headline = flexHeadlineFromPayload(reportPayload);
  const bullets = flexTeaserBullets(reportPayload);

  /** @type {unknown[]} */
  const afterHeadline = [
    {
      type: "text",
      text: headline,
      weight: "bold",
      size: "md",
      color: "#E8E8EC",
      wrap: true,
      maxLines: 3,
    },
  ];

  for (const b of bullets) {
    afterHeadline.push({
      type: "text",
      text: `• ${b}`,
      size: "xs",
      color: "#9A9AA0",
      wrap: true,
      maxLines: 3,
    });
  }

  if (bullets.length === 0) {
    afterHeadline.push({
      type: "text",
      text: "เด่นเรื่องพลังที่สแกนได้ — ฉบับเต็มจะขยายความละเอียด",
      size: "xs",
      color: "#8F8F95",
      wrap: true,
      maxLines: 2,
    });
  }

  const bodyContents = [
    createTopAccent(accentColor),
    createMainTitle("สรุปพลังชิ้นนี้", objectLbl),
    createCardShell(
      [
        {
          type: "text",
          text: "คะแนนพลัง",
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
          text: `พลังหลัก · ${mainLabel}`,
          size: "sm",
          color: "#ECECEC",
          wrap: true,
          maxLines: 2,
        },
        {
          type: "text",
          text: `ความเข้ากัน · ${compatLabel}`,
          size: "sm",
          color: "#C8C8CE",
          wrap: true,
          maxLines: 1,
        },
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
      spacing: "xs",
      margin: "sm",
      contents: afterHeadline,
    },
  ];

  return {
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
}

/**
 * Page 2 — Handoff / entry (HTML report). Primary CTA only when URL exists; optional rescan.
 * @param {object} p
 */
export function buildSummaryFlexPage2({
  accentColor,
  reportUrl,
  reportPayload,
}) {
  const url = String(reportUrl || "").trim();
  const rescan = String(reportPayload?.actions?.rescanUrl || "").trim();

  /** @type {unknown[]} */
  const textBlocks = PAGE2_COPY_A.lines.map((line) => ({
    type: "text",
    text: line,
    size: "sm",
    color: "#B8B8BE",
    wrap: true,
  }));

  /** @type {unknown[]} */
  const bodyContents = [
    createTopAccent(accentColor),
    {
      type: "text",
      text: PAGE2_COPY_A.title,
      weight: "bold",
      size: "xl",
      color: "#F5F5F5",
      margin: "md",
    },
    ...textBlocks,
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

  /** @type {unknown[]} */
  const footerContents = [];
  if (url) {
    footerContents.push({
      type: "button",
      style: "primary",
      color: accentColor,
      height: "sm",
      action: {
        type: "uri",
        label: "ดูรายงานฉบับเต็ม",
        uri: url,
      },
    });
  }
  if (rescan) {
    footerContents.push({
      type: "button",
      style: "secondary",
      height: "sm",
      action: {
        type: "uri",
        label: "สแกนอีกชิ้น",
        uri: rescan,
      },
    });
  }

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

  if (footerContents.length) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      backgroundColor: "#101010",
      paddingTop: "4px",
      paddingBottom: "14px",
      paddingStart: "18px",
      paddingEnd: "18px",
      spacing: "sm",
      contents: footerContents,
    };
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
      flexPresentationMode: "two_page_summary_handoff",
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

  const page1 = buildSummaryFlexPage1({
    accentColor,
    score,
    mainEnergy,
    compatibility,
    scanCopy,
    reportPayload,
  });

  const page2 = buildSummaryFlexPage2({
    accentColor,
    reportUrl,
    reportPayload,
  });

  return {
    type: "flex",
    altText,
    contents: {
      type: "carousel",
      contents: [page1, page2],
    },
  };
}
