/**
 * Temporary Moldavite life-area model: stable integer scores from scan id + fixed salts.
 * Replace with learned/model scores when validated — do not treat as ground truth.
 */
export const MOLDAVITE_SCORING_MODE = "deterministic_v1";

/** @typedef {"work"|"money"|"relationship"} MoldaviteLifeAreaKey */

const LIFE_AREA_LABEL_THAI = {
  work: "งาน",
  money: "การเงิน",
  relationship: "ความสัมพันธ์",
};

/**
 * FNV-1a 32-bit — deterministic, no Math.random().
 * @param {string} s
 * @returns {number}
 */
export function fnv1a32(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Map hash to inclusive integer range [min, max].
 * @param {number} h
 * @param {number} min
 * @param {number} max
 */
function spread(h, min, max) {
  const span = max - min + 1;
  return min + (h % span);
}

/**
 * @param {string} seedKey — prefer scan result id (UUID)
 * @returns {{
 *   scoringMode: typeof MOLDAVITE_SCORING_MODE,
 *   lifeAreas: Record<MoldaviteLifeAreaKey, { key: MoldaviteLifeAreaKey, score: number, labelThai: string }>,
 *   primaryLifeArea: MoldaviteLifeAreaKey,
 *   secondaryLifeArea: MoldaviteLifeAreaKey,
 * }}
 */
export function computeMoldaviteLifeAreaScoresDeterministicV1(seedKey) {
  const base = String(seedKey || "").trim() || "moldavite_seed_missing";
  const keys = /** @type {const} */ ([
    "work",
    "money",
    "relationship",
  ]);

  /** @type {Record<MoldaviteLifeAreaKey, number>} */
  const raw = {};
  for (const k of keys) {
    const h = fnv1a32(`${base}|moldavite_v1|life_area|${k}`);
    raw[k] = spread(h, 55, 94);
  }

  const lifeAreas = {
    work: {
      key: "work",
      score: raw.work,
      labelThai: LIFE_AREA_LABEL_THAI.work,
    },
    money: {
      key: "money",
      score: raw.money,
      labelThai: LIFE_AREA_LABEL_THAI.money,
    },
    relationship: {
      key: "relationship",
      score: raw.relationship,
      labelThai: LIFE_AREA_LABEL_THAI.relationship,
    },
  };

  const order = /** @type {const} */ ([
    "work",
    "money",
    "relationship",
  ]);
  const sorted = [...order].sort((a, b) => {
    const ds = raw[b] - raw[a];
    if (ds !== 0) return ds;
    return order.indexOf(a) - order.indexOf(b);
  });

  return {
    scoringMode: MOLDAVITE_SCORING_MODE,
    lifeAreas,
    primaryLifeArea: sorted[0],
    secondaryLifeArea: sorted[1],
  };
}
