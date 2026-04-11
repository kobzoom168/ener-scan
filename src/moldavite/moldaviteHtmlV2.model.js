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

/** One short line per axis (mobile). */
const V2_LIFE_BLURBS = {
  work: "บทบาท เป้าหมาย งานที่ค้าง",
  relationship: "สื่อสาร ขอบเขต ความชัด",
  money: "จัดระบบเงิน ตัดสินใจช้า ๆ",
};

const V2_USAGE_LINES = [
  "กรอบอ่าน ไม่ใช่คำสั่ง",
  "ไม่แทนคำแนะนำการแพทย์หรือการเงิน",
];

const OWNER_NOTE_SHORT_WITH_DOB = "เทียบจากวันเกิด ↔ กราฟ";
const OWNER_NOTE_SHORT_NO_DOB = "โปรไฟล์จำลองจากรายงาน";

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
  const [first, second] = sortAxisKeysByCrystalDesc(crystal);
  return [
    `เด่น: ${AXIS_LABEL_TH[first]}`,
    `รอง: ${AXIS_LABEL_TH[second]}`,
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
    ],
  };

  const interactionHeadline = "โทนกับคุณ";

  /** ใกล้กันบนแกน align → เสริมแรงสูง */
  const alignGap = Math.abs(
    (Number(ownerAxes[alignKey]) || 0) - (Number(crystal[alignKey]) || 0),
  );
  const boostScore = clamp0100(100 - alignGap);

  /** ช่องว่างบนแกน tension → ต้องระวังจังหวะมากขึ้น */
  const tensionGap = Math.abs(
    (Number(ownerAxes[tensionKey]) || 0) - (Number(crystal[tensionKey]) || 0),
  );
  const cautionScore = clamp0100(tensionGap);

  const energyNum = Number(payload.summary?.energyScore);
  const toneScore = Number.isFinite(energyNum)
    ? clamp0100(energyNum * 10)
    : clamp0100(
        (crystal.work + crystal.relationship + crystal.money) / 3,
      );

  /** @type {{ kicker: string, main: string, sub: string }[]} */
  const interactionRows = [
    {
      kicker: "เสริมแรง",
      main: `${alignLabel} · ขยับง่ายขึ้น`,
      sub: "",
    },
    {
      kicker: "ระวังจังหวะ",
      main: `${tensionLabel} · อย่าเร่ง`,
      sub: "",
    },
    {
      kicker: "โทนหิน",
      main: "เน้นขยับ เริ่มใหม่",
      sub: "",
    },
  ];

  /** @type {{ key: string, label: string, score: number, main: string, sub: string }[]} */
  const interactionGauges = [
    {
      key: "boost",
      label: "เสริมแรง",
      score: boostScore,
      main: interactionRows[0].main,
      sub: interactionRows[0].sub,
    },
    {
      key: "caution",
      label: "ระวังจังหวะ",
      score: cautionScore,
      main: interactionRows[1].main,
      sub: interactionRows[1].sub,
    },
    {
      key: "tone",
      label: "โทนหิน",
      score: toneScore,
      main: interactionRows[2].main,
      sub: interactionRows[2].sub,
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
    const blurb = thaiNoEmDash(V2_LIFE_BLURBS[k]).slice(0, 56);
    return {
      key: k,
      label: AXIS_LABEL_TH[k],
      score,
      blurb,
    };
  });
  lifeAreaRows.sort((a, b) => b.score - a.score);

  /** ชุดเดียวกับ lifeAreaDetail.rows (เรียงสูง→ต่ำ) — ใช้ render แถบแนวนอน */
  const lifeAreaBars = lifeAreaRows.map((r) => ({
    key: r.key,
    label: r.label,
    score: r.score,
    blurb: r.blurb,
  }));

  const usageLines = V2_USAGE_LINES;

  const dobPresent = Boolean(
    String(payload.birthdateUsed || "").trim().match(/\d/),
  );
  const ownerNoteShort = dobPresent
    ? OWNER_NOTE_SHORT_WITH_DOB
    : OWNER_NOTE_SHORT_NO_DOB;

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
    primaryAxis: crystalOrder[0],
    secondaryAxis: crystalOrder[1],
    radarSectionContext,
    ownerProfile: {
      zodiacLabel: `ราศี${ownerAxes.zodiacLabel}`,
      traitScores: ownerAxes.traitScores,
      note: ownerNoteShort,
    },
    interactionSummary: {
      headline: interactionHeadline,
      rows: interactionRows,
    },
    interactionGauges,
    lifeAreaDetail: { rows: lifeAreaRows },
    lifeAreaBars,
    usageCaution: { lines: usageLines },
    trustNote: String(payload.trust?.trustNote || "").trim(),
    reportVersion: String(payload.reportVersion || ""),
    modelLabel: payload.trust?.modelLabel
      ? String(payload.trust.modelLabel)
      : "",
  };
}
