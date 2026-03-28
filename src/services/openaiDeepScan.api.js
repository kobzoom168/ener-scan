import OpenAI from "openai";
import { env } from "../config/env.js";

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/** Model id sent to `openai.responses.create` for deep-scan draft + rewrite. */
const OPENAI_DEEP_SCAN_RESPONSES_MODEL = "gpt-4.1-mini";

const OPENAI_RATE_LIMIT_RETRY_MS = 10_000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isOpenAi429Error(err) {
  if (!err || typeof err !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (err);
  if (o.status === 429) return true;
  const res = /** @type {{ status?: number } | undefined} */ (o.response);
  if (res?.status === 429) return true;
  const code = String(o.code || "");
  if (code === "rate_limit_exceeded" || code.includes("429")) return true;
  const nested = /** @type {{ code?: string } | undefined} */ (o.error);
  if (nested && String(nested.code || "") === "rate_limit_exceeded") return true;
  const msg = String(o.message || "").toLowerCase();
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests"))
    return true;
  return false;
}

/**
 * Wraps an OpenAI API call: on HTTP 429, wait 10s and retry once.
 * Second 429 → throws `new Error("rate_limit")`.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withOpenAi429RetryOnce(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!isOpenAi429Error(err)) throw err;
    console.log("[OPENAI_RATE_LIMIT] 429 received, retrying in 10s");
    await sleep(OPENAI_RATE_LIMIT_RETRY_MS);
    try {
      return await fn();
    } catch (err2) {
      if (isOpenAi429Error(err2)) throw new Error("rate_limit");
      throw err2;
    }
  }
}

/**
 * Layer 1: gpt-4.1-mini — image + prompts → draft (JSON scan contract → rendered client-side).
 */
export async function generateDeepScanDraft({
  systemPrompt,
  userPrompt,
  imageBase64,
  mimeType = "image/jpeg",
}) {
  const startedAt = Date.now();

  const response = await withOpenAi429RetryOnce(() => {
    const model = OPENAI_DEEP_SCAN_RESPONSES_MODEL;
    console.log("[OPENAI_MODEL]", model);
    return openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${imageBase64}`,
            },
          ],
        },
      ],
      temperature: 0.7,
    });
  });

  const text = String(response.output_text || "").trim();

  console.log("[OPENAI_DRAFT_TIMING]", {
    model: OPENAI_DEEP_SCAN_RESPONSES_MODEL,
    ms: Date.now() - startedAt,
    outputLength: text.length,
  });

  if (!text) {
    throw new Error("OpenAI returned empty output_text (draft)");
  }

  return text;
}

/**
 * Layer 2: gpt-4.1-mini — rewrite draft (same format, polished language).
 */
export async function rewriteDeepScanDraft({ systemPrompt, userPrompt }) {
  const startedAt = Date.now();

  const response = await withOpenAi429RetryOnce(() => {
    const model = OPENAI_DEEP_SCAN_RESPONSES_MODEL;
    console.log("[OPENAI_MODEL]", model);
    return openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
      temperature: 0.8,
    });
  });

  const text = String(response.output_text || "").trim();

  console.log("[OPENAI_REWRITE_TIMING]", {
    model: OPENAI_DEEP_SCAN_RESPONSES_MODEL,
    ms: Date.now() - startedAt,
    outputLength: text.length,
  });

  if (!text) {
    throw new Error("OpenAI returned empty output_text (rewrite)");
  }

  return text;
}
