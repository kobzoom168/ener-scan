/**
 * Builds short deterministic-safe prompts for Thai rephrase (no routing).
 * @param {import("./contracts.types.js").LLMSurfaceInput} input
 */
export function buildConversationRephrasePrompts(input) {
  const facts = (input.allowedFacts || [])
    .map((f) => `${f.key}=${f.value}`)
    .join("; ");

  const tierNote =
    input.guidanceTier >= 3
      ? "Keep it very short (1–2 sentences)."
      : input.guidanceTier === 2
        ? "Keep it concise (2–3 short sentences)."
        : "Warm, natural Thai; keep reasonable length.";

  const system = [
    "You rewrite outbound Thai chat messages for a LINE bot.",
    "Rules: output ONLY valid JSON with key \"text\" (string). No markdown, no code fences.",
    "Do not add facts, prices, payment outcomes, package names, URLs, or new steps.",
    "Do not claim payment is approved, verified, or completed unless explicitly in allowed facts.",
    "Preserve every must-keep fact exactly as given (same digits for prices and refs).",
    "Do not change what the user should do next; only soften tone.",
    tierNote,
  ].join(" ");

  const user = [
    `stateOwner=${input.stateOwner}`,
    `replyType=${input.replyType}`,
    `nextStep(internal)=${input.nextStep}`,
    `guidanceTier=${input.guidanceTier}`,
    `microIntent=${input.microIntent || "unknown"}`,
    `allowedFacts: ${facts || "(none)"}`,
    "",
    "baseline_message (meaning must stay identical; phrasing may vary):",
    input.deterministicBaseline,
    "",
    "user_last_message:",
    input.lastUserText || "(empty)",
  ].join("\n");

  return { system, user };
}
