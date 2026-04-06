/**
 * Sacred amulet lane — deterministic power-category scores (placeholder until model-backed).
 * Six axes; same scoring pattern as Moldavite life areas but separate namespace.
 */
export const AMULET_SCORING_MODE = "deterministic_v1";

/** @typedef {"protection"|"metta"|"baramee"|"luck"|"fortune_anchor"|"specialty"} AmuletPowerKey */

const POWER_LABEL_THAI = {
  protection: "คุ้มครองป้องกัน",
  metta: "เมตตาและคนเอ็นดู",
  baramee: "บารมีและอำนาจนำ",
  luck: "โชคลาภและการเปิดทาง",
  fortune_anchor: "หนุนดวงและการตั้งหลัก",
  specialty: "งานเฉพาะทาง",
};

const POWER_ORDER = /** @type {const} */ ([
  "protection",
  "metta",
  "baramee",
  "luck",
  "fortune_anchor",
  "specialty",
]);

/**
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
 * @param {number} h
 * @param {number} min
 * @param {number} max
 */
function spread(h, min, max) {
  const span = max - min + 1;
  return min + (h % span);
}

/**
 * @param {string} seedKey
 * @returns {{
 *   scoringMode: typeof AMULET_SCORING_MODE,
 *   powerCategories: Record<AmuletPowerKey, { key: AmuletPowerKey, score: number, labelThai: string }>,
 *   primaryPower: AmuletPowerKey,
 *   secondaryPower: AmuletPowerKey,
 * }}
 */
export function computeAmuletPowerScoresDeterministicV1(seedKey) {
  const base = String(seedKey || "").trim() || "amulet_seed_missing";

  /** @type {Record<AmuletPowerKey, number>} */
  const raw = {};
  for (const k of POWER_ORDER) {
    const h = fnv1a32(`${base}|amulet_v1|power|${k}`);
    raw[k] = spread(h, 52, 96);
  }

  /** @type {Record<AmuletPowerKey, { key: AmuletPowerKey, score: number, labelThai: string }>} */
  const powerCategories = {};
  for (const k of POWER_ORDER) {
    powerCategories[k] = {
      key: k,
      score: raw[k],
      labelThai: POWER_LABEL_THAI[k],
    };
  }

  const sorted = [...POWER_ORDER].sort((a, b) => {
    const ds = raw[b] - raw[a];
    if (ds !== 0) return ds;
    return POWER_ORDER.indexOf(a) - POWER_ORDER.indexOf(b);
  });

  return {
    scoringMode: AMULET_SCORING_MODE,
    powerCategories,
    primaryPower: sorted[0],
    secondaryPower: sorted[1],
  };
}

export { POWER_LABEL_THAI, POWER_ORDER };
