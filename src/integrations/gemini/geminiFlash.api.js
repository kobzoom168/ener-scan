/**
 * Gemini Flash-Lite client for front conversation (non-scan).
 * Uses GOOGLE_API_KEY or GEMINI_API_KEY from env (see env.js).
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env.js";

let _client = null;

function getClient() {
  const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!key) return null;
  if (!_client) {
    _client = new GoogleGenerativeAI(String(key).trim());
  }
  return _client;
}

/**
 * @param {{
 *   systemInstruction?: string,
 *   jsonMode?: boolean,
 *   timeoutMs?: number,
 * }} opts
 */
export function getGeminiFlashModel(opts = {}) {
  const client = getClient();
  if (!client) return null;
  const modelId = env.GEMINI_FRONT_MODEL || "gemini-2.5-flash-lite";
  const generationConfig = {
    temperature: 0.2,
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
  return Boolean(getClient());
}

/**
 * @param {import("@google/generative-ai").GenerativeModel} model
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
