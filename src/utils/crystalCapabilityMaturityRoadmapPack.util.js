/**
 * Crystal quality capability maturity model + operating roadmap pack (offline).
 * Consumes **annual operating review pack** output and/or an **evidenceSnapshot** object
 * (see `docs/ops/crystal-capability-maturity-roadmap-pack.md`).
 * Template assessment — not production certification.
 *
 * @module crystalCapabilityMaturityRoadmapPack.util
 */

import { buildCrystalAnnualOperatingReviewPack } from "./crystalAnnualOperatingReviewPack.util.js";

export const MATURITY_REVIEW_PACK_VERSION = "1";

/** @typedef {"L1"|"L2"|"L3"|"L4"} MaturityLevel */
/** @typedef {"fragile"|"emerging"|"stable"|"scalable"} MaturityBand */

const LEVEL_TO_BAND = {
  L1: "fragile",
  L2: "emerging",
  L3: "stable",
  L4: "scalable",
};

function num(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function clampLevel(n) {
  const x = Math.round(n);
  if (x <= 1) return /** @type {MaturityLevel} */ ("L1");
  if (x === 2) return /** @type {MaturityLevel} */ ("L2");
  if (x === 3) return /** @type {MaturityLevel} */ ("L3");
  return /** @type {MaturityLevel} */ ("L4");
}

/** @param {MaturityLevel} lv */
function atLeast(lv, min) {
  const o = { L1: 1, L2: 2, L3: 3, L4: 4 };
  return o[lv] >= o[min];
}

/**
 * @param {object} annual - output of buildCrystalAnnualOperatingReviewPack
 * @param {object} [snapshot]
 */
function extractEvidence(annual, snapshot) {
  const s = snapshot || {};
  const k = annual?.annualKpis || s.annualKpis || {};
  const op = annual?.annualKpiPack?.operatingImpactSignals || [];

  const quarterlyStatuses = annual?.quarterlyStatusDistribution
    ? Object.keys(annual.quarterlyStatusDistribution).flatMap((st) =>
        Array(annual.quarterlyStatusDistribution[st] || 0)
          .fill(0)
          .map(() => st),
      )
    : s.quarterlyStatuses || [];

  const halfYearStatuses = annual?.halfYearStatusDistribution
    ? Object.keys(annual.halfYearStatusDistribution).flatMap((st) =>
        Array(annual.halfYearStatusDistribution[st] || 0)
          .fill(0)
          .map(() => st),
      )
    : s.halfYearStatuses || [];

  const anomalyCodes = (annual?.topRecurringAnomalies || s.topRecurringAnomalyCodes || []).map((x) =>
    typeof x === "string" ? x : x.anomalyCode,
  );

  const mismatchTypes = (annual?.topRecurringMismatchTypes || s.topRecurringMismatchTypes || []).map((x) =>
    typeof x === "string" ? x : x.mismatchType,
  );

  const totalCases = num(k.totalCrystalCases, s.totalCrystalCases);
  const notApp = num(k.notApplicableRowCountAnnual, s.notApplicableRowCountAnnual);
  const thaiHeavy = totalCases > 0 && notApp > totalCases * 3;

  return {
    annualStatus: annual?.annualStatus ?? s.annualStatus ?? "healthy",
    annualScoreBand: annual?.annualScoreBand ?? s.annualScoreBand ?? "good",
    overallScore: num(annual?.overallAnnualQualityScore, s.overallAnnualQualityScore ?? 70),
    alignedRate: num(k.alignedRate, s.alignedRate ?? 0.85),
    hardMismatchRate: num(k.hardMismatchRate, s.hardMismatchRate ?? 0.02),
    softMismatchRate: num(k.softMismatchRate, s.softMismatchRate ?? 0.04),
    genericFallbackRate: num(k.genericFallbackRate, s.genericFallbackRate ?? 0.08),
    crystalSpecificSurfaceRate: num(k.crystalSpecificSurfaceRate, s.crystalSpecificSurfaceRate ?? 0.82),
    weakProtectRate: num(k.weakProtectDefaultRate, s.weakProtectDefaultRate ?? 0.1),
    hardClusterMax: num(k.hardMismatchClusterCountMax, s.hardMismatchClusterCountMax ?? 0),
    recurringAnomalySum: num(k.recurringAnomalyCountAnnual, s.recurringAnomalyCountAnnual ?? 0),
    anomalyCodes,
    mismatchTypes,
    quarterlyStatuses,
    halfYearStatuses,
    usageDropMonths: num(annual?.usageDropMonths, s.usageDropMonths ?? 0),
    multiPeriodFallbackHeavy: annual?.multiPeriodFallbackHeavy ?? s.multiPeriodFallbackHeavy ?? false,
    releaseSignalsCount: (annual?.releaseSignalsInput || s.releaseSignals || []).length,
    roadmapSignals: Array.isArray(s.roadmapSignals) ? s.roadmapSignals : [],
    hasAnnualPack: !!annual && Object.keys(annual).length > 0,
    operatingImpactSignalCount: op.length,
    thaiHeavyExport: thaiHeavy,
    watchEscalateHalfYears: num(annual?.watchEscalateHalfYearPattern, s.watchEscalateHalfYearPattern ?? 0),
  };
}

/**
 * @param {ReturnType<typeof extractEvidence>} ev
 */
function scoreRoutingDomain(ev) {
  let sc = 2;
  if (num(ev.hardMismatchRate) < 0.025 && ev.hardClusterMax === 0) sc = 4;
  else if (num(ev.hardMismatchRate) < 0.04 && ev.hardClusterMax <= 1) sc = 3;
  else if (num(ev.hardMismatchRate) >= 0.08 || ev.hardClusterMax >= 3) sc = 1;
  else if (ev.anomalyCodes.some((c) => /hard_mismatch|cluster/i.test(c))) sc = Math.min(sc, 2);
  if (ev.annualStatus === "escalate") sc = Math.min(sc, 2);
  return clampLevel(sc);
}

function scoreWordingDomain(ev) {
  let sc = 3;
  if (num(ev.crystalSpecificSurfaceRate) >= 0.88 && num(ev.softMismatchRate) < 0.05) sc = 4;
  else if (num(ev.crystalSpecificSurfaceRate) < 0.65 || num(ev.softMismatchRate) > 0.1) sc = 2;
  if (ev.usageDropMonths >= 4) sc = Math.min(sc, 2);
  return clampLevel(sc);
}

function scoreDbDomain(ev) {
  let sc = 3;
  if (num(ev.genericFallbackRate) < 0.08) sc = 4;
  else if (num(ev.genericFallbackRate) >= 0.14) sc = 2;
  else if (num(ev.genericFallbackRate) >= 0.18) sc = 1;
  if (ev.mismatchTypes.includes("generic_fallback_elevated")) sc = Math.min(sc, 2);
  return clampLevel(sc);
}

function scoreTelemetryDomain(ev) {
  let sc = 2;
  if (ev.hasAnnualPack && ev.operatingImpactSignalCount >= 4) sc = 3;
  if (ev.hasAnnualPack && ev.releaseSignalsCount > 0) sc = Math.max(sc, 3);
  if (ev.recurringAnomalySum > 0 && ev.hasAnnualPack) sc = Math.max(sc, 3);
  if (!ev.hasAnnualPack) sc = 1;
  return clampLevel(sc);
}

function scoreReviewOpsDomain(ev) {
  const hs = ev.halfYearStatuses;
  const qs = ev.quarterlyStatuses;
  const all = [...hs, ...qs];
  let sc = 3;
  if (all.filter((x) => x === "healthy").length >= all.length * 0.7 && all.length >= 4) sc = 4;
  if (all.filter((x) => x === "escalate" || x === "investigate").length >= 3) sc = 2;
  if (ev.watchEscalateHalfYears >= 2) sc = Math.min(sc, 2);
  if (all.length === 0) sc = 2;
  return clampLevel(sc);
}

function scoreReleaseDomain(ev) {
  let sc = 2;
  if (ev.releaseSignalsCount > 0) sc = 3;
  if (ev.releaseSignalsCount > 0 && ev.anomalyCodes.length > 0) sc = 4;
  if (ev.annualStatus === "escalate" && ev.anomalyCodes.length > 2) sc = Math.min(sc, 2);
  return clampLevel(sc);
}

function domainRow(id, title, level, summary, evidence, strengths, gaps, nextStep) {
  return {
    domainId: id,
    domainTitle: title,
    maturityLevel: level,
    maturityLabel: LEVEL_TO_BAND[level],
    summary,
    evidence,
    keyStrengths: strengths,
    keyGaps: gaps,
    recommendedNextStep: nextStep,
  };
}

/**
 * @param {ReturnType<typeof extractEvidence>} ev
 */
function buildDomainAssessments(ev) {
  const r = scoreRoutingDomain(ev);
  const w = scoreWordingDomain(ev);
  const d = scoreDbDomain(ev);
  const t = scoreTelemetryDomain(ev);
  const o = scoreReviewOpsDomain(ev);
  const rel = scoreReleaseDomain(ev);

  return [
    domainRow(
      "routing_stability",
      "Routing stability",
      r,
      `Template view: hard mismatch ${(num(ev.hardMismatchRate) * 100).toFixed(1)}%, cluster max ${ev.hardClusterMax}.`,
      "Derived from annual KPI blend and recurring anomaly codes in input.",
      atLeast(r, "L3") ? ["Hard mismatch contained in submitted window."] : [],
      !atLeast(r, "L3") ? ["Elevated mismatch or cluster signals in evidence."] : [],
      !atLeast(r, "L3")
        ? "Harden routing observability and triage hard-mismatch clusters before broad rule changes."
        : "Maintain routing regression fixtures and weekly drift exports.",
    ),
    domainRow(
      "wording_quality",
      "Wording quality (crystal-first)",
      w,
      `Crystal-specific surface ~${(num(ev.crystalSpecificSurfaceRate) * 100).toFixed(1)}%; soft mismatch ~${(num(ev.softMismatchRate) * 100).toFixed(1)}%.`,
      "From annual blended rates and usage-drop month count.",
      atLeast(w, "L3") ? ["Surface rate supports crystal-first positioning in aggregate."] : [],
      !atLeast(w, "L3") ? ["Surface or soft-mismatch pressure in submitted evidence."] : [],
      !atLeast(w, "L3")
        ? "Invest in category/template coverage and weak-protect boundary reviews."
        : "Keep monthly wording diagnostics in cadence.",
    ),
    domainRow(
      "db_coverage",
      "DB / template coverage",
      d,
      `Generic fallback blend ~${(num(ev.genericFallbackRate) * 100).toFixed(1)}%.`,
      "Annual generic fallback rate and generic_fallback_elevated pattern flag.",
      atLeast(d, "L3") ? ["Fallback share moderate or low in aggregate."] : [],
      !atLeast(d, "L3") ? ["Generic fallback concentration suggests coverage gaps."] : [],
      !atLeast(d, "L3")
        ? "Prioritize crystal row hydration and code-bank gap closure."
        : "Continue incremental DB coverage checks with rollouts.",
    ),
    domainRow(
      "telemetry_observability",
      "Telemetry & observability",
      t,
      ev.hasAnnualPack
        ? "Annual pack and operating impact signals present — export path in use."
        : "Limited structured export evidence in input.",
      "Presence of annual operating pack and signal row count.",
      atLeast(t, "L3") ? ["Structured annual aggregate available for review."] : [],
      !atLeast(t, "L3") ? ["Thin export history or few operating signals in input."] : [],
      !atLeast(t, "L3")
        ? "Expand weekly/monthly export discipline and dashboard coverage."
        : "Preserve telemetry contract tests and digest linkage.",
    ),
    domainRow(
      "review_ops_discipline",
      "Review ops discipline",
      o,
      "Quarterly and half-year status mix from submitted pack.",
      "Distributions embedded in annual operating review input.",
      atLeast(o, "L3") ? ["Review periods mostly healthy in aggregate."] : [],
      !atLeast(o, "L3") ? ["Repeated watch/investigate across periods."] : [],
      !atLeast(o, "L3")
        ? "Lock quarterly review cadence and anomaly triage owners."
        : "Keep half-year/annual operating reviews on calendar.",
    ),
    domainRow(
      "release_change_safety",
      "Release & change safety",
      rel,
      ev.releaseSignalsCount
        ? "Release metadata attached to input — supports drift-to-deploy discussion."
        : "No releaseSignals in input — linkage is manual/external.",
      "releaseSignals count vs recurring anomaly codes.",
      atLeast(rel, "L3") ? ["Some release context or stable change window in evidence."] : [],
      !atLeast(rel, "L3") ? ["Limited release linkage to metrics in-tool."] : [],
      !atLeast(rel, "L3")
        ? "Attach deploy calendars to annual exports and map to recurring codes."
        : "Keep post-deploy review playbook tied to scorecard deltas.",
    ),
  ];
}

function avgDomainLevel(domains) {
  const map = { L1: 1, L2: 2, L3: 3, L4: 4 };
  const s = domains.reduce((a, d) => a + map[d.maturityLevel], 0);
  return clampLevel(Math.round(s / domains.length));
}

function overallBandFromLevel(level) {
  return LEVEL_TO_BAND[level];
}

/**
 * @param {ReturnType<typeof buildDomainAssessments>} domains
 * @param {ReturnType<typeof extractEvidence>} ev
 */
function buildRoadmapItems(domains, ev) {
  /** @type {Record<string, Array<Record<string, unknown>>>} */
  const buckets = {
    maintain_now: [],
    stabilize_next: [],
    invest_next_quarter: [],
    defer_for_now: [],
  };

  let id = 0;
  function item(bucket, title, cat, pri, horizon, why, evid, out, dep, conf) {
    const rid = `rm_${bucket.slice(0, 2)}_${String(++id).padStart(3, "0")}`;
    buckets[bucket].push({
      roadmapItemId: rid,
      title,
      category: cat,
      priority: pri,
      timeHorizon: horizon,
      whyNow: why,
      evidence: evid,
      expectedOutcome: out,
      dependencyHints: dep,
      confidenceLevel: conf,
    });
  }

  const lv = (id) => domains.find((d) => d.domainId === id)?.maturityLevel;
  const belowL3 = (id) => {
    const x = lv(id);
    return !x || !atLeast(/** @type {MaturityLevel} */ (x), "L3");
  };
  const lowRouting = belowL3("routing_stability");
  const lowDb = belowL3("db_coverage");
  const lowWording = belowL3("wording_quality");
  const lowTel = belowL3("telemetry_observability");
  const lowOps = belowL3("review_ops_discipline");
  const lowRel = belowL3("release_change_safety");

  if (!lowRouting && !lowDb && ev.annualStatus === "healthy") {
    item(
      "maintain_now",
      "Keep weekly drift and monthly scorecard cadence",
      "ops",
      "P2",
      "now",
      "No dominant gap in routing/DB in submitted evidence.",
      "annualStatus healthy; domain levels mostly L3+.",
      "Continued visibility without regression.",
      "Existing review owners",
      "medium",
    );
  }

  if (lowTel) {
    item(
      "stabilize_next",
      "Standardize exports for weekly/monthly/annual generators",
      "telemetry",
      "P2",
      "next_quarter",
      "Telemetry/observability domain below L3.",
      "Fewer structured signals in annual KPI pack.",
      "Predictable review artifacts each period.",
      "CI for pack scripts optional",
      "medium",
    );
  }

  if (lowDb || ev.mismatchTypes.includes("generic_fallback_elevated")) {
    item(
      "invest_next_quarter",
      "Close generic fallback gaps in crystal templates",
      "db",
      "P1",
      "next_quarter",
      "DB coverage domain fragile or generic_fallback_elevated pattern.",
      `genericFallbackRate ~${(num(ev.genericFallbackRate) * 100).toFixed(1)}%`,
      "Lower fallback share on next measurement window.",
      "Content + schema owners",
      "medium",
    );
  }

  if (lowRouting || ev.annualStatus === "escalate") {
    item(
      "invest_next_quarter",
      "Routing hardening for mismatch clusters",
      "routing",
      "P1",
      "next_quarter",
      "Routing domain L2 or annual escalate.",
      "hardMismatchRate or cluster max in evidence.",
      "Reduced hard mismatch recurrence in digests.",
      "Routing + wording joint triage",
      "medium",
    );
  }

  if (lowWording) {
    item(
      "stabilize_next",
      "Crystal-first surface and weak-protect boundary review",
      "wording",
      "P2",
      "next_quarter",
      "Wording quality domain below L3 or usage-drop months.",
      "crystalSpecificSurfaceRate / soft mismatch in evidence.",
      "Stabilized surface rate month-over-month.",
      "Rule-map fixtures",
      "medium",
    );
  }

  if (lowOps) {
    item(
      "stabilize_next",
      "Quarterly ops review ritual with anomaly owners",
      "ops",
      "P2",
      "next_quarter",
      "Review ops discipline below L3.",
      "Quarterly/half-year status mix.",
      "Faster triage on recurring codes.",
      "Ops calendar",
      "low",
    );
  }

  if (lowRel) {
    item(
      "invest_next_quarter",
      "Attach releaseSignals to annual export JSON",
      "release",
      "P3",
      "next_quarter",
      "Release domain below L3 — limited in-tool deploy context.",
      "releaseSignals empty in input.",
      "Defensible release-to-drift narrative next cycle.",
      "Eng release notes",
      "low",
    );
  }

  if (ev.thaiHeavyExport && !lowDb) {
    item(
      "defer_for_now",
      "Label executive dashboards as crystal-slice when Thai volume dominates",
      "telemetry",
      "P3",
      "later",
      "Non-crystal row count high vs crystal cases — informational.",
      "notApplicableRowCount vs totalCrystalCases ratio.",
      "Avoid misinterpretation in leadership decks.",
      "Data export filters",
      "high",
    );
  }

  if (buckets.invest_next_quarter.length === 0 && buckets.stabilize_next.length === 0) {
    item(
      "defer_for_now",
      "Defer large routing refactors while metrics hold",
      "routing",
      "P3",
      "later",
      "Domains stable in submitted window.",
      "annual band good or excellent.",
      "Capacity reserved for product bets.",
      "Roadmap planning only",
      "low",
    );
  }

  return buckets;
}

function pad3(a, filler) {
  const out = [...a];
  while (out.length < 3) out.push(filler);
  return out.slice(0, 3);
}

/**
 * @param {object} pack
 */
export function buildCrystalCapabilityMaturityAssessment(pack) {
  return {
    overallMaturityLevel: pack.overallMaturityLevel,
    overallMaturityBand: pack.overallMaturityBand,
    domainAssessments: pack.domainAssessments,
    methodNote: pack.methodNote,
  };
}

/**
 * @param {object} pack
 */
export function buildCrystalOperatingRoadmap(pack) {
  return pack.operatingRoadmap;
}

/**
 * @param {object} input
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalCapabilityMaturityRoadmapPack(input, options = {}) {
  const raw = input || {};
  const generatedAt =
    raw.generatedAt != null ? String(raw.generatedAt) : options.generatedAt != null
      ? String(options.generatedAt)
      : new Date().toISOString();

  let annual = raw.annualOperatingReviewPack;
  if (
    (!annual || typeof annual !== "object") &&
    (Array.isArray(raw.halfYears) || Array.isArray(raw.months))
  ) {
    annual = buildCrystalAnnualOperatingReviewPack(
      {
        yearWindowStart: raw.yearWindowStart,
        yearWindowEnd: raw.yearWindowEnd,
        halfYears: raw.halfYears,
        months: raw.months,
        generatedAt,
        releaseSignals: raw.releaseSignals,
      },
      { generatedAt },
    );
  }

  const evidenceSnapshot = raw.evidenceSnapshot || {};
  const ev = extractEvidence(annual || {}, evidenceSnapshot);

  const domainAssessments = buildDomainAssessments(ev);
  const overallMaturityLevel = avgDomainLevel(domainAssessments);
  const overallMaturityBand = overallBandFromLevel(overallMaturityLevel);

  const operatingRoadmap = buildRoadmapItems(domainAssessments, ev);

  const strengths = [];
  const gaps = [];
  for (const d of domainAssessments) {
    strengths.push(...d.keyStrengths.map((x) => `${d.domainId}: ${x}`));
    gaps.push(...d.keyGaps.map((x) => `${d.domainId}: ${x}`));
  }
  if (strengths.length === 0) strengths.push("Submitted annual or evidence snapshot enables this template assessment.");

  const evidenceBackedRisks = [];
  if (num(ev.hardMismatchRate) >= 0.05) evidenceBackedRisks.push(`Hard mismatch rate elevated (~${(num(ev.hardMismatchRate) * 100).toFixed(1)}%) in evidence.`);
  if (num(ev.genericFallbackRate) >= 0.12) evidenceBackedRisks.push(`Generic fallback elevated (~${(num(ev.genericFallbackRate) * 100).toFixed(1)}%).`);
  if (ev.annualStatus === "escalate") evidenceBackedRisks.push("Annual ops status is escalate in submitted pack.");
  if (evidenceBackedRisks.length === 0) evidenceBackedRisks.push("No extreme single-metric risk line beyond digest review.");

  const roadmapPriorities = [
    ...operatingRoadmap.invest_next_quarter.map((x) => ({ ...x, bucket: "invest_next_quarter" })),
    ...operatingRoadmap.stabilize_next.map((x) => ({ ...x, bucket: "stabilize_next" })),
    ...operatingRoadmap.maintain_now.map((x) => ({ ...x, bucket: "maintain_now" })),
  ].slice(0, 12);

  const quickWins = operatingRoadmap.maintain_now.map((x) => x.title).concat(
    operatingRoadmap.stabilize_next.filter((x) => x.priority === "P2").map((x) => x.title),
  );
  const foundationInvestments = operatingRoadmap.invest_next_quarter
    .filter((x) => x.category === "db" || x.category === "wording")
    .map((x) => x.title);
  const scaleUpInvestments = operatingRoadmap.invest_next_quarter
    .filter((x) => x.category === "telemetry" || x.category === "release")
    .map((x) => x.title);

  const packSkeleton = {
    reviewPackVersion: MATURITY_REVIEW_PACK_VERSION,
    assessmentWindowStart: String(raw.assessmentWindowStart || raw.yearWindowStart || "").trim(),
    assessmentWindowEnd: String(raw.assessmentWindowEnd || raw.yearWindowEnd || "").trim(),
    generatedAt,
    overallMaturityLevel,
    overallMaturityBand,
    domainAssessments,
    strengths: strengths.slice(0, 20),
    gaps: gaps.slice(0, 20),
    evidenceBackedRisks,
    operatingRoadmap,
    roadmapPriorities,
    quickWins: quickWins.slice(0, 8),
    foundationInvestments: foundationInvestments.slice(0, 8),
    scaleUpInvestments: scaleUpInvestments.slice(0, 8),
    executiveSummary: {},
    operatingSummary: {},
    roadmapSummary: {},
    recommendations: [],
    evidenceSourceNote: annual
      ? "Built from embedded or generated annual operating review pack."
      : "Built from evidenceSnapshot only — prefer passing annualOperatingReviewPack for richer domains.",
    multiYearHistoryPackReference: raw.multiYearHistoryPack ?? null,
    methodNote:
      "Template capability maturity assessment for planning only — not a formal certification. Pair with digests and playbooks.",
  };

  packSkeleton.executiveSummary = buildExecSummary(packSkeleton, ev);
  packSkeleton.operatingSummary = buildOperatingSummary(packSkeleton, ev);
  packSkeleton.roadmapSummary = buildRoadmapSummaryLayer(packSkeleton, ev);
  packSkeleton.recommendations = buildRecommendations(packSkeleton);

  return packSkeleton;
}

function buildExecSummary(pack, ev) {
  return {
    executiveSummaryHeadline: `Crystal quality capability sits at **${pack.overallMaturityLevel} (${pack.overallMaturityBand})** for the assessment window — template view from submitted evidence.`,
    executiveSummaryBody: [
      `Overall maturity averages six domains; annual ops status **${ev.annualStatus}**, score band **${ev.annualScoreBand}**.`,
      `Evidence is limited to JSON inputs — no live production queries.`,
    ].join(" "),
    top3Strengths: pad3(
      pack.strengths.slice(0, 5),
      "Continue existing review cadence while evidence stays stable.",
    ),
    top3Risks: pad3(pack.evidenceBackedRisks, "Monitor digests for codes not present in this aggregate."),
    top3RecommendedMoves: pad3(
      pack.roadmapPriorities.slice(0, 3).map((x) => x.title),
      "Re-run pack after next annual export with releaseSignals attached.",
    ),
    methodNote: "Executive lines summarize domain table and roadmap — not independent research.",
  };
}

function buildOperatingSummary(pack, ev) {
  return {
    operatingSummaryHeadline: `Operating view: prioritize **${pack.operatingRoadmap.invest_next_quarter.length ? "invest_next_quarter" : "stabilize_next"}** bucket items first where P1 exists.`,
    operatingSummaryBody: [
      `Domains below L3: ${pack.domainAssessments.filter((d) => d.maturityLevel <= "L2").map((d) => d.domainId).join(", ") || "none flagged as L1–L2"}.`,
      `Thai/non-crystal context: ${ev.thaiHeavyExport ? "high non-crystal volume — interpret KPIs as crystal slice." : "within normal ratio in evidence."}`,
    ].join(" "),
    topOperationalStrengths: pad3(pack.strengths, "Stable review artifacts in submitted window."),
    topOperationalGaps: pad3(pack.gaps, "No extra gap lines beyond domain table."),
    topOperationalNextActions: pad3(
      [...pack.operatingRoadmap.stabilize_next, ...pack.operatingRoadmap.invest_next_quarter].map((x) => x.title),
      "Maintain monthly scorecard discipline.",
    ),
    methodNote: "Operating summary ties to roadmap buckets — same evidence as maturity table.",
  };
}

function buildRoadmapSummaryLayer(pack, ev) {
  return {
    roadmapSummaryHeadline: "Roadmap: balance quick stabilization with foundation work tied to evidence.",
    roadmapSummaryBody: [
      `Quick wins skew toward **maintain_now** and light **stabilize_next** when status is ${ev.annualStatus}.`,
      `Foundation = DB/wording; scale-up = telemetry/release automation when signals justify.`,
    ].join(" "),
    top3QuickWins: pad3(pack.quickWins, "Document existing generator commands for ops handoff."),
    top3FoundationInvestments: pad3(pack.foundationInvestments, "Weak-protect and template coverage per playbook."),
    top3ScaleUpInvestments: pad3(pack.scaleUpInvestments, "Optional automation for review pack generation in CI."),
    methodNote: "Roadmap items are templated from domain gaps — validate effort with owners.",
  };
}

function buildRecommendations(pack) {
  const r = [];
  r.push("Use this pack in half-year roadmap review and annual operating planning.");
  if (["L1", "L2"].includes(pack.overallMaturityLevel)) {
    r.push("Treat L1–L2 domains as priority before large customer-facing experiments.");
  }
  r.push("Re-import annual operating review JSON each cycle rather than hand-copying KPIs.");
  return r;
}

/**
 * @param {object} pack
 */
export function renderCrystalCapabilityMaturityRoadmapPackMarkdown(pack) {
  const w = (s) => (s == null ? "" : String(s));
  const ex = pack.executiveSummary || {};
  const op = pack.operatingSummary || {};
  const rm = pack.roadmapSummary || {};

  const lines = [];
  lines.push("# Crystal capability maturity + operating roadmap pack");
  lines.push("");
  lines.push("## A. Header");
  lines.push("");
  lines.push(`- **Assessment window:** ${w(pack.assessmentWindowStart)} → ${w(pack.assessmentWindowEnd)}`);
  lines.push(`- **Generated at:** ${w(pack.generatedAt)}`);
  lines.push(`- **Overall maturity level:** \`${w(pack.overallMaturityLevel)}\``);
  lines.push(`- **Overall maturity band:** \`${w(pack.overallMaturityBand)}\``);
  lines.push("");
  lines.push(`> ${w(pack.methodNote)}`);
  lines.push("");

  lines.push("## B. Executive summary");
  lines.push("");
  lines.push(w(ex.executiveSummaryHeadline));
  lines.push("");
  lines.push(w(ex.executiveSummaryBody));
  lines.push("");
  lines.push(`> ${w(ex.methodNote)}`);
  lines.push("");
  lines.push("### Top 3 strengths");
  for (const t of ex.top3Strengths || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("### Top 3 risks");
  for (const t of ex.top3Risks || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("### Top 3 recommended moves");
  for (const t of ex.top3RecommendedMoves || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("### Operating summary");
  lines.push(w(op.operatingSummaryHeadline));
  lines.push("");
  lines.push(w(op.operatingSummaryBody));
  lines.push("");
  for (const t of op.topOperationalStrengths || []) lines.push(`- **Ops strength:** ${t}`);
  for (const t of op.topOperationalGaps || []) lines.push(`- **Ops gap:** ${t}`);
  for (const t of op.topOperationalNextActions || []) lines.push(`- **Ops next:** ${t}`);
  lines.push("");
  lines.push(`> ${w(op.methodNote)}`);
  lines.push("");
  lines.push("### Roadmap summary");
  lines.push(w(rm.roadmapSummaryHeadline));
  lines.push("");
  lines.push(w(rm.roadmapSummaryBody));
  lines.push("");
  lines.push("#### Top 3 quick wins");
  for (const t of rm.top3QuickWins || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("#### Top 3 foundation investments");
  for (const t of rm.top3FoundationInvestments || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push("#### Top 3 scale-up investments");
  for (const t of rm.top3ScaleUpInvestments || []) lines.push(`- ${t}`);
  lines.push("");
  lines.push(`> ${w(rm.methodNote)}`);
  lines.push("");

  lines.push("## C. Capability maturity overview");
  lines.push("");
  lines.push(`Overall: **${w(pack.overallMaturityLevel)}** — *${w(pack.overallMaturityBand)}*.`);
  lines.push("");
  lines.push("| Domain | Level | Band | Summary |");
  lines.push("|--------|-------|------|---------|");
  for (const d of pack.domainAssessments || []) {
    lines.push(`| ${d.domainTitle} | ${d.maturityLevel} | ${d.maturityLabel} | ${d.summary} |`);
  }
  lines.push("");
  lines.push("### Key strengths");
  for (const s of pack.strengths || []) lines.push(`- ${s}`);
  lines.push("");
  lines.push("### Key gaps");
  for (const s of pack.gaps || []) lines.push(`- ${s}`);
  lines.push("");

  lines.push("## D. Domain assessments");
  lines.push("");
  for (const d of pack.domainAssessments || []) {
    lines.push(`### ${d.domainTitle} (\`${d.domainId}\`)`);
    lines.push("");
    lines.push(`- **Maturity:** ${d.maturityLevel} (${d.maturityLabel})`);
    lines.push(`- **Evidence:** ${d.evidence}`);
    lines.push("- **Strengths:**");
    for (const s of d.keyStrengths) lines.push(`  - ${s}`);
    lines.push("- **Gaps:**");
    for (const s of d.keyGaps) lines.push(`  - ${s}`);
    lines.push(`- **Next step:** ${d.recommendedNextStep}`);
    lines.push("");
  }

  lines.push("## E. Operating roadmap (buckets)");
  lines.push("");
  function renderBucket(title, key) {
    lines.push(`### ${title}`);
    lines.push("");
    for (const it of pack.operatingRoadmap?.[key] || []) {
      lines.push(`- **${it.title}** (\`${it.roadmapItemId}\`) — ${it.category}, ${it.priority}, ${it.timeHorizon}`);
      lines.push(`  - Why now: ${it.whyNow}`);
      lines.push(`  - Evidence: ${it.evidence}`);
    }
    lines.push("");
  }
  renderBucket("Maintain now", "maintain_now");
  renderBucket("Stabilize next", "stabilize_next");
  renderBucket("Invest next quarter", "invest_next_quarter");
  renderBucket("Defer for now", "defer_for_now");

  lines.push("## F. Operating risk calls");
  lines.push("");
  lines.push("### What to monitor");
  lines.push("- Recurring anomaly codes and quarterly status mix.");
  lines.push("");
  lines.push("### What to investigate");
  lines.push("- Domains at L2 or below and generic_fallback_elevated pattern.");
  lines.push("");
  lines.push("### What to escalate");
  lines.push("- Annual escalate with hard mismatch cluster narrative in digests.");
  lines.push("");
  lines.push("### What can wait");
  lines.push("- Cosmetic copy when maturity L3+ and bands stable.");
  lines.push("");

  lines.push("## G. Recommended strategic focus");
  lines.push("");
  for (const r of pack.recommendations || []) lines.push(`- ${r}`);
  lines.push("");

  lines.push("## H. Appendix");
  lines.push("");
  lines.push("### Evidence-backed risks");
  for (const r of pack.evidenceBackedRisks || []) lines.push(`- ${r}`);
  lines.push("");
  lines.push(`### Evidence source`);
  lines.push(w(pack.evidenceSourceNote));
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify({ overallMaturityLevel: pack.overallMaturityLevel, roadmapPriorities: pack.roadmapPriorities }, null, 2));
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
