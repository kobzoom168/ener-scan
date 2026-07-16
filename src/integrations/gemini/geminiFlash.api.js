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
import { env } from "../../config/env.js";

let _googleClient = null;

/**
 * OpenAI-compatible providers (OpenRouter, Featherless): per-provider config.
 * `extraBody` carries non-standard fields that must reach the API verbatim
 * (the openai SDK silently drops unknown keys, so the compat path uses fetch).
 * For Featherless DeepSeek-V4 (a reasoning model), `chat_template_kwargs.thinking=false`
 * disables chain-of-thought, roughly halving latency for short chat replies.
 */
const OPENAI_COMPAT = {
  openrouter: {
    apiKey: () => env.OPENROUTER_API_KEY,
    baseURL: () => env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    model: () => env.OPENROUTER_FRONT_MODEL || "google/gemini-2.5-flash-lite",
    headers: { "HTTP-Referer": "https://my-ener.uk", "X-Title": "Ener Scan" },
    extraBody: {},
  },
  featherless: {
    apiKey: () => env.FEATHERLESS_API_KEY,
    baseURL: () => env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1",
    model: () => env.FEATHERLESS_FRONT_MODEL || "deepseek-ai/DeepSeek-V4-Flash",
    headers: {},
    extraBody: { chat_template_kwargs: { thinking: false }, reasoning_effort: "none" },
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

/**
 * @param {"openrouter"|"featherless"} provider
 * @param {{ systemInstruction?: string, jsonMode?: boolean, temperature?: number, timeoutMs?: number, maxTokens?: number, cacheSystemPrompt?: boolean, disableReasoning?: boolean }} opts
 */
function buildCompatModel(provider, opts = {}) {
  const cfg = OPENAI_COMPAT[provider];
  const modelId = String(opts.modelOverride || "").trim() || cfg.model();
  const apiKey = String(cfg.apiKey() || "").trim();
  const baseURL = cfg.baseURL().replace(/\/+$/, "");
  const temperature = clampTemp(opts.temperature, 0.2);
  const systemInstruction = opts.systemInstruction;
  const jsonMode = Boolean(opts.jsonMode);
  const abortMs = Math.max(
    400,
    Number(opts.timeoutMs) || Number(env.GEMINI_FRONT_TIMEOUT_MS) || 3200,
  );
  const maxTokens = Math.max(64, Number(opts.maxTokens) || 1024);
  return {
    async generateContent(userPrompt) {
      const messages = [];
      if (systemInstruction) {
        // Prompt caching (กบ 16 ก.ค. — ค่าแชท consult แพง): system prompt อาจารย์ ~14k chars
        // นิ่ง 100% ทุกข้อความ/ทุกคน → cache_control ephemeral ให้ Anthropic/Gemini ผ่าน OpenRouter
        // อ่านซ้ำจ่าย ~10% ของราคา input (TTL 5 นาที ต่ออายุเองทุกครั้งที่โดนใช้)
        if (opts.cacheSystemPrompt && provider === "openrouter") {
          messages.push({
            role: "system",
            content: [
              {
                type: "text",
                text: String(systemInstruction),
                cache_control: { type: "ephemeral" },
              },
            ],
          });
        } else {
          messages.push({ role: "system", content: String(systemInstruction) });
        }
      }
      messages.push({ role: "user", content: String(userPrompt || "") });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), abortMs);
      try {
        const res = await fetch(`${baseURL}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            ...cfg.headers,
          },
          body: JSON.stringify({
            model: modelId,
            temperature,
            max_tokens: maxTokens,
            messages,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
            // DeepSeek V4 Flash บางเจ้า (เช่น Alibaba) แอบคิดในใจ (reasoning) กิน max_tokens
            // จนคำตอบจริงโดนตัด — ปิดเมื่อผู้เรียกขอ (consult ชั้นฟรี)
            ...(opts.disableReasoning ? { reasoning: { enabled: false } } : {}),
            ...cfg.extraBody,
          }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`compat_http_${res.status}:${errText.slice(0, 200)}`);
        }
        const j = await res.json();
        const text = j?.choices?.[0]?.message?.content ?? "";
        return { response: { text: () => String(text || "") } };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * @param {{
 *   systemInstruction?: string,
 *   jsonMode?: boolean,
 *   timeoutMs?: number,
 *   temperature?: number,
 *   modelOverride?: string,
 *   cacheSystemPrompt?: boolean,
 * }} opts
 */
export function getGeminiFlashModel(opts = {}) {
  const provider = frontProvider();
  if (provider !== "google") {
    if (!String(OPENAI_COMPAT[provider].apiKey() || "").trim()) return null;
    return buildCompatModel(provider, opts);
  }

  const client = getGoogleClient();
  if (!client) return null;
  const modelId =
    String(opts.modelOverride || "").trim() ||
    env.GEMINI_FRONT_MODEL ||
    "gemini-2.5-flash-lite";
  const temperature = clampTemp(opts.temperature, 0.2);
  const generationConfig = {
    temperature,
    maxOutputTokens: Math.max(64, Number(opts.maxTokens) || 1024),
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
    ? Boolean(String(OPENAI_COMPAT[provider].apiKey() || "").trim())
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
