/**
 * Canonical report payload for Flex summary-first + HTML full report (single shape).
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
 * @property {string} [objectLabel]
 * @property {string} [objectType]
 */

/**
 * @typedef {Object} ReportSummary
 * @property {number|null} energyScore
 * @property {string} [energyLevelLabel]
 * @property {string} [mainEnergyLabel]
 * @property {number|null} compatibilityPercent
 * @property {string} summaryLine
 * @property {string} [birthdayLabel] — e.g. วันจันทร์ 19 ส.ค. 2528
 * @property {string} [compatibilityReason] — birth-day fit copy for Flex / report
 * @property {string} [secondaryEnergyLabel] — sub-energy from scan output
 * @property {Record<string, number>} [scanDimensions] — pillars 1–5 stars
 * @property {string[]} [scanTips] — model `tips` / “ชิ้นนี้หนุนเรื่อง” lines for Flex (max 2)
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
export const REPORT_PAYLOAD_VERSION = "1.1.0";
