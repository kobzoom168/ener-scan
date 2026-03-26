/**
 * Slip classification gate — fail-closed; only slipGate.service decides accept.
 *
 * @typedef {'likely_slip' | 'chat_screenshot' | 'object_photo' | 'other_image'} SlipLabel
 *
 * @typedef {'accept' | 'reject' | 'unclear'} SlipGateDecision
 *
 * @typedef {{
 *   amountVisible: boolean,
 *   dateTimeVisible: boolean,
 *   bankOrWalletUi: boolean,
 *   referenceLikeText: boolean,
 * }} SlipEvidenceSignals
 *
 * @typedef {{
 *   decision: SlipGateDecision,
 *   slipLabel: SlipLabel,
 *   slipEvidenceScore: number,
 *   rejectReason?: string,
 *   path: 'deterministic' | 'vision' | 'vision_disabled',
 * }} SlipGateResult
 */

export {};
