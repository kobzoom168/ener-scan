import OpenAI from "openai";
import { env } from "../config/env.js";

// 🌉 สะพานฉุกเฉิน: OPENAI_VIA_OPENROUTER=true → ทุกคอล OpenAI (responses/embeddings)
// วิ่งผ่าน OpenRouter แทน (บทเรียน 12 ก.ค.: เครดิตบัญชี OpenAI หมด ระบบสแกนล้มทั้งเส้น
// ทั้งที่ OpenRouter ยังมีเครดิต — เทสแล้ว OpenRouter รองรับ Responses API,
// แค่เติม prefix "openai/" หน้าชื่อโมเดล). ปิด flag = กลับไปตรง OpenAI เหมือนเดิมเป๊ะ
const viaOpenRouter =
  String(process.env.OPENAI_VIA_OPENROUTER ?? "false").trim().toLowerCase() === "true" &&
  Boolean(String(process.env.OPENROUTER_API_KEY || "").trim());

const rawClient = new OpenAI(
  viaOpenRouter
    ? {
        apiKey: String(process.env.OPENROUTER_API_KEY || "").trim(),
        baseURL: "https://openrouter.ai/api/v1",
        // attribution (Codex 13 ส.ค.): ให้บิล OpenRouter เห็นชื่อ app แทน (unknown)
        defaultHeaders: {
          "HTTP-Referer": "https://scan.my-ener.uk",
          "X-Title": "Ener Scan",
        },
      }
    : { apiKey: env.OPENAI_API_KEY },
);

if (viaOpenRouter) {
  console.log(JSON.stringify({ event: "OPENAI_VIA_OPENROUTER_ACTIVE" }));
}

const prefixModel = (m) =>
  viaOpenRouter && m && !String(m).includes("/") ? `openai/${m}` : m;

/** LLM_USAGE wrapper กลาง (Codex 13 ส.ค.: usage ต้องครบทุก call ใหญ่ ไม่ใช่แค่บิล CSV)
 *  — callSite อ่านจาก field user ที่ call site ติดมา · log แม้ error (settled telemetry) */
export function withUsageTracking(api, createFn) {
  return async (p) => {
    const started = Date.now();
    const callSite = String(p?.user || "untagged");
    const model = String(p?.model || "");
    // CHAT_TURN_AI_CHAIN (Codex P0-6): เส้น OpenAI (conversationSurface ฯลฯ) ต้องถูกนับ
    // ด้วย — attempted นับตั้งแต่ก่อนยิง (error/timeout ก็นับ) · นอก turn context = no-op
    let aiCallHandle = null;
    let budgetBlocked = null;
    try {
      const { tryReserveTurnAiCall, TurnAiBudgetExhaustedError } = await import("../core/telemetry/turnAiChain.js");
      const site = `openai.${api}:${callSite}`;
      // P0-3: enforcement กลางที่ boundary (text turn เท่านั้น) — งบหมด = ไม่แตะ transport
      const r = tryReserveTurnAiCall(site);
      if (!r.ok) budgetBlocked = new TurnAiBudgetExhaustedError(site);
      else aiCallHandle = r.handle;
    } catch { /* telemetry ห้ามขวาง */ }
    if (budgetBlocked) {
      console.warn(JSON.stringify({ event: "CHAT_TURN_AI_BUDGET_BLOCKED", stage: "transport", client: "openai", api, callSite }));
      throw budgetBlocked;
    }
    const recordLatency = async () => {
      try {
        const { recordTurnAiLatency } = await import("../core/telemetry/turnAiChain.js");
        recordTurnAiLatency(Date.now() - started, aiCallHandle);
      } catch { /* ignore */ }
    };
    try {
      const res = await createFn(p);
      await recordLatency();
      try {
        const u = res?.usage || {};
        console.log(
          JSON.stringify({
            event: "LLM_USAGE",
            api,
            callSite,
            model,
            promptTokens: Number(u.input_tokens ?? u.prompt_tokens) || 0,
            cachedTokens:
              Number(u.input_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached_tokens) || 0,
            completionTokens: Number(u.output_tokens ?? u.completion_tokens) || 0,
            genId: String(res?.id || "").slice(0, 48),
            latencyMs: Date.now() - started,
            ok: true,
          }),
        );
      } catch { /* telemetry ห้ามขวาง */ }
      return res;
    } catch (e) {
      await recordLatency();
      console.log(
        JSON.stringify({
          event: "LLM_USAGE",
          api,
          callSite,
          model,
          ok: false,
          latencyMs: Date.now() - started,
          error: String(e?.message || e).slice(0, 120),
        }),
      );
      throw e;
    }
  };
}

export const openai = {
  responses: {
    create: withUsageTracking("responses", (p) =>
      rawClient.responses.create({ ...p, model: prefixModel(p?.model) }),
    ),
  },
  embeddings: {
    // เข้า wrapper เหมือนกัน (Codex รอบ 3: AI chain ต้องครบทุกเส้น) — ถูกแต่ก็คือ call
    create: withUsageTracking("embeddings", (p) =>
      rawClient.embeddings.create({ ...p, model: prefixModel(p?.model) }),
    ),
  },
  chat: {
    completions: {
      create: withUsageTracking("chat", (p) =>
        rawClient.chat.completions.create({ ...p, model: prefixModel(p?.model) }),
      ),
    },
  },
};

/** Model id sent to `openai.responses.create` for deep-scan draft + rewrite. */
// โหมดคุณภาพสูงสุด (กบ 12 ก.ค.: "ค่า AI เยอะไม่เป็นไร ขอคุณภาพ 100%") — override ได้ทาง env
const OPENAI_DEEP_SCAN_RESPONSES_MODEL =
  String(process.env.DEEP_SCAN_MODEL || "").trim() || "gpt-4.1-mini";

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
  callSite = "deepScan.draft",
}) {
  const startedAt = Date.now();

  const response = await withOpenAi429RetryOnce(() => {
    const model = OPENAI_DEEP_SCAN_RESPONSES_MODEL;
    console.log("[OPENAI_MODEL]", model);
    return openai.responses.create({
      user: String(callSite || "deepScan.draft"),
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
export async function rewriteDeepScanDraft({ systemPrompt, userPrompt, callSite = "deepScan.rewrite" }) {
  const startedAt = Date.now();

  const response = await withOpenAi429RetryOnce(() => {
    const model = OPENAI_DEEP_SCAN_RESPONSES_MODEL;
    console.log("[OPENAI_MODEL]", model);
    return openai.responses.create({
      user: String(callSite || "deepScan.rewrite"),
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
