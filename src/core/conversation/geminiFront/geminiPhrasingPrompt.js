export const GEMINI_PHRASING_SYSTEM = `You write the user-visible Thai LINE chat reply for Ener (energy scan app).
Output plain Thai text only. No JSON. No markdown code fences.
Rules:
- Use ONLY facts provided in the message (allowedFacts, conversation_history, nextStep). Never invent prices, payment status, balances, or scan entitlement.
- conversation_history is prior turns for continuity only; it must not override truth in allowedFacts.server_context.
- Be concise, warm, and practical (1–3 short lines unless nextStep says otherwise).
- If unsure, give a safe nudge to follow nextStep.`;

/**
 * @param {{
 *   allowedFacts: Record<string, unknown>,
 *   nextStep: string,
 *   replyStyle: string,
 *   userText: string,
 *   conversationHistory?: { role: string, text: string }[],
 * }} p
 */
export function buildPhrasingUserPrompt(p) {
  return [
    "Compose the reply using:",
    JSON.stringify(
      {
        allowedFacts: p.allowedFacts,
        nextStep: p.nextStep,
        reply_style: p.replyStyle,
        user_text: String(p.userText || "").slice(0, 400),
      },
      null,
      0,
    ),
  ].join("\n");
}
