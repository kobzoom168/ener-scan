import { env } from "../../../config/env.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
  isGeminiConfigured,
} from "../../../integrations/gemini/geminiFlash.api.js";
import { GEMINI_CONSULT_SYSTEM, buildConsultUserPrompt } from "./geminiConsultPrompt.js";

/**
 * Answer an amulet/crystal KNOWLEDGE question as อาจารย์ Ener (grounded + guarded).
 * Runs on the front LLM (OpenRouter). Returns the Thai answer, or null when
 * disabled / not configured / model failed (caller falls back to a generic reply).
 *
 * @param {{ userText: string, conversationHistory?: { role: string, text: string }[] }} p
 * @returns {Promise<string | null>}
 */
export async function runGeminiConsult(p) {
  if (!env.GEMINI_CONSULT_ENABLED) return null;
  if (!isGeminiConfigured()) return null;

  const model = getGeminiFlashModel({
    systemInstruction: GEMINI_CONSULT_SYSTEM,
    jsonMode: false,
    temperature: 0.7,
    timeoutMs: env.GEMINI_CONSULT_TIMEOUT_MS,
    maxTokens: 1536,
  });
  if (!model) return null;

  const prompt = buildConsultUserPrompt({
    userText: p.userText,
    conversationHistory: p.conversationHistory,
  });

  try {
    const text = await generateTextWithTimeout(
      model,
      prompt,
      env.GEMINI_CONSULT_TIMEOUT_MS,
    );
    const out = String(text || "").trim();
    console.log(
      JSON.stringify({
        event: "GEMINI_CONSULT",
        outcome: out ? "ok" : "empty",
        len: out.length,
      }),
    );
    return out || null;
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "GEMINI_CONSULT",
        outcome: "error",
        message: (e && e.message) || String(e),
      }),
    );
    return null;
  }
}
