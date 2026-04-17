/**
 * Sacred amulet HTML — “วันที่ควรใช้” action summary (deterministic, display-only).
 * Does not read `timingV1` / timing engine truth; complements `timingSection`.
 */

import {
  TIMING_WEEKDAY_LABEL_TH,
  weekdayAffinityScore,
} from "../config/timing/timingWeekdayAffinity.config.js";

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
 * Deterministic weekday scores (0–6 Sun–Sat), then pick best.
 * Combines axis affinity (peak / second / align / tension penalty), birth nudge, compatibility nudge.
 *
 * @param {object} p
 * @param {string} p.peakKey
 * @param {string} p.secondKey
 * @param {string} p.alignKey
 * @param {string} p.tensionKey
 * @param {string|null|undefined} p.birthdateUsed
 * @param {number|null|undefined} p.compatibilityPercent
 * @returns {{ index0Sun: number, labelThai: string, scores: number[] }}
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

  const birthWd = birthWeekday0Sun(birthdateUsed);

  /** @type {number[]} */
  const scores = [];
  for (let wd = 0; wd < 7; wd += 1) {
    let s = 0;
    s += 0.34 * weekdayAffinityScore("sacred_amulet", pk, wd);
    s += 0.18 * weekdayAffinityScore("sacred_amulet", s2, wd);
    s += 0.28 * weekdayAffinityScore("sacred_amulet", ak, wd);
    s -= 0.22 * weekdayAffinityScore("sacred_amulet", tk, wd);
    if (birthWd != null && birthWd === wd) s += 10;
    s *= 0.94 + 0.14 * (compatN / 100);
    scores.push(s);
  }

  let best = 0;
  for (let i = 1; i < 7; i += 1) {
    if (scores[i] > scores[best]) best = i;
  }

  return {
    index0Sun: best,
    labelThai: TIMING_WEEKDAY_LABEL_TH[best] || "วันอาทิตย์",
    scores,
  };
}

const REASON_BY_PEAK = {
  protection: "เหมาะกับการหนุนคุ้มครองและความมั่นคงในโฟกัสของคุณ",
  metta: "เหมาะกับการขอพรเรื่องเมตตาและความนุ่มนวลรอบตัว",
  baramee: "เหมาะกับการหนุนบารมีและความมั่นใจในการสื่อสาร",
  luck: "เหมาะกับการเปิดทางและโอกาสใหม่ ๆ แบบค่อยเป็นค่อยไป",
  fortune_anchor: "เหมาะกับการตั้งหลักและทำเรื่องสำคัญให้ชัดเจน",
  specialty: "เหมาะกับงานเฉพาะทางที่ต้องใช้สมาธิและความแม่นยำ",
};

const ACTION_BY_ALIGN = {
  protection: "ใช้ดีเมื่ออยากให้รู้สึกปลอดภัยหรือมีเรื่องต้องปกป้องตัวเอง",
  metta: "ใช้ดีเมื่ออยากให้บรรยากาศรอบตัวเปิดรับและอ่อนโยนขึ้น",
  baramee: "ใช้ดีเมื่อมีนัดสำคัญหรืออยากให้คนรับฟังมากขึ้น",
  luck: "ใช้ดีเมื่อกำลังเปิดโปรเจกต์ใหม่หรือลองสิ่งที่ไม่คุ้นมือ",
  fortune_anchor: "ใช้ดีเมื่ออยากให้การตัดสินใจนิ่งขึ้นและไม่หลุดโฟกัส",
  specialty: "ใช้ดีเมื่อต้องทำงานละเอียดหรือฝึกทักษะเฉพาะด้าน",
};

/**
 * @param {object} p
 * @param {string} p.peakKey
 * @param {string} p.alignKey
 * @param {string} p.tensionKey
 * @param {number|null|undefined} p.compatibilityPercent
 * @returns {{ reasonShort: string, actionLine: string }}
 */
export function buildUseDayCopyLines(p) {
  const pk = String(p.peakKey || "protection").trim();
  const ak = String(p.alignKey || pk).trim();
  const tk = String(p.tensionKey || "").trim();
  const compat = Number(p.compatibilityPercent);
  const compatN = Number.isFinite(compat) ? Math.min(100, Math.max(0, compat)) : 72;

  const reasonShort =
    REASON_BY_PEAK[/** @type {keyof typeof REASON_BY_PEAK} */ (pk)] ||
    REASON_BY_PEAK.protection;

  let actionLine =
    ACTION_BY_ALIGN[/** @type {keyof typeof ACTION_BY_ALIGN} */ (ak)] ||
    ACTION_BY_ALIGN.protection;

  if (ak === tk && ak) {
    actionLine = "ใช้ดีเมื่ออยากให้บรรยากาศรอบตัวสงบและคุมจังหวะไม่เร่งเกินไป";
  }

  if (compatN >= 82) {
    actionLine = `${actionLine.replace(/\.$/, "")} · ตอนนี้คะแนนเข้ากันสูง พอไล่จังหวะได้ชัด`;
  } else if (compatN <= 62) {
    actionLine = `${actionLine.replace(/\.$/, "")} · ค่อย ๆ สังเกตผลไปทีละน้อย`;
  }

  return { reasonShort, actionLine };
}

/**
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload} payload
 * @param {object} metrics — from `computeAmuletOrdAndAlignFromPayload`
 * @returns {{ title: string, recommendedWeekday: string, reasonShort: string, actionLine: string }}
 */
export function buildSacredAmuletUseDayCard(payload, metrics) {
  const { ord, alignKey, tensionKey } = metrics;
  const peakKey = ord[0];
  const secondKey = ord[1];
  const seed =
    String(payload.scanId || payload.reportId || "seed").trim() || "seed";

  const { labelThai } = computeSacredAmuletRecommendedWeekday({
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
    compatibilityPercent: payload.summary?.compatibilityPercent,
  });

  return {
    title: "วันที่ควรใช้",
    recommendedWeekday: labelThai,
    reasonShort,
    actionLine,
  };
}
