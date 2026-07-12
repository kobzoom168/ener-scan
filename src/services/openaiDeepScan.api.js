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
      }
    : { apiKey: env.OPENAI_API_KEY },
);

if (viaOpenRouter) {
  console.log(JSON.stringify({ event: "OPENAI_VIA_OPENROUTER_ACTIVE" }));
}

const prefixModel = (m) =>
  viaOpenRouter && m && !String(m).includes("/") ? `openai/${m}` : m;

export const openai = viaOpenRouter
  ? {
      responses: {
        create: (p) => rawClient.responses.create({ ...p, model: prefixModel(p?.model) }),
      },
      embeddings: {
        create: (p) => rawClient.embeddings.create({ ...p, model: prefixModel(p?.model) }),
      },
      chat: {
        completions: {
          create: (p) =>
            rawClient.chat.completions.create({ ...p, model: prefixModel(p?.model) }),
        },
      },
    }
  : rawClient;

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
