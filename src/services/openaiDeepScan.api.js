import OpenAI from "openai";
import { env } from "../config/env.js";

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const OPENAI_RATE_LIMIT_RETRY_MS = 10_000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isOpenAi429Error(err) {
  if (!err || typeof err !== "object") return false;
  if (/** @type {{ status?: number }} */ (err).status === 429) return true;
  const res = /** @type {{ response?: { status?: number } }} */ (err).response;
  if (res?.status === 429) return true;
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
 * Layer 1: gpt-4o — image + prompts → draft (JSON scan contract → rendered client-side).
 */
export async function generateDeepScanDraft({
  systemPrompt,
  userPrompt,
  imageBase64,
  mimeType = "image/jpeg",
}) {
  const startedAt = Date.now();

  const response = await withOpenAi429RetryOnce(() =>
    openai.responses.create({
      model: "gpt-4o",
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
    }),
  );

  const text = String(response.output_text || "").trim();

  console.log("[OPENAI_DRAFT_TIMING]", {
    model: "gpt-4o",
    ms: Date.now() - startedAt,
    outputLength: text.length,
  });

  if (!text) {
    throw new Error("OpenAI returned empty output_text (draft)");
  }

  return text;
}

/**
 * Layer 2: gpt-4o — rewrite draft (same format, polished language).
 */
export async function rewriteDeepScanDraft({ systemPrompt, userPrompt }) {
  const startedAt = Date.now();

  const response = await withOpenAi429RetryOnce(() =>
    openai.responses.create({
      model: "gpt-4o",
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
    }),
  );

  const text = String(response.output_text || "").trim();

  console.log("[OPENAI_REWRITE_TIMING]", {
    model: "gpt-4o",
    ms: Date.now() - startedAt,
    outputLength: text.length,
  });

  if (!text) {
    throw new Error("OpenAI returned empty output_text (rewrite)");
  }

  return text;
}
