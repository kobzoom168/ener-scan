/**
 * Monthly crystal quality scorecard + KPI pack (offline).
 * Consumes a **monthly rollup** JSON object (see `docs/ops/crystal-monthly-scorecard.md`).
 * Template scoring — **not** canonical production SLOs.
 *
 * @module crystalMonthlyScorecard.util
 */

export const SCORECARD_VERSION = "1";

/**
 * Expected rollup shape (Phase 9–compatible stub; may be produced by future monthly rollup job).
 * All rates are 0..1 for crystal slice unless noted.
 *
 * @typedef {Object} CrystalMonthlyRollupInput
 * @property {string} [rollupVersion]
 * @property {string} monthWindowStart — ISO
 * @property {string} monthWindowEnd — ISO
 * @property {string} [generatedAt]
 * @property {number} totalCrystalCases — denominator for crystal KPIs
 * @property {number} [notApplicableRowCount] — non-crystal rows in export (informational only)
 * @property {number} alignedRate
 * @property {number} softMismatchRate
 * @property {number} hardMismatchRate
 * @property {number} crystalSpecificSurfaceRate
 * @property {number} genericFallbackRate
 * @property {number} fallbackHeavyRate
 * @property {number} weakProtectDefaultRate
 * @property {number} [recurringAnomalyCount]
 * @property {number} [hardMismatchClusterCount]
 * @property {number} [genericFallbackClusterCount]
 * @property {number} [objectFamilyMismatchClusterCount]
 * @property {number} [categoryMismatchClusterCount]
 * @property {boolean} [crystalSpecificUsageDropFlag]
 * @property {number} [trendStableWeeks]
 * @property {number} [trendWatchWeeks]
 * @property {number} [trendInvestigateWeeks]
 * @property {number} [trendEscalateWeeks]
 * @property {number} [topRoutingRuleShare] — 0..1 optional, from rollup (largest routing rule share)
 * @property {number} [topWordingSourceShare] — 0..1 optional (largest visible wording source share)
 */

/**
 * @typedef {Object} CrystalMonthlyKpiPack
 * @property {{ label: string, value: string|number, unit?: string }[]} headlineKpis
 * @property {{ label: string, value: string|number, unit?: string }[]} supportingKpis
 * @property {{ label: string, value: string|number, triggered?: boolean }[]} riskIndicators
 * @property {{ label: string, value: string|number }[]} trendIndicators
 * @property {string[]} recommendedFocusAreas
 */

/**
 * @typedef {Object} CrystalMonthlyScorecard
 * @property {string} scorecardVersion
 * @property {string} monthWindowStart
 * @property {string} monthWindowEnd
 * @property {string} generatedAt
 * @property {string} monthlyStatus — short code aligned with score band
 * @property {number} overallQualityScore — 0..100
 * @property {"excellent"|"good"|"watch"|"risk"} scoreBand
 * @property {Object} kpis — mirror rollup rates + anomaly counts
 * @property {string[]} strengths
 * @property {string[]} risks
 * @property {string[]} topSignals
 * @property {string[]} topAnomalies
 * @property {string[]} recommendations
 * @property {{ code: string, points: number, label: string }[]} scoreDriversPositive
 * @property {{ code: string, points: number, label: string }[]} scoreDriversNegative
 * @property {string} scoreMethodNote
 * @property {CrystalMonthlyRollupInput} rollupSnapshot
 * @property {CrystalMonthlyKpiPack} kpiPack
 */

const BAND = {
  EXCELLENT: "excellent",
  GOOD: "good",
  WATCH: "watch",
  RISK: "risk",
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function num(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

/**
 * Template score: start 100, subtract risk terms, small bonus for alignment / stability.
 * @param {CrystalMonthlyRollupInput} r
 */
function computeTemplateScore(r) {
  const driversNeg = [];
  const driversPos = [];
  let s = 100;

  const hard = clamp(num(r.hardMismatchRate), 0, 1);
  const soft = clamp(num(r.softMismatchRate), 0, 1);
  const gen = clamp(num(r.genericFallbackRate), 0, 1);
  const fb = clamp(num(r.fallbackHeavyRate), 0, 1);
  const wp = clamp(num(r.weakProtectDefaultRate), 0, 1);
  const spec = clamp(num(r.crystalSpecificSurfaceRate), 0, 1);
  const aligned = clamp(num(r.alignedRate), 0, 1);

  const pHard = Math.min(38, hard * 380);
  if (pHard > 0) {
    s -= pHard;
    driversNeg.push({
      code: "hard_mismatch_rate",
      points: Math.round(pHard * 10) / 10,
      label: `Hard mismatch rate ${(hard * 100).toFixed(1)}%`,
    });
  }
  const pSoft = Math.min(18, soft * 90);
  if (pSoft > 0) {
    s -= pSoft;
    driversNeg.push({
      code: "soft_mismatch_rate",
      points: Math.round(pSoft * 10) / 10,
      label: `Soft mismatch rate ${(soft * 100).toFixed(1)}%`,
    });
  }
  const pGen = Math.min(22, gen * 70);
  if (pGen > 0) {
    s -= pGen;
    driversNeg.push({
      code: "generic_fallback_rate",
      points: Math.round(pGen * 10) / 10,
      label: `Generic code-bank fallback rate ${(gen * 100).toFixed(1)}%`,
    });
  }
  const pFb = Math.min(16, fb * 95);
  if (pFb > 0) {
    s -= pFb;
    driversNeg.push({
      code: "fallback_heavy_rate",
      points: Math.round(pFb * 10) / 10,
      label: `Fallback-heavy rate ${(fb * 100).toFixed(1)}%`,
    });
  }
  const pWp = Math.min(12, wp * 35);
  if (pWp > 0) {
    s -= pWp;
    driversNeg.push({
      code: "weak_protect_default_rate",
      points: Math.round(pWp * 10) / 10,
      label: `Weak-protect default share ${(wp * 100).toFixed(1)}%`,
    });
  }
  const pSpec = Math.min(14, (1 - spec) * 28);
  if (pSpec > 0) {
    s -= pSpec;
    driversNeg.push({
      code: "crystal_specific_gap",
      points: Math.round(pSpec * 10) / 10,
      label: `Crystal-specific surface gap (1 − rate)`,
    });
  }

  const rec = num(r.recurringAnomalyCount, 0);
  const pr = Math.min(12, rec * 2.2);
  if (pr > 0) {
    s -= pr;
    driversNeg.push({
      code: "recurring_anomalies",
      points: Math.round(pr * 10) / 10,
      label: `Recurring anomaly count ${rec}`,
    });
  }
  const hmc = num(r.hardMismatchClusterCount, 0);
  const ph = Math.min(10, hmc * 4);
  if (ph > 0) {
    s -= ph;
    driversNeg.push({
      code: "hard_mismatch_clusters",
      points: Math.round(ph * 10) / 10,
      label: `Hard mismatch cluster count ${hmc}`,
    });
  }
  const gfc = num(r.genericFallbackClusterCount, 0);
  const pg = Math.min(8, gfc * 3);
  if (pg > 0) {
    s -= pg;
    driversNeg.push({
      code: "generic_fallback_clusters",
      points: Math.round(pg * 10) / 10,
      label: `Generic fallback cluster count ${gfc}`,
    });
  }
  const ofm = num(r.objectFamilyMismatchClusterCount, 0);
  const pOfm = Math.min(8, ofm * 4);
  if (pOfm > 0) {
    s -= pOfm;
    driversNeg.push({
      code: "object_family_clusters",
      points: Math.round(pOfm * 10) / 10,
      label: `Object-family mismatch cluster count ${ofm}`,
    });
  }
  const catc = num(r.categoryMismatchClusterCount, 0);
  const pCat = Math.min(8, catc * 4);
  if (pCat > 0) {
    s -= pCat;
    driversNeg.push({
      code: "category_mismatch_clusters",
      points: Math.round(pCat * 10) / 10,
      label: `Category mismatch cluster count ${catc}`,
    });
  }

  if (r.crystalSpecificUsageDropFlag === true) {
    s -= 10;
    driversNeg.push({
      code: "crystal_specific_usage_drop_flag",
      points: 10,
      label: "Crystal-specific usage drop flagged in rollup/digest",
    });
  }

  const tw = num(r.trendWatchWeeks, 0);
  const ti = num(r.trendInvestigateWeeks, 0);
  const te = num(r.trendEscalateWeeks, 0);
  const pTrend = Math.min(6, tw * 0.8 + ti * 1.5 + te * 2.5);
  if (pTrend > 0) {
    s -= pTrend;
    driversNeg.push({
      code: "weekly_trend_mix",
      points: Math.round(pTrend * 10) / 10,
      label: `Weeks watch/investigate/escalate: ${tw}/${ti}/${te}`,
    });
  }

  const ts = num(r.trendStableWeeks, 0);
  const bonusStable = Math.min(6, ts * 0.4);
  if (bonusStable > 0) {
    s += bonusStable;
    driversPos.push({
      code: "stable_weeks",
      points: Math.round(bonusStable * 10) / 10,
      label: `${ts} week(s) with stable trend (template bonus)`,
    });
  }

  const bAlign = Math.min(8, aligned * 8);
  if (bAlign > 0) {
    s += bAlign;
    driversPos.push({
      code: "aligned_rate",
      points: Math.round(bAlign * 10) / 10,
      label: `Aligned rate ${(aligned * 100).toFixed(1)}%`,
    });
  }

  s = Math.round(clamp(s, 0, 100));

  const methodNote =
    "Template review score (0–100): weighted penalties for mismatch/fallback/anomaly signals plus small bonuses for alignment and stable weekly trends. Calibrate weights to your baseline; not a production SLA.";

  return {
    overallQualityScore: s,
    scoreDriversNegative: driversNeg,
    scoreDriversPositive: driversPos,
    scoreMethodNote: methodNote,
  };
}

/**
 * @param {number} score
 */
function scoreToBand(score) {
  if (score >= 82) return BAND.EXCELLENT;
  if (score >= 68) return BAND.GOOD;
  if (score >= 52) return BAND.WATCH;
  return BAND.RISK;
}

/**
 * @param {string} band
 */
function bandToMonthlyStatus(band) {
  if (band === BAND.EXCELLENT) return "excellent_month";
  if (band === BAND.GOOD) return "good_month";
  if (band === BAND.WATCH) return "watch_month";
  return "risk_month";
}

function buildStrengthsRisksSignals(rollup, band, kpis, driversNeg, driversPos) {
  const strengths = [];
  const risks = [];
  const topSignals = [];
  const topAnomalies = [];

  if (num(rollup.alignedRate) >= 0.88) strengths.push("Aligned share is strong for the crystal slice.");
  if (num(rollup.crystalSpecificSurfaceRate) >= 0.85) strengths.push("Crystal-specific surface rate is healthy.");
  if (driversPos.length) strengths.push("Positive score drivers recorded (alignment / stable weeks).");

  if (num(rollup.hardMismatchRate) >= 0.04) {
    risks.push("Hard mismatch rate elevated — review routing vs wording with ops playbook.");
    topSignals.push("hard_mismatch_pressure");
  }
  if (num(rollup.genericFallbackRate) >= 0.2) {
    risks.push("Generic code-bank fallback share is high — check DB coverage and hydrate path.");
    topSignals.push("generic_fallback_pressure");
  }
  if (num(rollup.recurringAnomalyCount) >= 3) {
    topAnomalies.push(`Recurring anomalies: ${rollup.recurringAnomalyCount} (see monthly digest).`);
  }
  if (num(rollup.hardMismatchClusterCount) >= 1) {
    topAnomalies.push(`Hard mismatch clusters: ${rollup.hardMismatchClusterCount}`);
  }
  if (rollup.crystalSpecificUsageDropFlag) {
    risks.push("Crystal-specific usage drop flagged — validate wording path vs routing.");
    topSignals.push("crystal_specific_drop");
  }

  if (band === BAND.EXCELLENT || band === BAND.GOOD) {
    strengths.push(`Score band: ${band} — suitable for routine monthly review.`);
  } else {
    risks.push(`Score band: ${band} — pair with anomaly digest and weekly trends.`);
  }

  return { strengths, risks, topSignals, topAnomalies };
}

function buildRecommendations(band, rollup) {
  const rec = [];
  rec.push("Use KPI pack headline row in monthly ops notes; drill into digest for narrative detail.");
  if (band === BAND.RISK || band === BAND.WATCH) {
    rec.push("Schedule routing/wording/DB triage using crystal-routing-wording-playbook.md.");
  }
  if (num(rollup.weakProtectDefaultRate) > 0.25) {
    rec.push("Review weak-protect default share vs rule-map and fixtures.");
  }
  if (num(rollup.notApplicableRowCount) > num(rollup.totalCrystalCases) * 4) {
    rec.push("High Thai/non-crystal volume in export — crystal KPIs still slice-specific; confirm filters in warehouse.");
  }
  return rec;
}

/**
 * @param {CrystalMonthlyScorecard} scorecard
 * @returns {CrystalMonthlyKpiPack}
 */
export function buildCrystalMonthlyKpiPack(scorecard) {
  const k = scorecard.kpis;
  return {
    headlineKpis: [
      { label: "Overall quality score (template)", value: scorecard.overallQualityScore, unit: "0-100" },
      { label: "Aligned rate", value: `${(num(k.alignedRate) * 100).toFixed(1)}%` },
      { label: "Hard mismatch rate", value: `${(num(k.hardMismatchRate) * 100).toFixed(1)}%` },
      { label: "Crystal-specific surface rate", value: `${(num(k.crystalSpecificSurfaceRate) * 100).toFixed(1)}%` },
      { label: "Generic fallback rate", value: `${(num(k.genericFallbackRate) * 100).toFixed(1)}%` },
    ],
    supportingKpis: [
      { label: "Soft mismatch rate", value: `${(num(k.softMismatchRate) * 100).toFixed(1)}%` },
      { label: "Fallback-heavy rate", value: `${(num(k.fallbackHeavyRate) * 100).toFixed(1)}%` },
      { label: "Weak-protect default rate", value: `${(num(k.weakProtectDefaultRate) * 100).toFixed(1)}%` },
      { label: "Total crystal cases", value: k.totalCrystalCases },
      { label: "Recurring anomaly count", value: k.recurringAnomalyCount },
      {
        label: "Top routing rule share",
        value:
          k.topRoutingRuleShare != null && Number.isFinite(k.topRoutingRuleShare)
            ? `${(num(k.topRoutingRuleShare) * 100).toFixed(1)}%`
            : "—",
      },
      {
        label: "Top wording source share",
        value:
          k.topWordingSourceShare != null && Number.isFinite(k.topWordingSourceShare)
            ? `${(num(k.topWordingSourceShare) * 100).toFixed(1)}%`
            : "—",
      },
    ],
    riskIndicators: [
      {
        label: "Recurring anomalies",
        value: k.recurringAnomalyCount,
        triggered: num(k.recurringAnomalyCount) >= 3,
      },
      {
        label: "Hard mismatch clusters",
        value: k.hardMismatchClusterCount,
        triggered: num(k.hardMismatchClusterCount) >= 1,
      },
      {
        label: "Generic fallback clusters",
        value: k.genericFallbackClusterCount,
        triggered: num(k.genericFallbackClusterCount) >= 2,
      },
      {
        label: "Object-family mismatch clusters",
        value: k.objectFamilyMismatchClusterCount,
        triggered: num(k.objectFamilyMismatchClusterCount) >= 1,
      },
      {
        label: "Category mismatch clusters",
        value: k.categoryMismatchClusterCount,
        triggered: num(k.categoryMismatchClusterCount) >= 1,
      },
      {
        label: "Crystal-specific usage drop",
        value: k.crystalSpecificUsageDropFlag ? "yes" : "no",
        triggered: k.crystalSpecificUsageDropFlag === true,
      },
    ],
    trendIndicators: [
      { label: "Stable trend weeks", value: k.trendStableWeeks },
      { label: "Watch trend weeks", value: k.trendWatchWeeks },
      { label: "Investigate trend weeks", value: k.trendInvestigateWeeks },
      { label: "Escalate trend weeks", value: k.trendEscalateWeeks },
    ],
    recommendedFocusAreas: [
      "Soft mismatch and generic fallback trends when the band is watch or below.",
      "Fallback-heavy and weak-protect-default spikes; cross-check monthly anomaly digest.",
      "Hard mismatch clusters and weekly trend escalation weeks; align with routing/wording owners.",
      "Flat KPIs, low recurring anomaly count, and doc-only releases — routine monitoring only.",
    ],
  };
}

/**
 * @param {CrystalMonthlyRollupInput} rollup
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalMonthlyScorecard(rollup, options = {}) {
  const r = rollup || {};
  const generatedAt = r.generatedAt != null ? String(r.generatedAt) : options.generatedAt != null
    ? String(options.generatedAt)
    : new Date().toISOString();

  const kpis = {
    alignedRate: num(r.alignedRate),
    softMismatchRate: num(r.softMismatchRate),
    hardMismatchRate: num(r.hardMismatchRate),
    crystalSpecificSurfaceRate: num(r.crystalSpecificSurfaceRate),
    genericFallbackRate: num(r.genericFallbackRate),
    fallbackHeavyRate: num(r.fallbackHeavyRate),
    weakProtectDefaultRate: num(r.weakProtectDefaultRate),
    recurringAnomalyCount: num(r.recurringAnomalyCount, 0),
    hardMismatchClusterCount: num(r.hardMismatchClusterCount, 0),
    genericFallbackClusterCount: num(r.genericFallbackClusterCount, 0),
    objectFamilyMismatchClusterCount: num(r.objectFamilyMismatchClusterCount, 0),
    categoryMismatchClusterCount: num(r.categoryMismatchClusterCount, 0),
    crystalSpecificUsageDropFlag: r.crystalSpecificUsageDropFlag === true,
    totalCrystalCases: num(r.totalCrystalCases, 0),
    notApplicableRowCount: num(r.notApplicableRowCount, 0),
    trendStableWeeks: num(r.trendStableWeeks, 0),
    trendWatchWeeks: num(r.trendWatchWeeks, 0),
    trendInvestigateWeeks: num(r.trendInvestigateWeeks, 0),
    trendEscalateWeeks: num(r.trendEscalateWeeks, 0),
    topRoutingRuleShare:
      r.topRoutingRuleShare != null && Number.isFinite(Number(r.topRoutingRuleShare))
        ? clamp(num(r.topRoutingRuleShare), 0, 1)
        : null,
    topWordingSourceShare:
      r.topWordingSourceShare != null && Number.isFinite(Number(r.topWordingSourceShare))
        ? clamp(num(r.topWordingSourceShare), 0, 1)
        : null,
  };

  const { overallQualityScore, scoreDriversNegative, scoreDriversPositive, scoreMethodNote } =
    computeTemplateScore({ ...r, ...kpis });

  const scoreBand = scoreToBand(overallQualityScore);
  const monthlyStatus = bandToMonthlyStatus(scoreBand);

  const { strengths, risks, topSignals, topAnomalies } = buildStrengthsRisksSignals(
    { ...r, ...kpis },
    scoreBand,
    kpis,
    scoreDriversNegative,
    scoreDriversPositive,
  );

  const recommendations = buildRecommendations(scoreBand, { ...r, ...kpis });

  /** @type {CrystalMonthlyScorecard} */
  const scorecard = {
    scorecardVersion: SCORECARD_VERSION,
    monthWindowStart: String(r.monthWindowStart || "").trim(),
    monthWindowEnd: String(r.monthWindowEnd || "").trim(),
    generatedAt,
    monthlyStatus,
    overallQualityScore,
    scoreBand,
    kpis,
    strengths,
    risks,
    topSignals,
    topAnomalies,
    recommendations,
    scoreDriversPositive,
    scoreDriversNegative,
    scoreMethodNote,
    rollupSnapshot: { ...r },
    kpiPack: buildCrystalMonthlyKpiPack({
      scorecardVersion: SCORECARD_VERSION,
      monthWindowStart: String(r.monthWindowStart || "").trim(),
      monthWindowEnd: String(r.monthWindowEnd || "").trim(),
      generatedAt,
      monthlyStatus,
      overallQualityScore,
      scoreBand,
      kpis,
      strengths,
      risks,
      topSignals,
      topAnomalies,
      recommendations,
      scoreDriversPositive,
      scoreDriversNegative,
      scoreMethodNote,
      rollupSnapshot: { ...r },
    }),
  };

  return scorecard;
}

/**
 * @param {CrystalMonthlyScorecard} scorecard
 */
export function renderCrystalMonthlyScorecardMarkdown(scorecard) {
  const w = (s) => (s == null ? "" : String(s));
  const pct = (k) =>
    typeof k === "number" && Number.isFinite(k) ? `${(k * 100).toFixed(1)}%` : "—";

  const k = scorecard.kpis;
  const lines = [];

  lines.push("# Crystal monthly quality scorecard");
  lines.push("");
  lines.push("## A. Header");
  lines.push("");
  lines.push(`- **Month window:** ${w(scorecard.monthWindowStart)} → ${w(scorecard.monthWindowEnd)}`);
  lines.push(`- **Generated at:** ${w(scorecard.generatedAt)}`);
  lines.push(`- **Overall quality score (template):** ${scorecard.overallQualityScore} / 100`);
  lines.push(`- **Score band:** \`${w(scorecard.scoreBand)}\``);
  lines.push(`- **Monthly status:** \`${w(scorecard.monthlyStatus)}\``);
  lines.push("");
  lines.push(`> ${w(scorecard.scoreMethodNote)}`);
  lines.push("");

  lines.push("## B. Executive KPI summary");
  lines.push("");
  lines.push(`- **Total crystal cases:** ${k.totalCrystalCases}`);
  lines.push(`- **Aligned rate:** ${pct(k.alignedRate)}`);
  lines.push(`- **Hard mismatch rate:** ${pct(k.hardMismatchRate)}`);
  lines.push(`- **Crystal-specific surface rate:** ${pct(k.crystalSpecificSurfaceRate)}`);
  lines.push(`- **Generic fallback rate:** ${pct(k.genericFallbackRate)}`);
  lines.push(`- **Recurring anomaly count:** ${k.recurringAnomalyCount}`);
  lines.push(`- **Non-crystal rows (informational):** ${k.notApplicableRowCount}`);
  lines.push("");

  lines.push("## C. Strengths");
  lines.push("");
  for (const s of scorecard.strengths) lines.push(`- ${s}`);
  lines.push("");

  lines.push("## D. Risks");
  lines.push("");
  for (const s of scorecard.risks) lines.push(`- ${s}`);
  lines.push("");

  lines.push("## E. Recommended focus areas");
  lines.push("");
  const focus = scorecard.kpiPack.recommendedFocusAreas;
  lines.push("### What to monitor");
  lines.push(`- ${focus[0] ?? "—"}`);
  lines.push("");
  lines.push("### What to investigate");
  lines.push(`- ${focus[1] ?? "—"}`);
  lines.push("");
  lines.push("### What to escalate");
  lines.push(`- ${focus[2] ?? "—"}`);
  lines.push("");
  lines.push("### What can wait");
  lines.push(`- ${focus[3] ?? "—"}`);
  lines.push("");

  lines.push("## F. KPI pack appendix");
  lines.push("");
  lines.push("### Headline KPIs");
  lines.push("");
  lines.push("| Label | Value |");
  lines.push("|-------|-------|");
  for (const row of scorecard.kpiPack.headlineKpis) {
    lines.push(`| ${row.label} | ${row.value}${row.unit ? ` (${row.unit})` : ""} |`);
  }
  lines.push("");
  lines.push("### Supporting KPIs");
  lines.push("");
  lines.push("| Label | Value |");
  lines.push("|-------|-------|");
  for (const row of scorecard.kpiPack.supportingKpis) {
    lines.push(`| ${row.label} | ${row.value} |`);
  }
  lines.push("");
  lines.push("### Risk indicators");
  lines.push("");
  lines.push("| Label | Value | Triggered |");
  lines.push("|-------|-------|-----------|");
  for (const row of scorecard.kpiPack.riskIndicators) {
    lines.push(`| ${row.label} | ${row.value} | ${row.triggered ? "yes" : "no"} |`);
  }
  lines.push("");
  lines.push("### Trend indicators (from rollup)");
  lines.push("");
  lines.push("| Label | Value |");
  lines.push("|-------|-------|");
  for (const row of scorecard.kpiPack.trendIndicators) {
    lines.push(`| ${row.label} | ${row.value} |`);
  }
  lines.push("");
  lines.push("### Score driver breakdown (template)");
  lines.push("");
  lines.push("**Positive:**");
  for (const d of scorecard.scoreDriversPositive) {
    lines.push(`- ${d.label} (+${d.points})`);
  }
  lines.push("");
  lines.push("**Negative:**");
  for (const d of scorecard.scoreDriversNegative) {
    lines.push(`- ${d.label} (−${d.points})`);
  }
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify({ kpis: scorecard.kpis, topSignals: scorecard.topSignals, topAnomalies: scorecard.topAnomalies }, null, 2));
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
