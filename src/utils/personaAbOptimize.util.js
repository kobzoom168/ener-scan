/**
 * Persona A/B weight math: deterministic weighted pick + recompute from funnel stats.
 * Primary target: payment_success / paywall_shown.
 * Optional blended score (structure only; enable via env flag later).
 */

const VARIANT_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** @param {number} n */
export function variantLabelsForCount(n) {
  const k = Math.min(26, Math.max(1, Math.floor(Number(n) || 3)));
  return VARIANT_LABELS.slice(0, k);
}

/**
 * Default traffic split (first 3 variants match product spec; 4+ split evenly).
 * @param {number} variantCount
 * @returns {Record<string, number>}
 */
export function buildDefaultWeights(variantCount) {
  const labels = variantLabelsForCount(variantCount);
  if (labels.length === 3) {
    return { A: 0.34, B: 0.33, C: 0.33 };
  }
  const w = 1 / labels.length;
  const out = {};
  for (const l of labels) out[l] = w;
  return out;
}

/**
 * Deterministic weighted pick from [0,1) uniform `u`.
 * @param {Record<string, number>} weights
 * @param {number} u uniform in [0, 1)
 */
export function weightedPick(weights, u) {
  const entries = Object.entries(weights || {})
    .filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "A";
  const sum = entries.reduce((s, [, w]) => s + Number(w), 0);
  if (sum <= 0) return entries[0][0];
  let t = Math.min(0.999999999, Math.max(0, u)) * sum;
  for (const [label, w] of entries) {
    t -= Number(w);
    if (t <= 0) return label;
  }
  return entries[entries.length - 1][0];
}

/**
 * Map userId hash to [0,1) for deterministic first-time assignment.
 */
export function uniformFromHash32(h) {
  return (h >>> 0) / 4294967296;
}

/**
 * @typedef {{ variant: string, paywallShown: number, paymentIntent: number, paymentSuccess: number }} PersonaAbStatRow
 */

/**
 * Normalized day weights (sum = 1), oldest day index 0, newest index n-1.
 * `linear` / `exp` give more weight to recent days.
 */
export function buildRollingDayWeightsNormalized(numDays, mode, expLambda = 0.35) {
  const n = Math.max(1, Math.floor(Number(numDays) || 1));
  const m = String(mode || "uniform").toLowerCase();
  let raw = [];
  if (m === "linear") {
    for (let i = 0; i < n; i += 1) raw.push(i + 1);
  } else if (m === "exp") {
    const lam = Number(expLambda) || 0.35;
    for (let i = 0; i < n; i += 1) raw.push(Math.exp(lam * i));
  } else {
    raw = Array(n).fill(1);
  }
  const s = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((x) => x / s);
}

/**
 * Recompute weights from per-variant funnel stats.
 *
 * @param {PersonaAbStatRow[]} stats
 * @param {{
 *   variantLabels: string[],
 *   minWeight: number,
 *   minTotalPaywall: number,
 *   defaultWeights: Record<string, number>,
 *   useBlendedScore?: boolean,
 *   blendedIntentWeight?: number,
 *   bayesAlpha?: number,
 *   bayesBeta?: number,
 *   totalPaywallRawForThreshold?: number,
 * }} opts
 */
export function recomputeWeights(stats, opts) {
  const {
    variantLabels,
    minWeight,
    minTotalPaywall,
    defaultWeights,
    useBlendedScore = false,
    blendedIntentWeight = 0.3,
    bayesAlpha = 1,
    bayesBeta = 1,
    totalPaywallRawForThreshold,
  } = opts;

  const labels = Array.isArray(variantLabels) ? variantLabels : [];
  if (labels.length === 0) return { ...defaultWeights };

  const alpha = Math.max(0, Number(bayesAlpha) || 0);
  const beta = Math.max(1e-9, Number(bayesBeta) || 1);

  const byV = new Map(
    (stats || []).map((r) => [
      String(r.variant || "").trim().toUpperCase().slice(0, 1) || "A",
      {
        paywallShown: Math.max(0, Number(r.paywallShown) || 0),
        paymentIntent: Math.max(0, Number(r.paymentIntent) || 0),
        paymentSuccess: Math.max(0, Number(r.paymentSuccess) || 0),
      },
    ])
  );

  const summedFromRows = labels.reduce(
    (s, v) => s + (byV.get(v)?.paywallShown ?? 0),
    0
  );
  const totalPaywall =
    totalPaywallRawForThreshold != null &&
    Number.isFinite(Number(totalPaywallRawForThreshold))
      ? Math.max(0, Number(totalPaywallRawForThreshold))
      : summedFromRows;

  if (totalPaywall < minTotalPaywall) {
    return normalizeWeightsOrDefault(labels, defaultWeights, minWeight);
  }

  const raw = {};
  for (const v of labels) {
    const row = byV.get(v) || {
      paywallShown: 0,
      paymentIntent: 0,
      paymentSuccess: 0,
    };
    const pw = row.paywallShown;
    const successRate = (row.paymentSuccess + alpha) / (pw + beta);
    const intentRate = (row.paymentIntent + alpha) / (pw + beta);
    let score;
    if (useBlendedScore) {
      const b = Math.min(1, Math.max(0, blendedIntentWeight));
      score = (1 - b) * successRate + b * intentRate;
    } else {
      score = successRate;
    }
    raw[v] = Math.max(score, 1e-12);
  }

  const sumRaw = labels.reduce((s, v) => s + (raw[v] ?? 0), 0);
  if (sumRaw <= 0 || !Number.isFinite(sumRaw)) {
    return normalizeWeightsOrDefault(labels, defaultWeights, minWeight);
  }

  let w = {};
  for (const v of labels) {
    w[v] = (raw[v] ?? 0) / sumRaw;
  }

  w = applyFloorAndRenormalize(w, labels, minWeight);
  if (!w) {
    return normalizeWeightsOrDefault(labels, defaultWeights, minWeight);
  }
  return w;
}

/**
 * @param {Record<string, number>} w
 * @param {string[]} labels
 * @param {number} floor
 */
function applyFloorAndRenormalize(w, labels, floor) {
  const f = Math.min(0.49, Math.max(0, Number(floor) || 0));
  if (labels.length * f >= 1) {
    return null;
  }
  let out = {};
  for (const v of labels) {
    const x = Number(w[v]);
    out[v] = Math.max(f, Number.isFinite(x) ? x : f);
  }
  let s = labels.reduce((acc, v) => acc + out[v], 0);
  if (s <= 0) return null;
  for (const v of labels) {
    out[v] /= s;
  }
  return out;
}

function normalizeWeightsOrDefault(labels, defaultWeights, minWeight) {
  const base = {};
  for (const v of labels) {
    const d = (defaultWeights && defaultWeights[v]) ?? 1 / labels.length;
    base[v] = Number(d) > 0 ? Number(d) : 1 / labels.length;
  }
  let s = labels.reduce((acc, v) => acc + base[v], 0);
  for (const v of labels) {
    base[v] /= s || 1;
  }
  const floored = applyFloorAndRenormalize(base, labels, minWeight);
  if (floored) return floored;
  const eq = 1 / labels.length;
  const out = {};
  for (const v of labels) out[v] = eq;
  return out;
}
