import { deriveAmuletOwnerPowerProfile } from "./amuletOwnerProfile.util.js";
import { POWER_ORDER, POWER_LABEL_THAI } from "./amuletScores.util.js";

/** Short labels for hero/clarifier (match radar alias tone; human-facing). */
const PEAK_SHORT_THAI = {
  protection: "คุ้มครอง",
  metta: "เมตตา",
  baramee: "บารมี",
  luck: "โชคลาภ",
  fortune_anchor: "หนุนดวง",
  specialty: "งานเฉพาะ",
};

/**
 * True when hero โทนหลัก text matches the graph’s highest-scoring axis (no extra clarifier).
 * @param {string} mainShort
 * @param {string} peakKey
 */
function mainToneMatchesGraphPeak(mainShort, peakKey) {
  const m = String(mainShort || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!m) return true;
  const short = PEAK_SHORT_THAI[/** @type {keyof typeof PEAK_SHORT_THAI} */ (peakKey)];
  const full = POWER_LABEL_THAI[/** @type {keyof typeof POWER_LABEL_THAI} */ (peakKey)];
  if (short && (m.includes(short) || short.includes(m.slice(0, Math.min(m.length, 4))))) {
    return true;
  }
  if (full && (m.includes(full.slice(0, 4)) || full.includes(m))) {
    return true;
  }
  return false;
}

/** Default life-area blurbs when payload omits `htmlReport.lifeAreaBlurbs` (one tight line each). */
const AMULET_DEFAULT_LIFE_BLURBS = {
  protection: "กันแรงปะทะ ตั้งขอบเขต พยุงตัวเวลาเรื่องหนัก",
  metta: "คนรอบตัวเปิดใจ คุยง่าย รับพลังคุณได้มากขึ้น",
  baramee: "ภาพลักษณ์ ความน่าเชื่อถือ แรงนำในบทบาทที่รับอยู่",
  luck: "โอกาสใหม่ จังหวะใหม่ ทางเลือกเริ่มเปิด",
  fortune_anchor: "ประคองใจ ตั้งหลัก ไม่ไหลตามสถานการณ์ง่าย",
  specialty: "งานใช้ฝีมือ ถนัด หรือบทบาทเฉพาะตัว",
};

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
      { label: "ด้านที่โค้งสูงสุด", value: POWER_LABEL_THAI[ord[0]] },
      { label: "ด้านรองลงมา", value: POWER_LABEL_THAI[ord[1]] },
    ],
  };

  const alignLabel = POWER_LABEL_THAI[alignKey];
  const tensionLabel = POWER_LABEL_THAI[tensionKey];
  const peakLabel = POWER_LABEL_THAI[peakKey];
  const peakShort = PEAK_SHORT_THAI[peakKey] || peakLabel;

  const alignMain =
    minD <= 12
      ? `${alignLabel} ส่งเสริมคุณได้ชัดที่สุดในตอนนี้`
      : `${alignLabel} เริ่มเข้ากับคุณได้เร็ว — ลองใช้เป็นจุดเริ่ม`;

  const tensionMain =
    maxD >= 28
      ? `${tensionLabel} ยังไม่ส่งกับจังหวะคุณ — อย่าเร่งด้านนี้`
      : `${tensionLabel} ต้องปรับจังหวะ — อย่าบังคับใช้หนัก`;

  const interactionRows = [
    {
      kicker: "จุดเข้าคู่",
      main: alignMain,
      sub: "มุมที่คุณกับวัตถุใกล้เคียงกันที่สุด",
    },
    {
      kicker: "จุดตึง",
      main: tensionMain,
      sub: "มุมที่ยังห่างกัน — ใช้แบบค่อยเป็นค่อยไป",
    },
    {
      kicker: "พลังของชิ้นนี้",
      main: `เน้นด้าน${peakShort} มากที่สุด`,
      sub: "ตรงกับด้านที่เห็นโค้งสูงสุดในกราฟ",
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
    const rawBlurb =
      String(blurbs[k] || "").trim() ||
      AMULET_DEFAULT_LIFE_BLURBS[k] ||
      "พลังด้านนี้ยังไม่เด่นชัด";
    const blurb = rawBlurb.replace(/\s+/g, " ").trim().slice(0, 96);
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
  const usageDisclaimer =
    usageLines.length > 0
      ? usageLines.join(" ").replace(/\s+/g, " ").trim().slice(0, 320)
      : "ผลลัพธ์ขึ้นกับบริบทการใช้งานของคุณ ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน";

  const mainShort =
    String(fs.mainEnergyShort || "").trim() || "พลังมุ่งเน้นรวม";
  const clarifierLine = mainToneMatchesGraphPeak(mainShort, ord[0])
    ? ""
    : `กราฟด้านบนชี้ว่าเด่นที่ ${peakShort} ชัดที่สุด`;

  return {
    rendererId: "amulet-html-v2",
    hero: {
      subtypeLabel: String(fs.headline || "").trim(),
      tagline: String(fs.tagline || "").trim(),
      mainEnergyLabel: mainShort,
      /** Full hero line (frozen: โทนหลัก). */
      displayLine: `โทนหลัก · ${mainShort}`,
      /** Second line when โทนหลัก ไม่ตรงแกนสูงสุดบนกราฟ */
      clarifierLine,
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
      miniCards: [
        {
          title: "จังหวะเจ้าของ",
          text: ownerProf.zodiacLabel,
        },
        {
          title: "มุมที่เข้ากับคุณมากที่สุด",
          text: `${alignLabel} ใกล้เคียงกับคุณที่สุด`,
        },
      ],
    },
    interactionSummary: {
      headline: "วัตถุกับคุณ: สรุปสั้น ๆ",
      rows: interactionRows,
    },
    lifeAreaDetail: { rows: lifeRows },
    usageCaution: { disclaimer: usageDisclaimer },
    trustNote: String(payload.trust?.trustNote || "").trim(),
    reportVersion: String(payload.reportVersion || ""),
    modelLabel: payload.trust?.modelLabel
      ? String(payload.trust.modelLabel)
      : "",
  };
}
