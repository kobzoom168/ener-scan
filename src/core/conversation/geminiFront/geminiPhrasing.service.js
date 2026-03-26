import { env } from "../../../config/env.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
  isGeminiConfigured,
} from "../../../integrations/gemini/geminiFlash.api.js";
import {
  GEMINI_PHRASING_SYSTEM,
  buildPhrasingUserPrompt,
} from "./geminiPhrasingPrompt.js";
import { logGeminiPhrasing } from "./geminiFront.telemetry.js";

export async function runGeminiPhrasing({
  allowedFacts,
  nextStep,
  replyStyle,
  userText,
}) {
  if (!isGeminiConfigured()) {
    logGeminiPhrasing({ outcome: "skipped_no_api_key" });
    return null;
  }
  const model = getGeminiFlashModel({
    systemInstruction: GEMINI_PHRASING_SYSTEM,
    jsonMode: false,
  });
  if (!model) return null;

  const prompt = buildPhrasingUserPrompt({
    allowedFacts,
    nextStep,
    replyStyle,
    userText,
  });
  try {
    const text = await generateTextWithTimeout(
      model,
      prompt,
      env.GEMINI_FRONT_TIMEOUT_MS,
    );
    const out = String(text || "").trim();
    logGeminiPhrasing({ outcome: "ok", len: out.length });
    return out || null;
  } catch (e) {
    logGeminiPhrasing({
      outcome: "error",
      message: e?.message || String(e),
    });
    return null;
  }
}
