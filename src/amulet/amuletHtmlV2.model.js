import {
  POWER_ORDER,
  POWER_LABEL_THAI,
  AMULET_PEAK_SHORT_THAI,
} from "./amuletScores.util.js";
import {
  computeAmuletOrdAndAlignFromPayload,
  clamp0100,
} from "./amuletOrdAlign.util.js";
import { buildAxisLifeBlurb } from "./amuletMeaningBlurbs.util.js";
import { SACRED_AXIS_HINT_TH } from "../services/timing/timingEngine.copy.th.js";
import { TIMING_HOUR_WINDOWS } from "../config/timing/timingWindows.config.js";
import { TIMING_WEEKDAY_LABEL_TH } from "../config/timing/timingWeekdayAffinity.config.js";
import {
  energyGradeToLevelGradeClass,
  resolveEnergyLevelDisplayGrade,
} from "../utils/reports/energyLevelGrade.util.js";
import { buildSacredAmuletUseDayCard } from "./amuletUseDayCard.util.js";
import {
  buildSacredAmuletDailyOwnerCard,
  buildTodayObjectBoostLine,
} from "./amuletDailyOwnerCard.util.js";

/** Sacred_amulet HTML footer disclaimer (ท้ายรายงาน; source: `usageCaution.disclaimer`). */
export const AMULET_HTML_V2_USAGE_DISCLAIMER =
  "พระหรือเครื่องรางจะเด่นด้านไหน ไม่ได้ขึ้นอยู่กับวัตถุอย่างเดียว แต่ขึ้นอยู่กับวันเดือนปีเกิด พื้นฐานดวง และการปฏิบัติตัวของเจ้าของด้วย แต่ละคนจึงมีประสบการณ์ต่างกัน Ener Scan";

/**
 * Policy — sacred_amulet hero vs radar graph (HTML v2):
 *
 * 1. **Graph peak (hero headline)** — `displayLine` = `โทนหลัก · {peakShort}` where `peakShort` follows **object**
 *    scores (`ord[0]` after `sortPowerKeysByObjectDesc`), matching the radar “เด่นสุด”.
 * 2. **Baseline from scan** — `flexSurface.mainEnergyShort` stays on `mainEnergyLabel` and may differ from the graph;
 *    when it does, show short `clarifierLine` `สรุปจากสแกน` only (no duplicate of mainShort; headline already shows peak).
 * 3. **Graph summary row 2** — Label “เข้ากับคุณที่สุด”; value = axis among top-two object scores that best matches
 *    the owner profile (`pickAlignKeyAmongTopTwo`).
 * 4. **Radar secondary dot (HTML)** — Same axis as row 2: vertex on the object polygon at `alignment.axisKey` when ≠ peak
 *    (not `ord[1]` second-highest score).
 */

/**
 * True when baseline `mainEnergyShort` already aligns with the **graph peak axis** (`peakKey` = `ord[0]`),
 * so no clarifier is needed.
 * @param {string} mainShort — from flexSurface (baseline identity label)
 * @param {string} peakKey — dominant object axis key from score ordering
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

/** Sunday-first — ตรง `TIMING_WEEKDAY_LABEL_TH` / `summary.topWeekdayLabel` */
const AMULET_WEEKDAY_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** Copy สำหรับ sacred_amulet timing section — display เท่านั้น ไม่แตะ timing truth */
const AMULET_TIMING_SUBTITLE =
  "ช่วงที่พระเครื่องตอบกับจังหวะของคุณได้ดีที่สุด";
const AMULET_TIMING_WEEKDAY_KICKER = "วันส่งดี";
const AMULET_TIMING_TIME_KICKER = "ช่วงเวลาที่ส่งดี";
const AMULET_TIMING_MODE_KICKER = "แนวใช้ที่แนะนำ";

/**
 * บรรทัดหลักแถว “เวลาใช้ชิ้นนี้” — ผูกกับพลังเด่นบนวัตถุ (ไม่ใช่บุคลิกถาวร)
 * @type {Record<string, string>}
 */
const OWNER_REACT_USE_OBJECT_MAIN_TH = {
  baramee: "ภาพลักษณ์และคำพูดจะมีน้ำหนักขึ้น",
  metta: "บรรยากาศรอบตัวจะนุ่มนวลและเปิดรับมากขึ้น",
  protection: "ความมั่นคงและการตั้งขอบเขตจะชัดขึ้น",
  specialty: "สมาธิและงานละเอียดจะไปได้ดีขึ้น",
  fortune_anchor: "การตั้งหลักและเรื่องสำคัญจะนิ่งขึ้น",
  luck: "โอกาสและทางเลือกใหม่จะเปิดง่ายขึ้น",
};

/**
 * การ์ด “ชิ้นนี้ทำให้คุณเด่นแบบไหน” — สรุปปฏิสัมพันธ์กับวัตถุที่สแกน (ไม่ใช่คะแนนบุคลิก)
 *
 * @param {object} p
 * @param {string} p.alignKey
 * @param {string} p.alignLabel
 * @param {string[]} p.ord
 * @param {string} p.peakKey
 * @param {string} p.peakShort
 * @param {string} p.s0
 * @param {string} p.s1
 * @param {string} p.tensionGsumValue
 * @param {number} p.maxD
 * @param {string} p.ownerRhythmLine — e.g. birth month rhythm (soft, stable)
 * @param {string} p.tensionPaceSub — sub line aligned with interaction “ยังไม่ส่งกัน”
 */
function buildOwnerReactionCard(p) {
  const {
    alignKey,
    alignLabel,
    ord,
    peakKey,
    peakShort,
    s0,
    s1,
    tensionGsumValue,
    maxD,
    ownerRhythmLine,
    tensionPaceSub,
  } = p;

  const row1Sub =
    alignKey === ord[0]
      ? "ตรงกับพลังเด่นบนวัตถุ · ใช้คู่กันได้ดี"
      : "ตรงกับด้านรองจากเด่น · ใช้คู่กันได้ดี";

  const useMain =
    OWNER_REACT_USE_OBJECT_MAIN_TH[
      /** @type {keyof typeof OWNER_REACT_USE_OBJECT_MAIN_TH} */ (peakKey)
    ] || `พลัง${peakShort}บนวัตถุจะหนุนจังหวะที่คุณใช้ชิ้นนี้`;

  const useSub = `ส่ง ${s0} นำ · ${s1} รอง · เชื่อมกับแกนที่เข้ากับคุณ`;

  const row3Sub =
    maxD >= 26
      ? String(tensionPaceSub || "").trim() || "ค่อย ๆ สะสมจะเข้าจังหวะกว่า"
      : "ใช้แบบค่อย ๆ สะสมจะเข้าจังหวะกว่า";

  return {
    title: "ชิ้นนี้ทำให้คุณเด่นแบบไหน",
    ownerRhythmLine: String(ownerRhythmLine || "").trim(),
    rows: [
      { kicker: "ส่งกับคุณตรงสุด", main: alignLabel, sub: row1Sub },
      { kicker: "เวลาใช้ชิ้นนี้", main: useMain, sub: useSub },
      { kicker: "มุมที่ควรค่อย ๆ ไป", main: tensionGsumValue, sub: row3Sub },
    ],
  };
}

/**
 * การ์ด “ควรเก็บไหม” — เกรดการตัดสินใจเก็บ (ไม่ใช่เกรดความเด่นพลังงานระบบ S/A/B/D)
 *
 * `keepScore = 0.55 * compatibilityPercent + 0.25 * (energyScore * 10) + 0.20 * decisionBonus`
 *
 * @param {object} p
 * @param {number|null|undefined} p.compatibilityPercent
 * @param {number|null|undefined} p.energyScore
 * @param {string} p.alignKey
 * @param {string[]} p.ord
 * @param {number} p.maxD
 * @param {string} p.alignLabel
 * @param {string} p.tensionLabel
 */
export function buildSacredAmuletDecisionCard(p) {
  const compat = Number(p.compatibilityPercent);
  const compatN = Number.isFinite(compat) ? Math.min(100, Math.max(0, compat)) : 70;
  const es = Number(p.energyScore);
  const energyN = Number.isFinite(es) ? Math.min(10, Math.max(0, es)) : 7;

  let decisionBonus = 50;
  if (p.alignKey === p.ord[0]) decisionBonus += 12;
  else if (p.alignKey === p.ord[1]) decisionBonus += 8;
  else decisionBonus += 4;

  if (p.maxD >= 26) decisionBonus -= 10;
  else if (p.maxD >= 15) decisionBonus -= 5;
  else decisionBonus -= 2;

  if (compatN < 60) decisionBonus -= 4;
  else if (compatN >= 80) decisionBonus += 4;
  else if (compatN >= 72) decisionBonus += 2;

  if (energyN >= 8.5) decisionBonus += 3;
  else if (energyN >= 7.5) decisionBonus += 1;
  else if (energyN < 6.5) decisionBonus -= 3;

  decisionBonus = Math.min(100, Math.max(0, decisionBonus));

  const rawKeep =
    0.55 * compatN + 0.25 * (energyN * 10) + 0.2 * decisionBonus;
  const keepScore = Math.round(Math.min(100, Math.max(0, rawKeep)) * 10) / 10;

  /** @type {"S"|"A"|"B"|"C"} */
  let keepGrade = "C";
  let verdict = "หาต่อ";
  if (keepScore >= 85) {
    keepGrade = "S";
    verdict = "จับเก็บเลย";
  } else if (keepScore >= 75) {
    keepGrade = "A";
    verdict = "น่าเก็บ";
  } else if (keepScore >= 65) {
    keepGrade = "B";
    verdict = "ถ้าถูกทางค่อยเก็บ";
  }

  const reasonByGrade = {
    S: "เข้ากับคุณสูง พลังเด่นชัด และส่งกับคุณตรงสุด",
    A: "ใช้ได้ดีและเข้ากับคุณพอสมควร มีมุมที่ควรค่อย ๆ ไป",
    B: "ยังมีบางด้านที่ไม่ตรงกับจังหวะคุณ ถ้าเจอชิ้นที่ส่งกว่านี้อาจดีกว่า",
    C: "ชิ้นนี้ยังไม่ตอบกับคุณพอ ลองหาชิ้นที่เด่นด้านอื่นแล้วสแกนเพิ่ม",
  };

  const al = String(p.alignLabel || "").trim() || "แกนที่เข้ากับคุณ";
  const tl = String(p.tensionLabel || "").trim() || "แกนที่ยังไม่ส่งกัน";

  let nextHint = "";
  if (keepGrade === "S" || keepGrade === "A") {
    nextHint = `ถ้าเจอหลายชิ้น ให้เทียบชิ้นที่เด่นทาง ${al} แล้วเลือกคะแนนสูงสุด · ถ้าจะสแกนเพิ่มลองเทียบโทน ${al} ที่ใกล้กัน`;
  } else {
    nextHint = `ถ้าจะหาต่อ ให้เน้นชิ้นที่เด่น ${al} · ลองสแกนหลายชิ้นสายเดียวกันแล้วเทียบคะแนน · อย่าเริ่มจากชิ้นที่หนักทาง ${tl} มากเกินไป`;
  }

  return {
    title: "ควรเก็บไหม",
    keepScore,
    keepGrade,
    verdict,
    reason: reasonByGrade[keepGrade],
    nextHint,
  };
}

/** ป้ายสั้นต่อ `key` ของ `TIMING_HOUR_WINDOWS` — visual เท่านั้น */
const AMULET_TIME_STRIP_SHORT_BY_KEY = {
  dawn_05_06: "รุ่ง",
  morning_07_10: "เช้า",
  noon_11_13: "กลางวัน",
  afternoon_14_16: "บ่าย",
  evening_17_19: "เย็น",
  night_20_22: "ค่ำ",
  late_night_23_04: "ดึก",
};

/**
 * รายวันสำหรับ strip — active จาก `tv.summary.topWeekdayLabel` เท่านั้น (ไม่คำนวณใหม่)
 *
 * @param {import("../services/reports/reportPayload.types.js").ReportTimingV1} tv
 */
export function buildSacredAmuletWeekdayItems(tv) {
  const top = String(tv.summary?.topWeekdayLabel || "").trim();
  return TIMING_WEEKDAY_LABEL_TH.map((fullLabel, i) => ({
    fullLabel,
    shortLabel: AMULET_WEEKDAY_SHORT[i] || "?",
    active: Boolean(top && fullLabel === top),
  }));
}

/**
 * รายช่วงเวลาสำหรับ strip — active จาก `tv.bestHours[0].key` ตรงกับหน้าต่างใน `TIMING_HOUR_WINDOWS`
 *
 * @param {import("../services/reports/reportPayload.types.js").ReportTimingV1} tv
 */
export function buildSacredAmuletTimeItems(tv) {
  const topKey = String(tv.bestHours?.[0]?.key || "").trim();
  return TIMING_HOUR_WINDOWS.map((w) => ({
    key: w.key,
    shortLabel:
      AMULET_TIME_STRIP_SHORT_BY_KEY[w.key] ||
      String(w.labelTh || "").split(/\s/)[0] ||
      w.key,
    labelFull: w.labelTh,
    active: Boolean(topKey && w.key === topKey),
  }));
}

/**
 * Sacred_amulet timing card — HTML surface only.
 * Composed lines + strips ใช้ข้อมูลจาก `timingV1` เท่านั้น — ไม่ derive สูตร timing ในเลเยอร์นี้
 *
 * @param {object} tv — `timingV1` from engine (unchanged truth)
 * @param {string} peakKey
 * @param {string} secondKey
 */
export function buildSacredAmuletTimingCardDisplay(tv, peakKey, secondKey) {
  const topWindowLabel = String(tv.summary?.topWindowLabel || "").trim();
  const topWeekdayLabel = String(tv.summary?.topWeekdayLabel || "").trim();
  const ritualMode = String(tv.ritualMode || "ตั้งจิต").trim();
  const axisFull =
    SACRED_AXIS_HINT_TH[/** @type {keyof typeof SACRED_AXIS_HINT_TH} */ (peakKey)] ||
    SACRED_AXIS_HINT_TH.protection;
  const s0 =
    AMULET_PEAK_SHORT_THAI[/** @type {keyof typeof AMULET_PEAK_SHORT_THAI} */ (peakKey)] || "";
  const s1 =
    AMULET_PEAK_SHORT_THAI[/** @type {keyof typeof AMULET_PEAK_SHORT_THAI} */ (secondKey)] || "";

  const hourLine = topWindowLabel
    ? `${topWindowLabel} ส่งกับพลัง${axisFull}`
    : topWindowLabel;

  const weekdayLine =
    s0 && s1 && topWeekdayLabel
      ? `${topWeekdayLabel} หนุนพลัง${s0}และ${s1}ได้ดี`
      : topWeekdayLabel;

  const hint = String(tv.summary?.practicalHint || "").trim();

  const weekdayItems = buildSacredAmuletWeekdayItems(tv);
  const timeItems = buildSacredAmuletTimeItems(tv);

  return {
    heading: "จังหวะเสริมพลัง",
    subtitle: AMULET_TIMING_SUBTITLE,
    topWindowLabel,
    topWeekdayLabel,
    weekdayKicker: AMULET_TIMING_WEEKDAY_KICKER,
    timeKicker: AMULET_TIMING_TIME_KICKER,
    modeKicker: AMULET_TIMING_MODE_KICKER,
    ritualLine: ritualMode,
    hint,
    confidence:
      tv.confidence === "high" || tv.confidence === "low" ? tv.confidence : "medium",
    weekdayItems,
    timeItems,
    hourLine,
    weekdayLine,
  };
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

  const metrics = computeAmuletOrdAndAlignFromPayload(payload);
  if (!metrics) {
    throw new Error("AMULET_HTML_V2_BAD_METRICS");
  }
  const { ord, alignKey, objectP, ownerP, ownerProf } = metrics;

  const pc =
    av.powerCategories && typeof av.powerCategories === "object"
      ? av.powerCategories
      : {};

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
  const alignLabel = POWER_LABEL_THAI[alignKey];
  const tensionLabel = POWER_LABEL_THAI[tensionKey];
  const tensionGsumValue =
    maxD >= 26
      ? `${tensionLabel} · อย่าเร่ง`
      : `${tensionLabel} · ค่อย ๆ สะสม`;
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
        label: "เข้ากับคุณที่สุด",
        value: alignLabel,
      },
      {
        label: "ควรค่อย ๆ ไป",
        value: tensionGsumValue,
        rowKind: "tension",
      },
    ],
  };
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
          : "ตรงกับด้านรองจากเด่น · ยังเสริมคู่กันได้",
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

  const ownerReactionCard = buildOwnerReactionCard({
    alignKey,
    alignLabel,
    ord,
    peakKey,
    peakShort,
    s0,
    s1,
    tensionGsumValue,
    maxD,
    ownerRhythmLine: ownerProf.zodiacLabel,
    tensionPaceSub: interactionRows[1].sub,
  });

  const decisionCard = buildSacredAmuletDecisionCard({
    compatibilityPercent: payload.summary?.compatibilityPercent,
    energyScore: payload.summary?.energyScore,
    alignKey,
    ord,
    maxD,
    alignLabel,
    tensionLabel,
  });

  /** Same owner + same Bangkok calendar day from `generatedAt` ⇒ same card (no scan/object). */
  const dailyOwnerCard = buildSacredAmuletDailyOwnerCard({
    birthdateUsed: payload.birthdateUsed,
    generatedAtIso: payload.generatedAt,
  });
  /** Per object + compat / axes — may change when สแกนชิ้นอื่น. */
  const todayObjectBoostLine = buildTodayObjectBoostLine({
    compatibilityPercent: payload.summary?.compatibilityPercent,
    peakKey,
    alignKey,
    tensionKey,
  });

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
  /** When flex baseline ≠ graph peak: one line; โทนมาจากสแกนอยู่ที่ `mainEnergyLabel` แล้ว ไม่ซ้ำใน clarifier */
  const clarifierLine = mainToneMatchesGraphPeak(mainShort, ord[0]) ? "" : "สรุปจากสแกน";

  return {
    rendererId: "amulet-html-v2",
    hero: {
      subtypeLabel: String(fs.headline || "").trim(),
      tagline: String(fs.tagline || "").trim(),
      mainEnergyLabel: mainShort,
      displayLine: `โทนหลัก · ${peakShort}`,
      clarifierLine,
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
    /** จังหวะวันนี้ของเจ้าของ — stable ต่อวัน (ไม่ผูกวัตถุ) */
    dailyOwnerCard,
    /** บรรทัดสั้น ชิ้นนี้ + วันนี้ — เปลี่ยนตามวัตถุ/เข้ากัน */
    todayObjectBoostLine,
    /** เก็บ/ไม่เก็บ — เกรดตัดสินใจแยกจากความเด่นพลังงานระบบ */
    decisionCard,
    /** Object-reactive copy (สแกนต่อชิ้น) — ไม่ใช่คะแนนบุคลิกถาวร */
    ownerReactionCard,
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
      return buildSacredAmuletTimingCardDisplay(tv, ord[0], ord[1]);
    })(),
    /** Action summary “วันไหนหยิบใช้” — axes + birth + compatibility; not `timingV1` (see `timingSection`). */
    timingActionCard: buildSacredAmuletUseDayCard(payload, metrics),
    trustNote: String(payload.trust?.trustNote || "").trim(),
    reportVersion: String(payload.reportVersion || ""),
    modelLabel: payload.trust?.modelLabel
      ? String(payload.trust.modelLabel)
      : "",
  };
}
