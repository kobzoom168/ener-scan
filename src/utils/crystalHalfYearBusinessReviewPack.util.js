/**
 * Half-year crystal quality business review pack (offline).
 * Aggregates **two quarterly review inputs** (or six monthly slices) using
 * {@link buildCrystalQuarterlyReviewPack} — template heuristics, not production SLOs.
 *
 * @module crystalHalfYearBusinessReviewPack.util
 */

import { buildCrystalMonthlyScorecard } from "./crystalMonthlyScorecard.util.js";
import { buildCrystalQuarterlyReviewPack } from "./crystalQuarterlyReviewPack.util.js";

export const HALF_YEAR_REVIEW_PACK_VERSION = "1";

/** @typedef {"healthy"|"watch"|"investigate"|"escalate"} HalfYearOpsStatus */

const BAND_THRESH = { EXCELLENT: 82, GOOD: 68, WATCH: 52 };

function num(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function scoreToBand(score) {
  const s = num(score);
  if (s >= BAND_THRESH.EXCELLENT) return "excellent";
  if (s >= BAND_THRESH.GOOD) return "good";
  if (s >= BAND_THRESH.WATCH) return "watch";
  return "risk";
}

function weightedRates(monthCards) {
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
    for (const k of keys) acc[k] += num(c.kpis[k], 0) * w;
  }
  if (wSum <= 0) {
    for (const k of keys) {
      acc[k] = monthCards.length
        ? monthCards.reduce((s, c) => s + num(c.kpis[k], 0), 0) / monthCards.length
        : 0;
    }
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

function countMonthsAbove(monthCards, pred) {
  return monthCards.filter(pred).length;
}

function normalizeMonthInput(raw) {
  if (raw && typeof raw === "object" && "rollup" in raw && raw.rollup) {
    return { rollup: raw.rollup, anomalyEvents: raw.anomalyEvents, scorecard: raw.scorecard };
  }
  if (raw && typeof raw === "object" && "scorecard" in raw && raw.scorecard) {
    return { rollup: null, anomalyEvents: raw.anomalyEvents, scorecard: raw.scorecard };
  }
  return { rollup: raw, anomalyEvents: undefined, scorecard: undefined };
}

function buildMonthCardsFromNormalized(normalized, generatedAt) {
  /** @type {import("./crystalMonthlyScorecard.util.js").CrystalMonthlyScorecard[]} */
  const monthCards = [];
  for (const n of normalized) {
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
  return monthCards;
}

function aggregateAnomalyEvents(monthCards, monthInputs) {
  /** @type {Map<string, { months: Set<string>, severities: Set<string>, rules: Set<string>, sources: Set<string>, causes: Set<string>, actions: Set<string> }>} */
  const map = new Map();
  monthInputs.forEach((mi, idx) => {
    const card = monthCards[idx];
    const label = String(card.monthWindowStart || `month_${idx}`);
    const events =
      mi && typeof mi === "object" && "anomalyEvents" in mi && Array.isArray(mi.anomalyEvents)
        ? mi.anomalyEvents
        : [];
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

function buildRecurringAnomalyRows(anomalyMap) {
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
      periodsAffected: monthsAffected,
      periodLabel: `${monthsAffected} month(s)`,
      monthLabels: [...data.months].sort(),
      severity: sev,
      likelyCauses: [...data.causes].filter(Boolean).slice(0, 5),
      suggestedNextActions: [...data.actions].filter(Boolean).slice(0, 5),
    });
  }
  rows.sort((a, b) => b.monthsAffected - a.monthsAffected || a.anomalyCode.localeCompare(b.anomalyCode));
  return rows;
}

function buildMismatchRecurrenceHalfYear(monthCards) {
  const types = [];
  const hardM = countMonthsAbove(monthCards, (c) => num(c.kpis.hardMismatchRate) >= 0.04);
  const softM = countMonthsAbove(monthCards, (c) => num(c.kpis.softMismatchRate) >= 0.06);
  const gen = countMonthsAbove(monthCards, (c) => num(c.kpis.genericFallbackRate) >= 0.14);
  if (hardM >= 3) types.push({ mismatchType: "hard_mismatch_elevated", monthsAffected: hardM });
  if (softM >= 3) types.push({ mismatchType: "soft_mismatch_elevated", monthsAffected: softM });
  if (gen >= 3) types.push({ mismatchType: "generic_fallback_elevated", monthsAffected: gen });
  return types;
}

/**
 * @param {import("./crystalMonthlyScorecard.util.js").CrystalMonthlyScorecard[]} monthCards
 * @param {Record<string, number>} rates
 * @param {Map<string, object>} anomalyMap
 * @param {{ quarterlyStatus: string }[]} quarterlyPacks
 */
function deriveHalfYearStatus(monthCards, rates, anomalyMap, quarterlyPacks) {
  const qs = quarterlyPacks.map((p) => p.quarterlyStatus);
  const qb = quarterlyPacks.map((p) => p.quarterScoreBand);

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
      (anomalyMap.get(k)?.months.size ?? 0) >= 3,
  );
  const recurringOfm = [...anomalyMap.keys()].filter(
    (k) =>
      /object.family|object_family/i.test(k) && (anomalyMap.get(k)?.months.size ?? 0) >= 3,
  );
  const recurringCat = [...anomalyMap.keys()].filter(
    (k) =>
      /category_mismatch|category mismatch/i.test(k) && (anomalyMap.get(k)?.months.size ?? 0) >= 3,
  );

  const escalateQuarters = qs.filter((s) => s === "escalate").length;
  const investigateQuarters = qs.filter((s) => s === "investigate").length;
  const riskQuarters = qb.filter((b) => b === "risk").length;

  if (
    qs.includes("escalate") ||
    escalateQuarters >= 1 ||
    riskMonths >= 4 ||
    hmcMonths >= 4 ||
    recurringHardCode.length > 0 ||
    (ofmMonths >= 3 && num(rates.hardMismatchRate) >= 0.025) ||
    catMonths >= 3 ||
    recurringOfm.length > 0 ||
    recurringCat.length > 0 ||
    riskQuarters >= 2
  ) {
    return /** @type {HalfYearOpsStatus} */ ("escalate");
  }

  if (
    investigateQuarters >= 2 ||
    dropMonths >= 3 ||
    (fbHeavyMonths >= 3 && num(rates.fallbackHeavyRate) >= 0.1) ||
    (wpMonths >= 3 && num(rates.weakProtectDefaultRate) >= 0.14) ||
    gfcMonths >= 3
  ) {
    return /** @type {HalfYearOpsStatus} */ ("investigate");
  }

  if (
    qs.includes("watch") ||
    qs.includes("investigate") ||
    watchMonths >= 4 ||
    genFbMonths >= 3 ||
    softDriftMonths >= 3 ||
    gfcMonths >= 2
  ) {
    return /** @type {HalfYearOpsStatus} */ ("watch");
  }

  return /** @type {HalfYearOpsStatus} */ ("healthy");
}

function monthKey(c, i) {
  return String(c.monthWindowStart || `M${i + 1}`);
}

const PAD_TEXT = {
  win: "Half-year aggregate reflects only submitted monthly slices — confirm data completeness for business review.",
  risk: "No further risk lines inferred from this JSON alone; validate with quarterly/monthly digests.",
  action: "Align leadership narrative with deploy history if routing or wording priority changed mid-period.",
};

function padToThree(items, filler) {
  const out = [...items];
  while (out.length < 3) out.push(filler);
  return out.slice(0, 3);
}

/**
 * @param {object} input
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalHalfYearBusinessReviewPack(input, options = {}) {
  const h = input || {};
  const generatedAt =
    h.generatedAt != null ? String(h.generatedAt) : options.generatedAt != null
      ? String(options.generatedAt)
      : new Date().toISOString();

  /** @type {{ quarterWindowStart: string, quarterWindowEnd: string, months: unknown[] }[]} */
  let quarterInputs = [];
  if (Array.isArray(h.quarters) && h.quarters.length > 0) {
    quarterInputs = h.quarters.map((q) => ({
      quarterWindowStart: String(q.quarterWindowStart || "").trim(),
      quarterWindowEnd: String(q.quarterWindowEnd || "").trim(),
      months: Array.isArray(q.months) ? q.months : [],
    }));
  } else if (Array.isArray(h.months) && h.months.length > 0) {
    const months = h.months;
    const mid = Math.ceil(months.length / 2);
    quarterInputs = [
      {
        quarterWindowStart: String(h.halfYearWindowStart || "H1-A"),
        quarterWindowEnd: "split-first-half",
        months: months.slice(0, mid),
      },
      {
        quarterWindowStart: "split-second-half",
        quarterWindowEnd: String(h.halfYearWindowEnd || "H1-B"),
        months: months.slice(mid),
      },
    ];
  }

  if (quarterInputs.length === 0) {
    throw new Error(
      "buildCrystalHalfYearBusinessReviewPack: provide `quarters` (2) or `months` (e.g. 6) in the input JSON.",
    );
  }

  /** @type {ReturnType<typeof buildCrystalQuarterlyReviewPack>[]} */
  const quarterlyPacks = [];
  for (const q of quarterInputs) {
    quarterlyPacks.push(
      buildCrystalQuarterlyReviewPack(
        {
          quarterWindowStart: q.quarterWindowStart,
          quarterWindowEnd: q.quarterWindowEnd,
          months: q.months,
          generatedAt,
        },
        { generatedAt },
      ),
    );
  }

  const flatMonthInputs = quarterInputs.flatMap((q) => q.months);
  const normalized = flatMonthInputs.map((m, i) => normalizeMonthInput(m));
  const monthCards = buildMonthCardsFromNormalized(normalized, generatedAt);
  if (monthCards.length === 0) {
    throw new Error("buildCrystalHalfYearBusinessReviewPack: no monthly scorecards could be built.");
  }

  const rates = weightedRates(monthCards);
  let wScore = 0;
  let wSum = 0;
  for (const c of monthCards) {
    const w = num(c.kpis.totalCrystalCases, 0);
    wScore += num(c.overallQualityScore, 0) * w;
    wSum += w;
  }
  const overallHalfYearQualityScore =
    wSum > 0
      ? Math.round(wScore / wSum)
      : Math.round(monthCards.reduce((s, c) => s + num(c.overallQualityScore, 0), 0) / monthCards.length);

  const halfYearScoreBand = scoreToBand(overallHalfYearQualityScore);
  const anomalyMap = aggregateAnomalyEvents(monthCards, normalized);
  const halfYearStatus = deriveHalfYearStatus(monthCards, rates, anomalyMap, quarterlyPacks);

  const halfYearKpis = {
    ...rates,
    totalCrystalCases: sumKpis(monthCards, "totalCrystalCases"),
    recurringAnomalyCountHalfYear: sumKpis(monthCards, "recurringAnomalyCount"),
    hardMismatchClusterCountMax: maxKpis(monthCards, "hardMismatchClusterCount"),
    genericFallbackClusterCountMax: maxKpis(monthCards, "genericFallbackClusterCount"),
    objectFamilyMismatchClusterCountMax: maxKpis(monthCards, "objectFamilyMismatchClusterCount"),
    categoryMismatchClusterCountMax: maxKpis(monthCards, "categoryMismatchClusterCount"),
    notApplicableRowCountHalfYear: sumKpis(monthCards, "notApplicableRowCount"),
    topRoutingRuleShareHalfYear:
      monthCards.map((c) => c.kpis.topRoutingRuleShare).find((x) => x != null && Number.isFinite(x)) ?? null,
    topWordingSourceShareHalfYear:
      monthCards.map((c) => c.kpis.topWordingSourceShare).find((x) => x != null && Number.isFinite(x)) ?? null,
  };

  const monthlyStatusDistribution = monthCards.reduce((acc, c) => {
    acc[c.scoreBand] = (acc[c.scoreBand] || 0) + 1;
    return acc;
  }, {});
  const monthlyScoreDistribution = monthCards.reduce((acc, c) => {
    const b = scoreToBand(c.overallQualityScore);
    acc[b] = (acc[b] || 0) + 1;
    return acc;
  }, {});

  const quarterlyStatusDistribution = quarterlyPacks.reduce((acc, p) => {
    acc[p.quarterlyStatus] = (acc[p.quarterlyStatus] || 0) + 1;
    return acc;
  }, {});
  const quarterlyScoreDistribution = quarterlyPacks.reduce((acc, p) => {
    acc[p.quarterScoreBand] = (acc[p.quarterScoreBand] || 0) + 1;
    return acc;
  }, {});

  const topRecurringAnomalies = buildRecurringAnomalyRows(anomalyMap);
  const topRecurringMismatchTypes = buildMismatchRecurrenceHalfYear(monthCards);

  const ruleCount = new Map();
  const srcCount = new Map();
  for (const [, data] of anomalyMap.entries()) {
    for (const r of data.rules) ruleCount.set(r, (ruleCount.get(r) || 0) + 1);
    for (const s of data.sources) srcCount.set(s, (srcCount.get(s) || 0) + 1);
  }
  const topRecurringRoutingRuleIds = [...ruleCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([routingRuleId, recurrenceWeight]) => ({ routingRuleId, recurrenceWeight }));
  const topRecurringDecisionSources = [...srcCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([decisionSource, recurrenceWeight]) => ({ decisionSource, recurrenceWeight }));

  const usageDropMonths = countMonthsAbove(monthCards, (c) => c.kpis.crystalSpecificUsageDropFlag === true);
  const multiPeriodFallbackHeavy =
    countMonthsAbove(monthCards, (c) => num(c.kpis.fallbackHeavyRate) >= 0.12) >= 3;

  const topBusinessRiskAreas = [];
  if (halfYearStatus === "escalate") topBusinessRiskAreas.push("sustained_mismatch_and_cluster_pressure");
  if (halfYearStatus === "investigate") topBusinessRiskAreas.push("coverage_and_protect_default_investment");
  if (usageDropMonths >= 2) topBusinessRiskAreas.push("crystal_specific_surface_continuity");
  if (num(halfYearKpis.notApplicableRowCountHalfYear) > num(halfYearKpis.totalCrystalCases) * 3) {
    topBusinessRiskAreas.push("non_crystal_traffic_dominates_exports");
  }
  if (num(rates.genericFallbackRate) >= 0.12) topBusinessRiskAreas.push("generic_fallback_concentration");

  const quarterRecaps = quarterlyPacks.map((p, i) => ({
    quarterWindowStart: p.quarterWindowStart,
    quarterWindowEnd: p.quarterWindowEnd,
    quarterlyStatus: p.quarterlyStatus,
    quarterScoreBand: p.quarterScoreBand,
    overallQuarterQualityScore: p.overallQuarterQualityScore,
    headline: `Q${i + 1} slice: ops ${p.quarterlyStatus}, band ${p.quarterScoreBand}, template score ${p.overallQuarterQualityScore}`,
  }));

  const monthByMonthRecap = monthCards.map((c, i) => ({
    monthWindowStart: c.monthWindowStart,
    monthWindowEnd: c.monthWindowEnd,
    overallQualityScore: c.overallQualityScore,
    scoreBand: c.scoreBand,
    monthlyStatus: c.monthlyStatus,
    headline: `${monthKey(c, i)}: score ${c.overallQualityScore} (${c.scoreBand})`,
  }));

  const releaseSignals = Array.isArray(h.releaseSignals) ? h.releaseSignals : [];

  const pack = {
    reviewPackVersion: HALF_YEAR_REVIEW_PACK_VERSION,
    halfYearWindowStart: String(h.halfYearWindowStart || "").trim(),
    halfYearWindowEnd: String(h.halfYearWindowEnd || "").trim(),
    generatedAt,
    monthsIncluded: monthCards.map((c) => c.monthWindowStart),
    quartersIncluded: quarterlyPacks.map((p) => ({
      quarterWindowStart: p.quarterWindowStart,
      quarterWindowEnd: p.quarterWindowEnd,
    })),
    halfYearStatus,
    overallHalfYearQualityScore,
    halfYearScoreBand,
    halfYearKpis,
    monthlyStatusDistribution,
    monthlyScoreDistribution,
    quarterlyStatusDistribution,
    quarterlyScoreDistribution,
    topRecurringAnomalies,
    topRecurringMismatchTypes,
    topRecurringRoutingRuleIds,
    topRecurringDecisionSources,
    topBusinessRiskAreas,
    usageDropMonths,
    multiPeriodFallbackHeavy,
    quarterRecaps,
    monthByMonthRecap,
    releaseSignalsInput: releaseSignals,
    focusAreasNextHalf: [],
    executiveSummary: {},
    businessSummary: {},
    recommendations: [],
    halfYearKpiPack: {},
    scoreDriftDriver:
      monthCards.filter((c) => c.scoreBand === "risk").length >= 3
        ? "repeated_risk_months_in_half"
        : "mixed_or_stable",
    methodNote:
      "Template half-year business pack: heuristics are for strategic discussion, not production SLOs. Pair with quarterly/monthly digests.",
  };

  pack.focusAreasNextHalf = buildCrystalHalfYearBusinessFocusAreas(pack);
  pack.executiveSummary = {
    ...buildCrystalHalfYearExecutiveSummary(pack),
    methodNote:
      "Generated only from submitted rollups, quarterly aggregates, and structured anomaly events — no external business facts.",
  };
  pack.businessSummary = buildCrystalHalfYearBusinessSummary(pack);
  pack.recommendations = buildHalfYearRecommendations(pack);
  pack.halfYearKpiPack = buildHalfYearKpiPack(pack);

  return pack;
}

export function buildCrystalHalfYearExecutiveSummary(pack) {
  const status = pack.halfYearStatus;
  const band = pack.halfYearScoreBand;
  const score = num(pack.overallHalfYearQualityScore);
  const k = pack.halfYearKpis || {};
  const aligned = num(k.alignedRate);
  const hard = num(k.hardMismatchRate);
  const spec = num(k.crystalSpecificSurfaceRate);
  const gen = num(k.genericFallbackRate);

  const headline =
    status === "healthy"
      ? `Crystal quality for the half-year is in a healthy range (template score ${score}, band ${band}).`
      : status === "watch"
        ? `Crystal quality shows watch-level signals over the half-year (template score ${score}, ops status: watch).`
        : status === "investigate"
          ? `Crystal quality warrants investigation across multiple months (template score ${score}).`
          : `Crystal quality shows escalation patterns in this half-year — align routing, wording, and DB owners (template score ${score}).`;

  const body = [
    `Half-year template score ${score}/100 (${band}) blends monthly scorecards weighted by crystal volume.`,
    `Weighted aligned ~${(aligned * 100).toFixed(1)}%; hard mismatch ~${(hard * 100).toFixed(1)}%; crystal-specific surface ~${(spec * 100).toFixed(1)}%; generic fallback ~${(gen * 100).toFixed(1)}%.`,
    `Ops triage status: **${status}** (half-year heuristic over quarters + months — not an alert policy).`,
  ].join(" ");

  const wins = padToThree(buildExecWins(pack), PAD_TEXT.win);
  const risks = padToThree(buildExecRisks(pack), PAD_TEXT.risk);
  const actions = padToThree(buildExecActions(pack), PAD_TEXT.action);

  return {
    executiveSummaryHeadline: headline,
    executiveSummaryBody: body,
    top3Wins: wins,
    top3Risks: risks,
    top3NextActions: actions,
  };
}

function buildExecWins(pack) {
  const out = [];
  const dist = pack.monthlyScoreDistribution || {};
  if (num(dist.excellent) >= 3) out.push("Multiple months stayed in the excellent score band.");
  const k = pack.halfYearKpis || {};
  if (num(k.alignedRate) >= 0.85) out.push(`Weighted aligned rate remains strong (~${(num(k.alignedRate) * 100).toFixed(1)}%).`);
  const qd = pack.quarterlyScoreDistribution || {};
  if (num(qd.excellent) >= 1 && pack.halfYearStatus === "healthy") {
    out.push("At least one quarter landed in an excellent template band.");
  }
  if (out.length === 0) out.push("Monthly and quarterly inputs support a baseline trend review.");
  return out;
}

function buildExecRisks(pack) {
  const out = [];
  const k = pack.halfYearKpis || {};
  if (pack.halfYearStatus === "escalate" || num(k.hardMismatchClusterCountMax) >= 3) {
    out.push("Hard mismatch cluster pressure appears in monthly rollups.");
  }
  if (num(k.genericFallbackRate) >= 0.12) {
    out.push(`Generic fallback share is elevated (~${(num(k.genericFallbackRate) * 100).toFixed(1)}%) on a half-year blend.`);
  }
  if (pack.topRecurringAnomalies?.length) {
    out.push(
      `Recurring digest codes include: ${pack.topRecurringAnomalies.slice(0, 3).map((x) => x.anomalyCode).join(", ")}.`,
    );
  }
  if (out.length === 0) out.push("No dominant executive risk line beyond routine monitoring; confirm with digests.");
  return out;
}

function buildExecActions(pack) {
  const actions = [];
  if (pack.halfYearStatus === "escalate") {
    actions.push("Prioritize mismatch/cluster remediation with routing and wording owners before broad roadmap bets.");
  }
  if (pack.halfYearStatus === "investigate") {
    actions.push("Trace DB/template coverage and weak-protect-default using quarterly packs and digests.");
  }
  actions.push("Compare recurring anomalies to release history when that metadata is available.");
  if (actions.length < 3) actions.push("Keep quarterly KPI packs as the standing leadership snapshot.");
  return actions;
}

/**
 * Business-facing summary — evidence-bound; uses only pack fields.
 */
export function buildCrystalHalfYearBusinessSummary(pack) {
  const k = pack.halfYearKpis || {};
  const spec = num(k.crystalSpecificSurfaceRate);
  const gen = num(k.genericFallbackRate);
  const wp = num(k.weakProtectDefaultRate);
  const st = pack.halfYearStatus;

  const headline =
    st === "healthy"
      ? "Crystal-specific delivery looks stable enough for routine roadmap planning."
      : st === "watch"
        ? "Crystal quality shows intermittent drift — worth budgeting targeted wording/DB work."
        : st === "investigate"
          ? "Crystal quality patterns suggest investment in coverage and protect-default paths."
          : "Crystal quality signals warrant executive attention on routing hardening and observability.";

  const body = [
    `Blended crystal-specific surface rate ~${(spec * 100).toFixed(1)}% and generic fallback ~${(gen * 100).toFixed(1)}% (from submitted rollups only).`,
    `Weak-protect-default share ~${(wp * 100).toFixed(1)}% — interpret alongside rule-map and fixtures, not as a standalone ROI claim.`,
    `Release-to-drift linkage is **not** inferred here unless \`releaseSignals\` was provided in the input JSON.`,
  ].join(" ");

  const wins = padToThree(buildBusinessWins(pack), PAD_TEXT.win);
  const risks = padToThree(buildBusinessRisks(pack), PAD_TEXT.risk);
  const strat = padToThree(buildStrategicActions(pack), PAD_TEXT.action);

  return {
    businessSummaryHeadline: headline,
    businessSummaryBody: body,
    top3Wins: wins,
    top3BusinessRisks: risks,
    top3StrategicNextActions: strat,
    methodNote:
      "Business summary uses the same metric semantics as monthly/quarterly packs; it does not estimate revenue impact.",
  };
}

function buildBusinessWins(pack) {
  const out = [];
  if (num(pack.halfYearKpis?.alignedRate) >= 0.86) out.push("Strong alignment trend supports continued crystal-first positioning.");
  if (pack.halfYearScoreBand === "excellent" || pack.halfYearScoreBand === "good") {
    out.push(`Template half-year band is ${pack.halfYearScoreBand} — suitable for standard roadmap cadence.`);
  }
  if (pack.quarterlyScoreDistribution?.excellent >= 1) out.push("At least one quarter scored excellent on the template curve.");
  if (out.length === 0) out.push("Baseline half-year inputs are present for stakeholder review.");
  return out;
}

function buildBusinessRisks(pack) {
  const out = [];
  if (num(pack.halfYearKpis?.genericFallbackRate) >= 0.12) {
    out.push("Elevated generic fallback suggests DB wording coverage may need investment.");
  }
  if (pack.usageDropMonths >= 2) {
    out.push("Crystal-specific usage decline flags across multiple months may affect positioning consistency.");
  }
  if (pack.multiPeriodFallbackHeavy) {
    out.push("Fallback-heavy months recur — consider capacity for tuning and QA.");
  }
  if (out.length === 0) out.push("No additional business risks inferred beyond digest review.");
  return out;
}

function buildStrategicActions(pack) {
  const a = [];
  if (pack.halfYearStatus === "escalate" || pack.halfYearStatus === "investigate") {
    a.push("Prioritize routing/wording/DB initiatives in the next half-year plan using quarterly packs as evidence.");
  }
  a.push("Attach deploy/release notes to future exports if you need release-to-drift narrative in-tool.");
  if (a.length < 3) a.push("Maintain monthly scorecards as the operational source of truth for leadership updates.");
  return a;
}

function buildHalfYearRecommendations(pack) {
  const r = [];
  r.push("Use half-year KPI headline row for business reviews; attach quarterly packs for quarter-level narrative.");
  if (pack.halfYearStatus === "watch" || pack.halfYearStatus === "investigate") {
    r.push("Schedule a cross-functional session (ops/product) before major routing/wording roadmap commits.");
  }
  if (num(pack.halfYearKpis?.notApplicableRowCountHalfYear) > num(pack.halfYearKpis?.totalCrystalCases) * 4) {
    r.push("Non-crystal volume is large versus the crystal slice — label executive charts as crystal-only.");
  }
  return r;
}

export function buildCrystalHalfYearBusinessFocusAreas(pack) {
  const areas = [
    "Improve DB crystal row coverage where generic fallback concentration appears.",
    "Inspect recurring weak-protect-default share against `crystal_rg_weak_protect_default` and fixtures.",
    "Reduce generic fallback concentration via template hydration and category coverage.",
    "Stabilize crystal-specific surface rate month-over-month.",
    "Compare recurring anomalies to release history when available.",
  ];
  if (pack.halfYearStatus === "escalate") {
    areas.unshift("Prioritize routing hardening and mismatch observability before large customer-facing experiments.");
  }
  return areas;
}

function buildHalfYearKpiPack(pack) {
  const k = pack.halfYearKpis || {};
  const stabilityNote =
    num(k.crystalSpecificSurfaceRate) >= 0.8 && pack.halfYearStatus !== "escalate"
      ? "Surface rate blended ≥80% — stable vs severe decline"
      : "Review monthly crystal-specific surface in digests for slope";

  const businessImpactSignals = [
    {
      label: "Stability of crystal-first wording (blended surface rate)",
      value: `${(num(k.crystalSpecificSurfaceRate) * 100).toFixed(1)}%`,
      triggered: num(k.crystalSpecificSurfaceRate) < 0.72,
      note: stabilityNote,
    },
    {
      label: "Release-to-drift sensitivity",
      value: (pack.releaseSignalsInput || []).length ? "release metadata present" : "no releaseSignals in input",
      triggered: false,
      note: "Tool does not infer deploy impact without releaseSignals[] in JSON.",
    },
    {
      label: "DB crystal coverage concern (proxy: generic fallback blend)",
      value: `${(num(k.genericFallbackRate) * 100).toFixed(1)}%`,
      triggered: num(k.genericFallbackRate) >= 0.12,
      note: "Uses generic fallback rate from rollups only.",
    },
    {
      label: "Repeated generic fallback concentration",
      value: pack.topRecurringMismatchTypes?.some((t) => t.mismatchType === "generic_fallback_elevated")
        ? "pattern detected"
        : "no threshold pattern",
      triggered: !!pack.topRecurringMismatchTypes?.some((t) => t.mismatchType === "generic_fallback_elevated"),
      note: "Pattern = months crossing elevated threshold in half-year window.",
    },
    {
      label: "Repeated weak-protect-default concentration",
      value: `${(num(k.weakProtectDefaultRate) * 100).toFixed(1)}%`,
      triggered: num(k.weakProtectDefaultRate) >= 0.16 || pack.multiPeriodFallbackHeavy,
      note: "Blended weak-protect rate plus recurring fallback-heavy months.",
    },
  ];

  return {
    headlineKpis: [
      { label: "Overall half-year quality score (template)", value: pack.overallHalfYearQualityScore, unit: "0-100" },
      { label: "Aligned rate (half-year, weighted)", value: `${(num(k.alignedRate) * 100).toFixed(1)}%` },
      { label: "Hard mismatch rate (half-year, weighted)", value: `${(num(k.hardMismatchRate) * 100).toFixed(1)}%` },
      {
        label: "Crystal-specific surface rate (half-year, weighted)",
        value: `${(num(k.crystalSpecificSurfaceRate) * 100).toFixed(1)}%`,
      },
      { label: "Generic fallback rate (half-year, weighted)", value: `${(num(k.genericFallbackRate) * 100).toFixed(1)}%` },
    ],
    supportingKpis: [
      { label: "Soft mismatch rate (half-year, weighted)", value: `${(num(k.softMismatchRate) * 100).toFixed(1)}%` },
      { label: "Fallback-heavy rate (half-year, weighted)", value: `${(num(k.fallbackHeavyRate) * 100).toFixed(1)}%` },
      { label: "Weak-protect-default rate (half-year, weighted)", value: `${(num(k.weakProtectDefaultRate) * 100).toFixed(1)}%` },
      { label: "Quarter score band distribution", value: JSON.stringify(pack.quarterlyScoreDistribution || {}) },
      {
        label: "Top routing rule share (first month with data)",
        value:
          k.topRoutingRuleShareHalfYear != null && Number.isFinite(k.topRoutingRuleShareHalfYear)
            ? `${(num(k.topRoutingRuleShareHalfYear) * 100).toFixed(1)}%`
            : "—",
      },
      {
        label: "Top wording source share (first month with data)",
        value:
          k.topWordingSourceShareHalfYear != null && Number.isFinite(k.topWordingSourceShareHalfYear)
            ? `${(num(k.topWordingSourceShareHalfYear) * 100).toFixed(1)}%`
            : "—",
      },
    ],
    riskIndicators: [
      {
        label: "Recurring anomaly volume (sum, half-year)",
        value: k.recurringAnomalyCountHalfYear,
        triggered: num(k.recurringAnomalyCountHalfYear) >= 12,
      },
      {
        label: "Max hard mismatch clusters in a month",
        value: k.hardMismatchClusterCountMax,
        triggered: num(k.hardMismatchClusterCountMax) >= 3,
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
        value: pack.usageDropMonths,
        triggered: num(pack.usageDropMonths) >= 2,
      },
      {
        label: "Multi-period fallback-heavy",
        value: pack.multiPeriodFallbackHeavy ? "yes" : "no",
        triggered: pack.multiPeriodFallbackHeavy === true,
      },
    ],
    trendIndicators: [
      { label: "Half-year ops status (heuristic)", value: pack.halfYearStatus },
      { label: "Half-year score band (template)", value: pack.halfYearScoreBand },
      { label: "Quarters in view", value: (pack.quartersIncluded || []).length },
      { label: "Months in view", value: (pack.monthsIncluded || []).length },
    ],
    recurringSignals: (pack.topRecurringAnomalies || []).slice(0, 16).map((a) => ({
      label: a.anomalyCode,
      value: a.monthsAffected,
      monthsAffected: a.monthsAffected,
    })),
    businessImpactSignals,
    recommendedFocusAreas: pack.focusAreasNextHalf || [],
  };
}

/**
 * @param {object} pack
 */
export function renderCrystalHalfYearBusinessReviewPackMarkdown(pack) {
  const w = (s) => (s == null ? "" : String(s));
  const ex = pack.executiveSummary || {};
  const biz = pack.businessSummary || {};

  const lines = [];
  lines.push("# Crystal half-year quality business review pack");
  lines.push("");
  lines.push("## A. Header");
  lines.push("");
  lines.push(`- **Half-year window:** ${w(pack.halfYearWindowStart)} → ${w(pack.halfYearWindowEnd)}`);
  lines.push(`- **Generated at:** ${w(pack.generatedAt)}`);
  lines.push(`- **Half-year ops status (heuristic):** \`${w(pack.halfYearStatus)}\``);
  lines.push(`- **Overall half-year quality score (template):** ${pack.overallHalfYearQualityScore} / 100`);
  lines.push(`- **Half-year score band:** \`${w(pack.halfYearScoreBand)}\``);
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
  lines.push("### Business summary (product / leadership)");
  lines.push("");
  lines.push(`#### ${w(biz.businessSummaryHeadline)}`);
  lines.push("");
  lines.push(w(biz.businessSummaryBody));
  lines.push("");
  lines.push(`> ${w(biz.methodNote)}`);
  lines.push("");
  lines.push("#### Top 3 business wins");
  for (const t of biz.top3Wins || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("#### Top 3 business risks");
  for (const t of biz.top3BusinessRisks || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("#### Top 3 strategic next actions");
  for (const t of biz.top3StrategicNextActions || []) lines.push(`- ${t}`);
  lines.push("");

  lines.push("## C. Half-year KPI summary");
  lines.push("");
  const k = pack.halfYearKpis || {};
  lines.push(`- **Aligned (weighted):** ${(num(k.alignedRate) * 100).toFixed(1)}%`);
  lines.push(`- **Soft mismatch (weighted):** ${(num(k.softMismatchRate) * 100).toFixed(1)}%`);
  lines.push(`- **Hard mismatch (weighted):** ${(num(k.hardMismatchRate) * 100).toFixed(1)}%`);
  lines.push(`- **Crystal-specific surface (weighted):** ${(num(k.crystalSpecificSurfaceRate) * 100).toFixed(1)}%`);
  lines.push(`- **Generic fallback (weighted):** ${(num(k.genericFallbackRate) * 100).toFixed(1)}%`);
  lines.push(`- **Fallback-heavy (weighted):** ${(num(k.fallbackHeavyRate) * 100).toFixed(1)}%`);
  lines.push(`- **Weak-protect-default (weighted):** ${(num(k.weakProtectDefaultRate) * 100).toFixed(1)}%`);
  lines.push(`- **Total crystal cases (sum):** ${k.totalCrystalCases}`);
  lines.push("");

  lines.push("## D. Quarter and month distribution summary");
  lines.push("");
  lines.push("### Quarterly status distribution");
  lines.push("```json");
  lines.push(JSON.stringify(pack.quarterlyStatusDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Monthly status distribution (score bands)");
  lines.push("```json");
  lines.push(JSON.stringify(pack.monthlyStatusDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Quarterly score distribution");
  lines.push("```json");
  lines.push(JSON.stringify(pack.quarterlyScoreDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Monthly score distribution");
  lines.push("```json");
  lines.push(JSON.stringify(pack.monthlyScoreDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Quarter recap");
  for (const q of pack.quarterRecaps || []) lines.push(`- ${q.headline}`);
  lines.push("");
  lines.push("### Month recap");
  for (const m of pack.monthByMonthRecap || []) lines.push(`- ${m.headline}`);
  lines.push("");

  lines.push("## E. Recurring anomaly digest");
  lines.push("");
  lines.push("| Code | Periods (months) | Severity | Likely causes | Suggested action |");
  lines.push("|------|------------------|----------|---------------|------------------|");
  for (const a of pack.topRecurringAnomalies || []) {
    const causes = (a.likelyCauses || []).join("; ") || "—";
    const act = (a.suggestedNextActions || []).join("; ") || "—";
    lines.push(`| ${a.anomalyCode} | ${a.monthsAffected} | ${a.severity} | ${causes} | ${act} |`);
  }
  if (!(pack.topRecurringAnomalies || []).length) lines.push("| — | — | — | — | — |");
  lines.push("");

  lines.push("## F. Business risk calls");
  lines.push("");
  lines.push("### What to monitor next half");
  lines.push("- Soft mismatch + generic fallback if half-year status is watch.");
  lines.push("");
  lines.push("### What to investigate");
  lines.push("- Fallback-heavy / weak-protect-default when status is investigate.");
  lines.push("");
  lines.push("### What to escalate");
  lines.push("- Hard mismatch clusters and repeated risk quarters when status is escalate.");
  lines.push("");
  lines.push("### What can wait");
  lines.push("- Cosmetic copy where monthly bands stayed good and digests were light.");
  lines.push("");
  lines.push("### Where to invest next");
  lines.push("- **Routing** when mismatch/cluster signals dominate.");
  lines.push("- **Wording / DB** when generic fallback and weak-protect-default concentrate.");
  lines.push("- **Telemetry** when drift is suspected but evidence is thin — improve exports first.");
  lines.push("");

  lines.push("## G. Recommended strategic focus areas");
  lines.push("");
  for (const f of pack.focusAreasNextHalf || []) lines.push(`- ${f}`);
  lines.push("");

  lines.push("## H. Appendix — half-year KPI pack");
  lines.push("");
  const kp = pack.halfYearKpiPack || {};
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
  lines.push("| Label | Months |");
  lines.push("|-------|--------|");
  for (const row of kp.recurringSignals || []) {
    lines.push(`| ${row.label} | ${row.value} |`);
  }
  lines.push("");
  lines.push("### Business impact signals");
  lines.push("| Label | Value | Note |");
  lines.push("|-------|-------|------|");
  for (const row of kp.businessImpactSignals || []) {
    lines.push(`| ${row.label} | ${row.value} | ${w(row.note)} |`);
  }
  lines.push("");

  lines.push("### Recommendations");
  lines.push("");
  for (const r of pack.recommendations || []) lines.push(`- ${r}`);
  lines.push("");

  return lines.join("\n");
}
