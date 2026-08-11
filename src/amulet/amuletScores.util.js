/**
 * Sacred amulet lane: six-axis power scores.
 *  - deterministic_v2: legacy hash-seeded (object-stable + session drift) — fallback only.
 *  - feature_blend_v3: locality-sensitive blend of canonical visual slugs (angle-robust). Preferred.
 */
import { score10ToEnergyGrade } from "../utils/reports/energyLevelGrade.util.js";
import {
  buildAmuletStableSignature,
  computeAmuletAxisBaseFromFeatures,
} from "./amuletFeatureProfile.util.js";

/** @typedef {"protection"|"metta"|"baramee"|"luck"|"fortune_anchor"|"specialty"} AmuletPowerKey */

export const AMULET_SCORING_MODE = "deterministic_v2";
export const AMULET_SCORING_MODE_V3 = "feature_blend_v3";

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

      // (per-scan `session` jitter removed: it drifted displayed scores on rescans of the SAME
      // object even though primary/secondary were identity-stable. Fallback scores are now fully
      // identity-deterministic.)
      void withSessionJitter;

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
 * Locality-sensitive six-axis scores from canonical visual features (feature_blend_v3).
 *
 * Preferred over {@link computeAmuletPowerScoresDeterministicV1}: the same object across angles
 * yields near-identical scores because (a) fragile fields are dropped/bucketed and (b) each slug
 * contributes additively, so a single flipped slug shifts scores by a bounded amount instead of
 * avalanche-rerolling the whole vector. No per-scan/session jitter → rescans are identical.
 *
 * @param {{ primaryColor?: string, materialType?: string, formFactor?: string, textureHint?: string }} features
 * @param {{ mainEnergyLabel?: string }} [opts]
 * @returns {{
 *   scoringMode: typeof AMULET_SCORING_MODE_V3,
 *   powerCategories: Record<AmuletPowerKey, { key: AmuletPowerKey, score: number, labelThai: string }>,
 *   primaryPower: AmuletPowerKey,
 *   secondaryPower: AmuletPowerKey,
 *   signature: string,
 * }}
 */
export function computeAmuletPowerScoresFromFeaturesV3(features, opts = {}) {
  const { axes, signature } = computeAmuletAxisBaseFromFeatures(features);

  /**
   * Per-object discrimination: the coarse material/form/color buckets above give the angle-stable
   * "character", but two DIFFERENT pieces sharing those buckets would otherwise score identically
   * (±2). Add a bounded per-axis offset keyed on the granular stable-feature seed (hash of raw
   * color:material:form:texture, incl. fields the buckets drop) so distinct pieces separate while
   * the SAME object keeps the same seed → same offset (and re-scans also snap via baseline reuse).
   */
  const objSeed = String(opts.seedKey || "").trim();
  if (objSeed) {
    // shared per-object LEVEL shift (moves the mean → the overall 0–10 score differs between
    // pieces, not just the axis shape) + per-axis shape variation. Random per-axis alone averages
    // out and leaves every piece ~the same overall score.
    const level = (fnv1a32(`${objSeed}|v3|lvl`) % 25) - 9; // ≈ ±10 mean shift
    for (const k of POWER_ORDER) {
      const off = (fnv1a32(`${objSeed}|v3|obj|${k}`) % 15) - 7; // ±7 shape
      axes[k] = Math.min(99, Math.max(34, axes[k] + level + off));
    }
  }

  /** Optional hero/summary alignment nudge (same intent as v1; bounded). */
  const hint = inferAmuletAxisFromMainEnergyLabel(opts.mainEnergyLabel);
  if (hint && POWER_ORDER.includes(hint)) {
    axes[hint] = Math.min(99, axes[hint] + 5 + (fnv1a32(`${signature}|v3|nudge|${hint}`) % 6));
  }

  const sortedKeys = [...POWER_ORDER].sort((a, b) => {
    const ds = axes[b] - axes[a];
    if (ds !== 0) return ds;
    return POWER_ORDER.indexOf(a) - POWER_ORDER.indexOf(b);
  });

  /** Guarantee a readable lead between primary and secondary. */
  if (axes[sortedKeys[0]] - axes[sortedKeys[1]] < 4) {
    axes[sortedKeys[0]] = Math.min(99, axes[sortedKeys[0]] + 3);
  }

  /** @type {Record<AmuletPowerKey, { key: AmuletPowerKey, score: number, labelThai: string }>} */
  const powerCategories = {};
  for (const k of POWER_ORDER) {
    powerCategories[k] = { key: k, score: axes[k], labelThai: POWER_LABEL_THAI[k] };
  }

  return {
    scoringMode: AMULET_SCORING_MODE_V3,
    powerCategories,
    primaryPower: sortedKeys[0],
    secondaryPower: sortedKeys[1],
    signature,
  };
}

/**
 * Unified entry: prefer angle-robust feature blend (v3); fall back to legacy hash seed (v2).
 *
 * @param {{
 *   features?: { primaryColor?: string, materialType?: string, formFactor?: string, textureHint?: string }|null,
 *   seedKey?: string,
 *   sessionKey?: string,
 *   mainEnergyLabel?: string,
 * }} input
 */
export function computeAmuletPowerScores(input = {}) {
  const features = input.features;
  const hasUsableFeatures =
    features &&
    typeof features === "object" &&
    buildAmuletStableSignature(features) != null;

  if (hasUsableFeatures) {
    return computeAmuletPowerScoresFromFeaturesV3(features, {
      mainEnergyLabel: input.mainEnergyLabel,
      seedKey: input.seedKey,
    });
  }

  const scores = computeAmuletPowerScoresDeterministicV1(input.seedKey || "", {
    sessionKey: input.sessionKey,
    mainEnergyLabel: input.mainEnergyLabel,
  });
  return { ...scores, signature: null };
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

/* ============================== evidence_score_v4 ============================== */

/**
 * v4 (11 ส.ค. 2026 — กบเคาะ, สเปก docs/ai/plans/ener-scoring-v4.md · เลนพระเท่านั้น):
 *  - hash เหลือหน้าที่เดียว = แก้คะแนนชน แบบสมมาตร (level -3..+3, shape ต่อแกน -3..+3)
 *    บันทึกแยกเป็น collisionNudge ไม่ปนกับแต้มจากหลักฐาน
 *  - ❌ ไม่มี mainEnergyLabel nudge — พลังหลัก/รอง derive จากคะแนน 6 แกนเท่านั้น
 *  - breakdown ต่อแกนตรวจสอบได้: base + evidence[] + collisionNudge + leadAdjust = final
 *  - readingConfidence จาก evidence ที่มีอยู่ (knownLayers 0-5) — แยกจากความแรงพลัง
 * ⚠️ ห้ามแตะ v1/v3 ด้านบน — รายงาน/baseline เก่าต้องได้เลขเดิมเป๊ะ (มี fixture test คุม)
 */
export const AMULET_SCORING_MODE_V4 = "evidence_score_v4";

import { computeAmuletAxisEvidenceV4 } from "./amuletFeatureProfile.util.js";

/**
 * @param {Record<string, unknown>|null|undefined} features
 * @param {{ seedKey?: string }} [opts]
 */
export function computeAmuletPowerScoresFromFeaturesV4(features, opts = {}) {
  const { axes, evidence, signature, knownLayers } = computeAmuletAxisEvidenceV4(features);

  /** @type {Record<AmuletPowerKey, number>} */
  const collisionNudge = {};
  const objSeed = String(opts.seedKey || "").trim();
  for (const k of POWER_ORDER) collisionNudge[k] = 0;
  if (objSeed) {
    const level = (fnv1a32(`${objSeed}|v4|lvl`) % 7) - 3; // สมมาตร -3..+3 mean 0
    for (const k of POWER_ORDER) {
      const off = (fnv1a32(`${objSeed}|v4|obj|${k}`) % 7) - 3; // -3..+3
      collisionNudge[k] = level + off;
      axes[k] = Math.min(99, Math.max(34, axes[k] + collisionNudge[k]));
    }
  }

  const sortedKeys = [...POWER_ORDER].sort((a, b) => {
    const ds = axes[b] - axes[a];
    if (ds !== 0) return ds;
    return POWER_ORDER.indexOf(a) - POWER_ORDER.indexOf(b);
  });

  /** ช่องว่างอ่านง่ายระหว่างอันดับ 1-2 (เท่ากติกา v3) — บันทึกแยกเป็น leadAdjust */
  let leadAdjust = 0;
  if (axes[sortedKeys[0]] - axes[sortedKeys[1]] < 4) {
    leadAdjust = Math.min(3, 99 - axes[sortedKeys[0]]);
    axes[sortedKeys[0]] += leadAdjust;
  }

  /** @type {Record<AmuletPowerKey, { key: AmuletPowerKey, score: number, labelThai: string }>} */
  const powerCategories = {};
  for (const k of POWER_ORDER) {
    powerCategories[k] = { key: k, score: axes[k], labelThai: POWER_LABEL_THAI[k] };
  }

  /** breakdown ต่อแกน: base 46 + evidence deltas + collisionNudge (+leadAdjust เฉพาะแกนนำ) = final */
  const breakdown = POWER_ORDER.map((axis) => ({
    axis,
    base: 46,
    evidence: evidence
      .filter((e) => typeof e.deltas[axis] === "number")
      .map((e) => ({ field: e.field, value: e.value, delta: e.deltas[axis] })),
    collisionNudge: collisionNudge[axis],
    leadAdjust: axis === sortedKeys[0] ? leadAdjust : 0,
    final: axes[axis],
  }));

  const confidenceValue = Math.round((knownLayers / 5) * 100) / 100;
  const readingConfidence = {
    value: confidenceValue,
    level: knownLayers >= 4 ? "สูง" : knownLayers >= 2 ? "กลาง" : "ต่ำ",
    knownLayers,
  };

  return {
    scoringMode: AMULET_SCORING_MODE_V4,
    powerCategories,
    primaryPower: sortedKeys[0],
    secondaryPower: sortedKeys[1],
    signature,
    breakdown,
    readingConfidence,
  };
}

/**
 * สูตร overall ใหม่ (shadow เท่านั้น — ห้ามแสดงลูกค้า จนกว่า calibration ผ่าน):
 * 55% mean 6 แกน + 25% mean top2 + 20% evidence coherence
 * coherence = สัดส่วนชั้นหลักฐานที่แกนแรงสุดของชั้นนั้นชี้ไปทางแกนเด่นจริง (ไม่ใช่ hash)
 *
 * @param {Record<string, { score?: number }>} powerCategories
 * @param {Array<{ axis: string, evidence: Array<{ delta: number }> }>} breakdown
 * @param {string} primaryPower
 * @returns {{ score10: number, coherenceFrac: number }}
 */
export function deriveEvidenceOverallShadowV4(powerCategories, breakdown, primaryPower) {
  const scores = POWER_ORDER.map((k) => Number(powerCategories[k]?.score) || 0);
  const mean6 = scores.reduce((a, b) => a + b, 0) / 6;
  const sorted = [...scores].sort((a, b) => b - a);
  const top2 = (sorted[0] + sorted[1]) / 2;

  // นับต่อ "ชั้นหลักฐาน" (field เดียวกันนับครั้งเดียว): แกนที่ได้ delta สูงสุดของชั้นนั้น == แกนเด่น?
  /** @type {Map<string, { best: string, bestDelta: number }>} */
  const perLayer = new Map();
  for (const row of Array.isArray(breakdown) ? breakdown : []) {
    for (const e of row.evidence || []) {
      const cur = perLayer.get(e.field);
      if (!cur || e.delta > cur.bestDelta) perLayer.set(e.field, { best: row.axis, bestDelta: e.delta });
    }
  }
  const layers = [...perLayer.values()];
  const coherenceFrac = layers.length
    ? layers.filter((l) => l.best === primaryPower).length / layers.length
    : 0;
  const cohScore = 34 + coherenceFrac * 65; // สเกลเดียวกับแกน 34-99

  const raw = 0.55 * mean6 + 0.25 * top2 + 0.2 * cohScore;
  const score10 = Math.round(Math.min(10, Math.max(0, ((raw - 34) / 65) * 10)) * 10) / 10;
  return { score10, coherenceFrac: Math.round(coherenceFrac * 100) / 100 };
}

/**
 * v4 display transform (PRELIMINARY — ต้อง calibrate ด้วย scan จริงช่วง shadow ก่อนเปิดลูกค้า):
 * v4 ถอด hash level ที่เคยถ่างความต่างระหว่างชิ้น → ค่าเฉลี่ยแกนกองแคบราว 46-70
 * ใช้ band นั้นแทน 34-88 ของ v3 ไม่งั้นทุกชิ้นบีบเหลือ ~6.8 (เจอจาก synthetic 10k, 11 ส.ค.)
 * @param {Record<string, { score?: number }>} powerCategories
 */
export function deriveSacredAmuletEnergyScore10V4(powerCategories) {
  const scores = POWER_ORDER.map((k) => {
    const sc = Number(powerCategories[k]?.score);
    return Number.isFinite(sc) ? Math.min(100, Math.max(0, sc)) : 0;
  });
  const mean = scores.reduce((a, b) => a + b, 0) / 6;
  const sorted = [...scores].sort((a, b) => b - a);
  const gap = sorted[0] - sorted[1];
  const m = Math.min(99, Math.max(34, mean));
  const t = Math.min(1, Math.max(0, (m - 46) / (70 - 46)));
  let out = 4.7 + t * 5.0;
  out += Math.min(0.45, gap / 110);
  out = Math.min(9.95, Math.max(4.5, out));
  return Math.round(out * 10) / 10;
}

/**
 * เลือกสูตรรวมตาม scoringMode ของชิ้น — v4 ใช้ band ใหม่ / โหมดอื่นใช้ v3 เดิมเป๊ะ
 * @param {string} scoringMode
 * @param {Record<string, { score?: number }>} powerCategories
 */
export function deriveSacredAmuletOverallByMode(scoringMode, powerCategories) {
  return String(scoringMode || "").trim() === AMULET_SCORING_MODE_V4
    ? deriveSacredAmuletEnergyScore10V4(powerCategories)
    : deriveSacredAmuletEnergyScore10FromPowerCategories(powerCategories);
}
