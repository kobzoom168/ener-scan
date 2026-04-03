/**
 * Shared JSDoc contracts for deterministic conversation core + LLM surface (Phase A).
 * Runtime: no exports required; import this file for typedefs only where needed.
 */

/**
 * @typedef {'idle'|'waiting_birthdate'|'paywall_selecting_package'|'payment_package_selected'|'awaiting_slip'|'pending_verify'|'paid_active_scan_ready'|'soft_locked'|'hard_blocked'|'object_gate'} StateOwner
 */

/**
 * @typedef {1|2|3} GuidanceTierNumeric
 */

/**
 * @typedef {object} ActiveStateResolutionInput
 * @property {string} userId
 * @property {boolean} hardBlocked
 * @property {boolean} softLockedScan
 * @property {boolean} hasAwaitingPaymentInteractive
 * @property {'none'|'awaiting_slip'|'pending_verify'|'paywall'|'package_selected'} paymentInteractiveKind
 * @property {boolean} waitingBirthdateForScan
 * @property {boolean} accessPaidReady — true when `checkScanAccess().allowed` (free or paid)
 * @property {boolean} explicitCommandOrUtility
 * @property {number} [noProgressStreak] — optional session streak from `getGuidanceNoProgressCount` (wired at webhook later)
 */

/**
 * @typedef {object} ActiveStateResolution
 * @property {StateOwner} stateOwner
 * @property {string} expectedInputKind
 * @property {number} noProgressStreak
 * @property {string} resolutionReason
 */

/**
 * @typedef {object} MicroIntentResult
 * @property {string} microIntent
 * @property {'high'|'medium'|'low'} confidence
 * @property {boolean} safeToConsume
 * @property {string} [reason]
 */

/**
 * @typedef {object} ReplyTypeResult
 * @property {string} replyType
 * @property {string} nextStep
 * @property {GuidanceTierNumeric} guidanceTier
 */

/**
 * @typedef {object} AllowedFact
 * @property {string} key
 * @property {string} value
 * @property {boolean} [mustPreserveInOutput]
 */

/**
 * @typedef {object} ReplyContract
 * @property {StateOwner} stateOwner
 * @property {string} replyType
 * @property {AllowedFact[]} allowedFacts
 * @property {string} nextStep
 * @property {GuidanceTierNumeric} guidanceTier
 * @property {boolean} llmEnabled
 * @property {string} [validatorProfile]
 * @property {string} [fallbackMode]
 * @property {string} [microIntent]
 */

/**
 * @typedef {object} LLMSurfaceInput
 * @property {StateOwner} stateOwner
 * @property {string} replyType
 * @property {AllowedFact[]} allowedFacts
 * @property {string} nextStep
 * @property {GuidanceTierNumeric} guidanceTier
 * @property {string} lastUserText
 * @property {string} microIntent
 * @property {string} fallbackMode
 * @property {string} deterministicBaseline
 */

/**
 * @typedef {object} LLMSurfaceOutput
 * @property {string} text
 * @property {string} [toneProfile]
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} violations
 * @property {string} [fallbackReason]
 */

/**
 * @typedef {object} EdgeGateDecision
 * @property {boolean} shouldContinue
 * @property {string} edgeGateAction
 * @property {string} normalizedText
 * @property {string} [reason]
 */

export {};
