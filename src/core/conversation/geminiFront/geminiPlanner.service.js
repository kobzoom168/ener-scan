import { env } from "../../../config/env.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
  isGeminiConfigured,
} from "../../../integrations/gemini/geminiFlash.api.js";
import { GEMINI_PLANNER_SYSTEM, buildPlannerUserPrompt } from "./geminiPlannerPrompt.js";
import { logGeminiPlanner } from "./geminiFront.telemetry.js";

/**
 * @param {string} raw
 * @returns {import('./geminiPlanner.types.js').GeminiPlannerOutput | null}
 */
export function parsePlannerJson(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  const jsonMatch = t.match(/\{[\s\S]*\}/);
  const slice = jsonMatch ? jsonMatch[0] : t;
  try {
    const o = JSON.parse(slice);
    if (!o || typeof o !== "object") return null;
    return {
      intent: String(o.intent || "").trim() || "unclear",
      state_guess: String(o.state_guess || "").trim() || "unknown",
      proposed_action: String(o.proposed_action || "").trim() || "noop_phrase_only",
      confidence: Math.min(
        1,
        Math.max(0, Number(o.confidence) || 0),
      ),
      reply_style: String(o.reply_style || "").trim() || "neutral_help",
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} userPayloadJson
 * @param {{ silent?: boolean }} [opts] — when `silent`, skip GEMINI_FRONT_PLANNER logs (e.g. shadow path emits SHADOW_* only).
 * @returns {Promise<{
 *   plan: import('./geminiPlanner.types.js').GeminiPlannerOutput | null,
 *   outcome: "ok" | "parse_fail" | "error" | "skipped_no_key",
 *   errorMessage?: string,
 * }>}
 */
export async function runGeminiPlannerWithMeta(userPayloadJson, opts = {}) {
  const silent = Boolean(opts.silent);
  if (!isGeminiConfigured()) {
    if (!silent) logGeminiPlanner({ outcome: "skipped_no_api_key" });
    return { plan: null, outcome: "skipped_no_key" };
  }
  const model = getGeminiFlashModel({
    systemInstruction: GEMINI_PLANNER_SYSTEM,
    jsonMode: true,
  });
  if (!model) {
    if (!silent) logGeminiPlanner({ outcome: "skipped_no_api_key" });
    return { plan: null, outcome: "skipped_no_key" };
  }

  const prompt = buildPlannerUserPrompt(userPayloadJson);
  try {
    const out = await generateTextWithTimeout(
      model,
      prompt,
      env.GEMINI_FRONT_TIMEOUT_MS,
    );
    const parsed = parsePlannerJson(out);
    if (!silent) {
      logGeminiPlanner({
        outcome: parsed ? "ok" : "parse_fail",
        raw_len: out?.length ?? 0,
      });
    }
    return {
      plan: parsed,
      outcome: parsed ? "ok" : "parse_fail",
    };
  } catch (e) {
    const message = e?.message || String(e);
    if (!silent) {
      logGeminiPlanner({
        outcome: "error",
        message,
      });
    }
    return { plan: null, outcome: "error", errorMessage: message };
  }
}

/**
 * @param {string} userPayloadJson
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<import('./geminiPlanner.types.js').GeminiPlannerOutput | null>}
 */
export async function runGeminiPlanner(userPayloadJson, opts = {}) {
  const { plan } = await runGeminiPlannerWithMeta(userPayloadJson, opts);
  return plan;
}
