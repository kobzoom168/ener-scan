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
  if (s.includes("ปกป้อง") || s.includes("คุ้มครอง")) return ENERGY_TYPES.PROTECT;
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

export function getEnergyCopyBlock(energyType) {
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

export function getSummaryPair(energyType, tier) {
  const block = getEnergyCopyBlock(energyType);
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

export function pickFeel(energyType, tier, personality) {
  const block = getEnergyCopyBlock(energyType);
  const base = getTierTraitLine(
    block.traits?.feel,
    tier,
    getTierTraitLine(DEFAULT_COPY.traits.feel, tier, ""),
  );
  const s = cleanLine(stripBullet(personality));
  if (s && s !== "-" && (/นิ่ง|สงบ|เย็น/.test(s) || /ใจไม่วอกแวก/.test(s))) {
    return (
      capTrait("ช่วยให้ใจเย็นและสงบขึ้น", CAP_FEEL) ||
      capTrait(base, CAP_FEEL)
    );
  }
  if (s && s !== "-" && /มั่นใจ|กล้า/.test(s)) {
    return (
      capTrait("ช่วยให้กล้าเผชิญหน้าเรื่องสำคัญมากขึ้น", CAP_FEEL) ||
      capTrait(base, CAP_FEEL)
    );
  }
  return capTrait(base, CAP_FEEL);
}

export function pickUseCase(energyType, tier, tone) {
  const block = getEnergyCopyBlock(energyType);
  const base = getTierTraitLine(
    block.traits?.useCase,
    tier,
    getTierTraitLine(DEFAULT_COPY.traits.useCase, tier, ""),
  );
  const s = cleanLine(stripBullet(tone));
  if (s && s !== "-" && /ตัดสินใจ|ประชุม|งาน|เดินทาง|สังคม/.test(s)) {
    if (/ตัดสินใจ/.test(s)) {
      return capTrait("เหมาะกับเวลาที่ต้องตัดสินใจ", CAP_USE);
    }
    if (/ประชุม|นำทีม/.test(s)) {
      return capTrait("เหมาะกับการประชุมหรือเจรจา", CAP_USE);
    }
  }
  return capTrait(base, CAP_USE);
}

export function pickEffect(energyType, tier, hidden) {
  const block = getEnergyCopyBlock(energyType);
  const base = getTierTraitLine(
    block.traits?.effect,
    tier,
    getTierTraitLine(DEFAULT_COPY.traits.effect, tier, ""),
  );
  const s = cleanLine(stripBullet(hidden));
  if (s && s !== "-" && /มั่นใจ|อดทน|หลัก|ภูมิ|ตั้งใจ/.test(s)) {
    if (/อดทน|ภูมิ/.test(s)) {
      return capTrait("ทำให้อดทนและยืนหยัดได้ดีขึ้น", CAP_EFFECT);
    }
    if (/มั่นใจ|ตั้งใจ|หลักใจ/.test(s)) {
      return capTrait("ทำให้มั่นใจและตั้งใจมั่นขึ้น", CAP_EFFECT);
    }
  }
  return capTrait(base, CAP_EFFECT);
}
