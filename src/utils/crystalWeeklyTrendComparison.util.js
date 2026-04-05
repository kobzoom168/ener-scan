/**
 * Week-over-week drift on top of Phase 7 `buildCrystalWeeklyQualityReview` summaries.
 * Template heuristics — **not** production SLOs; calibrate `TREND_HEURISTIC_DEFAULTS`.
 *
 * @module crystalWeeklyTrendComparison.util
 */
import { ROUTING_WORDING_MISMATCH_TYPE } from "./crystalRoutingWordingMetrics.util.js";

/** @typedef {import("./crystalWeeklyQualityReview.util.js").buildCrystalWeeklyQualityReview} BuildWeeklyReviewFn */
/** @typedef {ReturnType<import("./crystalWeeklyQualityReview.util.js").buildCrystalWeeklyQualityReview>} CrystalWeeklyQualityReviewSummary */

export const CRYSTAL_WEEKLY_TREND_VERSION = "1";

/**
 * @typedef {Object} TrendHeuristicThresholds
 * @property {number} hardRateDeltaEscalate — absolute rate delta (0..1) week-over-week
 * @property {number} hardRateLevelEscalate — current-week hard rate triggers escalate
 * @property {number} ofmShareDeltaEscalate
 * @property {number} catShareDeltaEscalate
 * @property {number} softRateDeltaWatch
 * @property {number} genericFallbackDeltaWatch
 * @property {number} genericFallbackDeltaInvestigate
 * @property {number} fallbackHeavyDeltaInvestigate
 * @property {number} weakProtectDeltaInvestigate
 * @property {number} crystalSpecificDropInvestigate — negative delta (drop) threshold
 * @property {number} ruleShareDeltaWatch — largest single-rule |Δshare|
 * @property {number} decisionSourceShareDeltaWatch
 */

export const TREND_HEURISTIC_DEFAULTS = {
  hardRateDeltaEscalate: 0.035,
  hardRateLevelEscalate: 0.065,
  ofmShareDeltaEscalate: 0.012,
  catShareDeltaEscalate: 0.012,
  softRateDeltaWatch: 0.045,
  genericFallbackDeltaWatch: 0.04,
  genericFallbackDeltaInvestigate: 0.075,
  fallbackHeavyDeltaInvestigate: 0.055,
  weakProtectDeltaInvestigate: 0.07,
  crystalSpecificDropInvestigate: -0.055,
  ruleShareDeltaWatch: 0.07,
  decisionSourceShareDeltaWatch: 0.08,
};

/**
 * @param {CrystalWeeklyQualityReviewSummary} s
 * @param {string} type
 */
function mismatchShare(s, type) {
  const row = (s.topMismatchTypes || []).find((x) => x.mismatchType === type);
  const c = row ? row.count : 0;
  const t = s.totalCrystalCases || 0;
  return t > 0 ? c / t : 0;
}

/**
 * @param {{ key: string, currentCount: number, previousCount: number, currentShare: number, previousShare: number, deltaShare: number }[]} shifts
 */
function maxAbsDeltaShare(shifts) {
  let m = 0;
  for (const x of shifts) {
    const a = Math.abs(x.deltaShare);
    if (a > m) m = a;
  }
  return m;
}

/**
 * @template {{ count: number }} T
 * @param {T[]} curList
 * @param {T[]} prevList
 * @param {(x: T) => string} keyFn
 * @param {number} curTot
 * @param {number} prevTot
 */
function distributionShifts(curList, prevList, keyFn, curTot, prevTot) {
  const keys = new Set();
  for (const x of curList || []) keys.add(keyFn(x));
  for (const x of prevList || []) keys.add(keyFn(x));
  const out = [];
  for (const k of [...keys].sort((a, b) => a.localeCompare(b))) {
    const cc = (curList || []).find((x) => keyFn(x) === k)?.count ?? 0;
    const pc = (prevList || []).find((x) => keyFn(x) === k)?.count ?? 0;
    const cs = curTot > 0 ? cc / curTot : 0;
    const ps = prevTot > 0 ? pc / prevTot : 0;
    out.push({
      key: k,
      currentCount: cc,
      previousCount: pc,
      currentShare: cs,
      previousShare: ps,
      deltaShare: cs - ps,
    });
  }
  out.sort(
    (a, b) =>
      Math.abs(b.deltaShare) - Math.abs(a.deltaShare) || a.key.localeCompare(b.key),
  );
  return out;
}

/**
 * @param {CrystalWeeklyQualityReviewSummary} current
 * @param {CrystalWeeklyQualityReviewSummary} previous
 * @param {TrendHeuristicThresholds} t
 */
/**
 * @param {CrystalWeeklyQualityReviewSummary} current
 * @param {CrystalWeeklyQualityReviewSummary} previous
 * @param {Record<string, number>} rateDiffs
 * @param {{ key: string, deltaShare: number }[]} topRuleShifts
 * @param {{ key: string, deltaShare: number }[]} _topMismatchShifts
 * @param {{ key: string, deltaShare: number }[]} topDecisionShifts
 * @param {TrendHeuristicThresholds} t
 */
function deriveTrendStatus(current, previous, rateDiffs, topRuleShifts, _topMismatchShifts, topDecisionShifts, t) {
  const th = { ...TREND_HEURISTIC_DEFAULTS, ...t };
  const cur = current;
  const prev = previous;

  const ofmCur = mismatchShare(cur, ROUTING_WORDING_MISMATCH_TYPE.OBJECT_FAMILY_MISMATCH);
  const ofmPrev = mismatchShare(prev, ROUTING_WORDING_MISMATCH_TYPE.OBJECT_FAMILY_MISMATCH);
  const catCur = mismatchShare(cur, ROUTING_WORDING_MISMATCH_TYPE.CATEGORY_MISMATCH);
  const catPrev = mismatchShare(prev, ROUTING_WORDING_MISMATCH_TYPE.CATEGORY_MISMATCH);

  const hardDelta = rateDiffs.hardMismatchRate;
  const maxRule = maxAbsDeltaShare(topRuleShifts);

  /** Escalate tier (checked first) */
  if (cur.hardMismatchRate >= th.hardRateLevelEscalate && hardDelta > 0) {
    return {
      trendStatus: "escalate",
      driftSignals: ["hard_mismatch_rate_level"],
      stableItems: [],
      watchItems: [],
      investigateItems: [],
      escalateItems: [
        `Hard mismatch rate ${(cur.hardMismatchRate * 100).toFixed(1)}% vs ${(prev.hardMismatchRate * 100).toFixed(1)}% (template level).`,
      ],
    };
  }
  if (hardDelta >= th.hardRateDeltaEscalate && cur.hardMismatchRate >= 0.03) {
    return {
      trendStatus: "escalate",
      driftSignals: ["hard_mismatch_rate_shift"],
      stableItems: [],
      watchItems: [],
      investigateItems: [],
      escalateItems: [
        `Hard mismatch rate Δ ${(hardDelta * 100).toFixed(2)} pp; current ${(cur.hardMismatchRate * 100).toFixed(1)}%.`,
      ],
    };
  }
  if (ofmCur - ofmPrev >= th.ofmShareDeltaEscalate && ofmCur >= 0.008) {
    return {
      trendStatus: "escalate",
      driftSignals: ["object_family_mismatch_share_shift"],
      stableItems: [],
      watchItems: [],
      investigateItems: [],
      escalateItems: [
        `Object-family mismatch share Δ ${((ofmCur - ofmPrev) * 100).toFixed(2)} pp (template).`,
      ],
    };
  }
  if (catCur - catPrev >= th.catShareDeltaEscalate && catCur >= 0.008) {
    return {
      trendStatus: "escalate",
      driftSignals: ["category_mismatch_share_shift"],
      stableItems: [],
      watchItems: [],
      investigateItems: [],
      escalateItems: [
        `Category mismatch share Δ ${((catCur - catPrev) * 100).toFixed(2)} pp (template).`,
      ],
    };
  }

  /** Investigate tier */
  const inv = [];
  if (rateDiffs.fallbackHeavyRate >= th.fallbackHeavyDeltaInvestigate) {
    inv.push(`Fallback-heavy rate Δ ${(rateDiffs.fallbackHeavyRate * 100).toFixed(2)} pp.`);
  }
  if (rateDiffs.weakProtectDefaultRate >= th.weakProtectDeltaInvestigate) {
    inv.push(`Weak-protect default rate Δ ${(rateDiffs.weakProtectDefaultRate * 100).toFixed(2)} pp.`);
  }
  if (rateDiffs.crystalSpecificSurfaceRate <= th.crystalSpecificDropInvestigate) {
    inv.push(
      `Crystal-specific surface rate changed ${(rateDiffs.crystalSpecificSurfaceRate * 100).toFixed(2)} pp.`,
    );
  }
  if (rateDiffs.genericFallbackRate >= th.genericFallbackDeltaInvestigate) {
    inv.push(`Generic fallback rate Δ ${(rateDiffs.genericFallbackRate * 100).toFixed(2)} pp.`);
  }
  const maxDs = maxAbsDeltaShare(topDecisionShifts);
  if (maxDs >= th.decisionSourceShareDeltaWatch && rateDiffs.genericFallbackRate >= th.genericFallbackDeltaWatch) {
    inv.push("Decision source mix shifted alongside generic fallback movement.");
  }

  if (inv.length > 0) {
    return {
      trendStatus: "investigate",
      driftSignals: ["rate_or_mix_shift_investigate_band"],
      stableItems: [],
      watchItems: [],
      investigateItems: inv,
      escalateItems: [],
    };
  }

  /** Watch tier */
  const watch = [];
  if (rateDiffs.softMismatchRate >= th.softRateDeltaWatch) {
    watch.push(`Soft mismatch rate Δ ${(rateDiffs.softMismatchRate * 100).toFixed(2)} pp.`);
  }
  if (rateDiffs.genericFallbackRate >= th.genericFallbackDeltaWatch) {
    watch.push(`Generic fallback rate Δ ${(rateDiffs.genericFallbackRate * 100).toFixed(2)} pp.`);
  }
  if (maxRule >= th.ruleShareDeltaWatch) {
    watch.push(`Largest routing rule share move ≈ ${(maxRule * 100).toFixed(1)} pp (template).`);
  }

  if (watch.length > 0) {
    return {
      trendStatus: "watch",
      driftSignals: ["elevated_week_over_week_noise_band"],
      stableItems: [],
      watchItems: watch,
      investigateItems: [],
      escalateItems: [],
    };
  }

  return {
    trendStatus: "stable",
    driftSignals: ["within_template_week_over_week_band"],
    stableItems: [
      "Rate deltas and distribution shifts are small versus template thresholds (calibrate for your traffic).",
    ],
    watchItems: [],
    investigateItems: [],
    escalateItems: [],
  };
}

function buildRecommendations(trendStatus, rateDiffs, topRuleShifts, topMismatchShifts) {
  const rec = [];
  if (trendStatus === "escalate") {
    rec.push("Pull exemplar logs for hard / object-family / category mismatches in the current window.");
    rec.push("Cross-check deploy scope vs routing or wording changes.");
  } else if (trendStatus === "investigate") {
    rec.push("Review DB crystal row availability and fallback depth if fallback-heavy moved.");
    rec.push("Compare weak-protect default share to fixtures / rule-map if that rate moved.");
  } else if (trendStatus === "watch") {
    rec.push("Continue monitoring next week; validate generic code-bank share if wording path changed.");
  } else {
    rec.push("Optional: keep baseline snapshot for the next comparison.");
  }
  const topRule = topRuleShifts[0];
  if (topRule && Math.abs(topRule.deltaShare) > 0.03) {
    rec.push(`Largest rule shift: \`${topRule.key}\` (Δshare ${(topRule.deltaShare * 100).toFixed(1)} pp).`);
  }
  const topMm = topMismatchShifts[0];
  if (topMm && Math.abs(topMm.deltaShare) > 0.02) {
    rec.push(`Largest mismatch-type shift: \`${topMm.key}\`.`);
  }
  return rec;
}

/**
 * @param {CrystalWeeklyQualityReviewSummary} currentSummary
 * @param {CrystalWeeklyQualityReviewSummary} previousSummary
 * @param {{ generatedAt?: string, heuristicThresholds?: Partial<TrendHeuristicThresholds> }} [options]
 */
export function buildCrystalWeeklyTrendComparison(currentSummary, previousSummary, options = {}) {
  const cur = currentSummary;
  const prev = previousSummary;
  const generatedAt = options.generatedAt != null ? String(options.generatedAt) : new Date().toISOString();
  const t = { ...TREND_HEURISTIC_DEFAULTS, ...options.heuristicThresholds };

  const rateDiffs = {
    alignedRate: cur.alignedRate - prev.alignedRate,
    softMismatchRate: cur.softMismatchRate - prev.softMismatchRate,
    hardMismatchRate: cur.hardMismatchRate - prev.hardMismatchRate,
    crystalSpecificSurfaceRate: cur.crystalSpecificSurfaceRate - prev.crystalSpecificSurfaceRate,
    genericFallbackRate: cur.genericFallbackRate - prev.genericFallbackRate,
    fallbackHeavyRate: cur.fallbackHeavyRate - prev.fallbackHeavyRate,
    weakProtectDefaultRate: cur.weakProtectDefaultRate - prev.weakProtectDefaultRate,
  };

  const metricDiffs = {
    totalCrystalCases: cur.totalCrystalCases - prev.totalCrystalCases,
    alignedCount: cur.alignedCount - prev.alignedCount,
    softMismatchCount: cur.softMismatchCount - prev.softMismatchCount,
    hardMismatchCount: cur.hardMismatchCount - prev.hardMismatchCount,
  };

  const ct = cur.totalCrystalCases || 0;
  const pt = prev.totalCrystalCases || 0;

  const topRuleShifts = distributionShifts(
    cur.topRoutingRuleIds || [],
    prev.topRoutingRuleIds || [],
    (x) => x.ruleId,
    ct,
    pt,
  );
  const topMismatchShifts = distributionShifts(
    cur.topMismatchTypes || [],
    prev.topMismatchTypes || [],
    (x) => x.mismatchType,
    ct,
    pt,
  );
  const topDecisionSourceShifts = distributionShifts(
    cur.topDecisionSources || [],
    prev.topDecisionSources || [],
    (x) => x.source,
    ct,
    pt,
  );

  const pack = deriveTrendStatus(
    cur,
    prev,
    rateDiffs,
    topRuleShifts,
    topMismatchShifts,
    topDecisionSourceShifts,
    t,
  );
  const recommendations = buildRecommendations(
    pack.trendStatus,
    rateDiffs,
    topRuleShifts,
    topMismatchShifts,
  );

  return {
    comparisonVersion: CRYSTAL_WEEKLY_TREND_VERSION,
    generatedAt,
    currentWindow: { start: cur.windowStart, end: cur.windowEnd },
    previousWindow: { start: prev.windowStart, end: prev.windowEnd },
    totalCrystalCasesCurrent: cur.totalCrystalCases,
    totalCrystalCasesPrevious: prev.totalCrystalCases,
    reviewStatusDelta: { current: cur.reviewStatus, previous: prev.reviewStatus },
    metricDiffs,
    rateDiffs,
    topRuleShifts,
    topMismatchShifts,
    topDecisionSourceShifts,
    driftSignals: pack.driftSignals,
    trendStatus: pack.trendStatus,
    stableItems: pack.stableItems,
    watchItems: pack.watchItems,
    investigateItems: pack.investigateItems,
    escalateItems: pack.escalateItems,
    recommendations,
    heuristicNote:
      "Template week-over-week trend heuristics — calibrate thresholds; not production truth. Excludes non-crystal rows from rate denominators (Phase 7 summaries).",
  };
}

/**
 * @param {ReturnType<typeof buildCrystalWeeklyTrendComparison>} comparison
 * @param {object} [_options]
 */
export function buildCrystalWeeklyDriftSignals(comparison, _options) {
  return {
    codes: comparison.driftSignals || [],
    trendStatus: comparison.trendStatus,
    topRuleShiftMaxAbs: comparison.topRuleShifts[0]
      ? Math.abs(comparison.topRuleShifts[0].deltaShare)
      : 0,
    topMismatchShiftMaxAbs: comparison.topMismatchShifts[0]
      ? Math.abs(comparison.topMismatchShifts[0].deltaShare)
      : 0,
  };
}

/**
 * @param {ReturnType<typeof buildCrystalWeeklyTrendComparison>} comparison
 */
export function renderCrystalWeeklyTrendComparisonMarkdown(comparison) {
  const w = (s) => (s == null ? "" : String(s));
  const pp = (x) =>
    typeof x === "number" && Number.isFinite(x) ? `${(x * 100).toFixed(2)} pp` : "—";
  const lines = [];
  lines.push("# Crystal weekly trend comparison (week-over-week)");
  lines.push("");
  lines.push("## A. Header");
  lines.push("");
  lines.push(`- **Generated at:** ${w(comparison.generatedAt)}`);
  lines.push(`- **Trend status (template):** \`${w(comparison.trendStatus)}\``);
  lines.push(
    `- **Current window:** ${w(comparison.currentWindow?.start)} → ${w(comparison.currentWindow?.end)}`,
  );
  lines.push(
    `- **Previous window:** ${w(comparison.previousWindow?.start)} → ${w(comparison.previousWindow?.end)}`,
  );
  lines.push(
    `- **Review status:** current \`${w(comparison.reviewStatusDelta?.current)}\` · previous \`${w(comparison.reviewStatusDelta?.previous)}\``,
  );
  lines.push("");
  lines.push(`> ${w(comparison.heuristicNote)}`);
  lines.push("");
  lines.push("## B. Executive delta summary");
  lines.push("");
  lines.push(
    `- **Total crystal cases:** ${comparison.totalCrystalCasesCurrent} (current) vs ${comparison.totalCrystalCasesPrevious} (previous); Δ ${comparison.metricDiffs.totalCrystalCases}`,
  );
  lines.push(`- **Aligned rate Δ:** ${pp(comparison.rateDiffs.alignedRate)}`);
  lines.push(`- **Soft mismatch rate Δ:** ${pp(comparison.rateDiffs.softMismatchRate)}`);
  lines.push(`- **Hard mismatch rate Δ:** ${pp(comparison.rateDiffs.hardMismatchRate)}`);
  lines.push(`- **Crystal-specific surface rate Δ:** ${pp(comparison.rateDiffs.crystalSpecificSurfaceRate)}`);
  lines.push(`- **Generic fallback rate Δ:** ${pp(comparison.rateDiffs.genericFallbackRate)}`);
  lines.push("");
  lines.push("## C. Top drifts");
  lines.push("");
  lines.push("### Mismatch type share shifts (current − previous)");
  lines.push("");
  for (const x of comparison.topMismatchShifts.slice(0, 14)) {
    lines.push(
      `- \`${x.key}\`: Δshare ${pp(x.deltaShare)} (prev ${(x.previousShare * 100).toFixed(1)}% → curr ${(x.currentShare * 100).toFixed(1)}%)`,
    );
  }
  lines.push("");
  lines.push("### Routing rule share shifts");
  lines.push("");
  for (const x of comparison.topRuleShifts.slice(0, 14)) {
    lines.push(
      `- \`${x.key}\`: Δshare ${pp(x.deltaShare)} (counts ${x.previousCount} → ${x.currentCount})`,
    );
  }
  lines.push("");
  lines.push("### Wording decision source shifts");
  lines.push("");
  for (const x of comparison.topDecisionSourceShifts.slice(0, 14)) {
    lines.push(`- \`${x.key}\`: Δshare ${pp(x.deltaShare)}`);
  }
  lines.push("");
  lines.push("## D. Risk calls");
  lines.push("");
  lines.push("### Stable");
  lines.push("");
  for (const x of comparison.stableItems) lines.push(`- ${x}`);
  lines.push("");
  lines.push("### Watch");
  lines.push("");
  if (!comparison.watchItems.length) lines.push("_None (template)._");
  else for (const x of comparison.watchItems) lines.push(`- ${x}`);
  lines.push("");
  lines.push("### Investigate");
  lines.push("");
  if (!comparison.investigateItems.length) lines.push("_None (template)._");
  else for (const x of comparison.investigateItems) lines.push(`- ${x}`);
  lines.push("");
  lines.push("### Escalate");
  lines.push("");
  if (!comparison.escalateItems.length) lines.push("_None (template)._");
  else for (const x of comparison.escalateItems) lines.push(`- ${x}`);
  lines.push("");
  lines.push("## E. Suggested next actions");
  lines.push("");
  for (const r of comparison.recommendations) lines.push(`- ${r}`);
  lines.push("");
  lines.push("## F. Appendix — rate diffs & snapshots");
  lines.push("");
  lines.push("### Rate diffs (raw, 0..1 scale)");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(comparison.rateDiffs, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Metric count diffs");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(comparison.metricDiffs, null, 2));
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}
