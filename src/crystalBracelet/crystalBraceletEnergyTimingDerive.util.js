import {
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
  CRYSTAL_BRACELET_AXIS_ORDER,
} from "./crystalBraceletScores.util.js";

/** วันหลักตามแกนพลังกำไล */
export const CRYSTAL_BRACELET_WEEKDAY_TH_BY_AXIS = {
  career: "วันจันทร์",
  money: "วันพุธ",
  luck: "วันพฤหัสบดี",
  charm_attraction: "วันศุกร์",
  love: "วันศุกร์",
  intuition: "วันจันทร์",
};

/** ช่วงเวลาเริ่มต้นตามแกนหลัก */
export const CRYSTAL_BRACELET_TIME_BAND_BY_AXIS = {
  career: "08:00-10:59",
  money: "10:00-12:59",
  luck: "12:00-14:59",
  charm_attraction: "18:00-20:59",
  love: "19:00-21:59",
  intuition: "05:00-07:59",
};

/** ช่วงเวลาเมื่อ owner fit ต่ำ — เน้นสงบกว่า */
const QUIET_TIME_BAND_BY_AXIS = {
  career: "07:00-09:59",
  money: "08:00-10:59",
  luck: "10:00-12:59",
  charm_attraction: "16:00-18:59",
  love: "17:00-19:59",
  intuition: "05:00-07:59",
};

const MORNING_SUBTLE_BAND = "05:00-07:59";

const TIMING_REASON_BASE = {
  career:
    "จังหวะแบบวันจันทร์ช่วงเช้าเหมาะกับการตั้งหลัก ลงมือ และจัดลำดับสิ่งที่ต้องทำให้ชัด",
  money:
    "จังหวะแบบวันพุธช่วยหนุนเรื่องการเงิน การจัดการรายรับ และการมองผลตอบแทนให้เป็นระบบ",
  luck:
    "จังหวะแบบวันพฤหัสบดีเหมาะกับการเปิดทาง รับโอกาส และเรื่องที่เข้ามาแบบไม่คาดคิด",
  charm_attraction:
    "จังหวะแบบวันศุกร์ช่วงเย็นเหมาะกับแรงดึงดูด ภาพลักษณ์ และการทำให้คนรอบตัวเปิดรับพลังของคุณมากขึ้น",
  love:
    "จังหวะแบบวันศุกร์ช่วงค่ำเหมาะกับเรื่องความรัก ความสัมพันธ์ และการสื่อสารที่ต้องการความรู้สึกเชื่อมโยง",
  intuition:
    "จังหวะแบบเช้าตรู่เหมาะกับการนิ่งพอจะรับสัญญาณและตัดสินใจจากความรู้สึกได้ชัดขึ้น",
};

const RITUAL_NUANCE_BY_AXIS = {
  career: "เน้นตั้งเป้าของวันให้ชัด",
  money: "เน้นตั้งเจตนาเรื่องการจัดการและโอกาส",
  luck: "เน้นเปิดรับจังหวะที่เข้ามา",
  charm_attraction: "เน้นตั้งภาพลักษณ์และแรงดึงดูดที่อยากสื่อ",
  love: "เน้นตั้งใจเรื่องความสัมพันธ์หรือการสื่อสาร",
  intuition: "เน้นใจนิ่ง รับสัญญาณ ไม่ฝืน",
};

/** @param {string} s */
function thaiClean(s) {
  return String(s || "")
    .replace(/\u2014/g, " · ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** @param {unknown} k */
function normalizeAxisKey(k) {
  const s = String(k || "").trim();
  if (CRYSTAL_BRACELET_AXIS_ORDER.includes(s)) return s;
  return "career";
}

/**
 * @param {unknown} op
 * @returns {{ signalSensitive: boolean, execution: boolean, social: boolean }}
 */
function ownerProfileHints(op) {
  const parts = [];
  if (op && typeof op === "object") {
    parts.push(String(op.identityPhrase || ""));
    if (Array.isArray(op.ownerChips)) {
      for (const c of op.ownerChips) parts.push(String(c || ""));
    }
  }
  const text = parts.join(" ");
  return {
    signalSensitive:
      /สัญญาณ|เซ้นส์|ความรู้สึก|ไวต่อ|รับรู้|รับสัญญาณ/.test(text),
    execution: /ลงมือ|โครงสร้าง|ลำดับ|ชัดเจน|จัดการ|ขยับ|โฟกัส/.test(text),
    social:
      /ความสัมพันธ์|เชื่อมโยง|รอบตัว|ดึงดูด|เข้าหา|สื่อสาร/.test(text),
  };
}

/**
 * @param {number|null|undefined} ownerFitScore
 * @param {string} primaryAxis
 * @returns {string}
 */
export function crystalBraceletRitualModeFromOwnerFit(
  ownerFitScore,
  primaryAxis,
) {
  const p = normalizeAxisKey(primaryAxis);
  const fit =
    ownerFitScore != null && Number.isFinite(Number(ownerFitScore))
      ? Number(ownerFitScore)
      : 70;
  const nuance = RITUAL_NUANCE_BY_AXIS[p] || RITUAL_NUANCE_BY_AXIS.career;
  let base;
  if (fit >= 80) {
    base = "ตั้งจิตสั้น 1 ประโยคก่อนใส่ เพื่อรวมเจตนาให้ชัด";
  } else if (fit >= 65) {
    base =
      "ตั้งเจตนา 1 เรื่องก่อนใช้ แล้วใส่ต่อเนื่องในช่วงเวลาที่แนะนำ";
  } else {
    base =
      "ใช้แบบใจนิ่งและค่อย ๆ สังเกตจังหวะ ไม่ต้องเร่งให้เกิดผลทันที";
  }
  if (fit < 65) {
    return thaiClean(`${base} (${nuance})`);
  }
  return thaiClean(`${base} · ${nuance}`);
}

/**
 * @param {string} primary
 * @param {number} fit
 * @param {ReturnType<typeof ownerProfileHints>} hints
 */
function resolveTimeBand(primary, fit, hints) {
  let band =
    CRYSTAL_BRACELET_TIME_BAND_BY_AXIS[primary] ||
    CRYSTAL_BRACELET_TIME_BAND_BY_AXIS.career;

  if (
    hints.signalSensitive &&
    (primary === "intuition" || primary === "money")
  ) {
    band = MORNING_SUBTLE_BAND;
  }
  if (hints.execution && (primary === "career" || primary === "money")) {
    if (primary === "career") {
      band = "08:00-10:59";
    } else if (primary === "money" && band !== MORNING_SUBTLE_BAND) {
      band = "10:00-12:59";
    }
  }
  if (hints.social && (primary === "love" || primary === "charm_attraction")) {
    if (primary === "love") band = "19:00-21:59";
    else band = "18:00-20:59";
  }

  if (fit < 65) {
    band = QUIET_TIME_BAND_BY_AXIS[primary] || band;
  }

  return band;
}

/**
 * @param {object} input
 * @param {{ stoneScores: Record<string, number> }} input.bracelet
 * @param {object|null|undefined} input.ownerProfile
 * @param {number|null|undefined} input.ownerFitScore
 * @param {string} input.primaryAxis
 * @param {string} input.secondaryAxis
 * @param {string} input.alignmentAxisKey
 * @returns {{
 *   recommendedWeekday: string,
 *   recommendedTimeBand: string,
 *   ritualMode: string,
 *   timingReason: string,
 *   timingModeKey: string,
 * }}
 */
export function deriveCrystalBraceletEnergyTimingV1(input) {
  const stoneScores =
    input?.bracelet?.stoneScores && typeof input.bracelet.stoneScores === "object"
      ? input.bracelet.stoneScores
      : {};
  const ownerProfile = input?.ownerProfile;
  const fitRaw = input?.ownerFitScore;
  const fit =
    fitRaw != null && Number.isFinite(Number(fitRaw)) ? Number(fitRaw) : 70;

  const primary = normalizeAxisKey(input?.primaryAxis);
  const secondary = normalizeAxisKey(input?.secondaryAxis);
  const alignmentAxisKey = normalizeAxisKey(input?.alignmentAxisKey);

  const recommendedWeekday =
    CRYSTAL_BRACELET_WEEKDAY_TH_BY_AXIS[primary] || "วันจันทร์";
  const secondaryWeekday =
    CRYSTAL_BRACELET_WEEKDAY_TH_BY_AXIS[secondary] || recommendedWeekday;

  const hints = ownerProfileHints(ownerProfile);
  const recommendedTimeBand = resolveTimeBand(primary, fit, hints);

  const ritualMode = crystalBraceletRitualModeFromOwnerFit(fit, primary);

  let timingReason =
    TIMING_REASON_BASE[primary] || TIMING_REASON_BASE.career;

  const pScore = Number(stoneScores[primary]) || 0;
  const sScore = Number(stoneScores[secondary]) || 0;
  const scoresClose =
    primary !== secondary && Math.abs(pScore - sScore) <= 4;

  const secLabel =
    CRYSTAL_BRACELET_AXIS_LABEL_THAI[secondary] || secondary;
  if (scoresClose) {
    if (secondaryWeekday === recommendedWeekday) {
      if (primary === "love" && secondary === "charm_attraction") {
        timingReason = `${timingReason} เด่น${recommendedWeekday} โดยเฉพาะงานที่ต้องใช้แรงดึงดูดและความรู้สึกเชื่อมโยง`;
      } else if (primary === "money" && secondary === "luck") {
        timingReason = `${timingReason} เด่นวันพุธ และเสริมได้ดีในวันพฤหัสบดีเมื่อพลังโชคตามมาใกล้`;
      } else if (primary === "charm_attraction" && secondary === "love") {
        timingReason = `${timingReason} เด่น${recommendedWeekday} โดยเฉพาะงานที่ต้องใช้แรงดึงดูดและความรู้สึกเชื่อมโยง`;
      } else {
        timingReason = `${timingReason} พลัง${secLabel}ตามมาใกล้ จึงเสริมจังหวะเดียวกันใน${recommendedWeekday}ได้ดี`;
      }
    } else {
      timingReason = `${timingReason} และเพราะพลังรองของเส้นนี้ตามมาใกล้กัน จึงเสริมต่อได้ดีใน${secondaryWeekday}`;
    }
  }

  if (alignmentAxisKey === primary) {
    timingReason = `${timingReason} ในช่วงนี้จังหวะของคุณใกล้เคียงแกนหลักของกำไล จึงใช้แบบตรง ๆ ได้ค่อนข้างสบาย`;
  } else {
    timingReason = `${timingReason} แกนที่เข้ากับจังหวะคุณมากที่สุดยังไม่ตรงกับแกนหลักของกำไล แนะนำให้ค่อย ๆ จูนและสังเกตผล ไม่ฝืน`;
  }

  return {
    recommendedWeekday,
    recommendedTimeBand,
    ritualMode,
    timingReason: thaiClean(timingReason),
    timingModeKey: `bracelet_v1_${primary}`,
  };
}
