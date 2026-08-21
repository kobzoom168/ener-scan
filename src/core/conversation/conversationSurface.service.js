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

  {
    // P0-6: งบเรียกโมเดลที่ลูกค้าเห็นต่อเทิร์น ≤2 (ร่วมกับ consult/phrasing/clarifier)
    const { getCustomerAiBudget } = await import("../telemetry/turnAiChain.js");
    const budget = getCustomerAiBudget(2);
    if (budget && budget.attempted >= budget.max) {
      throw new Error("turn_ai_budget_exhausted");
    }
    if (budget) budget.attempted += 1;
  }

  const started = Date.now();
  const response = await withTimeout(
    openai.responses.create({
      user: "conversationSurface",
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

  // เฟส 2: rephrase พูดได้เฉพาะข้อเท็จจริงที่ส่งเข้าไป — เลข/พลัง/วัดที่แต่งเอง = โยน
  // ให้ caller ตกไป deterministic copy (fail-closed ห้ามส่งของที่ถูก reject)
  {
    const { checkLlmCustomerOutput, evidenceFromAllowedFacts } = await import(
      "./llmOutputContract.util.js"
    );
    const res = checkLlmCustomerOutput({
      text,
      userText: input?.userText || "",
      userIntent: "conversation_rephrase",
      userAskedAdvice: false,
      requiredNextAction: Boolean(input?.nextStep),
      expectedRole: "admin",
      allowQuestion: false,
      evidence: evidenceFromAllowedFacts(input?.facts ?? input?.allowedFacts ?? input),
    });
    if (!res.ok) {
      console.log(
        JSON.stringify({
          event: "LLM_TONE_REJECTED",
          callSite: "conversation_surface",
          replyType: "rephrase",
          violations: res.violations,
          evidencePresent: true,
        }),
      );
      throw new Error("conv_ai_contract_rejected");
    }
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
