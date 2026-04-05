/**
 * Crystal quality operating system pack — unified review stack (offline).
 * **Maps** existing annual + capability packs; does not replace them.
 * See `docs/ops/crystal-operating-system-pack.md`.
 *
 * @module crystalOperatingSystemPack.util
 */

import { ANNUAL_REVIEW_PACK_VERSION, buildCrystalAnnualOperatingReviewPack } from "./crystalAnnualOperatingReviewPack.util.js";
import {
  MATURITY_REVIEW_PACK_VERSION,
  buildCrystalCapabilityMaturityRoadmapPack,
} from "./crystalCapabilityMaturityRoadmapPack.util.js";

export const OS_REVIEW_PACK_VERSION = "1";

/** @typedef {"missing"|"partial"|"working"|"strong"} ControlStatus */

function str(x, def = "") {
  if (x == null) return def;
  return String(x).trim();
}

function num(x, def = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} options
 */
function resolveAnnualPack(inputs, options) {
  const generatedAt = options.generatedAt ?? inputs.generatedAt;
  if (inputs.annualOperatingReviewPack && typeof inputs.annualOperatingReviewPack === "object") {
    return inputs.annualOperatingReviewPack;
  }
  if (Array.isArray(inputs.halfYears) || Array.isArray(inputs.months)) {
    return buildCrystalAnnualOperatingReviewPack(
      {
        yearWindowStart: inputs.yearWindowStart,
        yearWindowEnd: inputs.yearWindowEnd,
        halfYears: inputs.halfYears,
        months: inputs.months,
        generatedAt,
        releaseSignals: inputs.releaseSignals,
      },
      { generatedAt },
    );
  }
  return null;
}

/**
 * Reuses {@link buildCrystalCapabilityMaturityRoadmapPack} — no duplicate maturity logic.
 *
 * @param {object} inputs
 * @param {object|null} annual
 * @param {{ generatedAt?: string }} options
 */
function resolveCapabilityPack(inputs, annual, options) {
  const generatedAt = options.generatedAt ?? inputs.generatedAt;
  if (inputs.capabilityMaturityRoadmapPack && typeof inputs.capabilityMaturityRoadmapPack === "object") {
    return inputs.capabilityMaturityRoadmapPack;
  }
  return buildCrystalCapabilityMaturityRoadmapPack(
    {
      assessmentWindowStart: inputs.assessmentWindowStart,
      assessmentWindowEnd: inputs.assessmentWindowEnd,
      yearWindowStart: inputs.yearWindowStart ?? annual?.yearWindowStart,
      yearWindowEnd: inputs.yearWindowEnd ?? annual?.yearWindowEnd,
      halfYears: inputs.halfYears,
      months: inputs.months,
      generatedAt,
      annualOperatingReviewPack: annual ?? undefined,
      evidenceSnapshot: inputs.evidenceSnapshot,
      multiYearHistoryPack: inputs.multiYearHistoryPack ?? inputs.multiYearHistoryPackReference,
      releaseSignals: inputs.releaseSignals,
    },
    { generatedAt },
  );
}

/**
 * @param {object|null} annual
 * @param {object} capability
 * @param {object} inputs
 */
function buildLayers(annual, capability, inputs) {
  const hasAnnual = !!(annual && Object.keys(annual).length);
  const hasCap = !!(capability && Object.keys(capability).length);
  const rel = (annual?.releaseSignalsInput || []).length;
  const capNote = str(capability?.evidenceSourceNote);
  const annualKpis = annual?.annualKpis;
  const mismatchCount = (annual?.topRecurringMismatchTypes || []).length;
  const anomalyCount = (annual?.topRecurringAnomalies || []).length;

  const optWeekly = inputs.weeklyReviewSummaryRefs;
  const optMonthly = inputs.monthlyScorecardSummaryRefs;
  const optQuarterly = inputs.quarterlyReviewSummaryRefs;
  const optMulti = inputs.multiYearHistoryPackReference ?? inputs.multiYearHistoryPack;

  const optionalHistoricalNote =
    optMulti != null
      ? "Optional multi-year reference present in input."
      : "No multi-year history pack in repo util yet — pass `multiYearHistoryPackReference` for narrative only.";

  return [
    {
      layerId: "telemetry_layer",
      layerTitle: "Telemetry layer (report payload)",
      role: "Emits routing / wording / scan signals consumed by dashboards and offline packs.",
      primaryInputs: ["Scan + report pipeline", "Crystal routing telemetry contract (`docs/crystal-routing-telemetry-mapping.md`)"],
      primaryOutputs: ["Aggregated KPI fields in monthly scorecard inputs", "Dashboard-oriented summaries"],
      primaryQuestionsAnswered: [
        "What did we route and surface this period?",
        "What volume and mix of crystal vs non-crystal traffic appeared?",
      ],
      consumers: ["Monthly scorecard generator", "Quarterly / annual review packs", "Ops digests"],
      currentStatus: hasAnnual && annualKpis
        ? `Annual pack carries KPI rollups (e.g. aligned rate ${num(annualKpis.alignedRate).toFixed(2)}).`
        : "No annual KPI bridge in this export — telemetry continuity not demonstrated in-pack.",
      knownGaps: [
        "This pack does not query production — only JSON you pass in.",
        "End-to-end lineage from raw event to annual row is not proven here.",
      ],
    },
    {
      layerId: "diagnostics_layer",
      layerTitle: "Visible wording diagnostics",
      role: "Explains wording priority and visible copy choices for crystal surfaces.",
      primaryInputs: ["Visible wording selection rules", "Copy layer inventories"],
      primaryOutputs: ["Diagnostics summaries in utils/tests", "Playbook references"],
      primaryQuestionsAnswered: ["Why was this copy chosen?", "Where might wording drift appear?"],
      consumers: ["Mismatch metrics layer", "Review playbooks"],
      currentStatus:
        "Code + tests exist (`visibleWording*` / flex surfaces); this OS pack references docs only unless annual encodes wording KPIs.",
      knownGaps: ["Automated wording QA is not fully represented in a single JSON artifact without monthly inputs."],
    },
    {
      layerId: "mismatch_metrics_layer",
      layerTitle: "Routing vs visible wording mismatch metrics",
      role: "Classifies alignment and mismatch taxonomies for crystal quality.",
      primaryInputs: ["`docs/crystal-routing-wording-mismatch-metrics.md`", "Report payload wording metrics"],
      primaryOutputs: ["Mismatch-type rollups in monthly → annual"],
      primaryQuestionsAnswered: ["What mismatch classes recur?", "Are hard vs soft mismatches bounded?"],
      consumers: ["Annual operating review", "Capability maturity pack"],
      currentStatus: hasAnnual
        ? `Annual lists ${mismatchCount} recurring mismatch type rows and ${anomalyCount} anomaly groupings (submitted window).`
        : "Mismatch metrics not anchored to an annual export in this run.",
      knownGaps: ["Taxonomy semantics are defined in product docs — this pack does not alter them."],
    },
    {
      layerId: "release_review_docs_layer",
      layerTitle: "Release / review documentation",
      role: "Human gate checklists and post-deploy review templates.",
      primaryInputs: ["`docs/ops/crystal-release-gate-checklist.md`", "`docs/ops/crystal-post-deploy-review.md`"],
      primaryOutputs: ["Checklist artifacts", "Manual review notes"],
      primaryQuestionsAnswered: ["Did release process cover crystal surfaces?", "What to verify after deploy?"],
      consumers: ["Release managers", "Annual `releaseSignalsInput` when provided"],
      currentStatus:
        rel > 0
          ? `Annual pack includes ${rel} release signal row(s) — linkage to cadence is explicit in JSON.`
          : "No `releaseSignals` in annual input — release-to-review linkage is documentation-only unless you attach signals.",
      knownGaps: ["Automated deploy-to-metric correlation is not in this offline pack."],
    },
    {
      layerId: "weekly_monthly_review_layer",
      layerTitle: "Weekly / monthly / quarterly review generators",
      role: "Rolling digest layers feeding half-year and annual aggregates.",
      primaryInputs: ["Monthly rollups", "Weekly review JSON", "Quarterly pack inputs"],
      primaryOutputs: ["`buildCrystalMonthlyScorecard`", "`buildCrystalQuarterlyReviewPack`", "Weekly review packs"],
      primaryQuestionsAnswered: ["How did this month trend?", "What escalations appeared before year-end?"],
      consumers: ["Half-year business review", "Annual operating review"],
      currentStatus:
        Array.isArray(optMonthly) || Array.isArray(optQuarterly) || Array.isArray(optWeekly)
          ? "Optional summary refs provided — treat as pointers to external files."
          : "No weekly/monthly/quarterly summary refs in input — continuity assumes repo generators were run elsewhere.",
      knownGaps: [
        "Stitching lower layers is manual unless you attach refs or embed packs in future versions.",
      ],
    },
    {
      layerId: "annual_operating_review_layer",
      layerTitle: "Annual operating review pack",
      role: "Year narrative, KPI pack, recurring anomalies, ops status.",
      primaryInputs: ["Two half-years or 12 months", "Optional `releaseSignals`"],
      primaryOutputs: ["`buildCrystalAnnualOperatingReviewPack` JSON", "Executive / operating summaries"],
      primaryQuestionsAnswered: ["Was the year healthy?", "What patterns recurred?"],
      consumers: ["Leadership readout", "Capability maturity pack (source)"],
      currentStatus: hasAnnual
        ? `Present (annual v${ANNUAL_REVIEW_PACK_VERSION}). Status: ${str(annual?.annualStatus)}; band: ${str(annual?.annualScoreBand)}.`
        : "Missing — provide `annualOperatingReviewPack` or `halfYears`/`months`.",
      knownGaps: hasAnnual ? [] : ["Without annual JSON, upper layers lack authoritative KPI anchors."],
    },
    {
      layerId: "capability_maturity_roadmap_layer",
      layerTitle: "Capability maturity / roadmap pack",
      role: "Domain maturity (L1–L4) and operating roadmap buckets from annual evidence.",
      primaryInputs: ["Annual operating review pack (preferred)", "Optional evidence snapshot"],
      primaryOutputs: ["`buildCrystalCapabilityMaturityRoadmapPack` JSON"],
      primaryQuestionsAnswered: ["Where are we fragile?", "What should we fund next?"],
      consumers: ["Operating planning", "This unified OS pack"],
      currentStatus: hasCap
        ? `Present (maturity v${MATURITY_REVIEW_PACK_VERSION}). Overall ${str(capability?.overallMaturityLevel)} (${str(capability?.overallMaturityBand)}). ${capNote}`
        : "Not available — capability builder returned empty.",
      knownGaps: [
        "Maturity is template/heuristic — not a certification.",
        hasAnnual ? "" : "Capability without full annual relies on snapshot heuristics.",
      ].filter(Boolean),
    },
    {
      layerId: "optional_historical_layers",
      layerTitle: "Optional historical / multi-year references",
      role: "Long-horizon context when a multi-year pack exists or is referenced.",
      primaryInputs: ["`multiYearHistoryPackReference` (optional passthrough)"],
      primaryOutputs: ["Narrative comparison — not generated here"],
      primaryQuestionsAnswered: ["How does this year compare to prior eras?"],
      consumers: ["Strategic reviews"],
      currentStatus: optionalHistoricalNote,
      knownGaps: ["No `buildCrystalMultiYearHistoryPack` in repo — reference-only."],
    },
  ];
}

/**
 * @param {object|null} annual
 * @param {object} capability
 * @param {object} inputs
 */
/** Matches {@link buildCrystalCapabilityMaturityRoadmapPack} `evidenceSourceNote` when annual was embedded. */
function capabilityReusesAnnualEmbedded(capability) {
  return str(capability?.evidenceSourceNote).includes(
    "Built from embedded or generated annual operating review pack",
  );
}

function buildControls(annual, capability, inputs) {
  const hasAnnual = !!(annual && Object.keys(annual).length);
  const hasCap = !!(capability && Object.keys(capability).length);
  const rel = (annual?.releaseSignalsInput || []).length;
  const capReuse = hasCap && capabilityReusesAnnualEmbedded(capability);
  const routing = capability?.domainAssessments?.find((d) => d.domainId === "routing_stability");
  const wording = capability?.domainAssessments?.find((d) => d.domainId === "wording_quality");
  const releaseDom = capability?.domainAssessments?.find((d) => d.domainId === "release_change_safety");

  /** @param {ControlStatus} st */
  function ctl(controlId, controlTitle, status, summary, evidence, gaps, nextUpgrade) {
    return { controlId, controlTitle, status, summary, evidence, gaps, nextUpgrade };
  }

  return [
    ctl(
      "telemetry_contract_control",
      "Telemetry contract control",
      hasAnnual && annual?.annualKpiPack ? "strong" : hasAnnual ? "working" : "partial",
      hasAnnual
        ? "Annual KPI pack embeds headline KPIs aligned with monthly rollup contract."
        : "Telemetry contract not evidenced without annual or monthly exports.",
      hasAnnual ? [`annualKpiPack present`, `annualKpis keys: ${Object.keys(annual?.annualKpis || {}).length} fields`] : ["No annual JSON in this run"],
      hasAnnual ? [] : ["Import monthly → annual pipeline output."],
      "Keep monthly scorecard inputs versioned with generator semver in ops notes.",
    ),
    ctl(
      "routing_traceability_control",
      "Routing traceability control",
      routing?.maturityLevel === "L4" || routing?.maturityLevel === "L3" ? "strong" : routing?.maturityLevel === "L2" ? "working" : "partial",
      "Capability domain `routing_stability` reflects submitted mismatch KPIs — not live trace logs.",
      [
        `Maturity: ${routing?.maturityLevel ?? "n/a"}`,
        `Hard mismatch rate in annual KPIs: ${hasAnnual ? num(annual?.annualKpis?.hardMismatchRate).toFixed(3) : "n/a"}`,
      ],
      [routing?.maturityLevel === "L1" || routing?.maturityLevel === "L2" ? "Elevated routing risk in template view." : "None flagged beyond template."],
      "Pair digest codes with owners when domain < L3.",
    ),
    ctl(
      "visible_wording_traceability_control",
      "Visible wording traceability control",
      wording?.maturityLevel === "L4" || wording?.maturityLevel === "L3" ? "strong" : "working",
      "Wording domain uses crystal-specific surface and soft mismatch rates from annual evidence.",
      [`Maturity: ${wording?.maturityLevel ?? "n/a"}`],
      [],
      "If soft mismatch spikes, cross-check copybank rows before routing changes.",
    ),
    ctl(
      "mismatch_detection_control",
      "Mismatch detection control",
      hasAnnual && (annual?.topRecurringMismatchTypes || []).length > 0 ? "working" : "partial",
      "Recurring mismatch types listed when annual includes them.",
      hasAnnual ? [(annual?.topRecurringMismatchTypes || []).map((x) => x.mismatchType || x).slice(0, 3).join(", ")] : [],
      hasAnnual ? [] : ["Run annual aggregation to populate mismatch recurrence."],
      "Keep mismatch taxonomy docs as source of truth — do not relabel in this pack.",
    ),
    ctl(
      "annual_review_control",
      "Annual review control",
      hasAnnual ? "strong" : "missing",
      hasAnnual ? "Annual operating review pack is the anchor for year quality narrative." : "Annual pack absent.",
      hasAnnual ? [`version ${ANNUAL_REVIEW_PACK_VERSION}`, `status ${annual?.annualStatus}`] : [],
      hasAnnual ? [] : ["Generate annual from half-years or 12 months."],
      "Attach releaseSignals when correlating deploys.",
    ),
    ctl(
      "capability_roadmap_control",
      "Capability roadmap control",
      hasCap && capReuse ? "strong" : hasCap ? "working" : "partial",
      hasCap
        ? capReuse
          ? "Capability pack explicitly consumes annual operating review evidence."
          : "Capability pack present but may be snapshot-only — check evidenceSourceNote."
        : "Capability pack missing.",
      hasCap ? [str(capability.evidenceSourceNote)] : [],
      hasCap && !capReuse ? ["Prefer embedding annualOperatingReviewPack for full domains."] : [],
      "Re-run capability generator after annual export refresh.",
    ),
    ctl(
      "release_review_linkage_control",
      "Release–review linkage control",
      rel > 0 && hasAnnual ? "working" : hasAnnual ? "partial" : "missing",
      rel > 0
        ? "Release signals included in annual input — linkage is explicit."
        : "Annual JSON has no releaseSignals — playbook linkage only.",
      [`releaseSignalsInput count: ${rel}`],
      rel === 0 && hasAnnual ? ["Weak link: add releaseSignals to annual JSON for cadence narrative."] : [],
      "Document deploy windows in `releaseSignals` for next annual import.",
    ),
    ctl(
      "evidence_continuity_control",
      "Evidence continuity control",
      hasAnnual && hasCap && capReuse ? "strong" : hasAnnual && hasCap ? "working" : "partial",
      "End-to-end story: telemetry → monthly → annual → capability — only partially provable from one JSON export.",
      [
        `annual: ${hasAnnual}`,
        `capability: ${hasCap}`,
        `capability reuses annual narrative: ${capReuse}`,
      ],
      [],
      "Store monthly/quarterly refs alongside annual for audit trail.",
    ),
  ];
}

/**
 * @param {object|null} annual
 * @param {object} capability
 * @param {object} inputs
 */
function assessEvidenceContinuity(annual, capability, inputs) {
  const hasAnnual = !!(annual && Object.keys(annual).length);
  const hasCap = !!(capability && Object.keys(capability).length);
  const capReuse = hasCap && capabilityReusesAnnualEmbedded(capability);
  const lowerRefs =
    inputs.weeklyReviewSummaryRefs ||
    inputs.monthlyScorecardSummaryRefs ||
    inputs.quarterlyReviewSummaryRefs;

  /** @type {"weak"|"partial"|"strong"} */
  let evidenceContinuityStatus = "weak";
  if (hasAnnual && hasCap && capReuse) evidenceContinuityStatus = "strong";
  else if (hasAnnual && hasCap) evidenceContinuityStatus = "partial";
  else if (hasCap && inputs.evidenceSnapshot) evidenceContinuityStatus = "partial";

  const breakpoints = [];
  if (!hasAnnual) breakpoints.push("No annual operating review JSON — KPI anchor missing or snapshot-only.");
  if (!hasCap) breakpoints.push("No capability pack — maturity/roadmap layer absent.");
  if (hasCap && !capReuse) breakpoints.push("Capability pack may not reuse full annual — check evidenceSourceNote.");
  if (!lowerRefs) breakpoints.push("No weekly/monthly/quarterly summary refs — lower layers require manual stitch.");
  if (!(inputs.releaseSignals || []).length && !(annual?.releaseSignalsInput || []).length) {
    breakpoints.push("Release signals absent — deploy-to-metric story not in JSON.");
  }

  const strengths = [];
  if (hasAnnual && hasCap && capReuse) {
    strengths.push("Annual and capability packs align — capability builder consumed annual operating review output.");
  }
  if (hasAnnual) strengths.push("Annual KPI and recurring anomaly lists provide a single-year evidence spine.");

  const upgrades = [];
  if (!lowerRefs) upgrades.push("Attach file paths or digests for monthly/quarterly generators when running OS review.");
  if (!(annual?.releaseSignalsInput || []).length) upgrades.push("Include releaseSignals in annual input for release linkage.");
  if (hasCap && !capReuse) upgrades.push("Pass `annualOperatingReviewPack` into capability input explicitly.");

  let evidenceContinuitySummary =
    evidenceContinuityStatus === "strong"
      ? "Annual and capability artifacts are chained; capability evidence note indicates annual reuse."
      : evidenceContinuityStatus === "partial"
        ? "Some layers present but continuity is incomplete (snapshot-only capability, missing lower refs, or no release signals)."
        : "Evidence chain is thin — add annual JSON and full capability inputs.";

  return {
    evidenceContinuityStatus,
    evidenceContinuitySummary,
    evidenceBreakpoints: breakpoints,
    evidenceStrengths: strengths.length ? strengths : ["Submit any available packs — template still produces a control map."],
    evidenceUpgradeSuggestions: upgrades.length ? upgrades : ["Maintain generator semver in export metadata."],
  };
}

/**
 * @param {object|null} annual
 * @param {object} capability
 */
function assessLinkage(annual, capability) {
  const hasAnnual = !!(annual && Object.keys(annual).length);
  const hasCap = !!(capability && Object.keys(capability).length);
  const rel = (annual?.releaseSignalsInput || []).length;
  const capFromAnnual = hasCap && capabilityReusesAnnualEmbedded(capability);

  /** @type {"weak"|"partial"|"strong"} */
  let releaseReviewLinkageStatus = "weak";
  if (rel > 0 && hasAnnual) releaseReviewLinkageStatus = "strong";
  else if (hasAnnual) releaseReviewLinkageStatus = "partial";

  /** @type {"weak"|"partial"|"strong"} */
  let roadmapLinkageStatus = "weak";
  if (hasCap && hasAnnual && capFromAnnual) roadmapLinkageStatus = "strong";
  else if (hasCap && hasAnnual) roadmapLinkageStatus = "partial";
  else if (hasCap) roadmapLinkageStatus = "partial";

  const linkageStrengths = [];
  if (capFromAnnual) linkageStrengths.push("Roadmap/capability layer reads from the same annual evidence spine (see capability evidenceSourceNote).");
  if (rel > 0) linkageStrengths.push("Release signals are present on the annual pack for cadence-aware review.");

  const linkageGaps = [];
  if (rel === 0 && hasAnnual) linkageGaps.push("Release-to-review linkage is weak without releaseSignals on annual JSON.");
  if (!capFromAnnual && hasCap) linkageGaps.push("Capability pack may be built from snapshot — roadmap linkage to annual KPIs is weaker.");
  if (!hasAnnual) linkageGaps.push("Annual pack missing — roadmap cannot anchor to year KPIs.");

  const recommendedLinkageUpgrades = [];
  if (linkageGaps.length) {
    recommendedLinkageUpgrades.push("Regenerate capability from fresh annual JSON after attaching releaseSignals.");
    recommendedLinkageUpgrades.push("Keep mismatch + anomaly tables in annual export stable across quarters for trend linkage.");
  } else {
    recommendedLinkageUpgrades.push("Maintain current export discipline — linkage evidence is acceptable for template.");
  }

  return {
    releaseReviewLinkageStatus,
    roadmapLinkageStatus,
    linkageStrengths,
    linkageGaps,
    recommendedLinkageUpgrades,
  };
}

function pad3(a, filler) {
  const out = [...(a || [])];
  while (out.length < 3) out.push(filler);
  return out.slice(0, 3);
}

/**
 * @param {object} pack
 * @param {object} ctx
 */
function buildExecSummary(pack, ctx) {
  const { hasAnnual, hasCap, annual, capability } = ctx;
  return {
    executiveSummaryHeadline: `Crystal quality operating system: **unified review stack** (${hasAnnual ? "annual anchored" : "no annual"}) + **capability layer** (${hasCap ? str(capability.overallMaturityBand) : "absent"}).`,
    executiveSummaryBody: [
      `Assessment window ${str(pack.assessmentWindowStart)} → ${str(pack.assessmentWindowEnd)}.`,
      hasAnnual
        ? `Annual ops status **${annual?.annualStatus}**, score band **${annual?.annualScoreBand}**.`
        : "No annual JSON — leadership narrative is limited to capability snapshot if any.",
      `Evidence continuity: **${pack.evidenceContinuityStatus}**; release linkage: **${pack.releaseReviewLinkageStatus}**; roadmap linkage: **${pack.roadmapLinkageStatus}**.`,
    ].join(" "),
    top3Strengths: pad3(
      [
        ...(pack.linkageStrengths || []).slice(0, 2),
        ...(pack.evidenceStrengths || []).slice(0, 2),
      ],
      "Generators and docs exist in-repo for monthly → annual → capability.",
    ),
    top3Risks: pad3(
      pack.evidenceBreakpoints || [],
      "Manual stitching of weekly/monthly exports if refs omitted.",
    ),
    top3RecommendedMoves: pad3(
      pack.recommendedLinkageUpgrades || [],
      "Import annual + capability JSON together each cycle.",
    ),
    methodNote: "Summaries derive from annual/capability fields and control map — not independent audits.",
  };
}

function buildOpSummary(pack, ctx) {
  const { annual, capability } = ctx;
  const strongC = (pack.operatingControlMap || []).filter((c) => c.status === "strong").length;
  return {
    operatingSummaryHeadline: `Operating view: **${strongC}/8** controls at \`strong\`; continuity **${pack.evidenceContinuityStatus}**.`,
    operatingSummaryBody: [
      annual
        ? `Annual recurring anomalies: ${(annual.topRecurringAnomalies || []).length} groups; mismatch types: ${(annual.topRecurringMismatchTypes || []).length}.`
        : "No annual table rows in this export.",
      capability
        ? `Capability overall ${str(capability.overallMaturityLevel)} — roadmap buckets populated from same evidence rules as Phase 15.`
        : "Add capability pack output for roadmap alignment.",
    ].join(" "),
    topOperationalStrengths: pad3(
      (pack.evidenceStrengths || []).slice(0, 5),
      "Repo contains weekly/monthly/annual/capability generators.",
    ),
    topOperationalGaps: pad3(
      [...(pack.evidenceBreakpoints || []), ...(pack.linkageGaps || [])].slice(0, 5),
      "Attach lower-layer refs when running a formal ops review.",
    ),
    topOperationalNextActions: pad3(
      pack.evidenceUpgradeSuggestions || [],
      "Version-control JSON exports alongside this markdown.",
    ),
    methodNote: "Operational lines mirror breakpoints and control statuses — same evidence as continuity section.",
  };
}

function buildSystemSummary(pack) {
  const layers = pack.unifiedReviewStack?.layers || [];
  const high = layers.filter((l) => /present|Optional multi-year|carry KPI|includes .* release signal/i.test(l.currentStatus)).slice(0, 3);
  return {
    systemSummaryHeadline: "System view: layered review stack (telemetry → diagnostics → metrics → docs → rolling reviews → annual → capability).",
    systemSummaryBody: [
      `Unified stack lists **${layers.length}** conceptual layers; optional historical is reference-only until a multi-year util lands.`,
      `Control map covers telemetry, traceability, mismatch, annual, capability, release, and continuity.`,
    ].join(" "),
    top3UnifiedStackHighlights: pad3(
      high.map((l) => `${l.layerTitle}: ${l.currentStatus}`),
      "See layer table for roles and consumers.",
    ),
    top3ControlGaps: pad3(
      (pack.operatingControlMap || []).filter((c) => c.status === "partial" || c.status === "missing").map((c) => `${c.controlTitle}: ${c.status}`),
      "Partial controls are expected when annual JSON is incomplete.",
    ),
    top3LinkageUpgrades: pad3(pack.recommendedLinkageUpgrades || [], "None — linkage acceptable."),
    methodNote: "System summary is structural — it does not certify production SLOs.",
  };
}

/**
 * @param {object} pack
 */
export function buildCrystalUnifiedReviewStack(pack) {
  return pack.unifiedReviewStack || { layers: [] };
}

/**
 * @param {object} pack
 */
export function buildCrystalOperatingControlMap(pack) {
  return { controls: pack.operatingControlMap || [] };
}

/**
 * @param {object} inputs
 * @param {{ generatedAt?: string }} [options]
 */
export function buildCrystalOperatingSystemPack(inputs, options = {}) {
  const raw = inputs || {};
  const generatedAt = str(raw.generatedAt || options.generatedAt || new Date().toISOString());

  const annual = resolveAnnualPack(raw, { ...options, generatedAt });
  const capability = resolveCapabilityPack(raw, annual, { ...options, generatedAt });

  const assessmentWindowStart = str(raw.assessmentWindowStart || annual?.yearWindowStart || capability?.assessmentWindowStart);
  const assessmentWindowEnd = str(raw.assessmentWindowEnd || annual?.yearWindowEnd || capability?.assessmentWindowEnd);

  const layers = buildLayers(annual, capability, raw);
  const operatingControlMap = buildControls(annual, capability, raw);

  const cont = assessEvidenceContinuity(annual, capability, raw);
  const link = assessLinkage(annual, capability, raw);

  const pack = {
    reviewPackVersion: OS_REVIEW_PACK_VERSION,
    generatedAt,
    assessmentWindowStart,
    assessmentWindowEnd,
    annualOperatingReviewPackVersion: annual ? ANNUAL_REVIEW_PACK_VERSION : null,
    capabilityMaturityRoadmapPackVersion: capability ? MATURITY_REVIEW_PACK_VERSION : null,
    annualPackPresent: !!annual,
    capabilityPackPresent: !!capability,
    unifiedReviewStack: { layers },
    operatingControlMap,
    evidenceContinuityStatus: cont.evidenceContinuityStatus,
    evidenceContinuitySummary: cont.evidenceContinuitySummary,
    evidenceBreakpoints: cont.evidenceBreakpoints,
    evidenceStrengths: cont.evidenceStrengths,
    evidenceUpgradeSuggestions: cont.evidenceUpgradeSuggestions,
    releaseReviewLinkageStatus: link.releaseReviewLinkageStatus,
    roadmapLinkageStatus: link.roadmapLinkageStatus,
    linkageStrengths: link.linkageStrengths,
    linkageGaps: link.linkageGaps,
    recommendedLinkageUpgrades: link.recommendedLinkageUpgrades,
    optionalLayerReferences: {
      weeklyReviewSummaryRefs: raw.weeklyReviewSummaryRefs ?? null,
      monthlyScorecardSummaryRefs: raw.monthlyScorecardSummaryRefs ?? null,
      quarterlyReviewSummaryRefs: raw.quarterlyReviewSummaryRefs ?? null,
      multiYearHistoryPackReference: raw.multiYearHistoryPackReference ?? raw.multiYearHistoryPack ?? null,
    },
    docReferences: {
      telemetryMapping: "docs/crystal-routing-telemetry-mapping.md",
      mismatchMetrics: "docs/crystal-routing-wording-mismatch-metrics.md",
      annualPackDoc: "docs/ops/crystal-annual-operating-review-pack.md",
      capabilityPackDoc: "docs/ops/crystal-capability-maturity-roadmap-pack.md",
      releaseGate: "docs/ops/crystal-release-gate-checklist.md",
      postDeploy: "docs/ops/crystal-post-deploy-review.md",
    },
    executiveSummary: {},
    operatingSummary: {},
    systemSummary: {},
    methodNote:
      "Unified operating system pack maps existing generators — it does not replace annual or capability utilities or alter routing/wording/mismatch semantics.",
  };

  const ctx = { hasAnnual: !!annual, hasCap: !!capability, annual, capability };
  pack.executiveSummary = buildExecSummary(pack, ctx);
  pack.operatingSummary = buildOpSummary(pack, ctx);
  pack.systemSummary = buildSystemSummary(pack);

  return pack;
}

/**
 * @param {object} pack
 */
export function renderCrystalOperatingSystemPackMarkdown(pack) {
  const w = (s) => (s == null ? "" : String(s));
  const ex = pack.executiveSummary || {};
  const op = pack.operatingSummary || {};
  const sys = pack.systemSummary || {};

  const lines = [];
  lines.push("# Crystal quality operating system pack (unified review stack)");
  lines.push("");
  lines.push("## Header");
  lines.push("");
  lines.push(`- **Assessment window:** ${w(pack.assessmentWindowStart)} → ${w(pack.assessmentWindowEnd)}`);
  lines.push(`- **Generated at:** ${w(pack.generatedAt)}`);
  lines.push(`- **Pack version:** \`${w(pack.reviewPackVersion)}\``);
  lines.push(`- **Annual pack present:** ${pack.annualPackPresent}`);
  lines.push(`- **Capability pack present:** ${pack.capabilityPackPresent}`);
  lines.push("");
  lines.push(`> ${w(pack.methodNote)}`);
  lines.push("");

  lines.push("## Executive summary");
  lines.push("");
  lines.push(w(ex.executiveSummaryHeadline));
  lines.push("");
  lines.push(w(ex.executiveSummaryBody));
  lines.push("");
  for (const t of ex.top3Strengths || []) lines.push(`- **Strength:** ${t}`);
  for (const t of ex.top3Risks || []) lines.push(`- **Risk / breakpoint:** ${t}`);
  for (const t of ex.top3RecommendedMoves || []) lines.push(`- **Move:** ${t}`);
  lines.push("");
  lines.push(`> ${w(ex.methodNote)}`);
  lines.push("");

  lines.push("## Unified review stack overview");
  lines.push("");
  lines.push("| Layer | Role | Status (this export) |");
  lines.push("|-------|------|----------------------|");
  for (const l of pack.unifiedReviewStack?.layers || []) {
    lines.push(`| ${l.layerTitle} | ${l.role} | ${l.currentStatus.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");

  lines.push("## Operating control map");
  lines.push("");
  lines.push("| Control | Status | Summary |");
  lines.push("|---------|--------|---------|");
  for (const c of pack.operatingControlMap || []) {
    lines.push(`| ${c.controlTitle} | \`${c.status}\` | ${c.summary.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");

  lines.push("## Evidence continuity");
  lines.push("");
  lines.push(`**Status:** \`${w(pack.evidenceContinuityStatus)}\``);
  lines.push("");
  lines.push(w(pack.evidenceContinuitySummary));
  lines.push("");
  lines.push("### Breakpoints");
  for (const b of pack.evidenceBreakpoints || []) lines.push(`- ${b}`);
  lines.push("");
  lines.push("### Strengths");
  for (const b of pack.evidenceStrengths || []) lines.push(`- ${b}`);
  lines.push("");
  lines.push("### Upgrade suggestions");
  for (const b of pack.evidenceUpgradeSuggestions || []) lines.push(`- ${b}`);
  lines.push("");

  lines.push("## Release / review / roadmap linkage");
  lines.push("");
  lines.push(`- **Release ↔ review:** \`${w(pack.releaseReviewLinkageStatus)}\``);
  lines.push(`- **Roadmap ↔ annual:** \`${w(pack.roadmapLinkageStatus)}\``);
  lines.push("");
  lines.push("### Linkage strengths");
  for (const b of pack.linkageStrengths || []) lines.push(`- ${b}`);
  lines.push("");
  lines.push("### Linkage gaps");
  for (const b of pack.linkageGaps || []) lines.push(`- ${b}`);
  lines.push("");

  lines.push("## Operating summary");
  lines.push("");
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

  lines.push("## System summary");
  lines.push("");
  lines.push(w(sys.systemSummaryHeadline));
  lines.push("");
  lines.push(w(sys.systemSummaryBody));
  lines.push("");
  for (const t of sys.top3UnifiedStackHighlights || []) lines.push(`- **Stack:** ${t}`);
  for (const t of sys.top3ControlGaps || []) lines.push(`- **Control gap:** ${t}`);
  for (const t of sys.top3LinkageUpgrades || []) lines.push(`- **Linkage:** ${t}`);
  lines.push("");
  lines.push(`> ${w(sys.methodNote)}`);
  lines.push("");

  lines.push("## Recommended system improvements");
  lines.push("");
  for (const b of pack.evidenceUpgradeSuggestions || []) lines.push(`- ${b}`);
  for (const b of pack.recommendedLinkageUpgrades || []) lines.push(`- ${b}`);
  lines.push("");

  lines.push("## Appendix");
  lines.push("");
  lines.push("### Doc references");
  for (const [k, v] of Object.entries(pack.docReferences || {})) {
    lines.push(`- **${k}:** \`${v}\``);
  }
  lines.push("");
  lines.push("### Optional layer references (input passthrough)");
  lines.push("```json");
  lines.push(JSON.stringify(pack.optionalLayerReferences || {}, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### Layer detail (primary questions)");
  for (const l of pack.unifiedReviewStack?.layers || []) {
    lines.push(`#### ${l.layerTitle}`);
    lines.push("");
    lines.push(`- **Consumers:** ${l.consumers.join("; ")}`);
    for (const q of l.primaryQuestionsAnswered || []) lines.push(`- Q: ${q}`);
    lines.push("");
  }

  return lines.join("\n");
}
