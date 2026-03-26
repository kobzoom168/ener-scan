/**
 * @typedef {'noop_phrase_only' | 'send_help_reply' | 'send_qr_bundle' | 'get_payment_status' | 'set_birthdate' | 'select_package' | 'create_or_reuse_payment' | 'get_conversation_context' | 'handoff_to_scan' | 'mark_pending_verify'} ConversationResolvedAction
 */

/**
 * @typedef {{
 *   sendQrBundle?: () => Promise<boolean>,
 *   sendHelpDeterministic?: () => Promise<boolean>,
 *   getPaymentStatusReply?: () => Promise<boolean>,
 *   setBirthdateFromText?: () => Promise<boolean>,
 *   selectPackageFromText?: () => Promise<boolean>,
 *   createOrReusePayment?: () => Promise<boolean>,
 * }} GeminiFrontDelegates
 */

export {};
