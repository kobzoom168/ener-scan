/**
 * Summary-first LINE Flex — single bubble handoff card.
 * HTML report stays primary artifact; Flex is teaser only.
 */
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";
import { formatScanBirthdayLabelThai } from "../../utils/scanBirthdayLabel.util.js";
import { parseScanText } from "./flex.parser.js";
import { normalizeScore, getEnergyShortLabel } from "./flex.utils.js";
import { buildScanFlexAltText, FLEX_SPLIT_WARN_THRESHOLD, splitSentencesForFlex } from "./flex.display.js";
import { SCAN_COPY_CONFIG_VERSION } from "./scanCopy.generator.js";
import { ENERGY_TYPES } from "./scanCopy.config.js";
import { resolveEnergyType } from "./scanCopy.utils.js";

const FLEX_CARD_BG = "#1a1a1a";
const FLEX_BOX_BG = "#2a2a2a";
const FLEX_ACCENT = "#E8593C";
const FLEX_TEXT_PRIMARY = "#ffffff";
const FLEX_TEXT_SECONDARY = "#888888";
const FLEX_BORDER = "#333333";
const FLEX_DIM_ORDER = ["คุ้มกัน", "สมดุล", "อำนาจ", "เมตตา", "ดึงดูด"];

function createScoreRowTwoUp(scoreDisplay, compatPctStr) {
  const levelValue = `${String(scoreDisplay || "-").trim() || "-"} / 10`;
  const pct = String(compatPctStr || "-").trim().replace(/\s+/g, "");
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
            color: FLEX_ACCENT,
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
        contents: [
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
            size: "xl",
            weight: "bold",
            color: FLEX_TEXT_PRIMARY,
            margin: "sm",
            wrap: true,
          },
        ],
      },
    ],
  };
}

function createEnergyBadgePills(mainLabel, subLabel) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    margin: "md",
    contents: [
      {
        type: "text",
        text: "พลังหลัก · พลังเสริม",
        size: "xs",
        color: FLEX_TEXT_SECONDARY,
        wrap: true,
      },
      {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            flex: 1,
            paddingTop: "10px",
            paddingBottom: "10px",
            paddingStart: "14px",
            paddingEnd: "14px",
            borderWidth: "1px",
            borderColor: FLEX_ACCENT,
            backgroundColor: FLEX_BOX_BG,
            contents: [
              {
                type: "text",
                text: String(mainLabel || "-").trim(),
                size: "sm",
                weight: "bold",
                color: FLEX_ACCENT,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            flex: 1,
            paddingTop: "10px",
            paddingBottom: "10px",
            paddingStart: "14px",
            paddingEnd: "14px",
            borderWidth: "1px",
            borderColor: FLEX_BORDER,
            backgroundColor: FLEX_BOX_BG,
            contents: [
              {
                type: "text",
                text: String(subLabel || "-").trim(),
                size: "sm",
                weight: "bold",
                color: FLEX_TEXT_SECONDARY,
                wrap: true,
              },
            ],
          },
        ],
      },
    ],
  };
}

function dimensionStarStrings(n) {
  const v = Math.min(5, Math.max(1, Math.round(Number(n) || 3)));
  return { filled: "★".repeat(v), empty: "☆".repeat(5 - v) };
}

function createScanDimensionStarBlock(dimensions) {
  const rows = FLEX_DIM_ORDER.map((key, idx) => {
    const raw = dimensions?.[key];
    const v =
      raw != null && Number.isFinite(Number(raw)) ? Number(raw) : 3;
    const { filled, empty } = dimensionStarStrings(v);
    return {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "none",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: key,
              flex: 4,
              size: "sm",
              color: FLEX_TEXT_SECONDARY,
            },
            {
              type: "box",
              layout: "horizontal",
              flex: 3,
              justifyContent: "flex-end",
              spacing: "none",
              contents: [
                { type: "text", text: filled, size: "sm", color: FLEX_ACCENT },
                { type: "text", text: empty, size: "sm", color: "#666666" },
              ],
            },
          ],
        },
        ...(idx < FLEX_DIM_ORDER.length - 1
          ? [{ type: "separator", color: FLEX_BORDER, margin: "sm" }]
          : []),
      ],
    };
  });
  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    spacing: "none",
    contents: rows,
  };
}

function createCompatibilityTeaserBlock(birthdayLabel, reasonText) {
  const reason = String(reasonText || "").trim() || "โยงพลังวันเกิดกับแกนหลักของชิ้นนี้ได้ตรงจุด — ดูฉบับเต็มในรายงาน";
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "14px",
    spacing: "sm",
    backgroundColor: FLEX_BOX_BG,
    borderWidth: "1px",
    borderColor: FLEX_ACCENT,
    margin: "md",
    contents: [
      {
        type: "text",
        text: "เข้ากับคุณยังไง",
        size: "xs",
        color: FLEX_TEXT_SECONDARY,
        wrap: true,
      },
      {
        type: "text",
        text: `วันเกิด: ${birthdayLabel}`,
        size: "sm",
        color: FLEX_ACCENT,
        wrap: true,
      },
      {
        type: "text",
        text: reason,
        size: "sm",
        color: FLEX_TEXT_PRIMARY,
        wrap: true,
      },
    ],
  };
}

/**
 * @param {string} line
 * @returns {{ type: string, text: string, size: string, color: string, wrap: boolean, margin: string } | null}
 */
function createTipBulletRow(line) {
  const t = String(line ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return {
    type: "text",
    text: `› ${t}`,
    size: "sm",
    color: "#cccccc",
    wrap: true,
    margin: "xs",
  };
}

/**
 * Scan JSON `tips` / legacy “ชิ้นนี้หนุนเรื่อง” bullets → max 2 strings for Flex.
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null} reportPayload
 * @param {ReturnType<typeof parseScanText>} parsed
 */
function resolveFlexScanTips(reportPayload, parsed) {
  const fromPayload = reportPayload?.summary?.scanTips;
  if (Array.isArray(fromPayload) && fromPayload.length) {
    return fromPayload
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, 2);
  }
  return (parsed.supportTopics || [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 2);
}

const SUMMARY_CARD_COPY_VARIANTS = {
  premium_minimal: {
    variantKey: "premium_minimal",
    objectLabel: "วัตถุสายอำนาจ",
    headline: "ชิ้นนี้เด่นด้านอำนาจและการตั้งหลัก",
    scoreLabel: "ระดับพลัง",
    compatibilityLabel: "เข้ากับคุณ",
    mainEnergyTitleByType: {
      [ENERGY_TYPES.POWER]: "พลังหลัก · พลังอำนาจ",
      [ENERGY_TYPES.PROTECT]: "พลังหลัก · พลังคุ้มกัน",
      [ENERGY_TYPES.BALANCE]: "พลังหลัก · พลังสมดุล",
      [ENERGY_TYPES.KINDNESS]: "พลังหลัก · พลังเมตตา",
      [ENERGY_TYPES.ATTRACT]: "พลังหลัก · พลังดึงดูด",
      [ENERGY_TYPES.LUCK]: "พลังหลัก · พลังโชคลาภ",
      [ENERGY_TYPES.BOOST]: "พลังหลัก · พลังเสริม",
    },
    bullets: [
      "เด่นด้านการตั้งพลังให้นิ่ง",
      "เหมาะกับช่วงที่ต้องเดินหน้าอย่างมีจังหวะ",
    ],
    ctaText: "เปิดรายงานฉบับเต็ม",
    traitLabelsByType: {
      [ENERGY_TYPES.POWER]: "อำนาจ",
      [ENERGY_TYPES.PROTECT]: "คุ้มกัน",
      [ENERGY_TYPES.BALANCE]: "สมดุล",
      [ENERGY_TYPES.KINDNESS]: "เมตตา",
      [ENERGY_TYPES.ATTRACT]: "ดึงดูด",
      [ENERGY_TYPES.LUCK]: "โชคลาภ",
      [ENERGY_TYPES.BOOST]: "เสริมพลัง",
    },
  },
  thai_mystic: {
    variantKey: "thai_mystic",
    objectLabel: "วัตถุสายบารมี",
    headline: "วัตถุชิ้นนี้เด่นเรื่องบารมี อำนาจ และแรงคุมเกม",
    scoreLabel: "ระดับพลัง",
    compatibilityLabel: "เข้ากับคุณ",
    mainEnergyTitleByType: {
      [ENERGY_TYPES.POWER]: "พลังหลัก · บารมีอำนาจ",
      [ENERGY_TYPES.PROTECT]: "พลังหลัก · บารมีคุ้มกัน",
      [ENERGY_TYPES.BALANCE]: "พลังหลัก · บารมีสมดุล",
      [ENERGY_TYPES.KINDNESS]: "พลังหลัก · บารมีเมตตา",
      [ENERGY_TYPES.ATTRACT]: "พลังหลัก · บารมีดึงดูด",
      [ENERGY_TYPES.LUCK]: "พลังหลัก · บารมีโชคลาภ",
      [ENERGY_TYPES.BOOST]: "พลังหลัก · บารมีเสริม",
    },
    bullets: [
      "เหมาะกับช่วงที่ต้องตัดสินใจเรื่องสำคัญ",
      "เด่นด้านคุมจังหวะและตั้งหลักไม่ให้เสียศูนย์",
    ],
    ctaText: "ดูคำอ่านฉบับเต็ม",
    traitLabelsByType: {
      [ENERGY_TYPES.POWER]: "อำนาจ",
      [ENERGY_TYPES.PROTECT]: "คุ้มกัน",
      [ENERGY_TYPES.BALANCE]: "สมดุล",
      [ENERGY_TYPES.KINDNESS]: "เมตตา",
      [ENERGY_TYPES.ATTRACT]: "ดึงดูด",
      [ENERGY_TYPES.LUCK]: "โชคลาภ",
      [ENERGY_TYPES.BOOST]: "เสริมพลัง",
    },
  },
  conversion_focus: {
    variantKey: "conversion_focus",
    objectLabel: "วัตถุสายตั้งมั่น",
    headline: "พลังของการตั้งหลัก กล้าตัดสินใจ และไม่เสียศูนย์ง่าย",
    scoreLabel: "ระดับพลัง",
    compatibilityLabel: "เข้ากับคุณ",
    mainEnergyTitleByType: {
      [ENERGY_TYPES.POWER]: "พลังหลัก · อำนาจนำ",
      [ENERGY_TYPES.PROTECT]: "พลังหลัก · คุ้มกันนำ",
      [ENERGY_TYPES.BALANCE]: "พลังหลัก · สมดุลนำ",
      [ENERGY_TYPES.KINDNESS]: "พลังหลัก · เมตตานำ",
      [ENERGY_TYPES.ATTRACT]: "พลังหลัก · ดึงดูดนำ",
      [ENERGY_TYPES.LUCK]: "พลังหลัก · โชคนำ",
      [ENERGY_TYPES.BOOST]: "พลังหลัก · เสริมนำ",
    },
    bullets: [
      "ใช้เด่นเมื่ออยู่ในช่วงกดดันหรือมีเรื่องให้เลือกตัดสินใจ",
      "ช่วยเสริมแรงคุมอารมณ์และความมั่นใจในตัวเอง",
    ],
    ctaText: "ดูพลังฉบับเต็ม",
    traitLabelsByType: {
      [ENERGY_TYPES.POWER]: "อำนาจ",
      [ENERGY_TYPES.PROTECT]: "คุ้มกัน",
      [ENERGY_TYPES.BALANCE]: "สมดุล",
      [ENERGY_TYPES.KINDNESS]: "เมตตา",
      [ENERGY_TYPES.ATTRACT]: "ดึงดูด",
      [ENERGY_TYPES.LUCK]: "โชคลาภ",
      [ENERGY_TYPES.BOOST]: "เสริมพลัง",
    },
  },
};

const SUMMARY_CARD_COPY = SUMMARY_CARD_COPY_VARIANTS.premium_minimal;
const SUMMARY_CARD_FAMILY_PATTERNS = {
  protection: {
    objectLabelPatterns: [
      "วัตถุสายคุ้มแรงใจ",
      "วัตถุสายประคองพลัง",
      "วัตถุสายพยุงความนิ่ง",
      "วัตถุสายตั้งหลักใจ",
    ],
    headlinePatterns: [
      "ชิ้นนี้เด่นด้านการประคองใจและรักษาความนิ่งภายใน",
      "พลังของชิ้นนี้คือการช่วยตั้งหลักใจไม่ให้เสียศูนย์ง่าย",
      "เด่นกับช่วงที่ต้องการความนิ่งท่ามกลางแรงกดรอบตัว",
      "ชิ้นนี้ให้พลังคุ้มกันแบบอ่อนลึกและช่วยพยุงใจได้ดี",
    ],
    bulletStyleRules: {
      should_sound_like: [
        "ช่วยประคองความนิ่งเมื่อเจอเรื่องหลายด้านพร้อมกัน",
        "เหมาะกับช่วงที่อยากรักษาใจให้นิ่งขึ้นในชีวิตประจำวัน",
        "เด่นเวลามีแรงกดจากคนรอบตัว งาน หรือความคิดสะสม",
        "ช่วยให้กลับมาอยู่กับตัวเองได้ง่ายขึ้นเมื่อใจเริ่มแกว่ง",
      ],
    },
    forbiddenGenericPhrases: [
      "เหมาะกับคนที่ต้องการความมั่นคง",
      "ช่วยเรื่องความมั่นคง",
      "ดีในหลายด้าน",
      "เสริมพลังโดยรวม",
    ],
  },
  shielding: {
    objectLabelPatterns: [
      "วัตถุสายตั้งมั่น",
      "วัตถุสายกันแรงรบกวน",
      "วัตถุสายรับแรงกด",
      "วัตถุสายคุมขอบเขตพลัง",
    ],
    headlinePatterns: [
      "ชิ้นนี้ให้พลังปกป้องแบบนิ่งและหนักแน่น",
      "เด่นด้านกันแรงปะทะและช่วยให้ใจไม่ไหลตามแรงรอบตัวง่าย",
      "พลังของชิ้นนี้คือการตั้งขอบเขตและยืนให้มั่นกว่าเดิม",
      "เหมาะกับช่วงที่ต้องรับแรงกดและยังต้องคุมตัวเองให้อยู่",
    ],
    bulletStyleRules: {
      should_sound_like: [
        "เด่นในช่วงที่ต้องตัดสินใจท่ามกลางแรงกดหรือสถานการณ์ไม่นิ่ง",
        "เหมาะกับคนที่ไม่อยากให้ใจไหลตามแรงรอบตัวง่ายเกินไป",
        "ช่วยตั้งขอบเขตทางใจเมื่อเจอคนเยอะ เรื่องเยอะ หรือแรงปะทะสะสม",
        "ใช้ดีในช่วงที่ต้องยืนกับการตัดสินใจของตัวเองให้ชัดขึ้น",
      ],
    },
    forbiddenGenericPhrases: [
      "ช่วยให้มั่นคงขึ้น",
      "เด่นเรื่องปกป้อง",
      "ดีต่อการตั้งหลัก",
      "มีพลังคุ้มกัน",
    ],
  },
  authority: {
    objectLabelPatterns: [
      "วัตถุสายอำนาจ",
      "วัตถุสายคุมเกม",
      "วัตถุสายตั้งหลักและอำนาจนำ",
      "วัตถุสายบารมีนิ่ง",
    ],
    headlinePatterns: [
      "ชิ้นนี้เด่นด้านอำนาจและการตั้งหลัก",
      "พลังของชิ้นนี้คือความนิ่งที่ช่วยให้คุมจังหวะได้ดีขึ้น",
      "เด่นกับช่วงที่ต้องตัดสินใจเองและยืนในจังหวะของตัวเอง",
      "ชิ้นนี้ให้แรงคุมเกมแบบนิ่ง ไม่เร่ง แต่ชัด",
    ],
    bulletStyleRules: {
      should_sound_like: [
        "เหมาะกับช่วงที่ต้องคุมอารมณ์และตัดสินใจเรื่องสำคัญ",
        "เด่นเมื่ออยากเดินหน้าอย่างมั่นใจโดยไม่เสียจังหวะตัวเอง",
        "ช่วยหนุนแรงยืนระยะและความชัดในเวลาที่ต้องคุมสถานการณ์",
        "ใช้ดีเมื่อจำเป็นต้องนิ่งกว่าความกดดันรอบตัว",
      ],
    },
    forbiddenGenericPhrases: [
      "เหมาะกับคนที่อยากมั่นใจ",
      "ช่วยเรื่องการงาน",
      "ดีด้านอำนาจ",
      "มีบารมี",
    ],
  },
  attraction: {
    objectLabelPatterns: [
      "วัตถุสายดึงดูด",
      "วัตถุสายเมตตาและแรงเปิด",
      "วัตถุสายคนเอ็นดู",
      "วัตถุสายเสน่ห์นุ่ม",
    ],
    headlinePatterns: [
      "ชิ้นนี้เด่นด้านแรงดึงดูดที่ดูนุ่มแต่มีผลกับคนรอบตัว",
      "พลังของชิ้นนี้คือการเปิดบรรยากาศให้คนเข้าหาง่ายขึ้น",
      "เด่นกับช่วงที่อยากให้ความสัมพันธ์และจังหวะการพบเจอดูไหลลื่นขึ้น",
      "ชิ้นนี้ให้แรงเมตตาและความเป็นมิตรที่ค่อย ๆ เปิดทาง",
    ],
    bulletStyleRules: {
      should_sound_like: [
        "เหมาะกับช่วงที่อยากให้คนรอบตัวรับพลังของคุณได้ง่ายขึ้น",
        "เด่นด้านบรรยากาศ ความเอ็นดู และความรู้สึกเข้าถึงได้",
        "ช่วยให้จังหวะการคุย การพบเจอ หรือความสัมพันธ์ดูไหลลื่นขึ้น",
        "ใช้ดีในช่วงที่อยากเปิดทางเรื่องคนและความรู้สึก",
      ],
    },
    forbiddenGenericPhrases: [
      "ช่วยเรื่องเมตตา",
      "ดีเรื่องเสน่ห์",
      "มีแรงดึงดูด",
      "เหมาะกับคนอยากมีเสน่ห์",
    ],
  },
};

function resolveFamilyPattern(reportPayload, resolvedType) {
  const wf = String(reportPayload?.summary?.wordingFamily || "")
    .trim()
    .toLowerCase();
  const wfAlias = {
    protection: "protection",
    shielding: "shielding",
    authority: "authority",
    attraction: "attraction",
  };
  const explicit = wfAlias[wf] || null;
  if (explicit && SUMMARY_CARD_FAMILY_PATTERNS[explicit]) {
    return SUMMARY_CARD_FAMILY_PATTERNS[explicit];
  }
  const byType = {
    [ENERGY_TYPES.PROTECT]: "protection",
    [ENERGY_TYPES.POWER]: "authority",
    [ENERGY_TYPES.ATTRACT]: "attraction",
    [ENERGY_TYPES.KINDNESS]: "attraction",
  };
  const k = byType[resolvedType] || null;
  return (k && SUMMARY_CARD_FAMILY_PATTERNS[k]) || null;
}

function resolveSummaryCardCopyVariant(reportPayload) {
  const rawWordingFamily = String(reportPayload?.summary?.wordingFamily || "")
    .trim()
    .toLowerCase();
  const rawClarityLevel = String(reportPayload?.summary?.clarityLevel || "")
    .trim()
    .toLowerCase();
  const wordingFamilyAlias = {
    authority: "authority",
    premium: "authority",
    authoritative: "authority",
    thai_mystic: "thai_mystic",
    mystic_th: "thai_mystic",
    thaibelief: "thai_mystic",
    conversion: "conversion",
    conversion_focus: "conversion",
    cta_focus: "conversion",
  };
  const clarityLevelAlias = {
    l2: "l2",
    clear: "l2",
    concise: "l2",
  };
  const wordingFamily =
    wordingFamilyAlias[rawWordingFamily] || rawWordingFamily;
  const clarityLevel = clarityLevelAlias[rawClarityLevel] || rawClarityLevel;
  const strictMap = {
    "authority:l2": "premium_minimal",
    "thai_mystic:l2": "thai_mystic",
    "conversion:l2": "conversion_focus",
  };
  const mapped = strictMap[`${wordingFamily}:${clarityLevel}`];
  return SUMMARY_CARD_COPY_VARIANTS[mapped] || SUMMARY_CARD_COPY;
}

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

function energyNameForPill(mainEnergyLine) {
  let s = String(mainEnergyLine || "").trim();
  if (!s || s === "-") return "";
  const i = s.indexOf("(");
  if (i >= 0) s = s.slice(0, i).trim();
  return s;
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
  const summaryCardCopy = resolveSummaryCardCopyVariant(reportPayload);

  const parsed = parseScanText(rawText);
  const mainEnergy =
    parsed.mainEnergy && parsed.mainEnergy !== "-"
      ? String(parsed.mainEnergy)
      : "";
  const compatibility =
    parsed.compatibility && parsed.compatibility !== "-"
      ? parsed.compatibility
      : "-";

  const score = scoreNormalizedForFlex(reportPayload, parsed.energyScore);

  const altMain =
    String(reportPayload?.summary?.mainEnergyLabel || "").trim() ||
    getEnergyShortLabel(mainEnergy || "พลังทั่วไป");
  const altText = buildScanFlexAltText({
    mainEnergyLabel: altMain,
    scoreDisplay: score.display || String(parsed.energyScore || "").trim(),
  });

  const overviewRaw =
    parsed.overview === "-" ? "" : String(parsed.overview || "");
  const splitOverview = splitSentencesForFlex(overviewRaw).length;
  const resolvedType = resolveEnergyType(
    String(reportPayload?.summary?.mainEnergyLabel || mainEnergy || "").trim(),
  );
  const familyPattern = resolveFamilyPattern(reportPayload, resolvedType);
  const familyPatternUsed = Object.entries(SUMMARY_CARD_FAMILY_PATTERNS).find(
    ([, v]) => v === familyPattern,
  )?.[0] || "none";

  const flexScanTips = resolveFlexScanTips(reportPayload, parsed);

  const copyShapingActive = familyPatternUsed !== "none";
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
      summaryCardCopyVariant: summaryCardCopy.variantKey,
      familyPatternUsed,
      copyShapingActive,
      flexSplitCounts: {
        overview: splitOverview,
        warnThreshold: FLEX_SPLIT_WARN_THRESHOLD,
      },
    }),
  );
  const imgUrl = String(reportPayload?.object?.objectImageUrl || "").trim();
  const heroOk = /^https:\/\//i.test(imgUrl);
  const url = String(reportUrl || "").trim();

  const compatForRow = compatibilityLabelForFlex(reportPayload, compatibility);
  const pctDisplay = compatForRow.includes("%")
    ? compatForRow.replace(/\s+/g, "")
    : `${String(compatForRow).replace(/%/g, "").trim() || "-"}%`;

  const mainPill =
    energyNameForPill(mainEnergy) ||
    String(reportPayload?.summary?.mainEnergyLabel || "").trim() ||
    "พลังหลัก";
  const subPill =
    String(reportPayload?.summary?.secondaryEnergyLabel || "").trim() ||
    (parsed.secondaryEnergy && parsed.secondaryEnergy !== "-"
      ? String(parsed.secondaryEnergy).trim()
      : "พลังสมดุล");

  const dimsPayload =
    reportPayload?.summary?.scanDimensions &&
    typeof reportPayload.summary.scanDimensions === "object"
      ? reportPayload.summary.scanDimensions
      : {};
  const dimensions = { ...parsed.dimensions };
  for (const k of FLEX_DIM_ORDER) {
    const v = dimsPayload[k];
    if (v != null && Number.isFinite(Number(v))) dimensions[k] = Number(v);
  }

  const birthdayLabel =
    String(reportPayload?.summary?.birthdayLabel || "").trim() ||
    (birthdate ? formatScanBirthdayLabelThai(birthdate) : "") ||
    "—";
  const compatReason =
    String(reportPayload?.summary?.compatibilityReason || "").trim() ||
    (parsed.fitReason && parsed.fitReason !== "-"
      ? String(parsed.fitReason).trim()
      : "");

  const tipRows = flexScanTips
    .map((line) => createTipBulletRow(line))
    .filter(Boolean);

  const bodyContents = [
    createScoreRowTwoUp(score.display || "-", pctDisplay),
    createEnergyBadgePills(mainPill, subPill),
    createScanDimensionStarBlock(dimensions),
    createCompatibilityTeaserBlock(birthdayLabel, compatReason),
    ...(tipRows.length > 0
      ? [
          {
            type: "box",
            layout: "vertical",
            spacing: "none",
            margin: "md",
            contents: tipRows,
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
        label: summaryCardCopy.ctaText,
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
      aspectRatio: "1:1",
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
