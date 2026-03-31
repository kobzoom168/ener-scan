/**
 * Object Energy Engine v1 + Star Mapping v1 (deterministic).
 */

import {
  CONDITION_CLASS_PROFILE,
  DOMINANT_COLOR_PROFILE,
  MATERIAL_FAMILY_PROFILE,
  NEUTRAL_PROFILE,
  OBJECT_ENERGY_FORMULA_VERSION,
  OBJECT_ENERGY_WEIGHTS,
  OBJECT_FAMILY_PROFILE_BASE,
  SHAPE_FAMILY_PROFILE,
  energyScoreLayerProfile,
} from "../config/objectEnergyFormula.config.js";
import { normalizeMainEnergyKey } from "./compatibilityFormula.util.js";

/** @typedef {Record<"balance"|"protection"|"authority"|"compassion"|"attraction", number>} EnergyProfile */
/** @typedef {Record<"balance"|"protection"|"authority"|"compassion"|"attraction", number>} EnergyStars */

export const ENERGY_DIMENSION_KEYS = /** @type {const} */ ([
  "balance",
  "protection",
  "authority",
  "compassion",
  "attraction",
]);

/** Thai labels used by Flex star rows (matches FLEX_DIMENSION_TIE_ORDER display). */
export const FLEX_THAI_LABEL_BY_DIMENSION = {
  protection: "คุ้มกัน",
  balance: "สมดุล",
  authority: "อำนาจ",
  compassion: "เมตตา",
  attraction: "ดึงดูด",
};

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Star Mapping v1: score 0–100 → 1–5 stars.
 * @param {number} score
 * @returns {number}
 */
export function scoreToStars(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return 3;
  const x = clamp(Math.round(s), 0, 100);
  if (x < 30) return 1;
  if (x < 45) return 2;
  if (x < 65) return 3;
  if (x < 85) return 4;
  return 5;
}

/**
 * @param {Partial<EnergyProfile> & Record<string, number>} profile
 * @returns {EnergyStars}
 */
export function buildEnergyStars(profile) {
  /** @type {EnergyStars} */
  const out = {
    balance: 3,
    protection: 3,
    authority: 3,
    compassion: 3,
    attraction: 3,
  };
  for (const k of ENERGY_DIMENSION_KEYS) {
    const v = profile[k];
    out[k] = scoreToStars(
      v != null && Number.isFinite(Number(v)) ? Number(v) : 50,
    );
  }
  return out;
}

/**
 * Flex `summary.scanDimensions`: Thai keys → star count 1–5.
 * @param {EnergyStars} stars
 * @returns {Record<string, number>}
 */
export function scanDimensionsFromObjectEnergyStars(stars) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of ENERGY_DIMENSION_KEYS) {
    const th = FLEX_THAI_LABEL_BY_DIMENSION[k];
    const v = stars[k];
    out[th] =
      v != null && Number.isFinite(Number(v))
        ? clamp(Math.round(Number(v)), 1, 5)
        : 3;
  }
  return out;
}

/**
 * @param {string} key
 * @returns {Record<string, number>}
 */
function lookupProfile(table, key) {
  const k = String(key || "")
    .trim()
    .toLowerCase();
  if (!k || !table[k]) return { ...NEUTRAL_PROFILE };
  return { ...table[k] };
}

/**
 * Weighted blend of layer profiles.
 * @param {Record<string, Record<string, number>>} layers
 */
function blendWeighted(layers) {
  /** @type {EnergyProfile} */
  const out = {
    balance: 0,
    protection: 0,
    authority: 0,
    compassion: 0,
    attraction: 0,
  };
  for (const dim of ENERGY_DIMENSION_KEYS) {
    let sum = 0;
    for (const [layerName, w] of Object.entries(OBJECT_ENERGY_WEIGHTS)) {
      const prof = layers[layerName];
      const v = prof?.[dim];
      sum += w * (Number.isFinite(Number(v)) ? Number(v) : 50);
    }
    out[dim] = Math.round(clamp(sum, 0, 100));
  }
  return out;
}

/**
 * Pull profile toward neutral when object-check confidence is low.
 * @param {EnergyProfile} profile
 * @param {number} conf01
 */
function dampenByObjectCheckConfidence(profile, conf01) {
  const c = clamp(Number(conf01), 0, 1);
  const mix = 0.35 + 0.65 * c;
  /** @type {EnergyProfile} */
  const out = { ...profile };
  for (const dim of ENERGY_DIMENSION_KEYS) {
    const v = out[dim];
    out[dim] = Math.round(
      clamp(NEUTRAL_PROFILE[dim] + (v - NEUTRAL_PROFILE[dim]) * mix, 0, 100),
    );
  }
  return out;
}

/**
 * Optional hint from main energy label: small nudge (does not override deterministic core).
 */
function applyMainEnergyHint(profile, mainEnergyLabel) {
  const key = normalizeMainEnergyKey(String(mainEnergyLabel || ""), "balance");
  /** @type {Partial<Record<keyof EnergyProfile, number>>} */
  const bump = {
    balance: 0,
    protection: 0,
    authority: 0,
    compassion: 0,
    attraction: 0,
  };
  if (key === "balance") bump.balance = 4;
  else if (key === "protection") bump.protection = 4;
  else if (key === "authority") bump.authority = 4;
  else if (key === "compassion") bump.compassion = 4;
  else if (key === "wealth") bump.attraction = 4;
  else if (key === "wisdom") {
    bump.balance = 2;
    bump.authority = 2;
  }

  /** @type {EnergyProfile} */
  const out = { ...profile };
  for (const dim of ENERGY_DIMENSION_KEYS) {
    out[dim] = clamp(out[dim] + (bump[dim] ?? 0), 0, 100);
  }
  return out;
}

/**
 * Dominant dimension from profile (max score; tie-break: protection → … → attraction).
 */
function dominantDimensionKey(profile) {
  const tieBreak = [
    "protection",
    "balance",
    "authority",
    "compassion",
    "attraction",
  ];
  let maxScore = -1;
  for (const k of ENERGY_DIMENSION_KEYS) {
    maxScore = Math.max(maxScore, profile[k]);
  }
  for (const k of tieBreak) {
    if (profile[k] === maxScore) return k;
  }
  return "balance";
}

/**
 * @typedef {Object} ObjectEnergyV1Input
 * @property {string} [objectFamily]
 * @property {string} [materialFamily]
 * @property {string} [dominantColor]
 * @property {string} [conditionClass]
 * @property {string} [shapeFamily]
 * @property {number} [energyScore]
 * @property {string} [mainEnergy]
 * @property {string} [objectCheckResult]
 * @property {number} [objectCheckConfidence] — 0–1
 */

/**
 * Overall confidence 0–1: more known signals + optional check confidence.
 */
function computeOverallConfidence(input, usedNeutralLayers) {
  let c = 0.42;
  const signals = [
    input.objectFamily,
    input.materialFamily,
    input.dominantColor,
    input.conditionClass,
    input.shapeFamily,
  ].filter((s) => String(s || "").trim().length > 0);
  c += Math.min(0.4, signals.length * 0.08);
  c -= Math.min(0.2, usedNeutralLayers * 0.04);

  const occ = input.objectCheckConfidence;
  if (occ != null && Number.isFinite(Number(occ))) {
    c = c * (0.55 + 0.45 * clamp(Number(occ), 0, 1));
  }

  return clamp(c, 0.28, 0.96);
}

/**
 * @param {ObjectEnergyV1Input} input
 */
export function computeObjectEnergyV1(input) {
  const objectFamily = String(input.objectFamily || "generic")
    .trim()
    .toLowerCase();
  const materialFamily = String(input.materialFamily || "")
    .trim()
    .toLowerCase();
  const dominantColor = String(input.dominantColor || "")
    .trim()
    .toLowerCase();
  const conditionClass = String(input.conditionClass || "")
    .trim()
    .toLowerCase();
  const shapeFamily = String(input.shapeFamily || "")
    .trim()
    .toLowerCase();

  let usedNeutralLayers = 0;
  const objProf = lookupProfile(OBJECT_FAMILY_PROFILE_BASE, objectFamily);
  if (!OBJECT_FAMILY_PROFILE_BASE[objectFamily]) usedNeutralLayers += 1;

  const matProf = materialFamily
    ? lookupProfile(MATERIAL_FAMILY_PROFILE, materialFamily)
    : { ...NEUTRAL_PROFILE };
  if (materialFamily && !MATERIAL_FAMILY_PROFILE[materialFamily])
    usedNeutralLayers += 1;
  if (!materialFamily) usedNeutralLayers += 1;

  const colProf = dominantColor
    ? lookupProfile(DOMINANT_COLOR_PROFILE, dominantColor)
    : { ...NEUTRAL_PROFILE };
  if (dominantColor && !DOMINANT_COLOR_PROFILE[dominantColor])
    usedNeutralLayers += 1;
  if (!dominantColor) usedNeutralLayers += 1;

  const condProf = conditionClass
    ? lookupProfile(CONDITION_CLASS_PROFILE, conditionClass)
    : { ...NEUTRAL_PROFILE };
  if (conditionClass && !CONDITION_CLASS_PROFILE[conditionClass])
    usedNeutralLayers += 1;
  if (!conditionClass) usedNeutralLayers += 1;

  const shapeProf = shapeFamily
    ? lookupProfile(SHAPE_FAMILY_PROFILE, shapeFamily)
    : { ...NEUTRAL_PROFILE };
  if (shapeFamily && !SHAPE_FAMILY_PROFILE[shapeFamily])
    usedNeutralLayers += 1;
  if (!shapeFamily) usedNeutralLayers += 1;

  const energyProf = energyScoreLayerProfile(input.energyScore ?? 5);

  let profile = blendWeighted({
    objectFamily: objProf,
    materialFamily: matProf,
    dominantColor: colProf,
    conditionClass: condProf,
    shapeFamily: shapeProf,
    energyScore: energyProf,
  });

  profile = applyMainEnergyHint(profile, input.mainEnergy);

  const occ = input.objectCheckConfidence;
  if (occ != null && Number.isFinite(Number(occ))) {
    profile = dampenByObjectCheckConfidence(profile, Number(occ));
  }

  const stars = buildEnergyStars(profile);
  const domKey = dominantDimensionKey(profile);
  const mainEnergyResolved = {
    key: domKey,
    labelThai: FLEX_THAI_LABEL_BY_DIMENSION[domKey] || domKey,
  };

  const confidence = computeOverallConfidence(input, usedNeutralLayers);

  return {
    formulaVersion: OBJECT_ENERGY_FORMULA_VERSION,
    profile,
    stars,
    mainEnergyResolved,
    confidence,
    inputs: {
      objectFamily: objectFamily || "generic",
      materialFamily: materialFamily || null,
      dominantColor: dominantColor || null,
      conditionClass: conditionClass || null,
      shapeFamily: shapeFamily || null,
      energyScore:
        input.energyScore != null && Number.isFinite(Number(input.energyScore))
          ? Number(input.energyScore)
          : null,
      mainEnergyKey: normalizeMainEnergyKey(String(input.mainEnergy || ""), "balance"),
      objectCheckResult:
        input.objectCheckResult != null
          ? String(input.objectCheckResult).trim() || null
          : null,
      objectCheckConfidence:
        occ != null && Number.isFinite(Number(occ)) ? clamp(Number(occ), 0, 1) : null,
    },
  };
}
