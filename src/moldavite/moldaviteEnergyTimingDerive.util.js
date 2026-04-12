/**
 * Moldavite-only deterministic v1: "จังหวะเสริมพลัง" (crystal lane — not sacred_amulet timing).
 * Native identity: change_acceleration — wording stays in Moldavite semantic space.
 */

/** @typedef {"work"|"relationship"|"money"} MoldaviteLifeAreaKey */

/** Public native identity label for Moldavite energy (reports / future payload hooks). */
export const MOLDAVITE_NATIVE_IDENTITY_CHANGE_ACCELERATION = "change_acceleration";

/** work → Mon, money → Wed, relationship → Fri (v1 mapping). */
export const MOLDAVITE_ENERGY_WEEKDAY_TH_BY_AREA = {
  work: "วันจันทร์",
  money: "วันพุธ",
  relationship: "วันศุกร์",
};

/** Default time band by primary life area (v1). */
export const MOLDAVITE_ENERGY_TIME_BAND_BY_AREA = {
  work: "08:00-10:59",
  money: "14:00-16:59",
  relationship: "19:00-21:59",
};

const MORNING_RESET_BAND = "05:00-07:59";

/** Moldavite HTML: avoid em dash (U+2014) in visible copy. */
function thaiNoEmDash(s) {
  return String(s || "")
    .replace(/\u2014/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const TIMING_REASON_BY_AREA = {
  work:
    "จังหวะนี้เหมาะกับการเปิดรอบใหม่ทางงานและตัดสินใจให้ชัด พลังของ Moldavite จะตอบกับช่วงที่เจ้าของพร้อมขยับจากจุดเดิมไปสู่ทางที่ชัดกว่าเดิม",
  money:
    "จังหวะนี้เหมาะกับการจัดระเบียบการเงินและเปิดทางให้โอกาสใหม่ค่อย ๆ เคลื่อนเข้ามา Moldavite จะเด่นเมื่อใช้ในช่วงที่เจ้าของพร้อมเปลี่ยนวิธีคิดหรือวิธีจัดการเรื่องเดิม",
  relationship:
    "จังหวะนี้เหมาะกับการปล่อยสิ่งค้างในใจและเปิดพื้นที่ให้ความสัมพันธ์เคลื่อนสู่ความชัดขึ้น Moldavite จะตอบกับช่วงที่เจ้าของยอมรับการเปลี่ยนผ่านอย่างตรงไปตรงมา",
};

/** @param {unknown} k */
function normalizeLifeAreaKey(k) {
  const s = String(k || "").trim();
  if (s === "work" || s === "money" || s === "relationship") return s;
  return "work";
}

/**
 * Owner profile hints "ต้นรอบ / reset" — prefer morning band (v1 heuristic).
 * @param {{ identityLabel?: string, summaryLine?: string }} ownerAxes
 */
export function moldaviteOwnerHintsEarlyCycleBand(ownerAxes) {
  const id = String(ownerAxes?.identityLabel || "");
  const sum = String(ownerAxes?.summaryLine || "");
  if (
    id.includes("จังหวะก่อนขยับ") ||
    id.includes("ตั้งหลักก่อนเปลี่ยน") ||
    id.includes("วางโครงสร้างก่อนเร่งเกียร์")
  ) {
    return true;
  }
  if (
    sum.includes("โครงสร้างและจังหวะการขยับ") ||
    sum.includes("พร้อมเปลี่ยนกรอบเมื่อจำเป็น")
  ) {
    return true;
  }
  return false;
}

/**
 * @param {number} ownerFitScore01to100
 * @returns {string}
 */
export function moldaviteRitualModeFromOwnerFit(ownerFitScore01to100) {
  const n = Number(ownerFitScore01to100);
  const s = Number.isFinite(n) ? n : 70;
  if (s >= 80) {
    return "ตั้งจิตสั้น ๆ ก่อนใช้ แล้วเริ่มสิ่งที่ตั้งใจทันที";
  }
  if (s >= 60) {
    return "ตั้งเจตนา 1 ประโยคก่อนใช้ เพื่อรวมทิศของการเปลี่ยนแปลงให้ชัด";
  }
  return "ใช้ในช่วงที่ใจนิ่งและพร้อมเปลี่ยนจริง แล้วค่อยตั้งจิตก่อนเริ่ม";
}

/**
 * @param {import("./moldaviteScores.util.js").MoldaviteLifeAreaKey} primary
 * @param {import("./moldaviteScores.util.js").MoldaviteLifeAreaKey} secondary
 * @param {Record<string, { score?: number }>} lifeAreas
 * @param {number} closeEpsilon
 */
function lifeAreaScoresClose(primary, secondary, lifeAreas, closeEpsilon) {
  const p = lifeAreas?.[primary];
  const s = lifeAreas?.[secondary];
  const ps = p && typeof p === "object" && p.score != null ? Number(p.score) : NaN;
  const ss = s && typeof s === "object" && s.score != null ? Number(s.score) : NaN;
  if (!Number.isFinite(ps) || !Number.isFinite(ss)) return false;
  return Math.abs(ps - ss) <= closeEpsilon;
}

/**
 * @param {object} input
 * @param {import("../services/reports/reportPayload.types.js").ReportMoldaviteV1} input.mv
 * @param {number} [input.ownerFitScore] — 0–100, typically summary.compatibilityPercent
 * @param {ReturnType<import("./moldaviteOwnerProfileFromBirthdate.util.js").deriveMoldaviteOwnerAxisProfile>} input.ownerAxes
 * @param {MoldaviteLifeAreaKey} [input.strongestAlignmentAxis] — radar “เข้ากัน” axis; reserved for future tie-break (v1 uses `primaryLifeArea` for copy)
 * @returns {{
 *   recommendedWeekday: string,
 *   recommendedTimeBand: string,
 *   ritualMode: string,
 *   timingReason: string,
 *   nativeIdentity: typeof MOLDAVITE_NATIVE_IDENTITY_CHANGE_ACCELERATION,
 * }}
 */
export function deriveMoldaviteEnergyTimingV1(input) {
  const { mv, ownerAxes, ownerFitScore } = input;
  // strongestAlignmentAxis: reserved for future tie-break (v1 uses primaryLifeArea)
  const primary = normalizeLifeAreaKey(mv?.primaryLifeArea);
  const secondary = normalizeLifeAreaKey(mv?.secondaryLifeArea);
  const la =
    mv?.lifeAreas && typeof mv.lifeAreas === "object" ? mv.lifeAreas : {};

  const recommendedWeekday = MOLDAVITE_ENERGY_WEEKDAY_TH_BY_AREA[primary];
  const secondaryWeekday = MOLDAVITE_ENERGY_WEEKDAY_TH_BY_AREA[secondary];

  let recommendedTimeBand = MOLDAVITE_ENERGY_TIME_BAND_BY_AREA[primary];
  if (ownerAxes && moldaviteOwnerHintsEarlyCycleBand(ownerAxes)) {
    recommendedTimeBand = MORNING_RESET_BAND;
  }

  const fitN =
    ownerFitScore != null && Number.isFinite(Number(ownerFitScore))
      ? Number(ownerFitScore)
      : 70;
  const ritualMode = moldaviteRitualModeFromOwnerFit(fitN);

  const baseReason = TIMING_REASON_BY_AREA[primary] || TIMING_REASON_BY_AREA.work;
  const scoresClose =
    primary !== secondary &&
    lifeAreaScoresClose(primary, secondary, la, 6);
  let timingReason = baseReason;
  if (scoresClose) {
    timingReason = `${baseReason} เด่น${recommendedWeekday} และเสริมได้ใน${secondaryWeekday}`;
  }

  return {
    recommendedWeekday,
    recommendedTimeBand,
    ritualMode,
    timingReason: thaiNoEmDash(timingReason),
    nativeIdentity: MOLDAVITE_NATIVE_IDENTITY_CHANGE_ACCELERATION,
  };
}

