/**
 * Front conversation LLM client (planner, phrasing, semanticCatcher, stateSafeClarifier).
 *
 * Supports multiple providers, selected by env.LLM_FRONT_PROVIDER:
 * - "google":      direct Gemini API via @google/generative-ai (GEMINI_API_KEY / GOOGLE_API_KEY)
 * - "openrouter":  OpenAI-compatible OpenRouter endpoint (OPENROUTER_API_KEY)
 * - "featherless": OpenAI-compatible Featherless.ai endpoint (FEATHERLESS_API_KEY)
 *
 * Every provider returns a model object exposing `generateContent(prompt)` that resolves
 * to `{ response: { text(): string } }`, so callers stay provider-agnostic.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { env } from "../../config/env.js";

let _googleClient = null;
/** @type {Record<string, OpenAI>} */
const _compatClients = {};

/** OpenAI-compatible providers (OpenRouter, Featherless): per-provider env resolution. */
const OPENAI_COMPAT = {
  openrouter: {
    apiKey: () => env.OPENROUTER_API_KEY,
    baseURL: () => env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    model: () => env.OPENROUTER_FRONT_MODEL || "google/gemini-2.5-flash-lite",
    headers: { "HTTP-Referer": "https://my-ener.uk", "X-Title": "Ener Scan" },
  },
  featherless: {
    apiKey: () => env.FEATHERLESS_API_KEY,
    baseURL: () => env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1",
    model: () => env.FEATHERLESS_FRONT_MODEL || "deepseek-ai/DeepSeek-V3-0324",
    headers: {},
  },
};

function frontProvider() {
  const p = env.LLM_FRONT_PROVIDER;
  return p === "openrouter" || p === "featherless" ? p : "google";
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

/** @param {"openrouter"|"featherless"} provider */
function getCompatClient(provider) {
  const cfg = OPENAI_COMPAT[provider];
  if (!cfg) return null;
  const key = cfg.apiKey();
  if (!key) return null;
  if (!_compatClients[provider]) {
    _compatClients[provider] = new OpenAI({
      apiKey: String(key).trim(),
      baseURL: cfg.baseURL(),
      maxRetries: 0,
      defaultHeaders: cfg.headers,
    });
  }
  return _compatClients[provider];
}

/**
 * @param {OpenAI} client
 * @param {"openrouter"|"featherless"} provider
 * @param {{ systemInstruction?: string, jsonMode?: boolean, temperature?: number }} opts
 */
function buildCompatModel(client, provider, opts = {}) {
  const modelId = OPENAI_COMPAT[provider].model();
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
  const provider = frontProvider();
  if (provider !== "google") {
    const client = getCompatClient(provider);
    if (!client) return null;
    return buildCompatModel(client, provider, opts);
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
  const provider = frontProvider();
  return provider !== "google"
    ? Boolean(getCompatClient(provider))
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
