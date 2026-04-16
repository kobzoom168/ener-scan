/**
 * @typedef {"waiting_birthdate" | "birthdate_change_waiting_date" | "paywall_offer_single" | "awaiting_slip" | "pending_verify" | "unknown"} SemanticCatcherState
 *
 * @typedef {"provide_birthdate" | "confirm_yes" | "confirm_no" | "pay_intent" | "package_ack" | "resend_qr" | "status_check" | "slip_claim_without_image" | "wait_tomorrow" | "generic_ack" | "birthdate_change_intent" | "explain_offer_value" | "explain_next_step" | "explain_how_scan_works" | "explain_single_image_rule" | "recommendation_question" | "off_topic_recoverable" | "unknown"} SemanticCatcherIntent
 *
 * @typedef {{
 *   birthdate_candidate: string | null,
 *   package_candidate_text: string | null,
 *   status_phrase: string | null,
 * }} SemanticCatcherExtracted
 *
 * @typedef {{
 *   intent: SemanticCatcherIntent,
 *   confidence: number,
 *   safe_to_consume: boolean,
 *   state_guess: SemanticCatcherState,
 *   extracted: SemanticCatcherExtracted,
 *   reason_short: string,
 * }} SemanticCatcherOutput
 */
export const SEMANTIC_CATCHER_ALLOWED_INTENTS = [
  "provide_birthdate",
  "confirm_yes",
  "confirm_no",
  "pay_intent",
  "package_ack",
  "resend_qr",
  "status_check",
  "slip_claim_without_image",
  "wait_tomorrow",
  "generic_ack",
  "birthdate_change_intent",
  "explain_offer_value",
  "explain_next_step",
  "explain_how_scan_works",
  "explain_single_image_rule",
  "recommendation_question",
  "off_topic_recoverable",
  "unknown",
];

export const SEMANTIC_CATCHER_ALLOWED_STATES = [
  "waiting_birthdate",
  "birthdate_change_waiting_date",
  "paywall_offer_single",
  "awaiting_slip",
  "pending_verify",
  "unknown",
];

