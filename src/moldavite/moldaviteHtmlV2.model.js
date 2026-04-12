import { deriveMoldaviteOwnerAxisProfile } from "./moldaviteOwnerProfileFromBirthdate.util.js";
import { deriveMoldaviteEnergyTimingV1 } from "./moldaviteEnergyTimingDerive.util.js";
import {
  energyGradeToLevelGradeClass,
  resolveEnergyLevelDisplayGrade,
} from "../utils/reports/energyLevelGrade.util.js";
import { buildMoldaviteOwnerIdentityCard } from "./moldaviteOwnerIdentityCard.util.js";

/** @typedef {"work"|"relationship"|"money"} AxisKey */

const AXIS_ORDER = /** @type {const} */ ([
  "work",
  "relationship",
  "money",
]);

const AXIS_LABEL_TH = {
  work: "งาน",
  relationship: "ความสัมพันธ์",
  money: "การเงิน",
};

/**
 * คำนำหน้าบรรทัดช่วยใต้หัวเรดาร์ (ใช้คู่กับ compare target ด้านล่าง)
 * — pattern เดียวกันจะใช้กับรายงานประเภทอื่นได้ (พระ / เครื่องราง / วัตถุ)
 */
export const RADAR_SECTION_COMPARE_HELPER_PREFIX = "เปรียบเทียบคุณกับ";

/** Moldavite / หิน·คริสตัล: ค่าเริ่มต้นสำหรับข้อความ “พลังของ…” */
export const DEFAULT_RADAR_COMPARE_TARGET_ENERGY_LABEL_MOLDAVITE =
  "พลังของหิน";

/**
 * @param {string} [compareTargetEnergyLabel] เช่น `พลังของหิน`, `พลังของวัตถุ`, `พลังของพระ`
 * @returns {string}
 */
export function buildRadarSectionCompareHelperLine(compareTargetEnergyLabel) {
  const t =
    String(compareTargetEnergyLabel || "").trim() ||
    DEFAULT_RADAR_COMPARE_TARGET_ENERGY_LABEL_MOLDAVITE;
  return `${RADAR_SECTION_COMPARE_HELPER_PREFIX}${t}`;
}

/** Moldavite HTML V2 only: avoid em dash (U+2014) in visible copy. */
function thaiNoEmDash(s) {
  return String(s || "")
    .replace(/\u2014/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const V2_LIFE_BLURBS = {
  work:
    "ช่วงนี้พลังไปแตะเรื่องงานก่อน เช่น บทบาท เป้าหมาย หรือสิ่งที่ค้างอยู่ ทำให้ต้องคิดใหม่ ปรับใหม่ หรือเริ่มบางอย่างเมื่อพร้อม",
  relationship:
    "พลังไปแตะเรื่องความสัมพันธ์ในมุมของการสื่อสารและความชัดเจน อาจทำให้ต้องคุยตรงขึ้นหรือเคลียร์ขอบเขตให้ชัด",
  money:
    "พลังไปแตะเรื่องการเงินในมุมของการจัดระบบและการตัดสินใจ ช่วยให้เห็นว่าจุดไหนควรปรับก่อน ไม่ใช่คำแนะนำการลงทุน",
};

const V2_USAGE_LINES = [
  "เหมาะเมื่ออยากให้เรื่องที่ค้างเริ่มขยับ หรืออยากเปลี่ยนกรอบเดิมในจังหวะที่พร้อมรับความไม่แน่นอน",
  "ถ้ารู้สึกเข้มหรือเร่งเกินไปในขณะที่ใจยังไม่พร้อมปล่อย ให้ลดจังหวะ แยกความรู้สึกให้ชัด ใช้เป็นกรอบอ่าน ไม่ใช่คำสั่ง",
  "นี่ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน ถ้ามีปัญหาสุขภาพหรือหนี้สินรุนแรง ควรปรึกษาผู้เชี่ยวชาญ",
];

/**
 * Legacy static defaults (pre–deterministic v1). Prefer `deriveMoldaviteEnergyTimingV1`;
 * kept for tests / migration references only.
 * @deprecated Use `moldaviteV1.htmlReport.energyTiming` overrides or derived v1 fields.
 */
export const MOLDAVITE_ENERGY_TIMING_DEFAULTS = {
  bestTimeText:
    "ช่วงที่ต้องการขยับจากจุดเดิม หรือตัดสินใจเริ่มสิ่งใหม่",
  bestDayText:
    "วันที่ต้องการความชัดในการเปลี่ยนแปลง หรือพร้อมเปิดรอบใหม่ให้ชีวิต",
  recommendedModeText:
    "ตั้งจิตหรืออธิษฐานสั้น ๆ ก่อนใช้ เพื่อรวมเจตนาให้ชัด",
  focusAmplifierNote:
    "Moldavite จะตอบกับเจตนาที่ชัดและแรงพร้อมขยับของเจ้าของ การอธิษฐานหรือตั้งจิตก่อนใช้ จะช่วยให้พลังของหินชิ้นนี้ทำงานได้ชัดขึ้น",
};

/**
 * Deterministic Moldavite “จังหวะเสริมพลัง” + optional `htmlReport.energyTiming` overrides.
 * New keys: `recommendedWeekday`, `recommendedTimeBand`, `ritualMode`, `timingReason`.
 * Legacy override keys still supported: `bestDayText`, `bestTimeText`, `recommendedModeText`, `focusAmplifierNote`.
 *
 * @param {object | null | undefined} mv
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload} payload
 * @param {ReturnType<typeof deriveMoldaviteOwnerAxisProfile>} ownerAxes
 * @param {"work"|"relationship"|"money"} [strongestAlignmentAxis] — radar alignment axis (min |owner−หิน|)
 */
function resolveMoldaviteEnergyTiming(mv, payload, ownerAxes, strongestAlignmentAxis) {
  const ownerFit =
    payload?.summary?.compatibilityPercent != null &&
    Number.isFinite(Number(payload.summary.compatibilityPercent))
      ? Number(payload.summary.compatibilityPercent)
      : null;

  const derived = deriveMoldaviteEnergyTimingV1({
    mv,
    ownerAxes,
    ownerFitScore: ownerFit ?? 70,
    strongestAlignmentAxis,
  });

  const raw =
    mv?.htmlReport &&
    typeof mv.htmlReport === "object" &&
    mv.htmlReport.energyTiming &&
    typeof mv.htmlReport.energyTiming === "object"
      ? mv.htmlReport.energyTiming
      : {};

  const str = (x) => String(x ?? "").trim();
  const pick = (newKey, legacyKey) => {
    const a = str(raw[newKey]);
    if (a) return a;
    const b = str(raw[legacyKey]);
    if (b) return b;
    return derived[newKey];
  };

  return {
    recommendedWeekday: pick("recommendedWeekday", "bestDayText"),
    recommendedTimeBand: pick("recommendedTimeBand", "bestTimeText"),
    ritualMode: pick("ritualMode", "recommendedModeText"),
    timingReason: pick("timingReason", "focusAmplifierNote"),
    nativeIdentity: derived.nativeIdentity,
  };
}

/**
 * @param {number} v
 * @returns {number}
 */
function clamp0100(v) {
  if (!Number.isFinite(v)) return 50;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/**
 * เรียงแกนตามคะแนนโทนหิน (สูงสุดก่อน) — เสมอกันใช้ลำดับ work → relationship → money
 * @param {Record<AxisKey, number>} crystal
 * @returns {AxisKey[]}
 */
export function sortAxisKeysByCrystalDesc(crystal) {
  return [...AXIS_ORDER].sort((a, b) => {
    const db = Number(crystal[b]) || 0;
    const da = Number(crystal[a]) || 0;
    if (db !== da) return db - da;
    return AXIS_ORDER.indexOf(a) - AXIS_ORDER.indexOf(b);
  });
}

/**
 * สรุปจากกราฟ (Moldavite V2): โทนเป็นมิตร อ่านง่าย ไม่เหมือนรายงานทางการ
 * @param {Record<AxisKey, number>} crystal
 * @returns {string[]}
 */
export function buildGraphSummaryLinesFromCrystal(crystal) {
  const [first, second, third] = sortAxisKeysByCrystalDesc(crystal);
  return [
    `หินช่วยเรื่อง${AXIS_LABEL_TH[first]}ให้ชัดที่สุดตอนนี้`,
    `รองลงมาเป็น${AXIS_LABEL_TH[second]}`,
    `เรื่อง${AXIS_LABEL_TH[third]}ค่อย ๆ ไปก็พอ ไม่ต้องเร่ง`,
  ];
}

/**
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload} payload
 */
export function buildMoldaviteHtmlV2ViewModel(payload) {
  const mv = payload?.moldaviteV1;
  if (!mv || typeof mv !== "object") {
    throw new Error("MOLDAVITE_HTML_V2_MISSING_SLICE");
  }
  const fs = mv.flexSurface;
  if (!fs || typeof fs !== "object") {
    throw new Error("MOLDAVITE_HTML_V2_MISSING_FLEX_SURFACE");
  }

  const seed =
    String(payload.scanId || payload.reportId || "seed").trim() || "seed";
  const ownerAxes = deriveMoldaviteOwnerAxisProfile(
    payload.birthdateUsed,
    seed,
  );

  const la = mv.lifeAreas && typeof mv.lifeAreas === "object" ? mv.lifeAreas : {};

  /** @type {Record<AxisKey, number>} */
  const crystal = {
    work: 50,
    relationship: 50,
    money: 50,
  };
  for (const k of AXIS_ORDER) {
    const e = la[k];
    const sc =
      e && typeof e === "object" && e.score != null
        ? Number(e.score)
        : NaN;
    crystal[k] = clamp0100(sc);
  }

  /** @type {AxisKey} */
  let alignKey = "work";
  /** @type {AxisKey} */
  let tensionKey = "work";
  let minD = Infinity;
  let maxD = -1;
  for (const k of AXIS_ORDER) {
    const d = Math.abs(ownerAxes[k] - crystal[k]);
    if (d < minD) {
      minD = d;
      alignKey = k;
    }
    if (d > maxD) {
      maxD = d;
      tensionKey = k;
    }
  }

  /** Strongest crystal emphasis (green vertex on radar). “เข้ากับคุณตามสูตร” = separate slate dot at `alignKey` in template when alignKey ≠ peak. */
  /** @type {AxisKey} */
  let crystalPeakKey = "work";
  let crystalPeakVal = -1;
  for (const k of AXIS_ORDER) {
    const v = crystal[k];
    if (v > crystalPeakVal) {
      crystalPeakVal = v;
      crystalPeakKey = k;
    }
  }

  const alignLabel = AXIS_LABEL_TH[alignKey];
  const tensionLabel = AXIS_LABEL_TH[tensionKey];

  const graphSummary = {
    rows: [
      { label: "พลังเด่น", value: AXIS_LABEL_TH[crystalPeakKey] },
      { label: "เข้ากับคุณที่สุด", value: AXIS_LABEL_TH[alignKey] },
      { label: "มุมที่ควรค่อย ๆ ไป", value: AXIS_LABEL_TH[tensionKey] },
    ],
  };

  const interactionHeadline = "หินทำงานกับคุณอย่างไร";
  /** @type {{ kicker: string, main: string, sub: string }[]} */
  const interactionRows = [
    {
      kicker: "เสริมแรง",
      main: `เรื่อง${alignLabel}ขยับง่ายขึ้นในช่วงนี้`,
      sub: "การคุย การตัดสินใจ หรือการทำให้บางเรื่องชัดขึ้น",
    },
    {
      kicker: "ระวังจังหวะ",
      main: `เรื่อง${tensionLabel}อย่าเพิ่งเร่ง`,
      sub: "แยกให้ออกว่าอะไรคือการเปลี่ยนจริง และอะไรคือแรงกดดันชั่วคราว",
    },
    {
      kicker: "โทนหิน",
      main: "เด่นเรื่องการขยับและเริ่มใหม่",
      sub: "ไม่ได้การันตีผลทันที แต่ไม่เหมาะกับการค้างอยู่ที่เดิม",
    },
  ];

  const subtypeShort = String(fs.headline || "มอลดาไวต์").trim() || "มอลดาไวต์";

  /** @type {{ key: AxisKey, label: string, score: number, blurb: string }[]} */
  const lifeAreaRows = AXIS_ORDER.map((k) => {
    const e = la[k];
    const score =
      e && typeof e === "object" && e.score != null
        ? clamp0100(Number(e.score))
        : 0;
    return {
      key: k,
      label: AXIS_LABEL_TH[k],
      score,
      blurb: V2_LIFE_BLURBS[k],
    };
  });
  lifeAreaRows.sort((a, b) => b.score - a.score);

  const usageLines = V2_USAGE_LINES;

  const compareTargetEnergyLabel = DEFAULT_RADAR_COMPARE_TARGET_ENERGY_LABEL_MOLDAVITE;
  const radarSectionContext = {
    compareTargetEnergyLabel,
    compareHelperLine:
      buildRadarSectionCompareHelperLine(compareTargetEnergyLabel),
  };

  return {
    rendererId: "moldavite-html-v2",
    hero: {
      subtypeLabel: String(fs.headline || "").trim(),
      tagline: String(fs.tagline || "").trim(),
      mainEnergyLabel: String(fs.mainEnergyShort || "").trim() || "เร่งการเปลี่ยนแปลง",
      objectImageUrl: String(payload.object?.objectImageUrl || "").trim(),
      reportGeneratedAt: String(payload.generatedAt || ""),
    },
    metrics: (() => {
      const g = resolveEnergyLevelDisplayGrade(
        payload.summary?.energyLevelLabel,
        payload.summary?.energyScore,
      );
      return {
        energyScore: payload.summary?.energyScore,
        energyLevelLabel: g,
        energyLevelGradeClass: g ? energyGradeToLevelGradeClass(g) : "level-grade--none",
        compatibilityPercent: payload.summary?.compatibilityPercent,
        compatibilityBand: String(payload.summary?.compatibilityBand || "").trim(),
      };
    })(),
    graph: {
      axes: AXIS_ORDER.map((id) => ({
        id,
        labelThai: AXIS_LABEL_TH[id],
      })),
      owner: ownerAxes,
      crystal,
      crystalPeakAxisKey: crystalPeakKey,
      crystalPeakLabelThai: AXIS_LABEL_TH[crystalPeakKey],
      alignment: { axisKey: alignKey, labelThai: alignLabel },
      tension: { axisKey: tensionKey, labelThai: tensionLabel },
    },
    graphSummary,
    radarSectionContext,
    ownerProfile: (() => {
      const identity = buildMoldaviteOwnerIdentityCard({
        traitScores: ownerAxes.traitScores,
        zodiacShortLabel: ownerAxes.zodiacLabel,
        seed: `${seed}|${String(payload.reportId || payload.scanId || "").trim()}`,
      });
      return {
        zodiacLabel: `คุณเกิดราศี${ownerAxes.zodiacLabel}`,
        traitScores: ownerAxes.traitScores,
        note: ownerAxes.note,
        identityChips: identity.chips,
        identitySummary: identity.summary,
        identitySummarySecond: identity.summarySecond,
        zodiacGlyphSvg: identity.glyphSvg,
      };
    })(),
    interactionSummary: {
      headline: interactionHeadline,
      rows: interactionRows,
    },
    lifeAreaDetail: { rows: lifeAreaRows },
    energyTiming: resolveMoldaviteEnergyTiming(mv, payload, ownerAxes, alignKey),
    usageCaution: { lines: usageLines },
    trustNote: String(payload.trust?.trustNote || "").trim(),
    reportVersion: String(payload.reportVersion || ""),
    modelLabel: payload.trust?.modelLabel
      ? String(payload.trust.modelLabel)
      : "",
  };
}
