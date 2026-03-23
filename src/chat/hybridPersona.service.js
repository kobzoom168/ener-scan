import { env } from "../config/env.js";
import { openai } from "../services/openaiDeepScan.api.js";
import {
  HYBRID_PERSONA_ALLOWED_TYPE_SET,
  getHybridPersonaPolicy,
} from "./hybridPersona.config.js";
import {
  buildHybridPersonaSystemPrompt,
  buildHybridPersonaUserPrompt,
} from "./hybridPersona.prompt.js";
import { validateHybridPersonaOutput } from "./hybridPersona.validator.js";
import { fallbackHybridPersona } from "./hybridPersona.fallback.js";

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("hybrid_persona_timeout")), timeoutMs)
    ),
  ]);
}

/**
 * @param {{
 *   userId: string,
 *   replyType: string,
 *   state: string,
 *   userMessage?: string,
 *   fallbackMessages: string[],
 * }} input
 * @returns {Promise<{ messages: string[], usedAi: boolean, fallbackReason?: string }>}
 */
export async function generateHybridPersonaMessages(input) {
  const replyType = String(input.replyType || "").trim();
  const userId = String(input.userId || "").trim();
  const fallbackMessages = (input.fallbackMessages || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  if (!env.HYBRID_PERSONA_ENABLED) {
    return {
      messages: fallbackHybridPersona({
        userId,
        replyType,
        fallbackMessages,
        reason: "hybrid_disabled",
      }),
      usedAi: false,
      fallbackReason: "hybrid_disabled",
    };
  }
  if (!HYBRID_PERSONA_ALLOWED_TYPE_SET.has(replyType)) {
    return {
      messages: fallbackHybridPersona({
        userId,
        replyType,
        fallbackMessages,
        reason: "type_not_allowed",
      }),
      usedAi: false,
      fallbackReason: "type_not_allowed",
    };
  }
  const policy = getHybridPersonaPolicy(replyType);
  if (!policy) {
    return {
      messages: fallbackHybridPersona({
        userId,
        replyType,
        fallbackMessages,
        reason: "policy_missing",
      }),
      usedAi: false,
      fallbackReason: "policy_missing",
    };
  }

  const payload = {
    persona: "Ajarn Ener",
    replyType,
    state: String(input.state || policy.state || "").trim(),
    userMessage: String(input.userMessage || "").trim(),
    goal: policy.goal,
    requiredPhrases: policy.requiredPhrases || [],
    forbiddenPhrases: policy.forbiddenPhrases || [],
    styleRules: {
      thaiOnly: true,
      casualPolite: true,
      maxMessages: policy.maxMessages || 3,
      maxCharsPerMessage: policy.maxCharsPerMessage || 90,
      noEmoji: true,
      noIcons: true,
    },
  };

  try {
    const startedAt = Date.now();
    const res = await withTimeout(
      openai.responses.create({
        model: env.HYBRID_PERSONA_MODEL,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: buildHybridPersonaSystemPrompt() }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: buildHybridPersonaUserPrompt(payload) }],
          },
        ],
        temperature: 0.7,
      }),
      env.HYBRID_PERSONA_TIMEOUT_MS
    );

    const raw = String(res.output_text || "").trim();
    const checked = validateHybridPersonaOutput(raw, {
      requiredPhrases: payload.requiredPhrases,
      forbiddenPhrases: payload.forbiddenPhrases,
      maxMessages: payload.styleRules.maxMessages,
      maxCharsPerMessage: payload.styleRules.maxCharsPerMessage,
    });

    if (!checked.ok) {
      return {
        messages: fallbackHybridPersona({
          userId,
          replyType,
          fallbackMessages,
          reason: checked.reason,
        }),
        usedAi: false,
        fallbackReason: checked.reason,
      };
    }

    console.log("[HYBRID_PERSONA_AI_OK]", {
      userId,
      replyType,
      ms: Date.now() - startedAt,
      n: checked.messages.length,
    });

    return { messages: checked.messages, usedAi: true };
  } catch (err) {
    return {
      messages: fallbackHybridPersona({
        userId,
        replyType,
        fallbackMessages,
        reason: err?.message || "hybrid_error",
      }),
      usedAi: false,
      fallbackReason: err?.message || "hybrid_error",
    };
  }
}

