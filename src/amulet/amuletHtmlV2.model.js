import { deriveAmuletOwnerPowerProfile } from "./amuletOwnerProfile.util.js";
import { POWER_ORDER, POWER_LABEL_THAI } from "./amuletScores.util.js";

/**
 * @param {number} v
 */
function clamp0100(v) {
  if (!Number.isFinite(v)) return 50;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/**
 * @param {Record<string, number>} objectP
 */
function sortPowerKeysByObjectDesc(objectP) {
  return [...POWER_ORDER].sort((a, b) => {
    const db = (Number(objectP[b]) || 0) - (Number(objectP[a]) || 0);
    if (db !== 0) return db;
    return POWER_ORDER.indexOf(a) - POWER_ORDER.indexOf(b);
  });
}

/**
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload} payload
 */
export function buildAmuletHtmlV2ViewModel(payload) {
  const av = payload?.amuletV1;
  if (!av || typeof av !== "object") {
    throw new Error("AMULET_HTML_V2_MISSING_SLICE");
  }
  const fs = av.flexSurface;
  if (!fs || typeof fs !== "object") {
    throw new Error("AMULET_HTML_V2_MISSING_FLEX_SURFACE");
  }

  const seed =
    String(payload.scanId || payload.reportId || "seed").trim() || "seed";
  const ownerProf = deriveAmuletOwnerPowerProfile(payload.birthdateUsed, seed);

  const pc =
    av.powerCategories && typeof av.powerCategories === "object"
      ? av.powerCategories
      : {};

  /** @type {Record<string, number>} */
  const objectP = {};
  for (const k of POWER_ORDER) {
    const e = pc[k];
    const sc =
      e && typeof e === "object" && e.score != null ? Number(e.score) : NaN;
    objectP[k] = clamp0100(sc);
  }

  /** @type {Record<string, number>} */
  const ownerP = {};
  for (const k of POWER_ORDER) {
    ownerP[k] = clamp0100(Number(ownerProf.ownerPower[k]) || 50);
  }

  let alignKey = POWER_ORDER[0];
  let tensionKey = POWER_ORDER[0];
  let minD = Infinity;
  let maxD = -1;
  for (const k of POWER_ORDER) {
    const d = Math.abs(ownerP[k] - objectP[k]);
    if (d < minD) {
      minD = d;
      alignKey = k;
    }
    if (d > maxD) {
      maxD = d;
      tensionKey = k;
    }
  }

  let peakKey = POWER_ORDER[0];
  let peakVal = -1;
  for (const k of POWER_ORDER) {
    const v = objectP[k];
    if (v > peakVal) {
      peakVal = v;
      peakKey = k;
    }
  }

  const ord = sortPowerKeysByObjectDesc(objectP);
  const graphSummary = {
    rows: [
      { label: "พลังเด่น", value: POWER_LABEL_THAI[ord[0]] },
      { label: "รองลงมา", value: POWER_LABEL_THAI[ord[1]] },
      { label: "ควรค่อย ๆ ไป", value: POWER_LABEL_THAI[ord[2]] },
    ],
  };

  const interactionRows = [
    {
      kicker: "ส่งเสริม",
      main: `มิติ${POWER_LABEL_THAI[alignKey]}สอดคล้องกับจังหวะคุณในช่วงนี้`,
      sub: "ใช้เป็นแนวทางปรับจังหวะ ไม่ใช่คำสั่ง",
    },
    {
      kicker: "ระวังจังหวะ",
      main: `มิติ${POWER_LABEL_THAI[tensionKey]}อาจต้องใช้เวลาปรับกรอบ`,
      sub: "แยกความรู้สึกกับแรงกดดันรอบตัวให้ชัด",
    },
    {
      kicker: "โทนวัตถุ",
      main: "เน้นมิติพลังรวมและการตั้งหลัก",
      sub: "อ่านเป็นสัญลักษณ์ ไม่การันตีผลทันที",
    },
  ];

  const hr = av.htmlReport;
  const blurbs =
    hr?.lifeAreaBlurbs && typeof hr.lifeAreaBlurbs === "object"
      ? hr.lifeAreaBlurbs
      : {};

  const lifeRows = POWER_ORDER.map((k) => {
    const e = pc[k];
    const score =
      e && typeof e === "object" && e.score != null
        ? clamp0100(Number(e.score))
        : 0;
    const blurb = String(blurbs[k] || "").trim() || "—";
    return {
      key: k,
      label: POWER_LABEL_THAI[k],
      score,
      blurb,
    };
  });
  lifeRows.sort((a, b) => b.score - a.score);

  const usageLines = Array.isArray(hr?.usageCautionLines)
    ? hr.usageCautionLines.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  return {
    rendererId: "amulet-html-v2",
    hero: {
      subtypeLabel: String(fs.headline || "").trim(),
      tagline: String(fs.tagline || "").trim(),
      mainEnergyLabel: String(fs.mainEnergyShort || "").trim() || "พลังมุ่งเน้นรวม",
      objectImageUrl: String(payload.object?.objectImageUrl || "").trim(),
      reportGeneratedAt: String(payload.generatedAt || ""),
    },
    metrics: {
      energyScore: payload.summary?.energyScore,
      energyLevelLabel: String(payload.summary?.energyLevelLabel || "").trim(),
      compatibilityPercent: payload.summary?.compatibilityPercent,
      compatibilityBand: String(payload.summary?.compatibilityBand || "").trim(),
    },
    power: {
      axes: POWER_ORDER.map((id) => ({ id, labelThai: POWER_LABEL_THAI[id] })),
      owner: ownerP,
      object: objectP,
      objectPeakKey: peakKey,
      objectPeakLabelThai: POWER_LABEL_THAI[peakKey],
      objectSecondKey: ord[1],
      objectSecondLabelThai: POWER_LABEL_THAI[ord[1]],
      alignment: { axisKey: alignKey, labelThai: POWER_LABEL_THAI[alignKey] },
      tension: { axisKey: tensionKey, labelThai: POWER_LABEL_THAI[tensionKey] },
    },
    graphSummary,
    ownerProfile: {
      zodiacLabel: ownerProf.zodiacLabel,
      traitScores: ownerProf.traitScores,
      note: ownerProf.note,
    },
    interactionSummary: {
      headline: "วัตถุทำงานกับคุณอย่างไร",
      rows: interactionRows,
    },
    lifeAreaDetail: { rows: lifeRows },
    usageCaution: { lines: usageLines },
    trustNote: String(payload.trust?.trustNote || "").trim(),
    reportVersion: String(payload.reportVersion || ""),
    modelLabel: payload.trust?.modelLabel
      ? String(payload.trust.modelLabel)
      : "",
  };
}
