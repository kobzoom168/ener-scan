import { deriveMoldaviteOwnerAxisProfile } from "./moldaviteOwnerProfileFromBirthdate.util.js";

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

  /** Strongest crystal emphasis (single vertex highlight on radar). */
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

  const crystalOrder = sortAxisKeysByCrystalDesc(crystal);
  const graphSummary = {
    rows: [
      { label: "พลังเด่น", value: AXIS_LABEL_TH[crystalOrder[0]] },
      { label: "รองลงมา", value: AXIS_LABEL_TH[crystalOrder[1]] },
      { label: "ควรค่อย ๆ ไป", value: AXIS_LABEL_TH[crystalOrder[2]] },
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
  const meaningParagraphs = [
    `${subtypeShort} เป็นหินที่มักถูกอ่านว่าเด่นเรื่องการเปลี่ยนแปลง`,
    "พลังของหินนี้มักไปแตะเรื่องที่ค้างอยู่ ให้เริ่มขยับหรือเริ่มใหม่ได้ง่ายขึ้นเมื่อเจ้าของพร้อม",
    "มันไม่ได้การันตีผลลัพธ์ แต่ช่วยให้เห็นว่าช่วงนี้ชีวิตอาจต้องขยับมากกว่านิ่งอยู่กับที่",
  ];

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
    metrics: {
      energyScore: payload.summary?.energyScore,
      energyLevelLabel: String(payload.summary?.energyLevelLabel || "").trim(),
      compatibilityPercent: payload.summary?.compatibilityPercent,
      compatibilityBand: String(payload.summary?.compatibilityBand || "").trim(),
    },
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
    ownerProfile: {
      zodiacLabel: `คุณเกิดราศี${ownerAxes.zodiacLabel}`,
      traitScores: ownerAxes.traitScores,
      note: ownerAxes.note,
    },
    interactionSummary: {
      headline: interactionHeadline,
      rows: interactionRows,
    },
    meaningParagraphs,
    lifeAreaDetail: { rows: lifeAreaRows },
    usageCaution: { lines: usageLines },
    trustNote: String(payload.trust?.trustNote || "").trim(),
    reportVersion: String(payload.reportVersion || ""),
    modelLabel: payload.trust?.modelLabel
      ? String(payload.trust.modelLabel)
      : "",
  };
}
