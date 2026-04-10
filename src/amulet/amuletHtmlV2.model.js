import { deriveAmuletOwnerPowerProfile } from "./amuletOwnerProfile.util.js";
import {
  POWER_ORDER,
  POWER_LABEL_THAI,
  AMULET_PEAK_SHORT_THAI,
} from "./amuletScores.util.js";
import { buildAxisLifeBlurb } from "./amuletMeaningBlurbs.util.js";

/** Sacred_amulet full-report disclaimer (ข้อจำกัด) — concise, owner- and birthdate-aware. */
export const AMULET_HTML_V2_USAGE_DISCLAIMER =
  "พระหรือเครื่องรางจะเด่นด้านไหน ไม่ได้ขึ้นอยู่กับวัตถุอย่างเดียว แต่ขึ้นอยู่กับวันเดือนปีเกิด พื้นฐานดวง และการปฏิบัติตัวของเจ้าของด้วย แต่ละคนจึงมีประสบการณ์ต่างกัน — Ener Scan";

/**
 * True when hero โทนหลัก text matches the dominant score axis (no extra clarifier).
 * @param {string} mainShort
 * @param {string} peakKey
 */
function mainToneMatchesGraphPeak(mainShort, peakKey) {
  const m = String(mainShort || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!m) return true;
  const short =
    AMULET_PEAK_SHORT_THAI[/** @type {keyof typeof AMULET_PEAK_SHORT_THAI} */ (peakKey)];
  const full = POWER_LABEL_THAI[/** @type {keyof typeof POWER_LABEL_THAI} */ (peakKey)];
  if (short && (m.includes(short) || short.includes(m.slice(0, Math.min(m.length, 4))))) {
    return true;
  }
  if (full && (m.includes(full.slice(0, 4)) || full.includes(m))) {
    return true;
  }
  return false;
}

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
 * เข้ากัน: เลือกระหว่าง top1/top2 เท่านั้น · ให้สอดคล้องกับพลังเด่นบนวัตถุ
 * @param {Record<string, number>} ownerP
 * @param {Record<string, number>} objectP
 * @param {string[]} ord
 */
function pickAlignKeyAmongTopTwo(ownerP, objectP, ord) {
  const a = ord[0];
  const b = ord[1];
  const da = Math.abs(ownerP[a] - objectP[a]);
  const db = Math.abs(ownerP[b] - objectP[b]);
  return da <= db ? a : b;
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

  const ord = sortPowerKeysByObjectDesc(objectP);
  const alignKey = pickAlignKeyAmongTopTwo(ownerP, objectP, ord);

  let tensionKey = POWER_ORDER[0];
  let maxD = -1;
  for (const k of POWER_ORDER) {
    const d = Math.abs(ownerP[k] - objectP[k]);
    if (d > maxD) {
      maxD = d;
      tensionKey = k;
    }
  }
  const minD = Math.abs(ownerP[alignKey] - objectP[alignKey]);

  const gapTop12 = objectP[ord[0]] - objectP[ord[1]];
  const topLabel = POWER_LABEL_THAI[ord[0]];
  const secondLabel = POWER_LABEL_THAI[ord[1]];
  const graphSummary = {
    rows: [
      {
        label: "พลังเด่น",
        value:
          gapTop12 <= 4
            ? `${topLabel} · สูสีรอง`
            : topLabel,
      },
      {
        label: "รองลงมา",
        value: secondLabel,
      },
    ],
  };

  const alignLabel = POWER_LABEL_THAI[alignKey];
  const tensionLabel = POWER_LABEL_THAI[tensionKey];
  const peakKey = ord[0];
  const peakShort =
    AMULET_PEAK_SHORT_THAI[peakKey] || POWER_LABEL_THAI[peakKey];
  const s0 = AMULET_PEAK_SHORT_THAI[ord[0]] || POWER_LABEL_THAI[ord[0]];
  const s1 = AMULET_PEAK_SHORT_THAI[ord[1]] || POWER_LABEL_THAI[ord[1]];

  const alignMain =
    minD <= 14
      ? `${alignLabel} เข้ากับคุณชัด · ใช้ได้ดี`
      : `${alignLabel} เริ่มส่งกับคุณ · ใช้ได้ดี`;

  const tensionMain =
    maxD >= 26
      ? `${tensionLabel} ยังไม่ส่งกับจังหวะคุณ · อย่าเร่ง`
      : `${tensionLabel} ยังไม่ส่งกัน · อย่าเร่ง`;

  const interactionRows = [
    {
      kicker: "เข้ากัน",
      main: alignMain,
      sub:
        alignKey === ord[0]
          ? "ตรงกับพลังเด่นบนวัตถุ"
          : "ตรงกับรองลงมา · ยังเสริมคู่กันได้",
    },
    {
      kicker: "ยังไม่ส่งกัน",
      main: tensionMain,
      sub: "คะแนนห่างกันที่สุด · คุมจังหวะ",
    },
    {
      kicker: "พลังเด่น",
      main: `เด่นสุดที่${peakShort}`,
      sub: `ส่ง ${s0} นำ · ${s1} รอง`,
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
    return {
      key: k,
      label: POWER_LABEL_THAI[k],
      score,
      blurb: "",
    };
  });
  lifeRows.sort((a, b) => b.score - a.score);
  lifeRows.forEach((row, idx) => {
    const custom = String(blurbs[row.key] || "").trim();
    row.blurb = custom
      ? custom.replace(/\s+/g, " ").trim().slice(0, 96)
      : buildAxisLifeBlurb(seed, row.key, idx);
  });

  const usageDisclaimer = AMULET_HTML_V2_USAGE_DISCLAIMER;

  const mainShort =
    String(fs.mainEnergyShort || "").trim() || "พลังมุ่งเน้นรวม";
  const clarifierLine = mainToneMatchesGraphPeak(mainShort, ord[0])
    ? ""
    : `ภาพรวม ${mainShort} · เด่นสุด ${AMULET_PEAK_SHORT_THAI[ord[0]] || topLabel}`;

  return {
    rendererId: "amulet-html-v2",
    hero: {
      subtypeLabel: String(fs.headline || "").trim(),
      tagline: String(fs.tagline || "").trim(),
      mainEnergyLabel: mainShort,
      displayLine: `โทนหลัก · ${mainShort}`,
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
          title: "เข้ากันมากที่สุด",
          text: `${alignLabel} ส่งกับคุณตรงสุด · ใช้คู่กันได้ดี`,
        },
      ],
    },
    interactionSummary: {
      headline: "ชิ้นนี้ทำงานกับคุณอย่างไร",
      rows: interactionRows,
    },
    lifeAreaDetail: { rows: lifeRows },
    usageCaution: { disclaimer: usageDisclaimer },
    timingSection: (() => {
      const tv = payload.timingV1;
      if (
        !tv ||
        (tv.engineVersion !== "timing_v1" && tv.engineVersion !== "timing_v1_1") ||
        !tv.summary ||
        !Array.isArray(tv.bestHours) ||
        tv.bestHours.length === 0
      ) {
        return null;
      }
      return {
        heading: "จังหวะที่เหมาะกับการอธิษฐาน",
        hourLine: String(tv.summary.topWindowLabel || "").trim(),
        weekdayLine: String(tv.summary.topWeekdayLabel || "").trim(),
        ritualLine: String(tv.ritualMode || "").trim(),
        hint: String(tv.summary.practicalHint || "").trim(),
        confidence: tv.confidence === "high" || tv.confidence === "low" ? tv.confidence : "medium",
      };
    })(),
    trustNote: String(payload.trust?.trustNote || "").trim(),
    reportVersion: String(payload.reportVersion || ""),
    modelLabel: payload.trust?.modelLabel
      ? String(payload.trust.modelLabel)
      : "",
  };
}
