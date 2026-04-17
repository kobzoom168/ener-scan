/**
 * Sacred amulet HTML — “วันที่ควรใช้” action summary (deterministic, display-only).
 * Does not read `timingV1` / timing engine truth; complements `timingSection`.
 */

import { TIMING_WEEKDAY_LABEL_TH } from "../config/timing/timingWeekdayAffinity.config.js";

/** 0=Sun … 6=Sat → table keys */
const WD_KEY_BY_INDEX = /** @type {const} */ ([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

/**
 * Explicit 7×6 affinity (0–100), tunable without timing engine imports.
 * @type {Record<string, Record<string, number>>}
 */
export const SACRED_WEEKDAY_AXIS_AFFINITY = {
  sunday: {
    baramee: 96,
    metta: 54,
    protection: 62,
    specialty: 48,
    fortune_anchor: 68,
    luck: 78,
  },
  monday: {
    baramee: 58,
    metta: 96,
    protection: 46,
    specialty: 56,
    fortune_anchor: 60,
    luck: 66,
  },
  tuesday: {
    baramee: 64,
    metta: 42,
    protection: 96,
    specialty: 58,
    fortune_anchor: 72,
    luck: 44,
  },
  wednesday: {
    baramee: 56,
    metta: 64,
    protection: 52,
    specialty: 96,
    fortune_anchor: 62,
    luck: 58,
  },
  thursday: {
    baramee: 88,
    metta: 70,
    protection: 60,
    specialty: 68,
    fortune_anchor: 92,
    luck: 62,
  },
  friday: {
    baramee: 72,
    metta: 90,
    protection: 48,
    specialty: 60,
    fortune_anchor: 58,
    luck: 94,
  },
  saturday: {
    baramee: 66,
    metta: 46,
    protection: 88,
    specialty: 62,
    fortune_anchor: 96,
    luck: 52,
  },
};

/**
 * ข้อความสั้นตามวัน (ผูกกับวันหลักที่แนะนำ) เสริมบรรทัดรอง/ความมั่นใจ ไม่ทับ reasonShort / actionLine
 * @type {Record<string, string>}
 */
export const SACRED_USE_DAY_WEEKDAY_TIP_TH = {
  sunday:
    "จังหวะเปิดเรื่องและเน้นความโดดเด่น ใช้วันนี้เมื่ออยากให้สิ่งสำคัญถูกมองเห็นและจดจำได้ง่าย",
  monday:
    "โทนอ่อนโยนและเปิดรับ ใช้วันนี้เมื่ออยากเสริมเมตตา บรรยากาศดี ๆ และความสัมพันธ์ที่นุ่มนวล",
  tuesday:
    "โทนตั้งรับและกล้าเด็ดขาด ใช้วันนี้เมื่ออยากตั้งขอบเขต กันแรงปะทะ และจัดการให้จบข้อ",
  wednesday:
    "โทนสมาธิและความคม ใช้วันนี้เมื่ออยากโฟกัสงานละเอียด เรียนรู้ลึก และตัดสินใจอย่างมีหลัก",
  thursday:
    "โทนขยายและมองไกล ใช้วันนี้เมื่ออยากผูกเรื่องใหญ่ วางแผนระยะยาว และสร้างความมั่นคง",
  friday:
    "โทนเบาและไหลลื่น ใช้วันนี้เมื่ออยากเปิดทางใหม่ ความราบรื่น และความสัมพันธ์ที่ราบรื่น",
  saturday:
    "โทนเก็บกักและตั้งหลัก ใช้วันนี้เมื่ออยากพักพลัง ทบทวนให้นิ่ง และเตรียมรอบถัดไป",
};

/**
 * @param {number} index0Sun 0=อาทิตย์ … 6=เสาร์
 * @returns {string}
 */
export function sacredUseDayWeekdayTipTh(index0Sun) {
  const i = ((Number(index0Sun) % 7) + 7) % 7;
  const key = WD_KEY_BY_INDEX[i];
  return SACRED_USE_DAY_WEEKDAY_TIP_TH[key] || "";
}

/**
 * @param {string} axisKey
 * @param {number} wd 0–6 Sun–Sat
 * @returns {number}
 */
function axisAffinityTable(axisKey, wd) {
  const dayKey = WD_KEY_BY_INDEX[((wd % 7) + 7) % 7];
  const row =
    SACRED_WEEKDAY_AXIS_AFFINITY[/** @type {keyof typeof SACRED_WEEKDAY_AXIS_AFFINITY} */ (dayKey)];
  if (!row) return 70;
  const k = String(axisKey || "protection").trim();
  const v = row[/** @type {keyof typeof row} */ (k)];
  const n = Number(v);
  return Number.isFinite(n) ? n : 70;
}

/**
 * Shortest circular distance on 7-day ring (0–3).
 * @param {number} a 0–6
 * @param {number} b 0–6
 */
function circularWeekdayDistance(a, b) {
  const x = ((a % 7) + 7) % 7;
  const y = ((b % 7) + 7) % 7;
  const d = Math.abs(x - y);
  return Math.min(d, 7 - d);
}

/**
 * @param {number|null} birthWd
 * @param {number} wd
 */
function birthWeekdayNudge(birthWd, wd) {
  if (birthWd == null || !Number.isFinite(birthWd)) return 0;
  const dist = circularWeekdayDistance(birthWd, wd);
  if (dist === 0) return 10;
  if (dist === 1) return 4;
  if (dist === 2) return 2;
  return 0;
}

/**
 * @param {string|null|undefined} birthdateUsed DD/MM/YYYY etc.
 * @returns {number|null} 0=Sun … 6=Sat, or null
 */
function birthWeekday0Sun(birthdateUsed) {
  const m = String(birthdateUsed || "").match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  if (y < 100) y = y >= 50 ? 1900 + y : 2000 + y;
  const t = Date.UTC(y, mo - 1, d, 12, 0, 0);
  return new Date(t).getUTCDay();
}

/**
 * @param {object} p
 * @param {string} p.peakKey
 * @param {string} p.secondKey
 * @param {string} p.alignKey
 * @param {string} p.tensionKey
 * @param {string|null|undefined} p.birthdateUsed
 * @param {number|null|undefined} p.compatibilityPercent
 * @returns {{
 *   recommendedIndex0Sun: number,
 *   secondaryIndex0Sun: number,
 *   recommendedWeekday: string,
 *   secondaryWeekday: string,
 *   confidence: "high"|"medium",
 *   scores: Record<string, number>,
 *   scoresArray: number[],
 * }}
 */
export function computeSacredAmuletRecommendedWeekday(p) {
  const {
    peakKey,
    secondKey,
    alignKey,
    tensionKey,
    birthdateUsed,
    compatibilityPercent,
  } = p;
  const pk = String(peakKey || "protection").trim();
  const s2 = String(secondKey || pk).trim();
  const ak = String(alignKey || pk).trim();
  const tk = String(tensionKey || pk).trim();
  const compat = Number(compatibilityPercent);
  const compatN = Number.isFinite(compat) ? Math.min(100, Math.max(0, compat)) : 72;
  const compatibilityFactor = 0.94 + 0.14 * (compatN / 100);

  const birthWd = birthWeekday0Sun(birthdateUsed);

  /** @type {number[]} */
  const scoresArray = [];
  for (let wd = 0; wd < 7; wd += 1) {
    let s = 0;
    s += 0.34 * axisAffinityTable(pk, wd);
    s += 0.18 * axisAffinityTable(s2, wd);
    s += 0.28 * axisAffinityTable(ak, wd);
    s -= 0.22 * axisAffinityTable(tk, wd);
    s += birthWeekdayNudge(birthWd, wd);
    s *= compatibilityFactor;
    scoresArray.push(s);
  }

  /** @type {{ wd: number; score: number }[]} */
  const ranked = scoresArray.map((score, wd) => ({ wd, score }));
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.wd - b.wd;
  });

  const top1 = ranked[0];
  const top2 = ranked[1] || top1;
  const gap = top1.score - top2.score;
  const confidence = gap > 6 ? "high" : "medium";

  /** @type {Record<string, number>} */
  const scores = {};
  for (let i = 0; i < 7; i += 1) {
    scores[WD_KEY_BY_INDEX[i]] = Math.round(scoresArray[i] * 10) / 10;
  }

  return {
    recommendedIndex0Sun: top1.wd,
    secondaryIndex0Sun: top2.wd,
    recommendedWeekday: TIMING_WEEKDAY_LABEL_TH[top1.wd] || "วันอาทิตย์",
    secondaryWeekday: TIMING_WEEKDAY_LABEL_TH[top2.wd] || "วันอาทิตย์",
    confidence,
    scores,
    scoresArray,
  };
}

const REASON_BY_PEAK = {
  baramee: "เหมาะกับการหนุนบารมีและความมั่นใจ",
  metta: "เหมาะกับการขอพรเรื่องเมตตาและความนุ่มนวล",
  protection: "เหมาะกับการตั้งขอบเขตและเสริมแรงคุ้มครอง",
  specialty: "เหมาะกับงานที่ต้องใช้สมาธิและความแม่น",
  fortune_anchor: "เหมาะกับการตั้งหลักและทำเรื่องสำคัญให้ชัด",
  luck: "เหมาะกับการเปิดทางและจังหวะใหม่",
};

const ACTION_BY_ALIGN = {
  baramee: "ใช้ดีเมื่อมีนัดสำคัญหรืออยากให้คนรับฟังมากขึ้น",
  metta: "ใช้ดีเมื่ออยากให้บรรยากาศรอบตัวเปิดรับมากขึ้น",
  protection: "ใช้ดีเมื่ออยากรู้สึกมั่นคงหรือมีเรื่องต้องกันแรง",
  specialty: "ใช้ดีเมื่อต้องทำงานละเอียดหรือโฟกัสเรื่องเฉพาะ",
  fortune_anchor: "ใช้ดีเมื่ออยากให้ใจนิ่งและไม่หลุดจังหวะ",
  luck: "ใช้ดีเมื่อกำลังเริ่มสิ่งใหม่และอยากให้ flow เปิด",
};

/**
 * @param {object} p
 * @param {string} p.peakKey
 * @param {string} p.alignKey
 * @param {string} p.tensionKey
 * @returns {{ reasonShort: string, actionLine: string }}
 */
export function buildUseDayCopyLines(p) {
  const pk = String(p.peakKey || "protection").trim();
  const ak = String(p.alignKey || pk).trim();
  const tk = String(p.tensionKey || "").trim();

  const reasonShort =
    REASON_BY_PEAK[/** @type {keyof typeof REASON_BY_PEAK} */ (pk)] ||
    REASON_BY_PEAK.protection;

  let actionLine =
    ACTION_BY_ALIGN[/** @type {keyof typeof ACTION_BY_ALIGN} */ (ak)] ||
    ACTION_BY_ALIGN.protection;

  if (ak === tk && ak) {
    actionLine = "ใช้ดีเมื่ออยากคุมจังหวะให้ช้าลงและไม่เร่งเกินไป";
  }

  return { reasonShort, actionLine };
}

/**
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload} payload
 * @param {object} metrics — from `computeAmuletOrdAndAlignFromPayload`
 * @returns {{
 *   title: string,
 *   recommendedWeekday: string,
 *   secondaryWeekday: string,
 *   confidence: "high"|"medium",
 *   weekdayTip: string,
 *   scores: Record<string, number>,
 *   reasonShort: string,
 *   actionLine: string,
 * }}
 */
export function buildSacredAmuletUseDayCard(payload, metrics) {
  const { ord, alignKey, tensionKey } = metrics;
  const peakKey = ord[0];
  const secondKey = ord[1];

  const computed = computeSacredAmuletRecommendedWeekday({
    peakKey,
    secondKey,
    alignKey,
    tensionKey,
    birthdateUsed: payload.birthdateUsed,
    compatibilityPercent: payload.summary?.compatibilityPercent,
  });

  const { reasonShort, actionLine } = buildUseDayCopyLines({
    peakKey,
    alignKey,
    tensionKey,
  });

  const weekdayTip = sacredUseDayWeekdayTipTh(computed.recommendedIndex0Sun);

  return {
    title: "วันที่ควรใช้",
    recommendedWeekday: computed.recommendedWeekday,
    secondaryWeekday: computed.secondaryWeekday,
    confidence: computed.confidence,
    weekdayTip,
    scores: computed.scores,
    reasonShort,
    actionLine,
  };
}
