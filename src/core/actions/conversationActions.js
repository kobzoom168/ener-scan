/**
 * Tool-style execution for Gemini-validated actions.
 * Mutations must live in delegates (wired from lineWebhook) to avoid circular imports.
 */

/**
 * @param {{
 *   resolvedAction: string,
 *   delegates: import('./conversationAction.types.js').GeminiFrontDelegates,
 * }} p
 * @returns {Promise<{ handled: boolean }>}
 */
export async function executeConversationAction(p) {
  const a = String(p.resolvedAction || "").trim();
  const d = p.delegates || {};

  switch (a) {
    case "send_qr_bundle":
      if (typeof d.sendQrBundle === "function") {
        const ok = await d.sendQrBundle();
        return { handled: Boolean(ok) };
      }
      return { handled: false };
    case "send_help_reply":
      if (typeof d.sendHelpDeterministic === "function") {
        const ok = await d.sendHelpDeterministic();
        return { handled: Boolean(ok) };
      }
      return { handled: false };
    case "get_payment_status":
      if (typeof d.getPaymentStatusReply === "function") {
        const ok = await d.getPaymentStatusReply();
        return { handled: Boolean(ok) };
      }
      return { handled: false };
    case "set_birthdate":
      if (typeof d.setBirthdateFromText === "function") {
        const ok = await d.setBirthdateFromText();
        return { handled: Boolean(ok) };
      }
      return { handled: false };
    case "select_package":
      if (typeof d.selectPackageFromText === "function") {
        const ok = await d.selectPackageFromText();
        return { handled: Boolean(ok) };
      }
      return { handled: false };
    case "create_or_reuse_payment":
      if (typeof d.createOrReusePayment === "function") {
        const ok = await d.createOrReusePayment();
        return { handled: Boolean(ok) };
      }
      return { handled: false };
    case "get_conversation_context":
    case "handoff_to_scan":
    case "mark_pending_verify":
    case "noop_phrase_only":
      return { handled: false };
    default:
      return { handled: false };
  }
}
