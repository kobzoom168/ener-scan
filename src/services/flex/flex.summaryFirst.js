/**
 * Summary-first LINE Flex — single bubble handoff card.
 * HTML report stays primary artifact; Flex is teaser only.
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
import { ENERGY_TYPES } from "./scanCopy.config.js";
import { resolveEnergyType } from "./scanCopy.utils.js";
import { createTopAccent } from "./flex.components.js";

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

const GENERIC_BULLET_PHRASES = new Set([
  "ช่วยเรื่องความมั่นคง",
  "เหมาะกับคนที่ต้องการความมั่นคง",
  "ดีในหลายด้าน",
  "เสริมพลังโดยรวม",
]);

function stablePick(list, seed = "") {
  const arr = Array.isArray(list) ? list.filter(Boolean) : [];
  if (!arr.length) return "";
  const s = String(seed || "summary-flex");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length] || arr[0];
}

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

function isOverlyGenericBullet(text, familyPattern) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (GENERIC_BULLET_PHRASES.has(t)) return true;
  const forbidden = familyPattern?.forbiddenGenericPhrases || [];
  return forbidden.some((x) => t.includes(String(x || "").trim()));
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
 * @param {string} fallbackHeadline
 */
function flexHeadlineFromPayload(reportPayload, fallbackHeadline, familyPattern) {
  const mp = String(reportPayload?.sections?.messagePoints?.[0] || "").trim();
  if (mp) return safeWrapText(mp, 64);
  const d = distillSummaryLine(reportPayload?.summary?.summaryLine || "");
  if (d) return safeWrapText(d, 64);
  if (familyPattern?.headlinePatterns?.length) {
    const seed = String(reportPayload?.reportId || reportPayload?.scanId || "headline");
    const picked = stablePick(familyPattern.headlinePatterns, seed);
    if (picked) return safeWrapText(picked, 64);
  }
  return fallbackHeadline;
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

function tightenTeaserCopy(text, maxChars = 48) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
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
      .map((x) => safeWrapText(tightenTeaserCopy(String(x).trim(), 48), 56))
      .filter(Boolean);
  }
  const m = reportPayload?.sections?.messagePoints;
  if (Array.isArray(m) && m.length >= 2) {
    return m
      .slice(1, 3)
      .map((x) => safeWrapText(tightenTeaserCopy(String(x).trim(), 48), 56))
      .filter(Boolean);
  }
  return [];
}

function createCompactMetricStrip({
  accentColor,
  scoreDisplay,
  compatLabel,
  scoreLabel,
  compatibilityLabel,
}) {
  const levelValue = `${String(scoreDisplay || "-").trim() || "-"} / 10`;
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    margin: "sm",
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        paddingAll: "13px",
        backgroundColor: "#18181A",
        cornerRadius: "12px",
        borderWidth: "1px",
        borderColor: "#2A2A2D",
        contents: [
          {
            type: "text",
            text: scoreLabel,
            size: "xs",
            color: "#94949A",
          },
          {
            type: "text",
            text: levelValue || "-",
            size: "md",
            weight: "bold",
            color: accentColor,
            wrap: true,
            maxLines: 1,
            margin: "sm",
          },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        paddingAll: "13px",
        backgroundColor: "#18181A",
        cornerRadius: "12px",
        borderWidth: "1px",
        borderColor: "#2A2A2D",
        contents: [
          {
            type: "text",
            text: compatibilityLabel,
            size: "xs",
            color: "#94949A",
          },
          {
            type: "text",
            text: compatLabel || "-",
            size: "md",
            weight: "bold",
            color: "#E8E8EC",
            wrap: true,
            maxLines: 1,
            margin: "sm",
          },
        ],
      },
    ],
  };
}

const FAMILY_LABEL = {
  [ENERGY_TYPES.PROTECT]: SUMMARY_CARD_COPY.traitLabelsByType[ENERGY_TYPES.PROTECT],
  [ENERGY_TYPES.BALANCE]: SUMMARY_CARD_COPY.traitLabelsByType[ENERGY_TYPES.BALANCE],
  [ENERGY_TYPES.POWER]: SUMMARY_CARD_COPY.traitLabelsByType[ENERGY_TYPES.POWER],
  [ENERGY_TYPES.KINDNESS]: SUMMARY_CARD_COPY.traitLabelsByType[ENERGY_TYPES.KINDNESS],
  [ENERGY_TYPES.ATTRACT]: SUMMARY_CARD_COPY.traitLabelsByType[ENERGY_TYPES.ATTRACT],
  [ENERGY_TYPES.LUCK]: SUMMARY_CARD_COPY.traitLabelsByType[ENERGY_TYPES.LUCK],
  [ENERGY_TYPES.BOOST]: SUMMARY_CARD_COPY.traitLabelsByType[ENERGY_TYPES.BOOST],
};

const FAMILY_POOL = [
  ENERGY_TYPES.PROTECT,
  ENERGY_TYPES.BALANCE,
  ENERGY_TYPES.POWER,
  ENERGY_TYPES.KINDNESS,
  ENERGY_TYPES.ATTRACT,
  ENERGY_TYPES.LUCK,
  ENERGY_TYPES.BOOST,
];

function stars(n) {
  const filled = Math.max(1, Math.min(5, Math.round(Number(n) || 0)));
  return {
    filled,
    empty: 5 - filled,
    filledText: "★".repeat(filled),
    emptyText: "☆".repeat(5 - filled),
  };
}

/**
 * Deterministic prominence mapping from main energy family.
 * Main family is always highest or tied-highest.
 * @param {string} resolvedType
 */
function buildAspectProminence(resolvedType) {
  /** @type {Record<string, number>} */
  const score = Object.fromEntries(FAMILY_POOL.map((k) => [k, 2]));
  const main = FAMILY_POOL.includes(resolvedType)
    ? resolvedType
    : ENERGY_TYPES.BOOST;
  score[main] = 5;
  const nearBy = {
    [ENERGY_TYPES.PROTECT]: [ENERGY_TYPES.BALANCE, ENERGY_TYPES.BOOST],
    [ENERGY_TYPES.BALANCE]: [ENERGY_TYPES.BOOST, ENERGY_TYPES.KINDNESS],
    [ENERGY_TYPES.POWER]: [ENERGY_TYPES.PROTECT, ENERGY_TYPES.ATTRACT],
    [ENERGY_TYPES.KINDNESS]: [ENERGY_TYPES.BALANCE, ENERGY_TYPES.ATTRACT],
    [ENERGY_TYPES.ATTRACT]: [ENERGY_TYPES.KINDNESS, ENERGY_TYPES.POWER],
    [ENERGY_TYPES.LUCK]: [ENERGY_TYPES.BOOST, ENERGY_TYPES.ATTRACT],
    [ENERGY_TYPES.BOOST]: [ENERGY_TYPES.BALANCE, ENERGY_TYPES.LUCK],
  };
  for (const k of nearBy[main] || []) {
    score[k] = Math.max(score[k], 4);
  }
  const aspects = [main, ...FAMILY_POOL.filter((k) => k !== main)].slice(0, 5);
  return aspects.map((family) => ({
    family,
    label: FAMILY_LABEL[family] || family,
    stars: score[family],
  }));
}

function createAspectStarsBlock(resolvedType) {
  const rows = buildAspectProminence(resolvedType);
  return {
    type: "box",
    layout: "vertical",
    margin: "sm",
    spacing: "none",
    contents: [
      {
        type: "text",
        text: "ระดับเด่นของชิ้นนี้",
        size: "xs",
        color: "#94949A",
      },
      ...rows.map((r) =>
        (function buildRow() {
          const s = stars(r.stars);
          /** @type {Array<Record<string, unknown>>} */
          const starContents = [];
          if (s.filledText) {
            starContents.push({
              type: "text",
              text: s.filledText,
              size: "xs",
              color: "#D4AF37",
              align: "end",
              flex: 0,
            });
          }
          if (s.emptyText) {
            starContents.push({
              type: "text",
              text: s.emptyText,
              size: "xs",
              color: "#5E5E65",
              align: "end",
              flex: 0,
            });
          }
          return {
            type: "box",
            layout: "horizontal",
            margin: "xs",
            contents: [
              {
                type: "text",
                text: r.label,
                size: "xs",
                color: "#B8B8BE",
                flex: 3,
                maxLines: 1,
              },
              {
                type: "box",
                layout: "horizontal",
                justifyContent: "flex-end",
                flex: 4,
                spacing: "none",
                contents: starContents,
              },
            ],
          };
        })(),
      ),
    ],
  };
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
      flexPresentationMode: "single_page_handoff",
      scanCopyConfigVersion: SCAN_COPY_CONFIG_VERSION,
      altText,
      hasReportPayload: Boolean(reportPayload),
      hasReportUrl: Boolean(String(reportUrl || "").trim()),
      appendReportBubbleLegacyIgnored: Boolean(options.appendReportBubble),
      summaryCardCopyVariant: summaryCardCopy.variantKey,
      flexSplitCounts: {
        overview: splitOverview,
        warnThreshold: FLEX_SPLIT_WARN_THRESHOLD,
      },
    }),
  );

  const compatLabel = compatibilityLabelForFlex(reportPayload, compatibility);
  const mainLabel =
    String(reportPayload?.summary?.mainEnergyLabel || "").trim() ||
    scanCopy?.summary?.mainEnergyLabel ||
    wrapFlexTextNoTruncate(getEnergyShortLabel(mainEnergy || "พลังทั่วไป"), 32);
  const resolvedType = resolveEnergyType(
    String(reportPayload?.summary?.mainEnergyLabel || mainEnergy || "").trim(),
  );
  const familyPattern = resolveFamilyPattern(reportPayload, resolvedType);
  const headline = flexHeadlineFromPayload(
    reportPayload,
    summaryCardCopy.headline,
    familyPattern,
  );
  let bullets = flexTeaserBullets(reportPayload);
  if (bullets.length === 0) {
    if (familyPattern?.bulletStyleRules?.should_sound_like?.length) {
      const seedBase = String(reportPayload?.reportId || reportPayload?.scanId || "bullet");
      const b1 = stablePick(familyPattern.bulletStyleRules.should_sound_like, `${seedBase}:1`);
      const b2 = stablePick(familyPattern.bulletStyleRules.should_sound_like, `${seedBase}:2`);
      bullets = [b1, b2].filter(Boolean).slice(0, 2);
    }
    if (bullets.length < 2) bullets = [...summaryCardCopy.bullets];
  } else if (bullets.length === 1) {
    const fallbackB2 = familyPattern?.bulletStyleRules?.should_sound_like?.length
      ? stablePick(
          familyPattern.bulletStyleRules.should_sound_like,
          String(reportPayload?.reportId || reportPayload?.scanId || "bullet:single"),
        )
      : summaryCardCopy.bullets[1];
    bullets = [bullets[0], safeWrapText(fallbackB2 || summaryCardCopy.bullets[1], 72)];
  }
  bullets = bullets.map((b, idx) => {
    if (!isOverlyGenericBullet(b, familyPattern)) return b;
    const familyFallback = familyPattern?.bulletStyleRules?.should_sound_like?.length
      ? stablePick(
          familyPattern.bulletStyleRules.should_sound_like,
          `${String(reportPayload?.reportId || reportPayload?.scanId || "bullet")}:${idx}`,
        )
      : "";
    return safeWrapText(
      familyFallback || summaryCardCopy.bullets[idx] || summaryCardCopy.bullets[0],
      72,
    );
  });
  bullets = bullets.slice(0, 2);
  const objectLbl =
    String(reportPayload?.object?.objectLabel || "").trim() ||
    stablePick(
      familyPattern?.objectLabelPatterns || [summaryCardCopy.objectLabel],
      String(reportPayload?.reportId || reportPayload?.scanId || "obj"),
    ) ||
    summaryCardCopy.objectLabel;
  const imgUrl = String(reportPayload?.object?.objectImageUrl || "").trim();
  const heroOk = /^https:\/\//i.test(imgUrl);
  const url = String(reportUrl || "").trim();

  const bodyContents = [
    createTopAccent(accentColor),
    {
      type: "text",
      text: objectLbl,
      size: "xs",
      color: "#94949A",
      wrap: true,
      maxLines: 1,
      margin: "sm",
    },
    {
      type: "text",
      text: headline,
      weight: "bold",
      size: "md",
      color: "#E8E8EC",
      wrap: true,
      maxLines: 2,
      margin: "xs",
    },
    createCompactMetricStrip({
      accentColor,
      scoreDisplay: score.display || "-",
      compatLabel,
      scoreLabel: summaryCardCopy.scoreLabel,
      compatibilityLabel: summaryCardCopy.compatibilityLabel,
    }),
    {
      type: "text",
      text:
        summaryCardCopy.mainEnergyTitleByType[resolvedType] ||
        `พลังหลัก · ${safeWrapText(mainLabel, 28)}`,
      size: "sm",
      weight: "bold",
      color: "#D0D0D6",
      wrap: true,
      maxLines: 2,
      margin: "sm",
    },
    createAspectStarsBlock(resolvedType),
    {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "md",
      contents: bullets.slice(0, 2).map((b) => ({
        type: "text",
        text: `• ${b}`,
        size: "xs",
        color: "#B8B8BE",
        wrap: true,
        maxLines: 2,
      })),
    },
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
  const bubble = {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      backgroundColor: "#101010",
      contents: bodyContents,
    },
    styles: { body: { backgroundColor: "#101010" } },
  };
  if (heroOk) {
    bubble.hero = {
      type: "image",
      url: imgUrl,
      size: "full",
      aspectRatio: "1:1",
      aspectMode: "cover",
      backgroundColor: "#0B0B0D",
    };
  }
  if (url) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      backgroundColor: "#101010",
      paddingTop: "8px",
      paddingBottom: "18px",
      paddingStart: "20px",
      paddingEnd: "20px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: accentColor,
          height: "sm",
          action: { type: "uri", label: summaryCardCopy.ctaText, uri: url },
        },
      ],
    };
    bubble.styles.footer = { backgroundColor: "#101010" };
  }

  return {
    type: "flex",
    altText,
    contents: bubble,
  };
}
