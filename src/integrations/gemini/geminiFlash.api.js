/**
 * Front conversation LLM client (planner, phrasing, semanticCatcher, stateSafeClarifier).
 *
 * Supports two providers, selected by env.LLM_FRONT_PROVIDER:
 * - "google":     direct Gemini API via @google/generative-ai (GEMINI_API_KEY / GOOGLE_API_KEY)
 * - "openrouter": OpenAI-compatible OpenRouter endpoint (OPENROUTER_API_KEY)
 *
 * Both providers return a model object exposing `generateContent(prompt)` that resolves
 * to `{ response: { text(): string } }`, so callers stay provider-agnostic.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { env } from "../../config/env.js";

let _googleClient = null;
let _openrouterClient = null;

function frontProvider() {
  return env.LLM_FRONT_PROVIDER === "openrouter" ? "openrouter" : "google";
}

function clampTemp(t, fallback) {
  return Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : fallback;
}

function getGoogleClient() {
  const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!key) return null;
  if (!_googleClient) {
    _googleClient = new GoogleGenerativeAI(String(key).trim());
  }
  return _googleClient;
}

function getOpenRouterClient() {
  const key = env.OPENROUTER_API_KEY;
  if (!key) return null;
  if (!_openrouterClient) {
    _openrouterClient = new OpenAI({
      apiKey: String(key).trim(),
      baseURL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      maxRetries: 0,
      defaultHeaders: {
        "HTTP-Referer": "https://my-ener.uk",
        "X-Title": "Ener Scan",
      },
    });
  }
  return _openrouterClient;
}

/**
 * @param {OpenAI} client
 * @param {{ systemInstruction?: string, jsonMode?: boolean, temperature?: number }} opts
 */
function buildOpenRouterModel(client, opts = {}) {
  const modelId = env.OPENROUTER_FRONT_MODEL || "google/gemini-2.5-flash-lite";
  const temperature = clampTemp(opts.temperature, 0.2);
  const systemInstruction = opts.systemInstruction;
  const jsonMode = Boolean(opts.jsonMode);
  return {
    async generateContent(userPrompt) {
      const messages = [];
      if (systemInstruction) {
        messages.push({ role: "system", content: String(systemInstruction) });
      }
      messages.push({ role: "user", content: String(userPrompt || "") });
      const resp = await client.chat.completions.create(
        {
          model: modelId,
          temperature,
          max_tokens: 1024,
          messages,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        },
        { timeout: env.GEMINI_FRONT_TIMEOUT_MS },
      );
      const text = resp?.choices?.[0]?.message?.content ?? "";
      return { response: { text: () => String(text || "") } };
    },
  };
}

/**
 * @param {{
 *   systemInstruction?: string,
 *   jsonMode?: boolean,
 *   timeoutMs?: number,
 *   temperature?: number,
 * }} opts
 */
export function getGeminiFlashModel(opts = {}) {
  if (frontProvider() === "openrouter") {
    const client = getOpenRouterClient();
    if (!client) return null;
    return buildOpenRouterModel(client, opts);
  }

  const client = getGoogleClient();
  if (!client) return null;
  const modelId = env.GEMINI_FRONT_MODEL || "gemini-2.5-flash-lite";
  const temperature = clampTemp(opts.temperature, 0.2);
  const generationConfig = {
    temperature,
    maxOutputTokens: 1024,
    ...(opts.jsonMode
      ? { responseMimeType: "application/json" }
      : {}),
  };
  return client.getGenerativeModel({
    model: modelId,
    systemInstruction: opts.systemInstruction,
    generationConfig,
  });
}

/** @returns {boolean} */
export function isGeminiConfigured() {
  return frontProvider() === "openrouter"
    ? Boolean(getOpenRouterClient())
    : Boolean(getGoogleClient());
}

/**
 * @param {{ generateContent: (p: string) => Promise<{ response: { text: () => string } }> }} model
 * @param {string} userPrompt
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
export async function generateTextWithTimeout(model, userPrompt, timeoutMs) {
  const ms = Math.max(400, Number(timeoutMs) || 3200);
  const run = model.generateContent(userPrompt).then((r) => {
    const text = r?.response?.text?.();
    return String(text || "").trim();
  });
  const timed = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("gemini_timeout")), ms);
  });
  return await Promise.race([run, timed]);
}
