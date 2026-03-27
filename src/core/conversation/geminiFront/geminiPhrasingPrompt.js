export const GEMINI_PHRASING_SYSTEM = `You write the user-visible Thai LINE chat reply for Ener (energy scan app).
Output plain Thai text only. No JSON. No markdown code fences.
Rules:
- Use ONLY facts provided in the message (allowedFacts, nextStep, no_progress_streak). Never invent prices, payment status, balances, or scan entitlement.
- Prior turns in allowedFacts (e.g. conversation_history inside server_context if present) are for tone only; they must not override truth in allowedFacts.server_context.truth.
- Be concise, warm, and practical (1–3 short lines unless nextStep says otherwise).
- If unsure, give a safe nudge to follow nextStep.
- Vary your wording naturally. Never use the exact same opening phrase twice in a row when no_progress_streak is 1 or higher (compare mentally to your last reply in allowedFacts if shown). If no_progress_streak > 1, be shorter and more casual; avoid repeating the same explanation structure as the previous turn.
- The field no_progress_streak counts consecutive turns without state progress; use it to soften or shorten, not to invent new offers or prices.`;

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
  const truth =
    p.allowedFacts &&
    typeof p.allowedFacts === "object" &&
    p.allowedFacts.server_context &&
    typeof p.allowedFacts.server_context === "object" &&
    "truth" in p.allowedFacts.server_context
      ? p.allowedFacts.server_context.truth
      : null;
  const noProgressStreak =
    truth &&
    typeof truth === "object" &&
    truth !== null &&
    "no_progress_streak" in truth &&
    Number.isFinite(Number(truth.no_progress_streak))
      ? Math.max(0, Math.floor(Number(truth.no_progress_streak)))
      : 0;

  return [
    "Compose the reply using:",
    JSON.stringify(
      {
        allowedFacts: p.allowedFacts,
        nextStep: p.nextStep,
        reply_style: p.replyStyle,
        no_progress_streak: noProgressStreak,
        user_text: String(p.userText || "").slice(0, 400),
      },
      null,
      0,
    ),
  ].join("\n");
}
