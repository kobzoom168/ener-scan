import { fnv1a32 } from "../moldavite/moldaviteScores.util.js";

export const CRYSTAL_BRACELET_SCORING_MODE = "deterministic_v1";

/** พลังงานชุดใหม่ 6 มิติ — crystal_bracelet lane only */
/** @type {const} */
export const CRYSTAL_BRACELET_AXIS_ORDER = [
  "charm_attraction",
  "money",
  "career",
  "luck",
  "intuition",
  "love",
];

export const CRYSTAL_BRACELET_AXIS_LABEL_THAI = {
  charm_attraction: "เสน่ห์",
  money: "การเงิน",
  career: "การงาน",
  luck: "โชคลาภ",
  intuition: "เซ้นส์",
  love: "ความรัก",
};

/**
 * @param {number} score
 */
function ownerFitBandFromScore(score) {
  if (score >= 86) {
    return {
      band: "เข้ากันดีมาก",
      reason:
        "พลังของกำไลเส้นนี้สอดคล้องกับจังหวะชีวิตของผู้สวมในช่วงนี้ค่อนข้างชัด",
    };
  }
  if (score >= 72) {
    return {
      band: "เข้ากันค่อนข้างดี",
      reason:
        "พลังของกำไลเส้นนี้เข้ากับจังหวะการขยับของผู้สวมในช่วงนี้",
    };
  }
  if (score >= 58) {
    return {
      band: "เข้ากันในระดับพอดี",
      reason:
        "พลังของกำไลยังปรับเข้ากับผู้สวมได้ในระดับที่พอไปต่อได้",
    };
  }
  return {
    band: "เข้ากันเบา ๆ",
    reason:
      "ช่วงนี้พลังของกำไลกับจังหวะผู้สวมอาจยังไม่ล็อกตรงทุกมิติ — อ่านแบบค่อยเป็นค่อยไป",
  };
}

/**
 * Owner-fit score for the “เข้ากับคุณ” row — not a radar axis.
 *
 * @param {string} seed
 * @param {string} session
 * @param {string} [mainEnergyLabel]
 * @param {number|null|undefined} [ownerFitScoreOpt]
 * @returns {number}
 */
function computeOwnerFitScoreValue(seed, session, mainEnergyLabel, ownerFitScoreOpt) {
  const h = fnv1a32(`${seed}|cb_axis|owner_fit|${session}`);
  let s = 34 + (h % 46);
  if (ownerFitScoreOpt != null) {
    const oc = Number(ownerFitScoreOpt);
    if (Number.isFinite(oc)) {
      s = Math.round(s * 0.55 + oc * 0.45);
      s = Math.min(99, Math.max(34, s));
    }
  }
  const hint = String(mainEnergyLabel || "").trim();
  if (hint && (h % 5) === 0) {
    s = Math.min(99, s + 2);
  }
  return s;
}

/**
 * Deterministic six-axis scores for mixed-stone crystal bracelet lane.
 *
 * @param {string} seedKey
 * @param {{
 *   sessionKey?: string,
 *   mainEnergyLabel?: string,
 *   ownerFitScore?: number|null,
 *   confidenceDamp?: number,
 * }} [opts]
 */
export function computeCrystalBraceletScoresDeterministicV1(seedKey, opts = {}) {
  const seed = String(seedKey || "").trim() || "bracelet_seed";
  const session = String(opts.sessionKey ?? "").trim();
  const mainEnergyLabel = opts.mainEnergyLabel;
  const ownerFitScoreOpt = opts.ownerFitScore;
  const damp =
    opts.confidenceDamp != null && Number.isFinite(Number(opts.confidenceDamp))
      ? Math.min(1, Math.max(0, Number(opts.confidenceDamp)))
      : 1;

  /** @type {Record<string, { key: string, score: number, labelThai: string }>} */
  const axes = {};

  for (const key of CRYSTAL_BRACELET_AXIS_ORDER) {
    const h = fnv1a32(`${seed}|cb_axis|${key}|${session}`);
    let s = 34 + (h % 46);
    const hint = String(mainEnergyLabel || "").trim();
    if (hint && (h % 5) === 0) {
      s = Math.min(99, s + 2);
    }
    s = Math.min(99, Math.max(20, Math.round(s * damp)));
    axes[key] = {
      key,
      score: s,
      labelThai: CRYSTAL_BRACELET_AXIS_LABEL_THAI[key],
    };
  }

  let ofScore = computeOwnerFitScoreValue(
    seed,
    session,
    mainEnergyLabel,
    ownerFitScoreOpt,
  );
  ofScore = Math.min(99, Math.max(20, Math.round(ofScore * damp)));
  const { band, reason } = ownerFitBandFromScore(ofScore);

  const sorted = [...CRYSTAL_BRACELET_AXIS_ORDER].sort((a, b) => {
    const ds = axes[b].score - axes[a].score;
    if (ds !== 0) return ds;
    return (
      CRYSTAL_BRACELET_AXIS_ORDER.indexOf(a) -
      CRYSTAL_BRACELET_AXIS_ORDER.indexOf(b)
    );
  });
  const primaryAxis = sorted[0];
  let secondaryAxis = sorted[1];
  if (secondaryAxis === primaryAxis) {
    secondaryAxis = sorted[2] || sorted[1];
  }

  return {
    scoringMode: CRYSTAL_BRACELET_SCORING_MODE,
    axes,
    primaryAxis,
    secondaryAxis,
    ownerFit: {
      score: ofScore,
      band,
      reason,
    },
  };
}

/**
 * Same rule as moldavite `graph.alignment`: axis where |จังหวะผู้สวม − พลังกำไล| is minimal
 * (จุดรองบนกราฟพลังกำไล — “เข้ากับคุณที่สุด” เมื่อไม่ซ้ำกับพีค).
 *
 * @param {Record<string, number>} stoneAxisScores — 0–100 per axis
 * @param {Record<string, number>} ownerAxisScores — 0–100 per axis
 * @returns {string} axis key in {@link CRYSTAL_BRACELET_AXIS_ORDER}
 */
export function computeCrystalBraceletAlignmentAxisKey(
  stoneAxisScores,
  ownerAxisScores,
) {
  let alignKey = CRYSTAL_BRACELET_AXIS_ORDER[0];
  let minD = Infinity;
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const d = Math.abs(
      (Number(ownerAxisScores[k]) || 0) - (Number(stoneAxisScores[k]) || 0),
    );
    if (d < minD) {
      minD = d;
      alignKey = k;
    }
  }
  return alignKey;
}

/**
 * Per-axis owner rhythm scores for HTML radar overlay (not stored on payload).
 * @param {string} seedKey
 * @param {string} sessionKey
 * @param {Record<string, number>} stoneAxisScores — 0–100 per axis key
 * @param {number|null|undefined} ownerFitScore — 0–100, from ownerFit or compatibility
 * @returns {Record<string, number>}
 */
export function computeCrystalBraceletOwnerAxisScoresV1(
  seedKey,
  sessionKey,
  stoneAxisScores,
  ownerFitScore,
) {
  const seed = String(seedKey || "").trim() || "cb";
  const session = String(sessionKey || "").trim() || "sess";
  const fit =
    ownerFitScore != null && Number.isFinite(Number(ownerFitScore))
      ? Math.min(100, Math.max(0, Math.round(Number(ownerFitScore))))
      : 66;
  const follow = 0.28 + (fit / 100) * 0.42;

  /** @type {Record<string, number>} */
  const out = {};
  for (const key of CRYSTAL_BRACELET_AXIS_ORDER) {
    const h = fnv1a32(`${seed}|cb_owner_axis|${key}|${session}`);
    const stone = Math.max(
      0,
      Math.min(100, Math.round(Number(stoneAxisScores[key]) || 0)),
    );
    const indie = 28 + (h % 52);
    let s = Math.round(indie * (1 - follow) + stone * follow + ((h % 7) - 3));
    s = Math.min(99, Math.max(20, s));
    out[key] = s;
  }
  return out;
}
