import { env } from "../../../config/env.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
  isGeminiConfigured,
} from "../../../integrations/gemini/geminiFlash.api.js";
import { GEMINI_CONSULT_SYSTEM, buildConsultUserPrompt } from "./geminiConsultPrompt.js";
import { buildScanHistoryContext } from "./recentScanContext.util.js";
import { buildCustomerFactsContext } from "./customerFactsContext.util.js";
import { buildKbContext } from "./kbRetrieval.util.js";

/**
 * Answer an amulet/crystal KNOWLEDGE question as อาจารย์ Ener (grounded + guarded).
 * Runs on the front LLM (OpenRouter). Returns the Thai answer, or null when
 * disabled / not configured / model failed (caller falls back to a generic reply).
 *
 * @param {{ userId?: string, userText: string, conversationHistory?: { role: string, text: string }[] }} p
 * @returns {Promise<string | null>}
 */
export async function runGeminiConsult(p) {
  if (!env.GEMINI_CONSULT_ENABLED) return null;
  if (!isGeminiConfigured()) return null;

  // Phase B: best-effort personalization from the user's own scan history
  // (multiple pieces, so it can compare "องค์ไหนแรงสุด/ดีสุด" + link the report)
  // + real account facts (birthdate on file, free/paid quota) so the model
  // never re-asks known data or guesses service rules.
  let recentScan = null;
  let customerFacts = null;
  let kbContext = null;
  const kbPromise = buildKbContext(p.userText).catch(() => null);
  if (p.userId) {
    [recentScan, customerFacts, kbContext] = await Promise.all([
      buildScanHistoryContext(p.userId, 6).catch(() => null),
      buildCustomerFactsContext(p.userId).catch(() => null),
      kbPromise,
    ]);
  } else {
    kbContext = await kbPromise;
  }

  const model = getGeminiFlashModel({
    systemInstruction: GEMINI_CONSULT_SYSTEM,
    jsonMode: false,
    temperature: 0.7,
    timeoutMs: env.GEMINI_CONSULT_TIMEOUT_MS,
    maxTokens: 1536,
    // Customer-visible replies deserve the smartest brain; planner/phrasing
    // stay on the cheap fast model. e.g. LLM_CONSULT_MODEL=anthropic/claude-opus-4.8
    modelOverride: env.LLM_CONSULT_MODEL,
  });
  if (!model) return null;

  const prompt = buildConsultUserPrompt({
    userText: p.userText,
    conversationHistory: p.conversationHistory,
    recentScan,
    customerFacts,
    kbContext,
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
        hasRecentScan: Boolean(recentScan),
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
