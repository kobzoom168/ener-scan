/**
 * Canonical report payload for Flex summary-first + HTML full report (single shape).
 * For hybrid Web-first contract evolution see `reportPayloadV1.types.js` (ReportPayloadV1).
 * Phase 2.3: `buildScanSummaryFirstFlex` prefers this when the DB row exists.
 * Phase 1: JSDoc only; runtime validation optional later.
 *
 * @typedef {Object} ReportPayload
 * @property {string} reportId
 * @property {string} publicToken
 * @property {string} scanId
 * @property {string} userId
 * @property {string|null} birthdateUsed
 * @property {string} generatedAt ISO 8601
 * @property {string} reportVersion
 *
 * @property {ReportObject} object
 *
 * @property {ReportSummary} summary
 *
 * @property {ReportSections} sections
 *
 * @property {ReportTrust} trust
 *
 * @property {ReportActions} actions
 *
 * @property {ReportWording} [wording] — structured copy for Flex teaser + HTML opening / life sections
 *
 * @property {ReportCompatibility} [compatibility] — deterministic v1 slice (HTML detail + Flex band via summary)
 *
 * @property {ReportObjectEnergy} [objectEnergy] — Object Energy Engine v1 + star mapping (HTML + Flex stars)
 *
 * @property {ReportParsedTruth} [parsed] — minimal snake_case truth fields (e.g. crystal_mode); mirrors summary where applicable
 *
 * @property {ReportEnrichmentMeta} [enrichment] — optional web hint merge (wording-only); never payment/access/scores
 *
 * @property {ReportDiagnostics} [diagnostics] — internal QA / explain (not public-report contract)
 *
 * @property {ReportMoldaviteV1} [moldaviteV1] — isolated Moldavite v1 slice (Flex + public); not generic crystal confidence
 * @property {ReportAmuletV1} [amuletV1] — sacred amulet lane v1 (Flex + HTML); separate from legacy thai_amulet mobile report
 * @property {ReportCrystalGenericSafeV1} [crystalGenericSafeV1] — neutral crystal fallback when Moldavite not detected; avoids DB confidence hero
 * @property {ReportCrystalBraceletV1} [crystalBraceletV1] — mixed-stone crystal bracelet lane; summary-first Flex + graph-first HTML; not Moldavite semantics
 * @property {ReportTimingV1} [timingV1] — deterministic Timing Engine v1 truth (HTML/Flex read-only)
 */

/**
 * Crystal bracelet lane v1 — mixed-stone crystal bracelet, summary-first Flex + graph-first HTML.
 * Uses crystal-generic semantics, not subtype-assertive naming.
 *
 * @typedef {Object} ReportCrystalBraceletV1
 * @property {string} version — e.g. "1"
 * @property {"deterministic_v1"} scoringMode
 * @property {{ reason: string, matchedSignals: string[] }} detection
 * @property {"crystal_bracelet"} lane
 * @property {{ objectFamily: "crystal", formFactor: "bracelet", compositionMode: "mixed"|"single_unknown"|"unknown" }} identity
 * @property {Record<string, { key: string, score: number, labelThai: string }>} axes
 * @property {string} primaryAxis
 * @property {string} secondaryAxis
 * @property {{ score: number|null, band: string|null, reason?: string|null }} [ownerFit]
 * @property {{
 *   headline: string,
 *   fitLine: string,
 *   bullets: string[],
 *   ctaLabel?: string,
 *   mainEnergyShort: string,
 *   heroNamingLine?: string,
 *   mainEnergyWordingLine?: string,
 *   htmlOpeningLine?: string,
 *   tagline?: string
 * }} flexSurface
 * @property {{
 *   meaningParagraphs: string[],
 *   graphSummaryRows: string[],
 *   axisBlurbs: Record<string, string>,
 *   usageCautionLines: string[],
 *   ownerProfile?: {
 *     summaryLabel?: string,
 *     traits?: string[],
 *     sensitiveAxes?: string[],
 *   },
 *   interactionSummary?: string[],
 * }} htmlReport
 * @property {{
 *   displayLabel: string,
 *   visibleMainEnergyLabel: string,
 *   namingPolicy: "generic_crystal_bracelet"
 * }} display
 * @property {{
 *   scanResultIdPrefix: string,
 *   energyScoreSnapshot: number|null,
 *   mainEnergyLabelSnapshot: string|null
 * }} [context]
 * @property {{
 *   internalStoneHints?: string[],
 *   internalToneSignals?: string[],
 *   subtypeConfidenceHidden?: number|null
 * }} [internalHints] — introspection only; never render to users
 */

/**
 * Crystal generic-safe v1 — neutral wording + dedicated Flex when family is crystal but Moldavite v1 did not attach.
 *
 * @typedef {Object} ReportCrystalGenericSafeV1
 * @property {string} version — e.g. "1"
 * @property {"generic_safe_v1"} mode
 * @property {{ headline: string, fitLine: string, bullets: string[], mainEnergyShort: string }} flexSurface
 * @property {{ heroNaming: string, mainEnergyLabelNeutral: string, visibleMainLabelNeutral: string, mainEnergyWordingLine: string, htmlOpeningNeutral: string }} display
 * @property {{ scanResultIdPrefix: string }} [context]
 */

/**
 * Timing Engine v1 slice — computed once at payload build; templates must not re-derive.
 *
 * @typedef {Object} ReportTimingSlot
 * @property {string} key
 * @property {number} score
 * @property {string} reasonCode
 * @property {string} reasonText
 *
 * @typedef {Object} ReportTimingDebugV11
 * @property {number} ownerRoot
 * @property {number} lifePath
 * @property {number|null} lanePrimaryWeight
 * @property {number|null} laneSecondaryWeight
 * @property {string|null} lanePrimaryKey
 * @property {string|null} laneSecondaryKey
 * @property {number} compatibilityBoostApplied
 * @property {number} ownerFitBoostApplied
 * @property {number} primaryAxisDeltaApplied
 * @property {string|null} timingFingerprint
 * @property {string} timingStableKey
 * @property {string} version
 *
 * @typedef {Object} ReportTimingV1
 * @property {"timing_v1"|"timing_v1_1"} engineVersion
 * @property {"sacred_amulet"|"moldavite"} lane
 * @property {string} ritualMode
 * @property {"high"|"medium"|"low"} confidence
 * @property {{ lifePath: number, birthDayRoot: number, weekday: number }} ownerProfile
 * @property {ReportTimingSlot[]} bestHours
 * @property {ReportTimingSlot[]} bestWeekdays
 * @property {ReportTimingSlot[]} bestDateRoots
 * @property {ReportTimingSlot[]} avoidHours
 * @property {{ topWindowLabel: string, topWeekdayLabel: string, practicalHint: string }} summary
 * @property {ReportTimingDebugV11} [debug] — introspection only; do not render to users
 */

/**
 * Moldavite vertical slice v1 — deterministic life-area scores + dedicated Flex copy path.
 *
 * @typedef {Object} ReportMoldaviteV1
 * @property {string} version — e.g. "1"
 * @property {"deterministic_v1"} scoringMode — temporary until model-backed scores
 * @property {{ reason: string, matchedSignals: string[] }} detection
 * @property {Record<string, { key: string, score: number, labelThai: string }>} lifeAreas — work / money / relationship
 * @property {string} primaryLifeArea
 * @property {string} secondaryLifeArea
 * @property {{ headline: string, fitLine: string, bullets: string[], mainEnergyShort: string, heroNamingLine?: string, mainEnergyWordingLine?: string, htmlOpeningLine?: string, tagline?: string }} flexSurface
 * @property {{ meaningParagraphs: string[], lifeAreaBlurbs: { work: string, relationship: string, money: string }, usageCautionLines: string[], energyTiming?: { recommendedWeekday?: string, recommendedTimeBand?: string, ritualMode?: string, timingReason?: string, bestTimeText?: string, bestDayText?: string, recommendedModeText?: string, focusAmplifierNote?: string } }} [htmlReport] — public HTML-only blocks (not Flex); energyTiming overrides Moldavite deterministic v1 (legacy keys alias new fields)
 * @property {{ displayNamingConfidenceLevel: "high"|"medium"|"low", effectiveSubtypeConfidenceForNaming: number }} [displayNaming] — internal naming tier + effective confidence (not shown as % to users)
 * @property {{ scanResultIdPrefix: string, energyScoreSnapshot: number|null, mainEnergyLabelSnapshot: string|null }} [context]
 */

/**
 * Sacred amulet lane v1 — six power categories; summary-first Flex + HTML shell (parallel structure to Moldavite, different semantics).
 *
 * @typedef {Object} ReportAmuletV1
 * @property {string} version — e.g. "1"
 * @property {"deterministic_v1"|"deterministic_v2"} scoringMode
 * @property {{ reason: string, matchedSignals: string[] }} detection
 * @property {Record<string, { key: string, score: number, labelThai: string }>} powerCategories
 * @property {string} primaryPower
 * @property {string} secondaryPower
 * @property {{ headline: string, fitLine: string, bullets: string[], mainEnergyShort: string, ctaLabel?: string, heroNamingLine?: string, mainEnergyWordingLine?: string, htmlOpeningLine?: string, tagline?: string }} flexSurface
 * @property {{ lifeAreaBlurbs: Record<string, string>, usageCautionLines: string[] }} htmlReport
 * @property {{ scanResultIdPrefix: string, energyScoreSnapshot: number|null, mainEnergyLabelSnapshot: string|null }} [context]
 */

/**
 * @typedef {Object} ReportDiagnostics
 * @property {string} [objectFamily]
 * @property {string} [resolvedCategoryCode]
 * @property {boolean} [diversificationApplied]
 * @property {string} [wordingBankUsed]
 * @property {string} [wordingVariantId]
 * @property {string} [crystalMode]
 * @property {number} [matchedSignalsCount]
 * @property {boolean} [enrichmentEligible]
 * @property {boolean} [enrichmentUsed]
 * @property {string|null} [enrichmentProvider]
 * @property {string} [deliveryStrategy]
 * @property {boolean} [lineSummaryPresent]
 * @property {"db"|"code_bank"} [wordingPrimarySource]
 * @property {boolean} [dbWordingSelected]
 * @property {string|number|null} [dbWordingRowId]
 * @property {string|null} [dbWordingSlot]
 * @property {string|null} [dbWordingPresentationAngle]
 * @property {string|null} [dbWordingClusterTag]
 * @property {number|null} [dbWordingFallbackLevel]
 * @property {"db"|"truth_or_absent"|"truth_or_composed"} [visibleMainLabelSource]
 * @property {boolean} [visibleCopyUsedCodeFallback]
 * @property {string} [parsedMainEnergyRaw] — truncated raw string used for category inference
 * @property {"line_value"|"fallback_body_match"|"missing"} [mainEnergySource]
 * @property {string} [resolveEnergyTypeResult] — Thai label from resolveEnergyTypeMetaForFamily
 * @property {string|null} [protectKeywordMatched]
 * @property {string} [energyCategoryInferenceBranch]
 * @property {string|null} [protectWeakKeywordMatched] — crystal weak protect cue (not mapped to PROTECT)
 * @property {"strong"|"weak"|"none"} [protectSignalStrength]
 * @property {"thai_legacy"|"crystal_conservative"} [energyTypeResolverMode]
 * @property {string} [energyTypeResolverFamily]
 * @property {string} [resolvedEnergyTypeBeforeCategoryMap]
 * @property {string|null} [crystalWeakProtectOutcome] — category code chosen for crystal weak-protect BOOST routing
 * @property {string} [crystalNonProtectRoutingReason] — e.g. weak_protect_confidence, generic_boost_luck_fortune
 * @property {string} [crystalPostResolverCategoryDecision] — final category after crystal heuristics (mirrors code when set)
 * @property {string} [crystalRoutingRuleId] — stable rule id from crystalCategoryRouting.util
 * @property {string} [crystalRoutingReason] — rule-specific reason (finer than legacy non-protect key)
 * @property {string} [crystalRoutingStrategy] — early_exit | resolver_direct | weak_protect | generic_boost | fallback
 * @property {"db_crystal"|"db_family"|"code_bank_crystal_first"|"code_bank_family"} [visibleWordingDecisionSource] — traceable wording source (see crystalVisibleWordingPriority.util.js)
 * @property {string} [visibleWordingObjectFamilyUsed] — normalized family used for wording branch
 * @property {boolean} [visibleWordingCrystalSpecific] — true when DB crystal rows or code crystal-first pools applied
 * @property {string} [visibleWordingCategoryUsed] — category driving template selection for visible surface
 * @property {string} [visibleWordingPresentationAngle] — angle id on headline/surface when known
 * @property {number|null} [visibleWordingFallbackLevel] — DB fallback level when DB path (else often undefined)
 * @property {string} [visibleWordingReason] — short machine reason for wording decision
 * @property {Object} [routingWordingMetrics] — Phase 4: crystal routing vs visible wording alignment (`buildCrystalRoutingWordingMetrics`); see `docs/crystal-routing-wording-mismatch-metrics.md`
 * @property {boolean} [crystalGenericSafeActive] — true when crystalGenericSafeV1 slice attached (non-Moldavite crystal)
 * @property {"gemini"|"gemini_error"|"gemini_not_moldavite"|"heuristic"} [moldaviteDecisionSource] — crystal Moldavite routing only
 * @property {string} [geminiCrystalSubtypeMode] — Gemini classifier outcome when crystal scan ran subtype pass
 * @property {{ crystalSubtype?: string, subtypeConfidence?: number, moldaviteLikely?: boolean, durationMs?: number }} [geminiCrystalSubtypeSummary]
 */

/**
 * @typedef {Object} ReportEnrichmentMeta
 * @property {import("../webEnrichment/webEnrichment.types.js").ExternalObjectHints} hints
 * @property {string} mergeMode
 * @property {string[]} appliedFields
 */

/**
 * @typedef {Object} ReportObjectEnergy
 * @property {string} formulaVersion
 * @property {Object} profile — balance, protection, authority, compassion, attraction (0–100)
 * @property {Object} stars — same keys, star count 1–5
 * @property {{ key: string, labelThai: string }} mainEnergyResolved
 * @property {number} confidence — 0–1
 * @property {Record<string, unknown>} [inputs]
 * @property {string[]} [explain]
 */

/**
 * @typedef {Object} ReportCompatibility
 * @property {number} score — 35–98
 * @property {string} band — Thai label e.g. เข้ากันดี
 * @property {string} [formulaVersion] — e.g. compatibility_v1
 * @property {Record<string, number>} [factors]
 * @property {Record<string, unknown>} [inputs]
 * @property {string[]} [explain]
 */

/**
 * Structured wording layer (camelCase in JSON). Derived in `buildReportPayloadFromScan` from parsed scan text.
 *
 * @typedef {Object} ReportWording
 * @property {string} [objectLabel]
 * @property {string} [heroNaming] — memorable one-line energy style name
 * @property {string} [energyCharacter] — one-sentence object character
 * @property {string} [mainEnergy] — single canonical primary energy label (Thai)
 * @property {string[]} [secondaryEnergies]
 * @property {number} [powerScore] — 0–10, mirrors summary.energyScore when present
 * @property {number} [compatibilityScore] — 0–100, mirrors summary.compatibilityPercent when present
 * @property {ReportEnergyBreakdown} [energyBreakdown] — display weights 0–100 by pillar (one pillar dominant)
 * @property {string} [lifeTranslation] — energy → life meaning
 * @property {string} [bestFor] — person / situation fit
 * @property {string} [notTheBestFor] — explicit “not mainly about”
 * @property {string[]} [practicalEffects] — up to 3 concrete life-facing effects
 * @property {string} [flexHeadline] — short Flex headline
 * @property {string[]} [flexBullets] — exactly 2 short Flex bullets when complete
 * @property {string} [htmlOpeningLine] — deeper HTML hero hook
 * @property {string} [wordingFamily] — hints Flex family patterns (e.g. protection, authority)
 * @property {string} [clarityLevel] — e.g. l2
 * @property {"light"|"dark"} [amuletReportV2Theme] — optional sacred_amulet HTML shell only (`amuletReportV2.template.js`); default white shell + gold accents; use `"dark"` for tech dark-gold dashboard
 * @property {string} [publicReportUrl] — optional absolute public report URL for canonical / Open Graph (https preferred)
 */

/**
 * @typedef {Object} ReportEnergyBreakdown
 * @property {number} [protection]
 * @property {number} [balance]
 * @property {number} [authority]
 * @property {number} [metta]
 * @property {number} [attraction]
 */

/**
 * @typedef {Object} ReportObject
 * @property {string} [objectImageUrl]
 * @property {string} [socialImageUrl] — optional Open Graph / share image (https); when set, preferred over objectImageUrl for previews
 * @property {string} [objectLabel]
 * @property {string} [objectType]
 */

/**
 * @typedef {Object} ReportSummary
 * @property {number|null} energyScore
 * @property {string} [energyLevelLabel]
 * @property {string} [mainEnergyLabel]
 * @property {number|null} compatibilityPercent
 * @property {string} [compatibilityBand] — Thai band from deterministic formula (Flex teaser)
 * @property {string} summaryLine
 * @property {string} [birthdayLabel] — e.g. วันจันทร์ 19 ส.ค. 2528
 * @property {string} [compatibilityReason] — birth-day fit copy for Flex / report
 * @property {string} [secondaryEnergyLabel] — sub-energy from scan output
 * @property {Record<string, number>} [scanDimensions] — pillars 1–5 stars
 * @property {string[]} [scanTips] — model `tips` / “ชิ้นนี้หนุนเรื่อง” lines for Flex (max 2)
 * @property {string} [headlineShort] — Flex-only one-line hook (built in reportPayload.builder)
 * @property {string} [fitReasonShort] — Flex-only short fit line
 * @property {string[]} [bulletsShort] — exactly 2 short lines for LINE Flex
 * @property {string} [ctaLabel] — primary button label for Flex handoff
 * @property {string} [energyCategoryCode] — energy_categories.code (sync-inferred for Flex DB resolver)
 * @property {string} [energyCopyObjectFamily] — normalized slug for energy_copy_templates.object_family
 * @property {"general"|"spiritual_growth"|null} [crystalMode] — crystal subgroup; null when not crystal
 * @property {string} [presentationAngleId] — Flex wording surface angle (e.g. filter, shield); truth category unchanged
 * @property {string} [wordingVariantId] — composed pool variant id for Flex teaser lines
 * @property {string} [openingShort] — DB `opening` slot when hydrated
 * @property {string} [teaserShort] — DB `teaser` slot when hydrated
 * @property {string} [visibleMainLabel] — effect-first visible label from DB `main_label` (truth stays in mainEnergyLabel)
 */

/**
 * @typedef {Object} ReportParsedTruth
 * @property {"general"|"spiritual_growth"|null} crystal_mode
 */

/**
 * @typedef {Object} ReportSections
 * @property {string[]} whatItGives
 * @property {string[]} messagePoints
 * @property {string[]} ownerMatchReason
 * @property {string} [roleDescription]
 * @property {string[]} bestUseCases
 * @property {string[]} weakMoments
 * @property {string[]} guidanceTips
 * @property {string[]} [careNotes]
 * @property {string[]} [miniRitual]
 */

/**
 * @typedef {Object} ReportTrust
 * @property {string} [modelLabel]
 * @property {string} trustNote
 * @property {string} rendererVersion
 */

/**
 * @typedef {Object} ReportActions
 * @property {string} [historyUrl]
 * @property {string} [rescanUrl]
 * @property {string} [changeBirthdateUrl]
 * @property {string} [lineHomeUrl]
 */

/** @type {string} */
export const REPORT_PAYLOAD_VERSION = "1.2.13";
