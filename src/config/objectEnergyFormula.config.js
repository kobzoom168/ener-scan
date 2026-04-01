/**
 * Object Energy Engine v1 — table-driven profiles (5 dimensions each).
 * Dimensions: balance, protection, authority, compassion, attraction (0–100).
 * @module objectEnergyFormula.config
 */

export const OBJECT_ENERGY_FORMULA_VERSION = "object_energy_v1";

/** Blend weights (sum = 1). Tweak here to rebalance the engine. */
export const OBJECT_ENERGY_WEIGHTS = {
  objectFamily: 0.35,
  materialFamily: 0.2,
  dominantColor: 0.15,
  conditionClass: 0.15,
  shapeFamily: 0.1,
  energyScore: 0.05,
};

/** When a lookup key is missing: no directional bias. */
export const NEUTRAL_PROFILE = /** @type {EnergyProfile} */ ({
  balance: 50,
  protection: 50,
  authority: 50,
  compassion: 50,
  attraction: 50,
});

/**
 * Base object archetype (Somdej / Hanuman / …).
 * @type {Record<string, Record<string, number>>}
 */
export const OBJECT_FAMILY_PROFILE_BASE = {
  generic: {
    balance: 52,
    protection: 50,
    authority: 48,
    compassion: 50,
    attraction: 48,
  },
  somdej: {
    balance: 64,
    protection: 58,
    authority: 52,
    compassion: 62,
    attraction: 46,
  },
  pidta: {
    balance: 58,
    protection: 62,
    authority: 48,
    compassion: 56,
    attraction: 44,
  },
  hanuman: {
    balance: 50,
    protection: 54,
    authority: 66,
    compassion: 52,
    attraction: 52,
  },
  krut: {
    balance: 48,
    protection: 56,
    authority: 64,
    compassion: 50,
    attraction: 58,
  },
  crystal: {
    balance: 58,
    protection: 50,
    authority: 46,
    compassion: 54,
    attraction: 58,
  },
  takrud: {
    balance: 54,
    protection: 58,
    authority: 60,
    compassion: 48,
    attraction: 52,
  },
  kruangrang: {
    balance: 52,
    protection: 56,
    authority: 62,
    compassion: 50,
    attraction: 56,
  },
};

/**
 * Material feel (earth / metal / …).
 * @type {Record<string, EnergyProfile>}
 */
export const MATERIAL_FAMILY_PROFILE = {
  unknown: { ...NEUTRAL_PROFILE },
  powder: {
    balance: 58,
    protection: 52,
    authority: 48,
    compassion: 54,
    attraction: 46,
  },
  clay: {
    balance: 56,
    protection: 54,
    authority: 50,
    compassion: 52,
    attraction: 46,
  },
  stone: {
    balance: 52,
    protection: 58,
    authority: 56,
    compassion: 48,
    attraction: 44,
  },
  metal: {
    balance: 48,
    protection: 56,
    authority: 62,
    compassion: 46,
    attraction: 54,
  },
  wood: {
    balance: 56,
    protection: 50,
    authority: 48,
    compassion: 58,
    attraction: 52,
  },
  herb: {
    balance: 54,
    protection: 48,
    authority: 46,
    compassion: 60,
    attraction: 48,
  },
  shell: {
    balance: 52,
    protection: 50,
    authority: 46,
    compassion: 56,
    attraction: 58,
  },
  liquid: {
    balance: 56,
    protection: 52,
    authority: 44,
    compassion: 54,
    attraction: 50,
  },
  crystal: {
    balance: 58,
    protection: 48,
    authority: 44,
    compassion: 52,
    attraction: 62,
  },
  fire: {
    balance: 46,
    protection: 52,
    authority: 60,
    compassion: 48,
    attraction: 58,
  },
};

/**
 * Dominant color signal (amulet / photo heuristic).
 * @type {Record<string, EnergyProfile>}
 */
export const DOMINANT_COLOR_PROFILE = {
  unknown: { ...NEUTRAL_PROFILE },
  gold: {
    balance: 52,
    protection: 54,
    authority: 58,
    compassion: 50,
    attraction: 62,
  },
  yellow: {
    balance: 54,
    protection: 52,
    authority: 56,
    compassion: 52,
    attraction: 58,
  },
  red: {
    balance: 48,
    protection: 58,
    authority: 62,
    compassion: 50,
    attraction: 56,
  },
  black: {
    balance: 56,
    protection: 60,
    authority: 54,
    compassion: 44,
    attraction: 42,
  },
  white: {
    balance: 58,
    protection: 52,
    authority: 48,
    compassion: 58,
    attraction: 48,
  },
  green: {
    balance: 60,
    protection: 50,
    authority: 46,
    compassion: 56,
    attraction: 52,
  },
  blue: {
    balance: 58,
    protection: 54,
    authority: 48,
    compassion: 52,
    attraction: 54,
  },
  brown: {
    balance: 54,
    protection: 56,
    authority: 52,
    compassion: 54,
    attraction: 46,
  },
  /** v1 pixel-histogram slugs (reportPipelineDominantColor.util.js) */
  silver: {
    balance: 54,
    protection: 52,
    authority: 50,
    compassion: 52,
    attraction: 56,
  },
  bronze: {
    balance: 52,
    protection: 54,
    authority: 54,
    compassion: 50,
    attraction: 50,
  },
  orange: {
    balance: 50,
    protection: 52,
    authority: 56,
    compassion: 52,
    attraction: 58,
  },
  purple: {
    balance: 56,
    protection: 50,
    authority: 48,
    compassion: 54,
    attraction: 58,
  },
  pink: {
    balance: 54,
    protection: 48,
    authority: 46,
    compassion: 58,
    attraction: 62,
  },
  gray: {
    balance: 56,
    protection: 54,
    authority: 52,
    compassion: 50,
    attraction: 48,
  },
  mixed: {
    balance: 52,
    protection: 52,
    authority: 52,
    compassion: 52,
    attraction: 52,
  },
};

/**
 * Physical / scan condition class.
 * @type {Record<string, EnergyProfile>}
 */
export const CONDITION_CLASS_PROFILE = {
  unknown: { ...NEUTRAL_PROFILE },
  excellent: {
    balance: 56,
    protection: 54,
    authority: 54,
    compassion: 52,
    attraction: 58,
  },
  good: {
    balance: 54,
    protection: 52,
    authority: 52,
    compassion: 52,
    attraction: 54,
  },
  fair: {
    balance: 52,
    protection: 50,
    authority: 50,
    compassion: 50,
    attraction: 50,
  },
  worn: {
    balance: 50,
    protection: 52,
    authority: 48,
    compassion: 54,
    attraction: 46,
  },
  damaged: {
    balance: 48,
    protection: 50,
    authority: 46,
    compassion: 56,
    attraction: 44,
  },
};

/**
 * Shape family.
 * @type {Record<string, EnergyProfile>}
 */
export const SHAPE_FAMILY_PROFILE = {
  unknown: { ...NEUTRAL_PROFILE },
  rectangular: {
    balance: 58,
    protection: 54,
    authority: 56,
    compassion: 48,
    attraction: 48,
  },
  round: {
    balance: 56,
    protection: 52,
    authority: 48,
    compassion: 54,
    attraction: 54,
  },
  pointed: {
    balance: 48,
    protection: 56,
    authority: 60,
    compassion: 46,
    attraction: 54,
  },
  seated: {
    balance: 54,
    protection: 56,
    authority: 52,
    compassion: 58,
    attraction: 44,
  },
};

/**
 * Layer driven by numeric energy score (0–10): subtle tilt, stays in mid band when signal weak.
 * @param {number} energyScore
 * @returns {EnergyProfile}
 */
export function energyScoreLayerProfile(energyScore) {
  const e = Number(energyScore);
  const x = Number.isFinite(e) ? Math.min(10, Math.max(0, e)) : 5;
  const t = x / 10;
  const base = 44 + t * 20;
  return {
    balance: Math.round(base + 2 * t),
    protection: Math.round(base + 1),
    authority: Math.round(base + 3 * t),
    compassion: Math.round(base - 1 + 2 * t),
    attraction: Math.round(base + 2 * (1 - Math.abs(t - 0.5))),
  };
}
