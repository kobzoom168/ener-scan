/**
 * Quarterly crystal quality review pack + executive summary (offline).
 * Consumes **monthly rollups / scorecards** (see `docs/ops/crystal-quarterly-review-pack.md`).
 * Template heuristics — **not** canonical production SLOs.
 *
 * Reuses {@link buildCrystalMonthlyScorecard} for per-month scoring; aggregates deterministically.
 *
 * @module crystalQuarterlyReviewPack.util
 */

import { buildCrystalMonthlyScorecard } from "./crystalMonthlyScorecard.util.js";

export const REVIEW_PACK_VERSION = "1";

/** @typedef {"excellent"|"good"|"watch"|"risk"} QuarterScoreBand */
/** @typedef {"healthy"|"watch"|"investigate"|"escalate"} QuarterlyOpsStatus */

/**
 * @typedef {Object} QuarterlyAnomalyEvent
 * @property {string} anomalyCode
 * @property {"low"|"medium"|"high"} [severity]
 * @property {string} [routingRuleId]
 * @property {string} [decisionSource]
 * @property {string} [likelyCause]
 * @property {string} [suggestedNextAction]
 */

/**
 * @typedef {Object} QuarterlyMonthInput
 * @property {import("./crystalMonthlyScorecard.util.js").CrystalMonthlyRollupInput} [rollup] — monthly rollup; required unless full scorecard passed as month entry
 * @property {import("./crystalMonthlyScorecard.util.js").CrystalMonthlyScorecard} [scorecard] — optional pre-built scorecard (skips rollup build)
 * @property {QuarterlyAnomalyEvent[]} [anomalyEvents] — optional structured digest rows for recurrence
 */

/**
 * @typedef {Object} CrystalQuarterlyReviewInput
 * @property {string} quarterWindowStart
 * @property {string} quarterWindowEnd
 * @property {string} [generatedAt]
 * @property {(QuarterlyMonthInput|import("./crystalMonthlyScorecard.util.js").CrystalMonthlyRollupInput)[]} months — 1..N monthly slices (typically 3)
 */

/**
 * @typedef {Object} QuarterlyExecutiveSummary
 * @property {string} executiveSummaryHeadline
 * @property {string} executiveSummaryBody
 * @property {string[]} top3Wins
 * @property {string[]} top3Risks
 * @property {string[]} top3NextActions
 */

/**
 * @typedef {Object} QuarterlyKpiPack
 * @property {{ label: string, value: string|number, unit?: string }[]} headlineKpis
 * @property {{ label: string, value: string|number, unit?: string }[]} supportingKpis
 * @property {{ label: string, value: string|number, triggered?: boolean }[]} riskIndicators
 * @property {{ label: string, value: string|number }[]} trendIndicators
 * @property {{ label: string, value: string|number, monthsAffected?: number }[]} recurringSignals
 * @property {string[]} recommendedFocusAreas
 */

const BAND_THRESH = { EXCELLENT: 82, GOOD: 68, WATCH: 52 };

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function num(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function scoreToQuarterBand(score) {
  const s = num(score);
  if (s >= BAND_THRESH.EXCELLENT) return "excellent";
  if (s >= BAND_THRESH.GOOD) return "good";
  if (s >= BAND_THRESH.WATCH) return "watch";
  return "risk";
}

/**
 * @param {import("./crystalMonthlyScorecard.util.js").CrystalMonthlyScorecard[]} monthCards
 * @param {Record<string, number>} quarterlyKpis — aggregated rates + counts
 */
function weightedQuarterlyRates(monthCards) {
  let wSum = 0;
  const keys = [
    "alignedRate",
    "softMismatchRate",
    "hardMismatchRate",
    "crystalSpecificSurfaceRate",
    "genericFallbackRate",
    "fallbackHeavyRate",
    "weakProtectDefaultRate",
  ];
  const acc = Object.fromEntries(keys.map((k) => [k, 0]));

  for (const c of monthCards) {
    const w = num(c.kpis.totalCrystalCases, 0);
    wSum += w;
    for (const k of keys) {
      acc[k] += num(c.kpis[k], 0) * w;
    }
  }

  if (wSum <= 0) {
    for (const k of keys) acc[k] = monthCards.length ? monthCards.reduce((s, c) => s + num(c.kpis[k], 0), 0) / monthCards.length : 0;
    return acc;
  }
  for (const k of keys) acc[k] = acc[k] / wSum;
  return acc;
}

function sumKpis(monthCards, key) {
  return monthCards.reduce((s, c) => s + num(c.kpis[key], 0), 0);
}

function maxKpis(monthCards, key) {
  return monthCards.reduce((m, c) => Math.max(m, num(c.kpis[key], 0)), 0);
}

function countMonthsAbove(monthCards, predicate) {
  return monthCards.filter(predicate).length;
}

/**
 * @param {import("./crystalMonthlyScorecard.util.js").CrystalMonthlyScorecard[]} monthCards
 * @param {Map<string, { months: Set<string>, severities: Set<string>, rules: Set<string>, sources: Set<string>, causes: Set<string>, actions: Set<string> }>} anomalyMap
 */
function deriveQuarterlyOpsStatus(monthCards, quarterlyRates, anomalyMap) {
  const bands = monthCards.map((c) => c.scoreBand);
  const riskMonths = countMonthsAbove(monthCards, (c) => c.scoreBand === "risk");
  const watchMonths = countMonthsAbove(monthCards, (c) => c.scoreBand === "watch");

  const hmcMonths = countMonthsAbove(monthCards, (c) => num(c.kpis.hardMismatchClusterCount) >= 1);
  const ofmMonths = countMonthsAbove(monthCards, (c) => num(c.kpis.objectFamilyMismatchClusterCount) >= 1);
  const catMonths = countMonthsAbove(monthCards, (c) => num(c.kpis.categoryMismatchClusterCount) >= 1);
  const gfcMonths = countMonthsAbove(monthCards, (c) => num(c.kpis.genericFallbackClusterCount) >= 2);

  const dropMonths = countMonthsAbove(monthCards, (c) => c.kpis.crystalSpecificUsageDropFlag === true);

  const fbHeavyMonths = countMonthsAbove(monthCards, (c) => num(c.kpis.fallbackHeavyRate) >= 0.12);
  const wpMonths = countMonthsAbove(monthCards, (c) => num(c.kpis.weakProtectDefaultRate) >= 0.18);
  const genFbMonths = countMonthsAbove(monthCards, (c) => num(c.kpis.genericFallbackRate) >= 0.14);

  const softDriftMonths = countMonthsAbove(monthCards, (c) => num(c.kpis.softMismatchRate) >= 0.06);

  const recurringHardCode = [...anomalyMap.keys()].filter(
    (k) =>
      /hard_mismatch|hard mismatch/i.test(k) &&
      (anomalyMap.get(k)?.months.size ?? 0) >= 2,
  );
  const recurringOfm = [...anomalyMap.keys()].filter(
    (k) =>
      /object.family|object_family/i.test(k) && (anomalyMap.get(k)?.months.size ?? 0) >= 2,
  );
  const recurringCat = [...anomalyMap.keys()].filter(
    (k) =>
      /category_mismatch|category mismatch/i.test(k) && (anomalyMap.get(k)?.months.size ?? 0) >= 2,
  );

  // Priority: escalate > investigate > watch > healthy
  if (
    riskMonths >= 2 ||
    hmcMonths >= 2 ||
    recurringHardCode.length > 0 ||
    (ofmMonths >= 2 && num(quarterlyRates.hardMismatchRate) >= 0.025) ||
    catMonths >= 2 ||
    recurringOfm.length > 0 ||
    recurringCat.length > 0
  ) {
    return /** @type {QuarterlyOpsStatus} */ ("escalate");
  }

  if (
    dropMonths >= 2 ||
    (fbHeavyMonths >= 2 && num(quarterlyRates.fallbackHeavyRate) >= 0.1) ||
    (wpMonths >= 2 && num(quarterlyRates.weakProtectDefaultRate) >= 0.14) ||
    gfcMonths >= 2
  ) {
    return /** @type {QuarterlyOpsStatus} */ ("investigate");
  }

  if (watchMonths >= 2 || genFbMonths >= 2 || softDriftMonths >= 2 || gfcMonths >= 1) {
    return /** @type {QuarterlyOpsStatus} */ ("watch");
  }

  return /** @type {QuarterlyOpsStatus} */ ("healthy");
}

/**
 * @param {CrystalQuarterlyReviewInput} input
 * @param {import("./crystalMonthlyScorecard.util.js").CrystalMonthlyScorecard[]} monthCards
 * @param {Map<string, object>} anomalyMap
 */
function buildRecurringAnomalyRows(anomalyMap, monthCards) {
  const rows = [];
  for (const [code, data] of anomalyMap.entries()) {
    const monthsAffected = data.months.size;
    if (monthsAffected === 0) continue;
    const sev = [...data.severities].includes("high")
      ? "high"
      : [...data.severities].includes("medium")
        ? "medium"
        : "low";
    rows.push({
      anomalyCode: code,
      monthsAffected,
      monthLabels: [...data.months].sort(),
      severity: sev,
      likelyCauses: [...data.causes].filter(Boolean).slice(0, 5),
      suggestedNextActions: [...data.actions].filter(Boolean).slice(0, 5),
    });
  }
  rows.sort((a, b) => b.monthsAffected - a.monthsAffected || a.anomalyCode.localeCompare(b.anomalyCode));
  return rows;
}

function buildMismatchRecurrence(monthCards) {
  const types = [];
  const hardM = countMonthsAbove(monthCards, (c) => num(c.kpis.hardMismatchRate) >= 0.04);
  const softM = countMonthsAbove(monthCards, (c) => num(c.kpis.softMismatchRate) >= 0.06);
  const gen = countMonthsAbove(monthCards, (c) => num(c.kpis.genericFallbackRate) >= 0.14);
  if (hardM >= 2) types.push({ mismatchType: "hard_mismatch_elevated", monthsAffected: hardM });
  if (softM >= 2) types.push({ mismatchType: "soft_mismatch_elevated", monthsAffected: softM });
  if (gen >= 2) types.push({ mismatchType: "generic_fallback_elevated", monthsAffected: gen });
  return types;
}

function aggregateAnomalyEvents(monthCards, monthInputs) {
  /** @type {Map<string, { months: Set<string>, severities: Set<string>, rules: Set<string>, sources: Set<string>, causes: Set<string>, actions: Set<string> }>} */
  const map = new Map();

  monthInputs.forEach((mi, idx) => {
    const card = monthCards[idx];
    const label = String(card.monthWindowStart || `month_${idx}`);
    const events = mi && typeof mi === "object" && "anomalyEvents" in mi && Array.isArray(mi.anomalyEvents) ? mi.anomalyEvents : [];

    for (const ev of events) {
      const code = String(ev.anomalyCode || "").trim();
      if (!code) continue;
      if (!map.has(code)) {
        map.set(code, {
          months: new Set(),
          severities: new Set(),
          rules: new Set(),
          sources: new Set(),
          causes: new Set(),
          actions: new Set(),
        });
      }
      const bucket = map.get(code);
      bucket.months.add(label);
      if (ev.severity) bucket.severities.add(String(ev.severity));
      if (ev.routingRuleId) bucket.rules.add(String(ev.routingRuleId));
      if (ev.decisionSource) bucket.sources.add(String(ev.decisionSource));
      if (ev.likelyCause) bucket.causes.add(String(ev.likelyCause));
      if (ev.suggestedNextAction) bucket.actions.add(String(ev.suggestedNextAction));
    }
  });

  return map;
}

function normalizeMonthInput(raw, idx, generatedAt) {
  if (raw && typeof raw === "object" && "rollup" in raw && raw.rollup) {
    return {
      rollup: raw.rollup,
      anomalyEvents: raw.anomalyEvents,
      scorecard: raw.scorecard,
    };
  }
  if (raw && typeof raw === "object" && "scorecard" in raw && raw.scorecard) {
    return { rollup: null, anomalyEvents: raw.anomalyEvents, scorecard: raw.scorecard };
  }
  return { rollup: raw, anomalyEvents: undefined, scorecard: undefined };
}

function monthKey(card, idx) {
  return String(card.monthWindowStart || `M${idx + 1}`);
}

/**
 * @param {import("./crystalMonthlyScorecard.util.js").CrystalMonthlyScorecard[]} monthCards
 */
function scoreDriftMetric(monthCards) {
  const bands = monthCards.map((c) => c.scoreBand);
  const risk = bands.filter((b) => b === "risk").length;
  const watch = bands.filter((b) => b === "watch").length;
  if (risk >= 2) return "score_band_risk_months";
  if (watch >= 2) return "score_band_watch_months";
  if (bands.some((b) => b === "risk")) return "score_band_risk_present";
  return "stable_or_improving";
}

/**
 * @param {CrystalQuarterlyReviewInput} input
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalQuarterlyReviewPack(input, options = {}) {
  const q = input || {};
  const generatedAt =
    q.generatedAt != null ? String(q.generatedAt) : options.generatedAt != null
      ? String(options.generatedAt)
      : new Date().toISOString();

  const rawMonths = Array.isArray(q.months) ? q.months : [];
  const normalized = rawMonths.map((m, i) => normalizeMonthInput(m, i, generatedAt));

  /** @type {import("./crystalMonthlyScorecard.util.js").CrystalMonthlyScorecard[]} */
  const monthCards = [];
  for (let i = 0; i < normalized.length; i++) {
    const n = normalized[i];
    if (n.scorecard) {
      monthCards.push(structuredClone(n.scorecard));
    } else if (n.rollup) {
      monthCards.push(
        buildCrystalMonthlyScorecard(n.rollup, {
          generatedAt: n.rollup.generatedAt ?? generatedAt,
        }),
      );
    }
  }

  if (monthCards.length === 0) {
    throw new Error("buildCrystalQuarterlyReviewPack: `months` must include at least one rollup or scorecard.");
  }

  const rates = weightedQuarterlyRates(monthCards);
  let wScore = 0;
  let wSum = 0;
  for (const c of monthCards) {
    const w = num(c.kpis.totalCrystalCases, 0);
    wScore += num(c.overallQualityScore, 0) * w;
    wSum += w;
  }
  const overallQuarterQualityScore =
    wSum > 0 ? Math.round(wScore / wSum) : Math.round(monthCards.reduce((s, c) => s + num(c.overallQualityScore, 0), 0) / monthCards.length);

  const quarterScoreBand = scoreToQuarterBand(overallQuarterQualityScore);

  const anomalyMap = aggregateAnomalyEvents(monthCards, normalized);
  const quarterlyStatus = deriveQuarterlyOpsStatus(monthCards, rates, anomalyMap);

  const quarterlyKpis = {
    ...rates,
    totalCrystalCases: sumKpis(monthCards, "totalCrystalCases"),
    recurringAnomalyCountQuarterly: sumKpis(monthCards, "recurringAnomalyCount"),
    hardMismatchClusterCountMax: maxKpis(monthCards, "hardMismatchClusterCount"),
    genericFallbackClusterCountMax: maxKpis(monthCards, "genericFallbackClusterCount"),
    objectFamilyMismatchClusterCountMax: maxKpis(monthCards, "objectFamilyMismatchClusterCount"),
    categoryMismatchClusterCountMax: maxKpis(monthCards, "categoryMismatchClusterCount"),
    notApplicableRowCountQuarterly: sumKpis(monthCards, "notApplicableRowCount"),
    topRoutingRuleShareQuarterly:
      monthCards.map((c) => c.kpis.topRoutingRuleShare).find((x) => x != null && Number.isFinite(x)) ?? null,
    topWordingSourceShareQuarterly:
      monthCards.map((c) => c.kpis.topWordingSourceShare).find((x) => x != null && Number.isFinite(x)) ?? null,
  };

  const monthlyStatusDistribution = monthCards.reduce((acc, c) => {
    acc[c.scoreBand] = (acc[c.scoreBand] || 0) + 1;
    return acc;
  }, {});

  const monthlyScoreDistribution = monthCards.reduce((acc, c) => {
    const b = scoreToQuarterBand(c.overallQualityScore);
    acc[b] = (acc[b] || 0) + 1;
    return acc;
  }, {});

  const topRecurringAnomalies = buildRecurringAnomalyRows(anomalyMap, monthCards);
  const topRecurringMismatchTypes = buildMismatchRecurrence(monthCards);

  const ruleCount = new Map();
  const srcCount = new Map();
  for (const [, data] of anomalyMap.entries()) {
    for (const r of data.rules) ruleCount.set(r, (ruleCount.get(r) || 0) + 1);
    for (const s of data.sources) srcCount.set(s, (srcCount.get(s) || 0) + 1);
  }
  const topRecurringRoutingRuleIds = [...ruleCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([routingRuleId, quarters]) => ({ routingRuleId, recurrenceWeight: quarters }));
  const topRecurringDecisionSources = [...srcCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([decisionSource, quarters]) => ({ decisionSource, recurrenceWeight: quarters }));

  const recurringRiskAreasSet = new Set();
  if (quarterlyStatus === "escalate") recurringRiskAreasSet.add("hard_mismatch_and_cluster_pressure");
  if (quarterlyStatus === "investigate") recurringRiskAreasSet.add("fallback_and_protect_defaults");
  if (countMonthsAbove(monthCards, (c) => c.kpis.crystalSpecificUsageDropFlag) >= 2) {
    recurringRiskAreasSet.add("crystal_specific_surface_or_usage");
  }
  if (num(quarterlyKpis.notApplicableRowCountQuarterly) > num(quarterlyKpis.totalCrystalCases) * 3) {
    recurringRiskAreasSet.add("non_crystal_volume_context");
  }
  const recurringRiskAreas = [...recurringRiskAreasSet];

  const usageDropMonths = countMonthsAbove(monthCards, (c) => c.kpis.crystalSpecificUsageDropFlag === true);

  const monthByMonthRecap = monthCards.map((c, i) => ({
    monthWindowStart: c.monthWindowStart,
    monthWindowEnd: c.monthWindowEnd,
    overallQualityScore: c.overallQualityScore,
    scoreBand: c.scoreBand,
    monthlyStatus: c.monthlyStatus,
    headline: `${monthKey(c, i)}: score ${c.overallQualityScore} (${c.scoreBand}); ${c.monthlyStatus}`,
  }));

  const scorecardDriftDriver = scoreDriftMetric(monthCards);

  const packSkeleton = {
    reviewPackVersion: REVIEW_PACK_VERSION,
    quarterWindowStart: String(q.quarterWindowStart || "").trim(),
    quarterWindowEnd: String(q.quarterWindowEnd || "").trim(),
    generatedAt,
    monthsIncluded: monthCards.map((c) => c.monthWindowStart),
    quarterlyStatus,
    overallQuarterQualityScore,
    quarterScoreBand,
    quarterlyKpis,
    monthlyStatusDistribution,
    monthlyScoreDistribution,
    topRecurringAnomalies,
    topRecurringMismatchTypes,
    topRecurringRoutingRuleIds,
    topRecurringDecisionSources,
    recurringRiskAreas,
    usageDropMonths,
    scorecardDriftDriver,
    monthByMonthRecap,
    focusAreasNextQuarter: [],
    executiveSummary: /** @type {QuarterlyExecutiveSummary & { methodNote: string }} */ ({
      executiveSummaryHeadline: "",
      executiveSummaryBody: "",
      top3Wins: [],
      top3Risks: [],
      top3NextActions: [],
      methodNote: "",
    }),
    recommendations: [],
    quarterlyKpiPack: /** @type {QuarterlyKpiPack} */ ({
      headlineKpis: [],
      supportingKpis: [],
      riskIndicators: [],
      trendIndicators: [],
      recurringSignals: [],
      recommendedFocusAreas: [],
    }),
    methodNote:
      "Template quarterly review pack: status/heuristics are for ops/product discussion, not paging or production SLOs. Pair with monthly digests for narrative detail.",
  };

  packSkeleton.focusAreasNextQuarter = buildCrystalQuarterlyFocusAreas(packSkeleton);
  packSkeleton.executiveSummary = {
    ...buildCrystalQuarterlyExecutiveSummary(packSkeleton),
    methodNote:
      "Executive summary is generated only from aggregated scorecards, KPIs, and structured anomaly events in the input JSON — no external facts.",
  };
  packSkeleton.recommendations = buildQuarterlyRecommendations(packSkeleton);
  packSkeleton.quarterlyKpiPack = buildQuarterlyKpiPack(packSkeleton);

  return packSkeleton;
}

/**
 * @param {object} pack — output of buildCrystalQuarterlyReviewPack (partial allowed for tests)
 */
export function buildCrystalQuarterlyExecutiveSummary(pack) {
  const status = pack.quarterlyStatus;
  const band = pack.quarterScoreBand;
  const score = num(pack.overallQuarterQualityScore);
  const k = pack.quarterlyKpis || {};
  const aligned = num(k.alignedRate);
  const hard = num(k.hardMismatchRate);
  const spec = num(k.crystalSpecificSurfaceRate);
  const gen = num(k.genericFallbackRate);

  const headline =
    status === "healthy"
      ? `Crystal quality for the quarter is in a healthy range (template score ${score}, band ${band}).`
      : status === "watch"
        ? `Crystal quality warrants attention this quarter (template score ${score}, ops status: watch).`
        : status === "investigate"
          ? `Crystal quality shows recurring fallback/protect patterns — investigation is recommended (template score ${score}).`
          : `Crystal quality shows escalation signals (clusters, mismatch pressure, or repeated risk months) — review with owners (template score ${score}).`;

  const body = [
    `Quarterly template score ${score}/100 (${band}) aggregates monthly scorecards weighted by crystal case volume where available.`,
    `Weighted aligned rate ~${(aligned * 100).toFixed(1)}%; hard mismatch ~${(hard * 100).toFixed(1)}%; crystal-specific surface ~${(spec * 100).toFixed(1)}%; generic fallback ~${(gen * 100).toFixed(1)}%.`,
    `Ops triage status: **${status}** (heuristic from month bands, clusters, and structured anomaly recurrence — not an alert policy).`,
  ].join(" ");

  const wins = buildTopWins(pack);
  const risks = buildTopRisks(pack);
  const actions = buildTopNextActions(pack);

  return {
    executiveSummaryHeadline: headline,
    executiveSummaryBody: body,
    top3Wins: wins.slice(0, 3),
    top3Risks: risks.slice(0, 3),
    top3NextActions: actions.slice(0, 3),
  };
}

const PAD_WIN = "Quarterly aggregate includes only submitted monthly slices — confirm completeness for leadership.";
const PAD_RISK =
  "No extra risk lines inferred beyond fields in this JSON; use monthly digests for narrative confirmation.";
const PAD_ACTION =
  "Re-read monthly KPI packs if any single month changed routing or wording priority during the quarter.";

function padToThree(items, fillerLines) {
  const out = [...items];
  let i = 0;
  while (out.length < 3 && i < fillerLines.length) out.push(fillerLines[i++]);
  while (out.length < 3) out.push(PAD_ACTION);
  return out.slice(0, 3);
}

function buildTopWins(pack) {
  const out = [];
  const dist = pack.monthlyScoreDistribution || {};
  if (num(dist.excellent) >= 2) out.push("Multiple months landed in the excellent score band.");
  const k = pack.quarterlyKpis || {};
  if (num(k.alignedRate) >= 0.85) out.push(`Weighted aligned rate is strong (~${(num(k.alignedRate) * 100).toFixed(1)}%).`);
  if (num(k.hardMismatchRate) < 0.03 && pack.quarterlyStatus !== "escalate") {
    out.push("Hard mismatch rate stayed low on a quarterly blended basis.");
  }
  if (out.length === 0) out.push("Monthly scorecards are available for trend review; no standout positive signal beyond baseline.");
  return padToThree(out, [PAD_WIN]);
}

function buildTopRisks(pack) {
  const out = [];
  const st = pack.quarterlyStatus;
  const k = pack.quarterlyKpis || {};
  if (st === "escalate" || num(k.hardMismatchClusterCountMax) >= 2) {
    out.push("Repeated hard mismatch cluster signals across months or elevated hard mismatch rate.");
  }
  if (st === "investigate" || num(k.fallbackHeavyRate) >= 0.1) {
    out.push("Fallback-heavy or weak-protect-default pressure appears in multiple slices.");
  }
  if (num(k.genericFallbackRate) >= 0.12) {
    out.push(`Generic code-bank fallback share is elevated (~${(num(k.genericFallbackRate) * 100).toFixed(1)}%) on the quarter.`);
  }
  const an = pack.topRecurringAnomalies || [];
  if (an.length) {
    out.push(`Recurring digest codes include: ${an.slice(0, 3).map((x) => x.anomalyCode).join(", ")}.`);
  }
  if (out.length === 0) out.push("No dominant risk line item beyond routine monitoring; confirm with monthly digests.");
  return padToThree(out, [PAD_RISK, PAD_RISK]);
}

function buildTopNextActions(pack) {
  const st = pack.quarterlyStatus;
  const actions = [];
  if (st === "escalate") {
    actions.push("Review hard mismatch clusters and category/object-family signals with routing + wording owners.");
  }
  if (st === "investigate") {
    actions.push("Trace DB/template coverage for fallback-heavy and weak-protect-default using monthly digests.");
  }
  actions.push("Compare recurring anomalies against deploy history for the quarter.");
  if (actions.length < 3) actions.push("Keep monthly scorecard KPI pack as the standing snapshot for leadership updates.");
  return padToThree(actions, [PAD_ACTION]);
}

function buildQuarterlyRecommendations(pack) {
  const r = [];
  r.push("Use quarterly KPI pack headline row for leadership; attach monthly digests for evidence.");
  if (pack.quarterlyStatus === "watch" || pack.quarterlyStatus === "investigate") {
    r.push("Schedule a focused routing/wording/DB sync before large copy or rule batches.");
  }
  if (num(pack.quarterlyKpis?.notApplicableRowCountQuarterly) > num(pack.quarterlyKpis?.totalCrystalCases) * 4) {
    r.push("Non-crystal export volume is high versus crystal slice — interpret KPIs as crystal-only.");
  }
  return r;
}

/**
 * @param {object} pack
 */
export function buildCrystalQuarterlyFocusAreas(pack) {
  const areas = [
    "Inspect DB crystal row coverage vs generic fallback recurrence.",
    "Inspect recurring weak-protect-default share against rule-map and fixtures.",
    "Validate wording category drift month-over-month using weekly trend exports.",
    "Compare recurring anomaly codes against deploy history for the quarter.",
  ];
  if (pack.quarterlyStatus === "escalate") {
    areas.unshift("Prioritize hard mismatch / cluster remediation before broad routing refactors.");
  }
  return areas;
}

/**
 * @param {object} pack
 */
function buildQuarterlyKpiPack(pack) {
  const k = pack.quarterlyKpis || {};
  const dist = pack.monthlyStatusDistribution || {};

  return {
    headlineKpis: [
      { label: "Overall quarter quality score (template)", value: pack.overallQuarterQualityScore, unit: "0-100" },
      { label: "Aligned rate (quarterly, weighted)", value: `${(num(k.alignedRate) * 100).toFixed(1)}%` },
      { label: "Hard mismatch rate (quarterly, weighted)", value: `${(num(k.hardMismatchRate) * 100).toFixed(1)}%` },
      { label: "Crystal-specific surface rate (quarterly, weighted)", value: `${(num(k.crystalSpecificSurfaceRate) * 100).toFixed(1)}%` },
      { label: "Generic fallback rate (quarterly, weighted)", value: `${(num(k.genericFallbackRate) * 100).toFixed(1)}%` },
    ],
    supportingKpis: [
      { label: "Soft mismatch rate (quarterly, weighted)", value: `${(num(k.softMismatchRate) * 100).toFixed(1)}%` },
      { label: "Fallback-heavy rate (quarterly, weighted)", value: `${(num(k.fallbackHeavyRate) * 100).toFixed(1)}%` },
      { label: "Weak-protect-default rate (quarterly, weighted)", value: `${(num(k.weakProtectDefaultRate) * 100).toFixed(1)}%` },
      {
        label: "Monthly score band distribution",
        value: JSON.stringify(pack.monthlyScoreDistribution || {}),
      },
      {
        label: "Monthly ops-style band (scorecard)",
        value: JSON.stringify(dist),
      },
      {
        label: "Top routing rule share (first month with data)",
        value:
          k.topRoutingRuleShareQuarterly != null && Number.isFinite(k.topRoutingRuleShareQuarterly)
            ? `${(num(k.topRoutingRuleShareQuarterly) * 100).toFixed(1)}%`
            : "—",
      },
      {
        label: "Top wording source share (first month with data)",
        value:
          k.topWordingSourceShareQuarterly != null && Number.isFinite(k.topWordingSourceShareQuarterly)
            ? `${(num(k.topWordingSourceShareQuarterly) * 100).toFixed(1)}%`
            : "—",
      },
    ],
    riskIndicators: [
      {
        label: "Recurring anomaly volume (sum of monthly counts)",
        value: k.recurringAnomalyCountQuarterly,
        triggered: num(k.recurringAnomalyCountQuarterly) >= 6,
      },
      {
        label: "Max hard mismatch clusters in a month",
        value: k.hardMismatchClusterCountMax,
        triggered: num(k.hardMismatchClusterCountMax) >= 2,
      },
      {
        label: "Max object-family mismatch clusters in a month",
        value: k.objectFamilyMismatchClusterCountMax,
        triggered: num(k.objectFamilyMismatchClusterCountMax) >= 2,
      },
      {
        label: "Max category mismatch clusters in a month",
        value: k.categoryMismatchClusterCountMax,
        triggered: num(k.categoryMismatchClusterCountMax) >= 2,
      },
      {
        label: "Crystal-specific usage decline (months flagged)",
        value: num(pack.usageDropMonths, 0),
        triggered: num(pack.usageDropMonths, 0) >= 2,
      },
    ],
    trendIndicators: [
      { label: "Quarterly ops status (heuristic)", value: pack.quarterlyStatus },
      { label: "Quarter score band (template)", value: pack.quarterScoreBand },
      { label: "Score drift driver (template)", value: pack.scorecardDriftDriver || "n/a" },
      { label: "Months included", value: (pack.monthsIncluded || []).length },
    ],
    recurringSignals: (pack.topRecurringAnomalies || []).slice(0, 12).map((a) => ({
      label: a.anomalyCode,
      value: a.monthsAffected,
      monthsAffected: a.monthsAffected,
    })),
    recommendedFocusAreas: pack.focusAreasNextQuarter || [],
  };
}

/**
 * @param {object} pack
 */
export function renderCrystalQuarterlyReviewPackMarkdown(pack) {
  const w = (s) => (s == null ? "" : String(s));
  const ex = pack.executiveSummary || {};

  const lines = [];
  lines.push("# Crystal quarterly quality review pack");
  lines.push("");
  lines.push("## A. Header");
  lines.push("");
  lines.push(`- **Quarter window:** ${w(pack.quarterWindowStart)} → ${w(pack.quarterWindowEnd)}`);
  lines.push(`- **Generated at:** ${w(pack.generatedAt)}`);
  lines.push(`- **Quarterly ops status (heuristic):** \`${w(pack.quarterlyStatus)}\``);
  lines.push(`- **Overall quarter quality score (template):** ${pack.overallQuarterQualityScore} / 100`);
  lines.push(`- **Quarter score band:** \`${w(pack.quarterScoreBand)}\``);
  lines.push("");
  lines.push(`> ${w(pack.methodNote)}`);
  lines.push("");

  lines.push("## B. Executive summary");
  lines.push("");
  lines.push(`### ${w(ex.executiveSummaryHeadline)}`);
  lines.push("");
  lines.push(w(ex.executiveSummaryBody));
  lines.push("");
  lines.push(`> ${w(ex.methodNote)}`);
  lines.push("");
  lines.push("### Top 3 wins");
  for (const t of ex.top3Wins || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("### Top 3 risks");
  for (const t of ex.top3Risks || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("### Top 3 next actions");
  for (const t of ex.top3NextActions || []) lines.push(`- ${t}`);
  lines.push("");

  lines.push("## C. Quarterly KPI summary");
  lines.push("");
  const k = pack.quarterlyKpis || {};
  lines.push(`- **Aligned (weighted):** ${(num(k.alignedRate) * 100).toFixed(1)}%`);
  lines.push(`- **Soft mismatch (weighted):** ${(num(k.softMismatchRate) * 100).toFixed(1)}%`);
  lines.push(`- **Hard mismatch (weighted):** ${(num(k.hardMismatchRate) * 100).toFixed(1)}%`);
  lines.push(`- **Crystal-specific surface (weighted):** ${(num(k.crystalSpecificSurfaceRate) * 100).toFixed(1)}%`);
  lines.push(`- **Generic fallback (weighted):** ${(num(k.genericFallbackRate) * 100).toFixed(1)}%`);
  lines.push(`- **Fallback-heavy (weighted):** ${(num(k.fallbackHeavyRate) * 100).toFixed(1)}%`);
  lines.push(`- **Weak-protect-default (weighted):** ${(num(k.weakProtectDefaultRate) * 100).toFixed(1)}%`);
  lines.push(`- **Total crystal cases (sum):** ${k.totalCrystalCases}`);
  lines.push("");

  lines.push("## D. Monthly distribution summary");
  lines.push("");
  lines.push("### Monthly score band distribution");
  lines.push("```json");
  lines.push(JSON.stringify(pack.monthlyScoreDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Monthly status distribution (from monthly scorecards)");
  lines.push("```json");
  lines.push(JSON.stringify(pack.monthlyStatusDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Month-by-month recap");
  for (const row of pack.monthByMonthRecap || []) {
    lines.push(`- ${row.headline}`);
  }
  lines.push("");

  lines.push("## E. Recurring anomaly digest");
  lines.push("");
  lines.push("| Code | Months affected | Severity | Likely causes | Suggested action |");
  lines.push("|------|-----------------|----------|---------------|------------------|");
  for (const a of pack.topRecurringAnomalies || []) {
    const causes = (a.likelyCauses || []).join("; ") || "—";
    const act = (a.suggestedNextActions || []).join("; ") || "—";
    lines.push(`| ${a.anomalyCode} | ${a.monthsAffected} | ${a.severity} | ${causes} | ${act} |`);
  }
  if (!(pack.topRecurringAnomalies || []).length) lines.push("| — | — | — | — | — |");
  lines.push("");

  lines.push("## F. Risk calls");
  lines.push("");
  lines.push("### What to monitor next quarter");
  lines.push("- Soft mismatch + generic fallback if quarterly ops status is watch.");
  lines.push("");
  lines.push("### What to investigate");
  lines.push("- Fallback-heavy / weak-protect-default when ops status is investigate.");
  lines.push("");
  lines.push("### What to escalate");
  lines.push("- Hard mismatch clusters and repeated risk months when ops status is escalate.");
  lines.push("");
  lines.push("### What can wait");
  lines.push("- Cosmetic doc-only work when monthly digests stay light and bands stay good.");
  lines.push("");

  lines.push("## G. Recommended focus areas");
  lines.push("");
  for (const f of pack.focusAreasNextQuarter || []) lines.push(`- ${f}`);
  lines.push("");

  lines.push("## H. Appendix — quarterly KPI pack");
  lines.push("");
  const kp = pack.quarterlyKpiPack || {};
  lines.push("### Headline KPIs");
  lines.push("| Label | Value |");
  lines.push("|-------|-------|");
  for (const row of kp.headlineKpis || []) {
    lines.push(`| ${row.label} | ${row.value}${row.unit ? ` (${row.unit})` : ""} |`);
  }
  lines.push("");
  lines.push("### Supporting KPIs");
  lines.push("| Label | Value |");
  lines.push("|-------|-------|");
  for (const row of kp.supportingKpis || []) {
    lines.push(`| ${row.label} | ${row.value} |`);
  }
  lines.push("");
  lines.push("### Risk indicators");
  lines.push("| Label | Value | Triggered |");
  lines.push("|-------|-------|-----------|");
  for (const row of kp.riskIndicators || []) {
    lines.push(`| ${row.label} | ${row.value} | ${row.triggered ? "yes" : "no"} |`);
  }
  lines.push("");
  lines.push("### Trend indicators");
  lines.push("| Label | Value |");
  lines.push("|-------|-------|");
  for (const row of kp.trendIndicators || []) {
    lines.push(`| ${row.label} | ${row.value} |`);
  }
  lines.push("");
  lines.push("### Recurring signals");
  lines.push("| Label | Months affected |");
  lines.push("|-------|-----------------|");
  for (const row of kp.recurringSignals || []) {
    lines.push(`| ${row.label} | ${row.value} |`);
  }
  lines.push("");

  lines.push("### Recurring mismatch types (metric-based)");
  lines.push("");
  for (const m of pack.topRecurringMismatchTypes || []) {
    lines.push(`- **${m.mismatchType}** — months affected: ${m.monthsAffected}`);
  }
  lines.push("");

  lines.push("### Top recurring routing rule ids");
  lines.push("");
  for (const r of pack.topRecurringRoutingRuleIds || []) {
    lines.push(`- \`${r.routingRuleId}\` (weight ${r.recurrenceWeight})`);
  }
  lines.push("");

  lines.push("### Top recurring decision sources");
  lines.push("");
  for (const r of pack.topRecurringDecisionSources || []) {
    lines.push(`- ${r.decisionSource} (weight ${r.recurrenceWeight})`);
  }
  lines.push("");

  lines.push("### Recommendations");
  lines.push("");
  for (const r of pack.recommendations || []) lines.push(`- ${r}`);
  lines.push("");

  return lines.join("\n");
}
