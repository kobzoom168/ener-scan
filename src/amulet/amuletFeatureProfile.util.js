/**
 * Angle-robust amulet feature handling for locality-sensitive 6-axis scoring (B + A foundation).
 *
 * Goal: the same physical object photographed from different angles should produce nearly
 * identical scores. Two ideas:
 *  - (B) Canonicalize the fragile vision slugs into a small, stable signal set. Drop the most
 *    angle/lighting-sensitive field (textureHint) from the scoring + seed, and bucket raw colors
 *    into coarse families so lighting shifts (gold↔yellow, silver↔white) do not flip the signal.
 *  - (A) Map each canonical slug to small ADDITIVE per-axis contributions. A single flipped slug
 *    then moves scores by a bounded amount instead of avalanche-rerolling the whole vector
 *    (the failure mode of hashing the concatenated slugs with FNV-1a).
 */

import { fnv1a32 } from "./amuletScores.util.js";

/** @typedef {"protection"|"metta"|"baramee"|"luck"|"fortune_anchor"|"specialty"} AmuletPowerKey */

export const AMULET_AXES = /** @type {const} */ ([
  "protection",
  "metta",
  "baramee",
  "luck",
  "fortune_anchor",
  "specialty",
]);

/**
 * @param {unknown} v
 * @returns {string}
 */
function slug(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/** Raw color slug → coarse, lighting-tolerant bucket. */
const COLOR_BUCKET = {
  gold: "warm_metal",
  yellow: "warm_metal",
  brass: "warm_metal",
  silver: "cool_metal",
  white: "cool_metal",
  gray: "cool_metal",
  grey: "cool_metal",
  brown: "earth",
  bronze: "earth",
  clay: "earth",
  black: "dark",
  red: "red",
  orange: "warm_metal",
  green: "green",
  blue: "blue",
  purple: "purple",
  mixed: "mixed",
};

/** Material synonyms → canonical material. */
const MATERIAL_CANON = {
  thai_amulet: "thai_amulet",
  brass: "brass",
  bronze: "bronze",
  clay: "clay",
  moldavite: "moldavite",
  quartz: "quartz",
  amethyst: "amethyst",
  obsidian: "obsidian",
  jade: "jade",
  agate: "agate",
  tiger_eye: "tiger_eye",
  mixed_crystal: "mixed_crystal",
};

/** Form factor synonyms → canonical (amulet shapes collapse to coarse buckets). */
const FORM_CANON = {
  amulet_coin: "coin",
  coin: "coin",
  amulet_figure: "figure",
  figure: "figure",
  pendant: "pendant",
  necklace: "pendant",
  bracelet: "bracelet",
  ring: "ring",
  loose_stone: "loose_stone",
};

/**
 * @param {{ primaryColor?: string, materialType?: string, formFactor?: string, textureHint?: string }|null|undefined} features
 * @returns {{ materialType: string, formFactor: string, colorBucket: string }}
 */
export function normalizeAmuletFeatures(features) {
  const f = features && typeof features === "object" ? features : {};
  const materialRaw = slug(f.materialType);
  const formRaw = slug(f.formFactor);
  const colorRaw = slug(f.primaryColor);

  return {
    materialType: MATERIAL_CANON[materialRaw] || (materialRaw && materialRaw !== "unknown" ? materialRaw : "unknown"),
    formFactor: FORM_CANON[formRaw] || (formRaw && formRaw !== "unknown" ? formRaw : "unknown"),
    colorBucket: COLOR_BUCKET[colorRaw] || (colorRaw && colorRaw !== "unknown" ? colorRaw : "unknown"),
  };
}

/**
 * Stable, angle-robust signature for seeding/keying (textureHint intentionally excluded).
 * Returns `null` when every robust field is unknown (caller should fall back).
 *
 * @param {{ primaryColor?: string, materialType?: string, formFactor?: string, textureHint?: string }|null|undefined} features
 * @returns {string|null}
 */
export function buildAmuletStableSignature(features) {
  const c = normalizeAmuletFeatures(features);
  if (
    c.materialType === "unknown" &&
    c.formFactor === "unknown" &&
    c.colorBucket === "unknown"
  ) {
    return null;
  }
  return `${c.materialType}:${c.formFactor}:${c.colorBucket}`;
}

/** @typedef {Partial<Record<AmuletPowerKey, number>>} AxisDelta */

/** Per-canonical-material additive contribution to each axis (small magnitudes). */
const MATERIAL_AXIS = /** @type {Record<string, AxisDelta>} */ ({
  thai_amulet: { protection: 12, baramee: 10, metta: 4 },
  brass: { protection: 8, baramee: 8, luck: 4 },
  bronze: { protection: 9, baramee: 7, fortune_anchor: 4 },
  clay: { metta: 8, fortune_anchor: 8, protection: 4 },
  obsidian: { protection: 13, specialty: 6 },
  jade: { metta: 10, fortune_anchor: 8, luck: 4 },
  agate: { protection: 8, fortune_anchor: 6, baramee: 3 },
  tiger_eye: { baramee: 10, protection: 8, luck: 4 },
  amethyst: { metta: 9, baramee: 6, specialty: 5 },
  quartz: { specialty: 8, luck: 6, metta: 4 },
  moldavite: { specialty: 13, baramee: 6 },
  mixed_crystal: { luck: 7, specialty: 6, metta: 4 },
});

/** Per-form additive contribution to each axis. */
const FORM_AXIS = /** @type {Record<string, AxisDelta>} */ ({
  coin: { luck: 10, fortune_anchor: 8, baramee: 4 },
  figure: { baramee: 11, protection: 7 },
  pendant: { metta: 8, protection: 6 },
  bracelet: { metta: 7, luck: 6 },
  ring: { baramee: 8, specialty: 5 },
  loose_stone: { specialty: 9, fortune_anchor: 5 },
});

/** Per-color-bucket additive contribution to each axis. */
const COLOR_AXIS = /** @type {Record<string, AxisDelta>} */ ({
  warm_metal: { luck: 9, baramee: 7, fortune_anchor: 4 },
  cool_metal: { protection: 8, specialty: 5 },
  earth: { fortune_anchor: 9, metta: 6 },
  dark: { protection: 11, specialty: 5 },
  red: { baramee: 9, luck: 6 },
  green: { metta: 8, luck: 6 },
  blue: { specialty: 8, protection: 5 },
  purple: { baramee: 8, specialty: 6 },
  mixed: { luck: 5, metta: 3 },
});

const AXIS_MIN = 34;
const AXIS_MAX = 99;
const BASE_CENTER = 46;

/**
 * @param {Record<string, AxisDelta>} table
 * @param {string} key
 * @param {Record<AmuletPowerKey, number>} out
 */
function applyContribution(table, key, out) {
  const row = table[key];
  if (!row) return;
  for (const axis of AMULET_AXES) {
    const d = row[axis];
    if (typeof d === "number") out[axis] += d;
  }
}

/**
 * Locality-sensitive per-axis base scores from canonical features (A).
 * One flipped slug only changes that slug's contribution → bounded delta, not a full reroll.
 *
 * @param {{ primaryColor?: string, materialType?: string, formFactor?: string, textureHint?: string }|null|undefined} features
 * @returns {{ axes: Record<AmuletPowerKey, number>, signature: string, knownLayers: number }}
 */
export function computeAmuletAxisBaseFromFeatures(features) {
  const c = normalizeAmuletFeatures(features);
  /** @type {Record<AmuletPowerKey, number>} */
  const out = {
    protection: BASE_CENTER,
    metta: BASE_CENTER,
    baramee: BASE_CENTER,
    luck: BASE_CENTER,
    fortune_anchor: BASE_CENTER,
    specialty: BASE_CENTER,
  };

  let knownLayers = 0;
  if (c.materialType !== "unknown") {
    applyContribution(MATERIAL_AXIS, c.materialType, out);
    knownLayers += 1;
  }
  if (c.formFactor !== "unknown") {
    applyContribution(FORM_AXIS, c.formFactor, out);
    knownLayers += 1;
  }
  if (c.colorBucket !== "unknown") {
    applyContribution(COLOR_AXIS, c.colorBucket, out);
    knownLayers += 1;
  }

  const signature = `${c.materialType}:${c.formFactor}:${c.colorBucket}`;

  /** Tiny deterministic per-axis jitter from the STABLE signature only (never per-scan): breaks flat ties without hurting cross-angle stability. */
  for (const axis of AMULET_AXES) {
    const j = (fnv1a32(`${signature}|v3|jit|${axis}`) % 5) - 2;
    out[axis] = Math.min(AXIS_MAX, Math.max(AXIS_MIN, Math.round(out[axis] + j)));
  }

  return { axes: out, signature, knownLayers };
}

export { COLOR_BUCKET, MATERIAL_CANON, FORM_CANON };
