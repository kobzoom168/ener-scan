/**
 * Timing Engine v1 — JSDoc contracts (truth layer; not wording).
 *
 * @typedef {"timing_v1"|"timing_v1_1"} TimingEngineVersion
 * @typedef {"sacred_amulet"|"moldavite"} TimingLaneId
 * @typedef {"high"|"medium"|"low"} TimingConfidence
 * @typedef {"ตั้งจิต"|"สวดภาวนา"|"ขอพรสั้น"|"เสริมบารมี"} TimingRitualModeTh
 *
 * @typedef {Object} TimingRequest
 * @property {string} birthdateIso — YYYY-MM-DD preferred
 * @property {TimingLaneId} lane
 * @property {string} primaryKey
 * @property {string} [secondaryKey]
 * @property {string} [scannedAtIso]
 * @property {string} [objectFamily]
 * @property {string} [materialFamily]
 * @property {string} [shapeFamily]
 * @property {string} [dominantColor]
 * @property {string} [conditionClass]
 * @property {number} [compatibilityScore] — 0–100
 * @property {number} [ownerFitScore] — 0–100
 *
 * @typedef {Object} TimingSlot
 * @property {string} key
 * @property {number} score — 0–100
 * @property {string} reasonCode
 * @property {string} reasonText
 *
 * @typedef {Object} TimingOwnerProfile
 * @property {number} lifePath
 * @property {number} birthDayRoot
 * @property {number} weekday — 0–6 Sun=0
 *
 * @typedef {Object} TimingSummary
 * @property {string} topWindowLabel
 * @property {string} topWeekdayLabel
 * @property {string} practicalHint
 *
 * @typedef {Object} TimingDebugV11
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
 * @typedef {Object} TimingResponse
 * @property {TimingEngineVersion} engineVersion
 * @property {TimingLaneId} lane
 * @property {TimingRitualModeTh} ritualMode
 * @property {TimingConfidence} confidence
 * @property {TimingOwnerProfile} ownerProfile
 * @property {TimingSlot[]} bestHours
 * @property {TimingSlot[]} bestWeekdays
 * @property {TimingSlot[]} bestDateRoots
 * @property {TimingSlot[]} avoidHours
 * @property {TimingSlot[]} [allWeekdayScores] — Sunday-first weekday_0..6, pre-sort
 * @property {TimingSlot[]} [allHourScores] — TIMING_HOUR_WINDOWS order, pre-sort
 * @property {TimingSummary} summary
 * @property {TimingDebugV11} [debug]
 */

export {};
