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
  conversationHistory,
  turnBudget,
}) {
  // P0-6: งบเรียกโมเดลต่อเทิร์นใช้ร่วมกับ consult/guard ตัวอื่น
  if (turnBudget && turnBudget.attempted >= (turnBudget.max || 2)) {
    logGeminiPhrasing({ outcome: "skipped_budget_exhausted" });
    return null;
  }
  if (!isGeminiConfigured()) {
    logGeminiPhrasing({ outcome: "skipped_no_api_key" });
    return null;
  }
  const model = getGeminiFlashModel({
    callSite: "phrasing",
    systemInstruction: GEMINI_PHRASING_SYSTEM,
    jsonMode: false,
    temperature: env.GEMINI_FRONT_PHRASING_TEMPERATURE,
  });
  if (!model) return null;

  const prompt = buildPhrasingUserPrompt({
    allowedFacts,
    nextStep,
    replyStyle,
    userText,
    conversationHistory,
  });
  try {
    const text = await generateTextWithTimeout(
      model,
      prompt,
      env.GEMINI_FRONT_TIMEOUT_MS,
    );
    const out = String(text || "").trim();
    if (!out) return null;
    // เฟส 2: phrasing พูดได้เฉพาะสิ่งที่อยู่ใน allowedFacts — เลข/พลัง/วัสดุที่แต่งเอง = ตก
    const { enforceLlmCustomerOutput, evidenceFromAllowedFacts } = await import(
      "../llmOutputContract.util.js"
    );
    const guarded = await enforceLlmCustomerOutput(
      {
        callSite: "gemini_front_phrasing",
        replyType: "phrasing",
        userText,
        userIntent: "phrasing",
        userAskedAdvice: false,
        requiredNextAction: Boolean(nextStep),
        expectedRole: "admin",
        allowQuestion: false,
        evidence: evidenceFromAllowedFacts(allowedFacts),
        turnBudget,
      },
      {
        generate: async (directive) => {
          if (!directive) return out;
          const retry = await generateTextWithTimeout(
            model,
            `${prompt}\n\nแก้ตามนี้: ${directive}`,
            env.GEMINI_FRONT_TIMEOUT_MS,
          );
          return String(retry || "").trim();
        },
      },
    );
    logGeminiPhrasing({ outcome: "ok", len: guarded.text.length, source: guarded.source });
    return guarded.text || null;
  } catch (e) {
    logGeminiPhrasing({
      outcome: "error",
      message: e?.message || String(e),
    });
    return null;
  }
}
