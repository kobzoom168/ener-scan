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
import { logConversationCost } from "../utils/conversationCost.util.js";

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
 *   stateOwner: string,
 *   usedAi: boolean,
 *   fallbackToDeterministic: boolean,
 *   fallbackReason?: string | null,
 *   modelUsed?: string | null,
 * }} p
 */
function logHybridConvCost(p) {
  logConversationCost({
    layer: "layer3_hybrid",
    aiPath: "hybrid_persona",
    userId: p.userId,
    replyType: p.replyType,
    stateOwner: p.stateOwner || null,
    usedAi: p.usedAi,
    modelUsed: p.modelUsed ?? null,
    fallbackToDeterministic: p.fallbackToDeterministic,
    fallbackReason: p.fallbackReason ?? null,
    suppressedDuplicate: false,
    softVerifyTriggered: false,
    softVerifyPassed: false,
  });
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
  const stateOwner = String(input.state || "").trim();
  const fallbackMessages = (input.fallbackMessages || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  if (!env.HYBRID_PERSONA_ENABLED) {
    const out = {
      messages: fallbackHybridPersona({
        userId,
        replyType,
        fallbackMessages,
        reason: "hybrid_disabled",
      }),
      usedAi: false,
      fallbackReason: "hybrid_disabled",
    };
    logHybridConvCost({
      userId,
      replyType,
      stateOwner,
      usedAi: false,
      fallbackToDeterministic: true,
      fallbackReason: out.fallbackReason,
      modelUsed: null,
    });
    return out;
  }
  if (!HYBRID_PERSONA_ALLOWED_TYPE_SET.has(replyType)) {
    const out = {
      messages: fallbackHybridPersona({
        userId,
        replyType,
        fallbackMessages,
        reason: "type_not_allowed",
      }),
      usedAi: false,
      fallbackReason: "type_not_allowed",
    };
    logHybridConvCost({
      userId,
      replyType,
      stateOwner,
      usedAi: false,
      fallbackToDeterministic: true,
      fallbackReason: out.fallbackReason,
      modelUsed: null,
    });
    return out;
  }
  const policy = getHybridPersonaPolicy(replyType);
  if (!policy) {
    const out = {
      messages: fallbackHybridPersona({
        userId,
        replyType,
        fallbackMessages,
        reason: "policy_missing",
      }),
      usedAi: false,
      fallbackReason: "policy_missing",
    };
    logHybridConvCost({
      userId,
      replyType,
      stateOwner,
      usedAi: false,
      fallbackToDeterministic: true,
      fallbackReason: out.fallbackReason,
      modelUsed: null,
    });
    return out;
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
      const out = {
        messages: fallbackHybridPersona({
          userId,
          replyType,
          fallbackMessages,
          reason: checked.reason,
        }),
        usedAi: false,
        fallbackReason: checked.reason,
      };
      logHybridConvCost({
        userId,
        replyType,
        stateOwner: payload.state,
        usedAi: false,
        fallbackToDeterministic: true,
        fallbackReason: out.fallbackReason,
        modelUsed: env.HYBRID_PERSONA_MODEL,
      });
      return out;
    }

    logHybridConvCost({
      userId,
      replyType,
      stateOwner: payload.state,
      usedAi: true,
      fallbackToDeterministic: false,
      fallbackReason: null,
      modelUsed: env.HYBRID_PERSONA_MODEL,
    });
    console.log("[HYBRID_PERSONA_AI_OK]", {
      userId,
      replyType,
      ms: Date.now() - startedAt,
      n: checked.messages.length,
    });

    return { messages: checked.messages, usedAi: true };
  } catch (err) {
    const reason = err?.message || "hybrid_error";
    const out = {
      messages: fallbackHybridPersona({
        userId,
        replyType,
        fallbackMessages,
        reason,
      }),
      usedAi: false,
      fallbackReason: reason,
    };
    logHybridConvCost({
      userId,
      replyType,
      stateOwner: payload.state,
      usedAi: false,
      fallbackToDeterministic: true,
      fallbackReason: out.fallbackReason,
      modelUsed: env.HYBRID_PERSONA_MODEL,
    });
    return out;
  }
}

