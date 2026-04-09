/**
 * Sacred amulet lane — six-axis power scores (deterministic_v2: object-stable + session drift).
 */
/** @typedef {"protection"|"metta"|"baramee"|"luck"|"fortune_anchor"|"specialty"} AmuletPowerKey */

export const AMULET_SCORING_MODE = "deterministic_v2";

const POWER_LABEL_THAI = {
  protection: "คุ้มครองป้องกัน",
  metta: "เมตตาและคนเอ็นดู",
  baramee: "บารมีและอำนาจนำ",
  luck: "โชคลาภและการเปิดทาง",
  fortune_anchor: "หนุนดวงและการตั้งหลัก",
  specialty: "งานเฉพาะทาง",
};

/** Short labels — shared HTML / owner / Flex display. */
export const AMULET_PEAK_SHORT_THAI = {
  protection: "คุ้มครอง",
  metta: "เมตตา",
  baramee: "บารมี",
  luck: "โชคลาภ",
  fortune_anchor: "หนุนดวง",
  specialty: "งานเฉพาะ",
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
 * Map hero / summary wording to an axis for score nudge (optional).
 * @param {string|null|undefined} label
 * @returns {AmuletPowerKey|null}
 */
export function inferAmuletAxisFromMainEnergyLabel(label) {
  const t = String(label || "").trim();
  if (!t) return null;
  if (/คุ้มครอง|ป้องกัน/.test(t)) return "protection";
  if (/เมตตา/.test(t)) return "metta";
  if (/บารมี|อำนาจนำ/.test(t)) return "baramee";
  if (/โชค|ลาภ|เปิดทาง/.test(t)) return "luck";
  if (/หนุนดวง|ตั้งหลัก/.test(t)) return "fortune_anchor";
  if (/งานเฉพาะ|เฉพาะทาง|ฝีมือ|ถนัดเฉพาะ/.test(t)) return "specialty";
  return null;
}

/**
 * Object identity (`seedKey`) defines baseline character; `sessionKey` adds small emphasis drift
 * between rescans. Optional `mainEnergyLabel` nudges the matching axis toward hero alignment.
 *
 * @param {string} seedKey
 * @param {{ sessionKey?: string, scanSessionKey?: string, mainEnergyLabel?: string }} [opts]
 * @returns {{
 *   scoringMode: typeof AMULET_SCORING_MODE,
 *   powerCategories: Record<AmuletPowerKey, { key: AmuletPowerKey, score: number, labelThai: string }>,
 *   primaryPower: AmuletPowerKey,
 *   secondaryPower: AmuletPowerKey,
 * }}
 */
export function computeAmuletPowerScoresDeterministicV1(seedKey, opts = {}) {
  const identity = String(seedKey || "").trim() || "amulet_seed_missing";
  const session = String(opts.sessionKey ?? opts.scanSessionKey ?? "").trim();

  const hId = fnv1a32(`${identity}|v2|id`);
  const ia = hId % 6;
  let ib = (hId >>> 11) % 6;
  if (ib === ia) ib = (ib + 2) % 6;
  const affinityA = POWER_ORDER[ia];
  const affinityB = POWER_ORDER[ib];

  /** @type {Record<AmuletPowerKey, number>} */
  const raw = /** @type {Record<AmuletPowerKey, number>} */ ({});

  for (const k of POWER_ORDER) {
    let s = 58 + (fnv1a32(`${identity}|v2|base|${k}`) % 20);

    if (k === affinityA) {
      s += 10 + (fnv1a32(`${identity}|v2|b1|${k}`) % 9);
    } else if (k === affinityB) {
      s += 5 + (fnv1a32(`${identity}|v2|b2|${k}`) % 8);
    }

    if (session) {
      s += (fnv1a32(`${session}|v2|sess|${k}`) % 9) - 4;
    }

    s += (fnv1a32(`${identity}|${session}|jit|${k}`) % 3);

    raw[k] = Math.min(96, Math.max(50, Math.round(s)));
  }

  const hint = inferAmuletAxisFromMainEnergyLabel(opts.mainEnergyLabel);
  if (hint && POWER_ORDER.includes(hint)) {
    raw[hint] = Math.min(
      96,
      raw[hint] + 6 + (fnv1a32(`${identity}|nudge|${hint}`) % 5),
    );
  }

  const sorted = [...POWER_ORDER].sort((a, b) => {
    const ds = raw[b] - raw[a];
    if (ds !== 0) return ds;
    return POWER_ORDER.indexOf(a) - POWER_ORDER.indexOf(b);
  });

  if (raw[sorted[0]] - raw[sorted[1]] < 4) {
    raw[sorted[0]] = Math.min(96, raw[sorted[0]] + 3);
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

  return {
    scoringMode: AMULET_SCORING_MODE,
    powerCategories,
    primaryPower: sorted[0],
    secondaryPower: sorted[1],
  };
}

export { POWER_LABEL_THAI, POWER_ORDER };
