/**
 * Scan copy resolution: energy type, tier, trait picks, caps.
 * Wording lives in `scanCopy.config.js`.
 */
import {
  CAP_EFFECT,
  CAP_FEEL,
  CAP_USE,
  DEFAULT_COPY,
  ENERGY_COPY,
  ENERGY_TYPES,
  SCORE_TIERS,
} from "./scanCopy.config.js";
import {
  ENERGY_COPY_MYSTIC,
  ENERGY_COPY_MYSTIC_SALES,
} from "./scanCopy.energyByTone.js";
import { SCAN_TONE_LEVEL } from "./scanCopy.toneLevel.js";
import {
  cleanLine,
  sanitizeFlexDisplayText,
  safeThaiCut,
  stripBullet,
} from "./flex.utils.js";

/**
 * @param {string} mainEnergy
 * @returns {string} One of `ENERGY_TYPES` values (Thai key).
 */
export function resolveEnergyType(mainEnergy) {
  const s = cleanLine(mainEnergy);
  if (!s || s === "-") return ENERGY_TYPES.BOOST;
  if (
    s.includes("ปกป้อง") ||
    s.includes("คุ้มครอง") ||
    s.includes("ป้องกัน")
  ) {
    return ENERGY_TYPES.PROTECT;
  }
  if (s.includes("อำนาจ") || s.includes("บารมี")) return ENERGY_TYPES.POWER;
  if (s.includes("โชคลาภ") || s.includes("โชค")) return ENERGY_TYPES.LUCK;
  if (s.includes("สมดุล") || s.includes("นิ่ง")) return ENERGY_TYPES.BALANCE;
  if (s.includes("เมตตา")) return ENERGY_TYPES.KINDNESS;
  if (s.includes("ดึงดูด") || s.includes("เสน่ห์")) return ENERGY_TYPES.ATTRACT;
  return ENERGY_TYPES.BOOST;
}

/**
 * @param {number|null|undefined} numeric
 * @returns {string} One of `SCORE_TIERS` values.
 */
export function resolveScoreTier(numeric) {
  if (numeric == null || !Number.isFinite(numeric)) return SCORE_TIERS.MEDIUM;
  if (numeric >= 7.5) return SCORE_TIERS.HIGH;
  if (numeric >= 5) return SCORE_TIERS.MEDIUM;
  return SCORE_TIERS.LOW;
}

export function fallbackText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/**
 * @param {string} energyType
 * @param {import('./scanCopy.toneLevel.js').ScanToneLevel} [scanToneLevel]
 */
export function getEnergyCopyBlock(energyType, scanToneLevel = SCAN_TONE_LEVEL.STANDARD) {
  if (scanToneLevel === SCAN_TONE_LEVEL.MYSTIC) {
    return (
      ENERGY_COPY_MYSTIC[energyType] ||
      ENERGY_COPY_MYSTIC[ENERGY_TYPES.BOOST]
    );
  }
  if (scanToneLevel === SCAN_TONE_LEVEL.MYSTIC_SALES) {
    return (
      ENERGY_COPY_MYSTIC_SALES[energyType] ||
      ENERGY_COPY_MYSTIC_SALES[ENERGY_TYPES.BOOST]
    );
  }
  return ENERGY_COPY[energyType] || ENERGY_COPY[ENERGY_TYPES.BOOST];
}

/**
 * @param {Record<string, { high?: string, medium?: string, low?: string }>} map
 * @param {string} tier
 * @param {string} fallbackLine
 */
export function getTierTraitLine(map, tier, fallbackLine) {
  if (!map) return fallbackLine;
  return map[tier] || map[SCORE_TIERS.MEDIUM] || fallbackLine;
}

export function getSummaryPair(energyType, tier, scanToneLevel = SCAN_TONE_LEVEL.STANDARD) {
  const block = getEnergyCopyBlock(energyType, scanToneLevel);
  const pair = block.summary?.[tier] || DEFAULT_COPY.summary[tier];
  const fb = DEFAULT_COPY.summary[SCORE_TIERS.MEDIUM];
  const line1 = pair?.[0] ?? fb[0];
  const line2 = pair?.[1] ?? fb[1];
  return [line1, line2];
}

function capTrait(s, maxLen) {
  const t = cleanLine(s);
  if (!t) return "";
  if (t.length <= maxLen) return sanitizeFlexDisplayText(t);
  return sanitizeFlexDisplayText(safeThaiCut(t, maxLen));
}

export function pickFeel(energyType, tier, personality, scanToneLevel = SCAN_TONE_LEVEL.STANDARD) {
  const block = getEnergyCopyBlock(energyType, scanToneLevel);
  const base = getTierTraitLine(
    block.traits?.feel,
    tier,
    getTierTraitLine(DEFAULT_COPY.traits.feel, tier, ""),
  );
  const s = cleanLine(stripBullet(personality));
  if (s && s !== "-" && (/นิ่ง|สงบ|เย็น/.test(s) || /ใจไม่วอกแวก/.test(s))) {
    return (
      capTrait("ใจเย็นและตั้งหลักขึ้นในโทนนิ่ง ๆ", CAP_FEEL) ||
      capTrait(base, CAP_FEEL)
    );
  }
  if (s && s !== "-" && /มั่นใจ|กล้า/.test(s)) {
    return (
      capTrait("ใจกล้าและตั้งหลักขึ้นในระดับพอดี", CAP_FEEL) ||
      capTrait(base, CAP_FEEL)
    );
  }
  return capTrait(base, CAP_FEEL);
}

/** Middle trait slot: received signal in the body — not situations (those belong in Bubble 3). */
export function pickUseCase(energyType, tier, tone, scanToneLevel = SCAN_TONE_LEVEL.STANDARD) {
  const block = getEnergyCopyBlock(energyType, scanToneLevel);
  const base = getTierTraitLine(
    block.traits?.useCase,
    tier,
    getTierTraitLine(DEFAULT_COPY.traits.useCase, tier, ""),
  );
  const s = cleanLine(stripBullet(tone));
  if (s && s !== "-" && /ตัดสินใจ|ประชุม|งาน|เดินทาง|สังคม/.test(s)) {
    if (/ตัดสินใจ/.test(s)) {
      return capTrait("ใจนิ่งพอตัดสินใจได้ชัดขึ้น", CAP_USE);
    }
    if (/ประชุม|นำทีม/.test(s)) {
      return capTrait("ถือตัวตรงและน่าเชื่อถือขึ้นในใจ", CAP_USE);
    }
  }
  return capTrait(base, CAP_USE);
}

export function pickEffect(energyType, tier, hidden, scanToneLevel = SCAN_TONE_LEVEL.STANDARD) {
  const block = getEnergyCopyBlock(energyType, scanToneLevel);
  const base = getTierTraitLine(
    block.traits?.effect,
    tier,
    getTierTraitLine(DEFAULT_COPY.traits.effect, tier, ""),
  );
  const s = cleanLine(stripBullet(hidden));
  if (s && s !== "-" && /มั่นใจ|อดทน|หลัก|ภูมิ|ตั้งใจ/.test(s)) {
    if (/อดทน|ภูมิ/.test(s)) {
      return capTrait("อดทนและยืนหยัดได้ดีขึ้นในแกนใจ", CAP_EFFECT);
    }
    if (/มั่นใจ|ตั้งใจ|หลักใจ/.test(s)) {
      return capTrait("ตั้งใจมั่นและนิ่งขึ้นในการลงมือ", CAP_EFFECT);
    }
  }
  return capTrait(base, CAP_EFFECT);
}
