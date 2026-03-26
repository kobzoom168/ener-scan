import { openai } from "../../services/openaiDeepScan.api.js";
import { env } from "../../config/env.js";
import { buildConversationRephrasePrompts } from "./conversationPromptAdapter.js";

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("conv_ai_timeout")), ms),
    ),
  ]);
}

/**
 * @param {import("./contracts.types.js").LLMSurfaceInput} input
 * @returns {Promise<{ text: string, model: string }>}
 */
export async function rephraseWithConversationModel(input) {
  const model = env.CONV_AI_MODEL || "gpt-4.1-mini";
  const { system, user } = buildConversationRephrasePrompts(input);

  const started = Date.now();
  const response = await withTimeout(
    openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: system }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: user }],
        },
      ],
      temperature: 0.35,
      max_output_tokens: 220,
    }),
    env.CONV_AI_TIMEOUT_MS,
  );

  const raw = String(response.output_text || "").trim();
  let text = "";
  try {
    const parsed = JSON.parse(raw);
    text = String(parsed.text || "").trim();
  } catch {
    throw new Error("conv_ai_invalid_json");
  }

  if (!text) {
    throw new Error("conv_ai_empty_text");
  }

  console.log(
    JSON.stringify({
      event: "CONV_AI_TIMING",
      model,
      ms: Date.now() - started,
      outputLength: text.length,
    }),
  );

  return { text, model };
}
