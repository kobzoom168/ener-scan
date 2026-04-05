/**
 * Annual crystal quality operating review pack (offline).
 * Aggregates **two half-year inputs** (each: two quarters, 12 months total) via
 * {@link buildCrystalHalfYearBusinessReviewPack}, plus four {@link buildCrystalQuarterlyReviewPack} slices.
 * Template heuristics — not production SLOs.
 *
 * @module crystalAnnualOperatingReviewPack.util
 */

import { buildCrystalMonthlyScorecard } from "./crystalMonthlyScorecard.util.js";
import { buildCrystalQuarterlyReviewPack } from "./crystalQuarterlyReviewPack.util.js";
import { buildCrystalHalfYearBusinessReviewPack } from "./crystalHalfYearBusinessReviewPack.util.js";

export const ANNUAL_REVIEW_PACK_VERSION = "1";

/** @typedef {"healthy"|"watch"|"investigate"|"escalate"} AnnualOpsStatus */

const BAND_THRESH = { EXCELLENT: 82, GOOD: 68, WATCH: 52 };

const PAD = {
  win: "Annual aggregate includes only submitted periods — confirm year completeness for leadership.",
  risk: "No further risk lines inferred from this JSON; validate with quarterly and monthly digests.",
  action: "Attach deploy calendars to future exports if release-to-drift narrative is required in-tool.",
};

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

function buildMismatchAnnual(monthCards) {
  const types = [];
  const hardM = countMonthsAbove(monthCards, (c) => num(c.kpis.hardMismatchRate) >= 0.04);
  const softM = countMonthsAbove(monthCards, (c) => num(c.kpis.softMismatchRate) >= 0.06);
  const gen = countMonthsAbove(monthCards, (c) => num(c.kpis.genericFallbackRate) >= 0.14);
  if (hardM >= 6) types.push({ mismatchType: "hard_mismatch_elevated", monthsAffected: hardM });
  if (softM >= 6) types.push({ mismatchType: "soft_mismatch_elevated", monthsAffected: softM });
  if (gen >= 6) types.push({ mismatchType: "generic_fallback_elevated", monthsAffected: gen });
  return types;
}

function padToThree(items, filler) {
  const out = [...items];
  while (out.length < 3) out.push(filler);
  return out.slice(0, 3);
}

/**
 * @param {ReturnType<typeof buildCrystalHalfYearBusinessReviewPack>[]} halfYearPacks
 * @param {import("./crystalMonthlyScorecard.util.js").CrystalMonthlyScorecard[]} monthCards
 * @param {Record<string, number>} rates
 * @param {Map<string, object>} anomalyMap
 * @param {ReturnType<typeof buildCrystalQuarterlyReviewPack>[]} quarterlyPacks
 */
function deriveAnnualStatus(halfYearPacks, monthCards, rates, anomalyMap, quarterlyPacks) {
  const hs = halfYearPacks.map((p) => p.halfYearStatus);
  const qs = quarterlyPacks.map((p) => p.quarterlyStatus);
  const qb = quarterlyPacks.map((p) => p.quarterScoreBand);

  const riskMonths = countMonthsAbove(monthCards, (c) => c.scoreBand === "risk");
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
      (anomalyMap.get(k)?.months.size ?? 0) >= 6,
  );
  const recurringOfm = [...anomalyMap.keys()].filter(
    (k) =>
      /object.family|object_family/i.test(k) && (anomalyMap.get(k)?.months.size ?? 0) >= 6,
  );
  const recurringCat = [...anomalyMap.keys()].filter(
    (k) =>
      /category_mismatch|category mismatch/i.test(k) && (anomalyMap.get(k)?.months.size ?? 0) >= 6,
  );

  const halfEscalate = hs.filter((s) => s === "escalate").length;
  const halfInvestigate = hs.filter((s) => s === "investigate").length;
  const qEscalate = qs.filter((s) => s === "escalate").length;
  const riskQuarters = qb.filter((b) => b === "risk").length;

  if (
    hs.includes("escalate") ||
    halfEscalate >= 1 ||
    qEscalate >= 2 ||
    riskMonths >= 6 ||
    hmcMonths >= 6 ||
    recurringHardCode.length > 0 ||
    (ofmMonths >= 6 && num(rates.hardMismatchRate) >= 0.025) ||
    catMonths >= 6 ||
    recurringOfm.length > 0 ||
    recurringCat.length > 0 ||
    riskQuarters >= 2
  ) {
    return /** @type {AnnualOpsStatus} */ ("escalate");
  }

  if (
    halfInvestigate >= 2 ||
    dropMonths >= 6 ||
    (fbHeavyMonths >= 6 && num(rates.fallbackHeavyRate) >= 0.1) ||
    (wpMonths >= 6 && num(rates.weakProtectDefaultRate) >= 0.14) ||
    gfcMonths >= 6
  ) {
    return /** @type {AnnualOpsStatus} */ ("investigate");
  }

  if (
    hs.includes("watch") ||
    hs.includes("investigate") ||
    qs.includes("watch") ||
    genFbMonths >= 6 ||
    softDriftMonths >= 6 ||
    gfcMonths >= 4
  ) {
    return /** @type {AnnualOpsStatus} */ ("watch");
  }

  return /** @type {AnnualOpsStatus} */ ("healthy");
}

/**
 * @param {object} input
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalAnnualOperatingReviewPack(input, options = {}) {
  const a = input || {};
  const generatedAt =
    a.generatedAt != null ? String(a.generatedAt) : options.generatedAt != null
      ? String(options.generatedAt)
      : new Date().toISOString();

  /** @type {{ halfYearWindowStart: string, halfYearWindowEnd: string, quarters: { quarterWindowStart: string, quarterWindowEnd: string, months: unknown[] }[] }[]} */
  let halfYearInputs = [];

  if (Array.isArray(a.halfYears) && a.halfYears.length > 0) {
    halfYearInputs = a.halfYears.map((h) => ({
      halfYearWindowStart: String(h.halfYearWindowStart || "").trim(),
      halfYearWindowEnd: String(h.halfYearWindowEnd || "").trim(),
      quarters: Array.isArray(h.quarters) ? h.quarters : [],
    }));
  } else if (Array.isArray(a.months) && a.months.length > 0) {
    const months = a.months;
    const qn = Math.ceil(months.length / 4) || 3;
    const chunks = [];
    for (let i = 0; i < months.length; i += qn) chunks.push(months.slice(i, i + qn));
    while (chunks.length < 4) chunks.push([]);
    halfYearInputs = [
      {
        halfYearWindowStart: String(a.yearWindowStart || "H1"),
        halfYearWindowEnd: "split-midyear",
        quarters: [
          {
            quarterWindowStart: "Q1",
            quarterWindowEnd: "Q1-end",
            months: chunks[0] || [],
          },
          {
            quarterWindowStart: "Q2",
            quarterWindowEnd: "Q2-end",
            months: chunks[1] || [],
          },
        ],
      },
      {
        halfYearWindowStart: "split-midyear",
        halfYearWindowEnd: String(a.yearWindowEnd || "H2"),
        quarters: [
          {
            quarterWindowStart: "Q3",
            quarterWindowEnd: "Q3-end",
            months: chunks[2] || [],
          },
          {
            quarterWindowStart: "Q4",
            quarterWindowEnd: "Q4-end",
            months: chunks[3] || [],
          },
        ],
      },
    ];
  }

  if (halfYearInputs.length === 0) {
    throw new Error(
      "buildCrystalAnnualOperatingReviewPack: provide `halfYears` (2) or `months` (e.g. 12) in the input JSON.",
    );
  }

  /** @type {ReturnType<typeof buildCrystalHalfYearBusinessReviewPack>[]} */
  const halfYearPacks = [];
  for (const h of halfYearInputs) {
    halfYearPacks.push(
      buildCrystalHalfYearBusinessReviewPack(
        {
          halfYearWindowStart: h.halfYearWindowStart,
          halfYearWindowEnd: h.halfYearWindowEnd,
          quarters: h.quarters,
          generatedAt,
          releaseSignals: a.releaseSignals,
        },
        { generatedAt },
      ),
    );
  }

  const flatMonthInputs = halfYearInputs.flatMap((h) => h.quarters.flatMap((q) => q.months || []));
  const normalized = flatMonthInputs.map((m) => normalizeMonthInput(m));
  const monthCards = buildMonthCardsFromNormalized(normalized, generatedAt);
  if (monthCards.length === 0) {
    throw new Error("buildCrystalAnnualOperatingReviewPack: could not build monthly scorecards.");
  }

  const quarterlyPacks = halfYearInputs.flatMap((h) =>
    (h.quarters || []).map((q) =>
      buildCrystalQuarterlyReviewPack(
        {
          quarterWindowStart: q.quarterWindowStart,
          quarterWindowEnd: q.quarterWindowEnd,
          months: q.months || [],
          generatedAt,
        },
        { generatedAt },
      ),
    ),
  );

  const rates = weightedRates(monthCards);
  let wScore = 0;
  let wSum = 0;
  for (const c of monthCards) {
    const w = num(c.kpis.totalCrystalCases, 0);
    wScore += num(c.overallQualityScore, 0) * w;
    wSum += w;
  }
  const overallAnnualQualityScore =
    wSum > 0
      ? Math.round(wScore / wSum)
      : Math.round(monthCards.reduce((s, c) => s + num(c.overallQualityScore, 0), 0) / monthCards.length);

  const annualScoreBand = scoreToBand(overallAnnualQualityScore);
  const anomalyMap = aggregateAnomalyEvents(monthCards, normalized);
  const annualStatus = deriveAnnualStatus(halfYearPacks, monthCards, rates, anomalyMap, quarterlyPacks);

  const annualKpis = {
    ...rates,
    totalCrystalCases: sumKpis(monthCards, "totalCrystalCases"),
    recurringAnomalyCountAnnual: sumKpis(monthCards, "recurringAnomalyCount"),
    hardMismatchClusterCountMax: maxKpis(monthCards, "hardMismatchClusterCount"),
    genericFallbackClusterCountMax: maxKpis(monthCards, "genericFallbackClusterCount"),
    objectFamilyMismatchClusterCountMax: maxKpis(monthCards, "objectFamilyMismatchClusterCount"),
    categoryMismatchClusterCountMax: maxKpis(monthCards, "categoryMismatchClusterCount"),
    notApplicableRowCountAnnual: sumKpis(monthCards, "notApplicableRowCount"),
    topRoutingRuleShareAnnual:
      monthCards.map((c) => c.kpis.topRoutingRuleShare).find((x) => x != null && Number.isFinite(x)) ?? null,
    topWordingSourceShareAnnual:
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

  const halfYearStatusDistribution = halfYearPacks.reduce((acc, p) => {
    acc[p.halfYearStatus] = (acc[p.halfYearStatus] || 0) + 1;
    return acc;
  }, {});
  const halfYearScoreDistribution = halfYearPacks.reduce((acc, p) => {
    acc[p.halfYearScoreBand] = (acc[p.halfYearScoreBand] || 0) + 1;
    return acc;
  }, {});

  const topRecurringAnomalies = buildRecurringAnomalyRows(anomalyMap);
  const topRecurringMismatchTypes = buildMismatchAnnual(monthCards);

  const ruleCount = new Map();
  const srcCount = new Map();
  for (const [, data] of anomalyMap.entries()) {
    for (const r of data.rules) ruleCount.set(r, (ruleCount.get(r) || 0) + 1);
    for (const s of data.sources) srcCount.set(s, (srcCount.get(s) || 0) + 1);
  }
  const topRecurringRoutingRuleIds = [...ruleCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([routingRuleId, recurrenceWeight]) => ({ routingRuleId, recurrenceWeight }));
  const topRecurringDecisionSources = [...srcCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([decisionSource, recurrenceWeight]) => ({ decisionSource, recurrenceWeight }));

  const usageDropMonths = countMonthsAbove(monthCards, (c) => c.kpis.crystalSpecificUsageDropFlag === true);
  const multiPeriodFallbackHeavy =
    countMonthsAbove(monthCards, (c) => num(c.kpis.fallbackHeavyRate) >= 0.12) >= 6;
  const watchEscalatePattern =
    halfYearPacks.filter((p) => p.halfYearStatus === "watch" || p.halfYearStatus === "escalate").length;

  const topOperatingRiskAreas = [];
  if (annualStatus === "escalate") topOperatingRiskAreas.push("sustained_mismatch_and_cluster_pressure");
  if (annualStatus === "investigate") topOperatingRiskAreas.push("coverage_and_protect_investment");
  if (usageDropMonths >= 4) topOperatingRiskAreas.push("crystal_specific_usage_continuity");
  if (num(annualKpis.notApplicableRowCountAnnual) > num(annualKpis.totalCrystalCases) * 3) {
    topOperatingRiskAreas.push("non_crystal_volume_context");
  }
  if (num(rates.genericFallbackRate) >= 0.12) topOperatingRiskAreas.push("generic_fallback_concentration");

  const halfYearRecaps = halfYearPacks.map((p, i) => ({
    halfYearWindowStart: p.halfYearWindowStart,
    halfYearWindowEnd: p.halfYearWindowEnd,
    halfYearStatus: p.halfYearStatus,
    halfYearScoreBand: p.halfYearScoreBand,
    overallHalfYearQualityScore: p.overallHalfYearQualityScore,
    headline: `H${i + 1}: ops ${p.halfYearStatus}, band ${p.halfYearScoreBand}, score ${p.overallHalfYearQualityScore}`,
  }));

  const quarterRecaps = quarterlyPacks.map((p, i) => ({
    quarterWindowStart: p.quarterWindowStart,
    quarterWindowEnd: p.quarterWindowEnd,
    quarterlyStatus: p.quarterlyStatus,
    quarterScoreBand: p.quarterScoreBand,
    overallQuarterQualityScore: p.overallQuarterQualityScore,
    headline: `Q${i + 1}: ops ${p.quarterlyStatus}, band ${p.quarterScoreBand}, score ${p.overallQuarterQualityScore}`,
  }));

  const monthByMonthRecap = monthCards.map((c, i) => ({
    monthWindowStart: c.monthWindowStart,
    monthWindowEnd: c.monthWindowEnd,
    overallQualityScore: c.overallQualityScore,
    scoreBand: c.scoreBand,
    headline: `${String(c.monthWindowStart || `M${i + 1}`)}: score ${c.overallQualityScore} (${c.scoreBand})`,
  }));

  const releaseSignals = Array.isArray(a.releaseSignals) ? a.releaseSignals : [];

  const pack = {
    reviewPackVersion: ANNUAL_REVIEW_PACK_VERSION,
    yearWindowStart: String(a.yearWindowStart || "").trim(),
    yearWindowEnd: String(a.yearWindowEnd || "").trim(),
    generatedAt,
    monthsIncluded: monthCards.map((c) => c.monthWindowStart),
    quartersIncluded: quarterlyPacks.map((p) => ({
      quarterWindowStart: p.quarterWindowStart,
      quarterWindowEnd: p.quarterWindowEnd,
    })),
    halfYearsIncluded: halfYearPacks.map((p) => ({
      halfYearWindowStart: p.halfYearWindowStart,
      halfYearWindowEnd: p.halfYearWindowEnd,
    })),
    annualStatus,
    overallAnnualQualityScore,
    annualScoreBand,
    annualKpis,
    monthlyStatusDistribution,
    quarterlyStatusDistribution,
    halfYearStatusDistribution,
    monthlyScoreDistribution,
    quarterlyScoreDistribution,
    halfYearScoreDistribution,
    topRecurringAnomalies,
    topRecurringMismatchTypes,
    topRecurringRoutingRuleIds,
    topRecurringDecisionSources,
    topOperatingRiskAreas,
    usageDropMonths,
    multiPeriodFallbackHeavy,
    watchEscalateHalfYearPattern: watchEscalatePattern,
    halfYearRecaps,
    quarterRecaps,
    monthByMonthRecap,
    releaseSignalsInput: releaseSignals,
    focusAreasNextYear: [],
    executiveSummary: {},
    operatingSummary: {},
    recommendations: [],
    annualKpiPack: {},
    methodNote:
      "Template annual operating pack: not production SLOs. Pair with quarterly/monthly digests for narrative detail.",
  };

  pack.focusAreasNextYear = buildCrystalAnnualOperatingFocusAreas(pack);
  pack.executiveSummary = {
    ...buildCrystalAnnualExecutiveSummary(pack),
    methodNote:
      "Generated only from submitted rollups and nested quarterly/half-year aggregates in this JSON.",
  };
  pack.operatingSummary = buildCrystalAnnualOperatingSummary(pack);
  pack.recommendations = buildAnnualRecommendations(pack);
  pack.annualKpiPack = buildAnnualKpiPack(pack);

  return pack;
}

export function buildCrystalAnnualExecutiveSummary(pack) {
  const status = pack.annualStatus;
  const band = pack.annualScoreBand;
  const score = num(pack.overallAnnualQualityScore);
  const k = pack.annualKpis || {};
  const aligned = num(k.alignedRate);
  const hard = num(k.hardMismatchRate);
  const spec = num(k.crystalSpecificSurfaceRate);
  const gen = num(k.genericFallbackRate);

  const headline =
    status === "healthy"
      ? `Crystal operating quality for the year is in a healthy range (template score ${score}, band ${band}).`
      : status === "watch"
        ? `Crystal quality shows watch-level patterns over the year (template score ${score}, ops status: watch).`
        : status === "investigate"
          ? `Crystal quality warrants cross-team investigation across multiple periods (template score ${score}).`
          : `Crystal quality shows escalation-level signals for the year — align routing, wording, DB, and telemetry owners (template score ${score}).`;

  const body = [
    `Annual template score ${score}/100 (${band}) blends monthly scorecards weighted by crystal volume.`,
    `Weighted aligned ~${(aligned * 100).toFixed(1)}%; hard mismatch ~${(hard * 100).toFixed(1)}%; crystal-specific surface ~${(spec * 100).toFixed(1)}%; generic fallback ~${(gen * 100).toFixed(1)}%.`,
    `Annual ops triage status: **${status}** (heuristic over half-years, quarters, and months).`,
  ].join(" ");

  return {
    executiveSummaryHeadline: headline,
    executiveSummaryBody: body,
    top3Wins: padToThree(buildAnnualExecWins(pack), PAD.win),
    top3Risks: padToThree(buildAnnualExecRisks(pack), PAD.risk),
    top3NextActions: padToThree(buildAnnualExecActions(pack), PAD.action),
  };
}

function buildAnnualExecWins(pack) {
  const out = [];
  const md = pack.monthlyScoreDistribution || {};
  if (num(md.excellent) >= 6) out.push("A majority of months landed in the excellent template band.");
  const k = pack.annualKpis || {};
  if (num(k.alignedRate) >= 0.85) out.push(`Weighted aligned rate for the year ~${(num(k.alignedRate) * 100).toFixed(1)}%.`);
  const hsd = pack.halfYearScoreDistribution || {};
  if (num(hsd.excellent) >= 1 && pack.annualStatus === "healthy") {
    out.push("At least one half-year scored excellent on the template curve.");
  }
  if (out.length === 0) out.push("Annual inputs support year-over-year comparison when prior year exports exist.");
  return out;
}

function buildAnnualExecRisks(pack) {
  const out = [];
  const k = pack.annualKpis || {};
  if (pack.annualStatus === "escalate" || num(k.hardMismatchClusterCountMax) >= 3) {
    out.push("Hard mismatch cluster signals appeared in monthly rollups during the year.");
  }
  if (num(k.genericFallbackRate) >= 0.12) {
    out.push(`Generic fallback share is elevated (~${(num(k.genericFallbackRate) * 100).toFixed(1)}%) on the annual blend.`);
  }
  if (pack.topRecurringAnomalies?.length) {
    out.push(
      `Recurring digest codes include: ${pack.topRecurringAnomalies.slice(0, 3).map((x) => x.anomalyCode).join(", ")}.`,
    );
  }
  if (out.length === 0) out.push("No dominant executive risk beyond digest review for this JSON aggregate.");
  return out;
}

function buildAnnualExecActions(pack) {
  const actions = [];
  if (pack.annualStatus === "escalate") {
    actions.push("Align annual roadmap with mismatch/cluster owners using quarterly archives.");
  }
  if (pack.annualStatus === "investigate") {
    actions.push("Schedule DB/template and weak-protect reviews with ops evidence from digests.");
  }
  actions.push("Compare recurring anomalies to release history when calendars are available.");
  if (actions.length < 3) actions.push("Retain quarterly KPI packs as rolling leadership snapshots.");
  return actions;
}

export function buildCrystalAnnualOperatingSummary(pack) {
  const k = pack.annualKpis || {};
  const st = pack.annualStatus;
  const headline =
    st === "healthy"
      ? "Operating view: crystal delivery stayed within normal variance for annual planning."
      : st === "watch"
        ? "Operating view: intermittent drift suggests budgeting targeted wording and coverage work."
        : st === "investigate"
          ? "Operating view: recurring fallback/protect patterns merit capacity planning."
          : "Operating view: escalation signals should shape next-year routing and observability investments.";

  const body = [
    `Blended crystal-specific surface ~${(num(k.crystalSpecificSurfaceRate) * 100).toFixed(1)}%; generic fallback ~${(num(k.genericFallbackRate) * 100).toFixed(1)}% (rollup fields only).`,
    `Half-years in watch/escalate pattern: ${num(pack.watchEscalateHalfYearPattern)} — not a paging policy.`,
    `Release cadence impact is **not** inferred unless \`releaseSignals\` was included in the annual JSON.`,
  ].join(" ");

  return {
    operatingSummaryHeadline: headline,
    operatingSummaryBody: body,
    topRecurringOperationalPatterns: padToThree(buildOpPatterns(pack), "No coded pattern beyond digest thresholds in this aggregate."),
    topOperatingConcerns: padToThree(buildOpConcerns(pack), "Confirm with monthly digests for narrative detail."),
    topOperatingNextActions: padToThree(buildOpNextActions(pack), PAD.action),
    methodNote:
      "Operating summary uses monthly/quarterly/half-year semantics only; no revenue or customer impact estimates.",
  };
}

function buildOpPatterns(pack) {
  const p = [];
  if (pack.topRecurringMismatchTypes?.some((t) => t.mismatchType === "generic_fallback_elevated")) {
    p.push("Generic fallback months crossed the elevated threshold repeatedly — coverage pattern.");
  }
  if (num(pack.usageDropMonths) >= 4) {
    p.push("Crystal-specific usage decline flags recurred across multiple months.");
  }
  if (pack.multiPeriodFallbackHeavy) {
    p.push("Fallback-heavy months recurred across the year — tuning/QA load pattern.");
  }
  if (p.length === 0) p.push("No strong recurring pattern flagged beyond standard monitoring.");
  return p;
}

function buildOpConcerns(pack) {
  const c = [];
  if (num(pack.annualKpis?.genericFallbackRate) >= 0.12) {
    c.push("Elevated generic fallback on the annual blend — DB wording coverage investment candidate.");
  }
  if (num(pack.annualKpis?.hardMismatchRate) >= 0.05) {
    c.push("Hard mismatch rate on the annual blend — routing hardening / observability candidate.");
  }
  if (pack.annualStatus === "escalate") {
    c.push("Escalation status — prioritize mismatch remediation in operating plan.");
  }
  if (c.length === 0) c.push("No extra operating concerns inferred beyond quarterly reviews.");
  return c;
}

function buildOpNextActions(pack) {
  const a = [];
  if (pack.annualStatus === "escalate" || pack.annualStatus === "investigate") {
    a.push("Prioritize routing/wording/DB workstreams in next-year OKRs using this pack as evidence.");
  }
  a.push("Attach release calendars to future annual exports if drift-to-deploy narrative is required.");
  if (a.length < 3) a.push("Keep monthly scorecards as the operational backbone for leadership.");
  return a;
}

function buildAnnualRecommendations(pack) {
  const r = [];
  r.push("Use annual KPI headline for operating review; attach half-year and quarterly packs for drill-down.");
  if (pack.annualStatus === "watch" || pack.annualStatus === "investigate") {
    r.push("Schedule a joint ops/product session before major routing/wording roadmap locks.");
  }
  if (num(pack.annualKpis?.notApplicableRowCountAnnual) > num(pack.annualKpis?.totalCrystalCases) * 4) {
    r.push("Non-crystal export volume is high — label executive charts as crystal-slice only.");
  }
  return r;
}

export function buildCrystalAnnualOperatingFocusAreas(pack) {
  const areas = [
    "Improve DB crystal row coverage where generic fallback concentration appears in annual blend.",
    "Inspect recurring weak-protect-default against `crystal_rg_weak_protect_default` and fixtures.",
    "Reduce generic fallback concentration via templates and category coverage.",
    "Stabilize crystal-specific surface rate using monthly trend exports.",
    "Compare recurring anomalies to release history when available.",
  ];
  if (pack.annualStatus === "escalate") {
    areas.unshift("Prioritize mismatch/cluster remediation and observability before broad operating bets.");
  }
  return areas;
}

function buildAnnualKpiPack(pack) {
  const k = pack.annualKpis || {};
  const stabilityNote =
    num(k.crystalSpecificSurfaceRate) >= 0.8 && pack.annualStatus !== "escalate"
      ? "Blended surface rate ≥80% — relatively stable vs severe decline"
      : "Review monthly crystal-specific surface slopes in digests";

  const operatingImpactSignals = [
    {
      label: "Stability of crystal-first wording (annual blend)",
      value: `${(num(k.crystalSpecificSurfaceRate) * 100).toFixed(1)}%`,
      triggered: num(k.crystalSpecificSurfaceRate) < 0.72,
      note: stabilityNote,
    },
    {
      label: "Release-to-drift sensitivity",
      value: (pack.releaseSignalsInput || []).length ? "release metadata present" : "no releaseSignals in input",
      triggered: false,
      note: "Does not infer deploy impact without releaseSignals in JSON.",
    },
    {
      label: "DB crystal coverage concern (generic fallback blend)",
      value: `${(num(k.genericFallbackRate) * 100).toFixed(1)}%`,
      triggered: num(k.genericFallbackRate) >= 0.12,
      note: "Proxy from rollup fields only.",
    },
    {
      label: "Recurring generic fallback concentration",
      value: pack.topRecurringMismatchTypes?.some((t) => t.mismatchType === "generic_fallback_elevated")
        ? "annual pattern"
        : "below annual threshold",
      triggered: !!pack.topRecurringMismatchTypes?.some((t) => t.mismatchType === "generic_fallback_elevated"),
      note: "≥6 months crossing elevated threshold in the year.",
    },
    {
      label: "Recurring weak-protect-default concentration",
      value: `${(num(k.weakProtectDefaultRate) * 100).toFixed(1)}%`,
      triggered: num(k.weakProtectDefaultRate) >= 0.16 || pack.multiPeriodFallbackHeavy,
      note: "Annual blend plus multi-month fallback-heavy.",
    },
    {
      label: "Repeated watch/escalate in half-year reviews",
      value: String(pack.watchEscalateHalfYearPattern ?? 0),
      triggered: num(pack.watchEscalateHalfYearPattern) >= 1,
      note: "Counts half-years with watch or escalate status.",
    },
  ];

  return {
    headlineKpis: [
      { label: "Overall annual quality score (template)", value: pack.overallAnnualQualityScore, unit: "0-100" },
      { label: "Aligned rate (annual, weighted)", value: `${(num(k.alignedRate) * 100).toFixed(1)}%` },
      { label: "Hard mismatch rate (annual, weighted)", value: `${(num(k.hardMismatchRate) * 100).toFixed(1)}%` },
      {
        label: "Crystal-specific surface rate (annual, weighted)",
        value: `${(num(k.crystalSpecificSurfaceRate) * 100).toFixed(1)}%`,
      },
      { label: "Generic fallback rate (annual, weighted)", value: `${(num(k.genericFallbackRate) * 100).toFixed(1)}%` },
    ],
    supportingKpis: [
      { label: "Soft mismatch rate (annual, weighted)", value: `${(num(k.softMismatchRate) * 100).toFixed(1)}%` },
      { label: "Fallback-heavy rate (annual, weighted)", value: `${(num(k.fallbackHeavyRate) * 100).toFixed(1)}%` },
      { label: "Weak-protect-default rate (annual, weighted)", value: `${(num(k.weakProtectDefaultRate) * 100).toFixed(1)}%` },
      { label: "Quarter score band distribution", value: JSON.stringify(pack.quarterlyScoreDistribution || {}) },
      { label: "Half-year score band distribution", value: JSON.stringify(pack.halfYearScoreDistribution || {}) },
      {
        label: "Top routing rule share (first month with data)",
        value:
          k.topRoutingRuleShareAnnual != null && Number.isFinite(k.topRoutingRuleShareAnnual)
            ? `${(num(k.topRoutingRuleShareAnnual) * 100).toFixed(1)}%`
            : "—",
      },
      {
        label: "Top wording source share (first month with data)",
        value:
          k.topWordingSourceShareAnnual != null && Number.isFinite(k.topWordingSourceShareAnnual)
            ? `${(num(k.topWordingSourceShareAnnual) * 100).toFixed(1)}%`
            : "—",
      },
    ],
    riskIndicators: [
      {
        label: "Recurring anomaly volume (sum, year)",
        value: k.recurringAnomalyCountAnnual,
        triggered: num(k.recurringAnomalyCountAnnual) >= 24,
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
        triggered: num(pack.usageDropMonths) >= 4,
      },
      {
        label: "Multi-period fallback-heavy (year)",
        value: pack.multiPeriodFallbackHeavy ? "yes" : "no",
        triggered: pack.multiPeriodFallbackHeavy === true,
      },
    ],
    trendIndicators: [
      { label: "Annual ops status (heuristic)", value: pack.annualStatus },
      { label: "Annual score band (template)", value: pack.annualScoreBand },
      { label: "Half-years in view", value: (pack.halfYearsIncluded || []).length },
      { label: "Quarters in view", value: (pack.quartersIncluded || []).length },
      { label: "Months in view", value: (pack.monthsIncluded || []).length },
    ],
    recurringSignals: (pack.topRecurringAnomalies || []).slice(0, 20).map((a) => ({
      label: a.anomalyCode,
      value: a.monthsAffected,
      monthsAffected: a.monthsAffected,
    })),
    operatingImpactSignals,
    recommendedFocusAreas: pack.focusAreasNextYear || [],
  };
}

/**
 * @param {object} pack
 */
export function renderCrystalAnnualOperatingReviewPackMarkdown(pack) {
  const w = (s) => (s == null ? "" : String(s));
  const ex = pack.executiveSummary || {};
  const op = pack.operatingSummary || {};

  const lines = [];
  lines.push("# Crystal annual quality operating review pack");
  lines.push("");
  lines.push("## A. Header");
  lines.push("");
  lines.push(`- **Annual window:** ${w(pack.yearWindowStart)} → ${w(pack.yearWindowEnd)}`);
  lines.push(`- **Generated at:** ${w(pack.generatedAt)}`);
  lines.push(`- **Annual ops status (heuristic):** \`${w(pack.annualStatus)}\``);
  lines.push(`- **Overall annual quality score (template):** ${pack.overallAnnualQualityScore} / 100`);
  lines.push(`- **Annual score band:** \`${w(pack.annualScoreBand)}\``);
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

  lines.push("## C. Annual KPI summary");
  lines.push("");
  const k = pack.annualKpis || {};
  lines.push(`- **Aligned (weighted):** ${(num(k.alignedRate) * 100).toFixed(1)}%`);
  lines.push(`- **Soft mismatch (weighted):** ${(num(k.softMismatchRate) * 100).toFixed(1)}%`);
  lines.push(`- **Hard mismatch (weighted):** ${(num(k.hardMismatchRate) * 100).toFixed(1)}%`);
  lines.push(`- **Crystal-specific surface (weighted):** ${(num(k.crystalSpecificSurfaceRate) * 100).toFixed(1)}%`);
  lines.push(`- **Generic fallback (weighted):** ${(num(k.genericFallbackRate) * 100).toFixed(1)}%`);
  lines.push(`- **Fallback-heavy (weighted):** ${(num(k.fallbackHeavyRate) * 100).toFixed(1)}%`);
  lines.push(`- **Weak-protect-default (weighted):** ${(num(k.weakProtectDefaultRate) * 100).toFixed(1)}%`);
  lines.push(`- **Total crystal cases (sum):** ${k.totalCrystalCases}`);
  lines.push("");

  lines.push("## D. Period distribution summary");
  lines.push("");
  lines.push("### Monthly status distribution");
  lines.push("```json");
  lines.push(JSON.stringify(pack.monthlyStatusDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Quarterly status distribution");
  lines.push("```json");
  lines.push(JSON.stringify(pack.quarterlyStatusDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Half-year status distribution");
  lines.push("```json");
  lines.push(JSON.stringify(pack.halfYearStatusDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Monthly score distribution");
  lines.push("```json");
  lines.push(JSON.stringify(pack.monthlyScoreDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Quarterly score distribution");
  lines.push("```json");
  lines.push(JSON.stringify(pack.quarterlyScoreDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Half-year score distribution");
  lines.push("```json");
  lines.push(JSON.stringify(pack.halfYearScoreDistribution || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Half-year recap");
  for (const h of pack.halfYearRecaps || []) lines.push(`- ${h.headline}`);
  lines.push("");
  lines.push("### Quarter recap");
  for (const q of pack.quarterRecaps || []) lines.push(`- ${q.headline}`);
  lines.push("");
  lines.push("### Month recap");
  for (const m of pack.monthByMonthRecap || []) lines.push(`- ${m.headline}`);
  lines.push("");

  lines.push("## E. Recurring anomaly digest");
  lines.push("");
  lines.push("| Code | Months | Severity | Likely causes | Suggested action |");
  lines.push("|------|--------|----------|---------------|------------------|");
  for (const row of pack.topRecurringAnomalies || []) {
    const causes = (row.likelyCauses || []).join("; ") || "—";
    const act = (row.suggestedNextActions || []).join("; ") || "—";
    lines.push(`| ${row.anomalyCode} | ${row.monthsAffected} | ${row.severity} | ${causes} | ${act} |`);
  }
  if (!(pack.topRecurringAnomalies || []).length) lines.push("| — | — | — | — | — |");
  lines.push("");

  lines.push("## F. Operating risk calls");
  lines.push("");
  lines.push("### What to monitor next year");
  lines.push("- Soft mismatch + generic fallback when annual status is watch.");
  lines.push("");
  lines.push("### What to investigate");
  lines.push("- Fallback-heavy / weak-protect-default when status is investigate.");
  lines.push("");
  lines.push("### What to escalate");
  lines.push("- Hard mismatch clusters and repeated risk half-years when status is escalate.");
  lines.push("");
  lines.push("### What can wait");
  lines.push("- Cosmetic copy where monthly bands remained good.");
  lines.push("");
  lines.push("### Where to invest next");
  lines.push("- **Routing** — mismatch/cluster dominance.");
  lines.push("- **Wording / DB** — generic fallback and weak-protect concentration.");
  lines.push("- **Telemetry** — richer exports before new customer-facing experiments.");
  lines.push("");

  lines.push("## G. Recommended strategic focus areas");
  lines.push("");
  for (const f of pack.focusAreasNextYear || []) lines.push(`- ${f}`);
  lines.push("");

  lines.push("## H. Operating summary");
  lines.push("");
  lines.push(`### ${w(op.operatingSummaryHeadline)}`);
  lines.push("");
  lines.push(w(op.operatingSummaryBody));
  lines.push("");
  lines.push(`> ${w(op.methodNote)}`);
  lines.push("");
  lines.push("### Top recurring operational patterns");
  for (const t of op.topRecurringOperationalPatterns || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("### Top operating concerns");
  for (const t of op.topOperatingConcerns || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("### Top operating next actions");
  for (const t of op.topOperatingNextActions || []) lines.push(`- ${t}`);
  lines.push("");

  lines.push("## I. Appendix — annual KPI pack");
  lines.push("");
  const kp = pack.annualKpiPack || {};
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
  lines.push("### Operating impact signals");
  lines.push("| Label | Value | Note |");
  lines.push("|-------|-------|------|");
  for (const row of kp.operatingImpactSignals || []) {
    lines.push(`| ${row.label} | ${row.value} | ${w(row.note)} |`);
  }
  lines.push("");
  lines.push("### Recommendations");
  lines.push("");
  for (const r of pack.recommendations || []) lines.push(`- ${r}`);
  lines.push("");

  return lines.join("\n");
}
