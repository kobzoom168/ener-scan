/**
 * Sacred amulet lane: six-axis power scores (deterministic_v2: object-stable + session drift).
 */
import { score10ToEnergyGrade } from "../utils/reports/energyLevelGrade.util.js";

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

/** Short labels: shared HTML / owner / Flex display. */
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

  /** Wider per-axis spread than legacy 50–96: typical items ~mid, strong items high, weak tails possible. */
  const AXIS_MIN = 34;
  const AXIS_MAX = 99;

  /**
   * Identity-only scores (no session / no per-scan jitter): stable primary/secondary across rescans.
   * @param {boolean} withSessionJitter
   */
  const buildAxisScores = (withSessionJitter) => {
    /** @type {Record<AmuletPowerKey, number>} */
    const out = /** @type {Record<AmuletPowerKey, number>} */ ({});
    for (const k of POWER_ORDER) {
      let s = 38 + (fnv1a32(`${identity}|v2|base|${k}`) % 34);

    if (k === affinityA) {
      s += 10 + (fnv1a32(`${identity}|v2|b1|${k}`) % 15);
    } else if (k === affinityB) {
      s += 6 + (fnv1a32(`${identity}|v2|b2|${k}`) % 12);
    }

      if (withSessionJitter && session) {
        s += (fnv1a32(`${session}|v2|sess|${k}`) % 9) - 4;
        s += (fnv1a32(`${identity}|${session}|jit|${k}`) % 3);
      }

      out[k] = Math.min(AXIS_MAX, Math.max(AXIS_MIN, Math.round(s)));
    }

    /** ~2.5% of identities: all axes lift together (rare strong pieces; still graph-consistent). */
    if ((fnv1a32(`${identity}|v2|elite`) % 40) === 0) {
      const bump = 6 + (fnv1a32(`${identity}|v2|eliteAmp`) % 5);
      for (const k of POWER_ORDER) {
        out[k] = Math.min(AXIS_MAX, out[k] + bump);
      }
    }

    const hint = inferAmuletAxisFromMainEnergyLabel(opts.mainEnergyLabel);
    if (hint && POWER_ORDER.includes(hint)) {
      out[hint] = Math.min(
        AXIS_MAX,
        out[hint] + 5 + (fnv1a32(`${identity}|nudge|${hint}`) % 6),
      );
    }

    const sortedKeys = [...POWER_ORDER].sort((a, b) => {
      const ds = out[b] - out[a];
      if (ds !== 0) return ds;
      return POWER_ORDER.indexOf(a) - POWER_ORDER.indexOf(b);
    });

    if (out[sortedKeys[0]] - out[sortedKeys[1]] < 4) {
      out[sortedKeys[0]] = Math.min(AXIS_MAX, out[sortedKeys[0]] + 3);
    }

    return { out, sortedKeys };
  };

  const { out: identityRaw, sortedKeys: sortedIdentity } = buildAxisScores(false);
  const primaryPower = sortedIdentity[0];
  const secondaryPower = sortedIdentity[1];

  const { out: raw } = buildAxisScores(true);

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
    primaryPower,
    secondaryPower,
  };
}

/**
 * Single 0–10 display score for sacred_amulet hero strip — derived only from the six axis scores
 * (same numbers as the radar graph). Equal-weight mean, plus a small bonus when the top axis
 * clearly leads (does not replace axis math elsewhere).
 *
 * @param {Record<string, { score?: number }>} powerCategories
 * @returns {number}
 */
export function deriveSacredAmuletEnergyScore10FromPowerCategories(powerCategories) {
  const scores = POWER_ORDER.map((k) => {
    const e = powerCategories[k];
    const sc = e && typeof e === "object" && e.score != null ? Number(e.score) : NaN;
    return Number.isFinite(sc) ? Math.min(100, Math.max(0, sc)) : 0;
  });
  const mean = scores.reduce((a, b) => a + b, 0) / 6;
  const sorted = [...scores].sort((a, b) => b - a);
  const gap = sorted[0] - sorted[1];
  const m = Math.min(99, Math.max(34, mean));
  /** Reference band: empirical axis means rarely fill 34–99; stretch so strong real graphs reach 9.x without inflating noise at the bottom. */
  const t = Math.min(1, Math.max(0, (m - 34) / (88 - 34)));
  let out = 4.7 + t * 5.0;
  out += Math.min(0.45, gap / 110);
  out = Math.min(9.95, Math.max(4.5, out));
  return Math.round(out * 10) / 10;
}

/**
 * Letter grade for sacred_amulet summary (same thresholds as Moldavite/generic; tied to {@link deriveSacredAmuletEnergyScore10FromPowerCategories}).
 * @param {number} n — 0–10 scale
 */
export function sacredAmuletEnergyLevelLabelFromScore10(n) {
  return score10ToEnergyGrade(n);
}

export { POWER_LABEL_THAI, POWER_ORDER };
