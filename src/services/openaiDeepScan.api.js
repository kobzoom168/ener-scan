import OpenAI from "openai";
import { env } from "../config/env.js";

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * Layer 1: gpt-4.1-mini — image + birthdate → draft (fixed format).
 */
export async function generateDeepScanDraft({
  systemPrompt,
  userPrompt,
  imageBase64,
  mimeType = "image/jpeg",
}) {
  const startedAt = Date.now();

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
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

  const text = String(response.output_text || "").trim();

  console.log("[OPENAI_DRAFT_TIMING]", {
    model: "gpt-4.1-mini",
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

  const response = await openai.responses.create({
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
  });

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
