/**
 * Deterministic compatibility v1 — lookup tables only.
 * @module compatibilityFormula.config
 */

/** @type {Record<number, string>} lifePath (1–9) → element */
export const LIFE_PATH_TO_ELEMENT = {
  1: "fire",
  2: "water",
  3: "wood",
  4: "wood",
  5: "earth",
  6: "metal",
  7: "water",
  8: "earth",
  9: "fire",
};

/** material → element (preferred for object element) */
export const MATERIAL_TO_ELEMENT = {
  powder: "earth",
  clay: "earth",
  stone: "earth",
  metal: "metal",
  wood: "wood",
  herb: "wood",
  shell: "water",
  liquid: "water",
  crystal: "water",
  fire: "fire",
};

/** object family slug → element (fallback when material missing) */
export const OBJECT_FAMILY_TO_ELEMENT = {
  somdej: "earth",
  pidta: "earth",
  kruangrang: "metal",
  hanuman: "fire",
  krut: "fire",
  crystal: "water",
  takrud: "metal",
};

/**
 * ownerElement × objectElement → score 0–100
 * @type {Record<string, Record<string, number>>}
 */
export const ELEMENT_MATRIX = {
  fire: {
    fire: 78,
    earth: 92,
    metal: 58,
    water: 42,
    wood: 84,
  },
  earth: {
    fire: 84,
    earth: 78,
    metal: 92,
    water: 58,
    wood: 42,
  },
  metal: {
    fire: 42,
    earth: 84,
    metal: 78,
    water: 92,
    wood: 58,
  },
  water: {
    fire: 58,
    earth: 42,
    metal: 84,
    water: 78,
    wood: 92,
  },
  wood: {
    fire: 92,
    earth: 58,
    metal: 42,
    water: 84,
    wood: 78,
  },
};

/** main energy key → preferred number groups */
export const MAIN_ENERGY_TO_NUMBER_GROUP = {
  balance: [2, 5, 6],
  compassion: [2, 6, 9],
  authority: [1, 8, 9],
  protection: [4, 7, 9],
  wealth: [3, 6, 8],
  wisdom: [4, 5, 7],
};

export const OBJECT_FAMILY_BASE = {
  somdej: 88,
  pidta: 82,
  hanuman: 84,
  krut: 86,
  crystal: 76,
  takrud: 80,
  generic: 65,
};

export const SHAPE_BONUS = {
  rectangular: 8,
  seated: 6,
  round: 4,
  pointed: 5,
  unknown: 0,
};

export const MAIN_ENERGY_BONUS = {
  balance: 8,
  compassion: 7,
  protection: 6,
  authority: 6,
  wisdom: 5,
  wealth: 5,
};

/** @type {Record<string, Record<string, number>>} */
export const CONTEXT_MATRIX = {
  balance: {
    deep_night: 72,
    morning: 80,
    active_day: 74,
    settling: 88,
    quiet_evening: 84,
  },
  compassion: {
    deep_night: 74,
    morning: 78,
    active_day: 72,
    settling: 86,
    quiet_evening: 88,
  },
  authority: {
    deep_night: 60,
    morning: 82,
    active_day: 88,
    settling: 74,
    quiet_evening: 66,
  },
  protection: {
    deep_night: 78,
    morning: 74,
    active_day: 76,
    settling: 82,
    quiet_evening: 86,
  },
  wealth: {
    deep_night: 62,
    morning: 80,
    active_day: 84,
    settling: 76,
    quiet_evening: 70,
  },
  wisdom: {
    deep_night: 82,
    morning: 84,
    active_day: 68,
    settling: 80,
    quiet_evening: 88,
  },
};

export const COMPATIBILITY_FORMULA_VERSION = "compatibility_v1";

/** Same factor weights as v1, but scan time for number/context layers is derived from stable object+owner fingerprint (not wall-clock). */
export const COMPATIBILITY_FORMULA_VERSION_STABLE = "compatibility_v1_stable";
