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
export const REPORT_PAYLOAD_VERSION = "1.0.0";
