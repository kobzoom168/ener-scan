/**
 * Gemini vision rescue: bracelet form when strict GPT pass returns non-bracelet / low confidence.
 * Crystal family is already proven; only classifies loop-of-beads wrist form.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env.js";

/**
 * Runtime read so tests can toggle `process.env` without reloading `env.js`.
 * @returns {boolean}
 */
export function readGeminiBraceletRescueEnabled() {
  if (process.env.GEMINI_BRACELET_RESCUE_ENABLED !== undefined) {
    return (
      String(process.env.GEMINI_BRACELET_RESCUE_ENABLED).trim().toLowerCase() ===
      "true"
    );
  }
  return Boolean(env.GEMINI_BRACELET_RESCUE_ENABLED);
}

/**
 * @returns {number}
 */
export function readGeminiBraceletRescueMinConfidence() {
  if (process.env.GEMINI_BRACELET_RESCUE_MIN_CONFIDENCE !== undefined) {
    const n = Number(process.env.GEMINI_BRACELET_RESCUE_MIN_CONFIDENCE);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.65;
  }
  return env.GEMINI_BRACELET_RESCUE_MIN_CONFIDENCE;
}

/**
 * @returns {number}
 */
function readGeminiBraceletRescueTimeoutMs() {
  if (process.env.GEMINI_BRACELET_RESCUE_TIMEOUT_MS !== undefined) {
    const n = Number(process.env.GEMINI_BRACELET_RESCUE_TIMEOUT_MS);
    return Number.isFinite(n) ? Math.max(50, Math.floor(n)) : 14000;
  }
  return env.GEMINI_BRACELET_RESCUE_TIMEOUT_MS;
}

/**
 * @returns {string}
 */
function readGeminiBraceletRescueModelId() {
  if (process.env.GEMINI_BRACELET_RESCUE_MODEL !== undefined) {
    const s = String(process.env.GEMINI_BRACELET_RESCUE_MODEL || "").trim();
    if (s) return s;
  }
  const fromEnv = String(env.GEMINI_BRACELET_RESCUE_MODEL || "").trim();
  if (fromEnv) return fromEnv;
  return String(env.GEMINI_FRONT_MODEL || "").trim() || "gemini-2.5-flash-lite";
}

const BRACELET_RESCUE_SYSTEM = `You are a jewelry form specialist. The object was already classified as crystal/stone family.
Your only job: determine if this is a crystal bead bracelet (กำไลหินคริสตัล).
Reply with JSON only: { "formFactor": "bracelet|not_bracelet|unknown", "confidence": 0.0, "reasoningShort": "<=100 chars" }
bracelet = bead loop worn on wrist, beads strung in a continuous circle/oval.
not_bracelet = necklace, pendant, loose stone, amulet.
unknown = cannot determine from image.`;

const USER_PROMPT = `Is this a crystal/stone bead bracelet worn on the wrist? Reply with JSON only.`;

/**
 * @param {string} raw
 * @returns {object|null}
 */
function safeParseJsonObject(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const unfenced = s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  try {
    const v = JSON.parse(unfenced);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * @param {Buffer|Uint8Array} imageBuffer
 * @returns {string}
 */
function bufferToBase64(imageBuffer) {
  const b = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
  return b.toString("base64");
}

/**
 * @param {object} p
 * @param {Buffer} p.imageBuffer
 * @param {string} [p.mimeType]
 * @param {string} [p.scanResultIdPrefix]
 * @param {{ GoogleGenerativeAI?: typeof GoogleGenerativeAI }} [deps] test-only Gemini client inject
 * @returns {Promise<{
 *   mode: "ok"|"disabled"|"timeout"|"error",
 *   formFactor?: string,
 *   confidence?: number,
 *   reasoningShort?: string,
 *   durationMs?: number,
 *   modelId?: string,
 *   reason?: string,
 * }>}
 */
export async function classifyBraceletFormWithGemini(
  { imageBuffer, mimeType = "image/jpeg", scanResultIdPrefix = "" },
  deps = {},
) {
  const prefix = String(scanResultIdPrefix || "").slice(0, 8);

  if (!readGeminiBraceletRescueEnabled()) {
    console.log(
      JSON.stringify({
        event: "GEMINI_BRACELET_RESCUE_SKIPPED",
        scanResultIdPrefix: prefix,
        reason: "disabled_by_env",
      }),
    );
    return { mode: /** @type {const} */ ("disabled"), reason: "disabled_by_env" };
  }

  const key = String(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      env.GEMINI_API_KEY ||
      env.GOOGLE_API_KEY ||
      "",
  ).trim();
  if (!key) {
    console.log(
      JSON.stringify({
        event: "GEMINI_BRACELET_RESCUE_SKIPPED",
        scanResultIdPrefix: prefix,
        reason: "no_gemini_api_key",
      }),
    );
    return { mode: /** @type {const} */ ("disabled"), reason: "no_gemini_api_key" };
  }

  const started = Date.now();
  console.log(
    JSON.stringify({
      event: "GEMINI_BRACELET_RESCUE_REQUESTED",
      scanResultIdPrefix: prefix,
      mimeType: String(mimeType || "image/jpeg").slice(0, 32),
    }),
  );

  const modelId = readGeminiBraceletRescueModelId();
  const timeoutMs = readGeminiBraceletRescueTimeoutMs();

  const GenAI = deps.GoogleGenerativeAI ?? GoogleGenerativeAI;
  const client = new GenAI(String(key).trim());
  const model = client.getGenerativeModel({
    model: modelId,
    systemInstruction: BRACELET_RESCUE_SYSTEM,
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 256,
      responseMimeType: "application/json",
    },
  });

  const base64 = bufferToBase64(imageBuffer);
  const parts = [
    { inlineData: { mimeType: String(mimeType || "image/jpeg"), data: base64 } },
    { text: USER_PROMPT },
  ];

  const run = model.generateContent(parts).then((r) => {
    const text = r?.response?.text?.();
    return String(text || "").trim();
  });
  const timed = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("gemini_bracelet_rescue_timeout")), timeoutMs);
  });

  try {
    const rawText = await Promise.race([run, timed]);
    const parsed = safeParseJsonObject(rawText);
    const durationMs = Date.now() - started;

    if (!parsed) {
      console.log(
        JSON.stringify({
          event: "GEMINI_BRACELET_RESCUE_PARSE_FAIL",
          scanResultIdPrefix: prefix,
          durationMs,
          rawLen: rawText.length,
        }),
      );
      return {
        mode: /** @type {const} */ ("error"),
        reason: "parse_fail",
        durationMs,
        modelId,
      };
    }

    const ffRaw = String(parsed.formFactor || "unknown").trim().toLowerCase();
    let formFactor = "unknown";
    if (ffRaw === "not_bracelet" || ffRaw === "notbracelet") {
      formFactor = "not_bracelet";
    } else if (ffRaw === "bracelet") {
      formFactor = "bracelet";
    } else if (ffRaw.includes("not_bracelet")) {
      formFactor = "not_bracelet";
    } else if (ffRaw === "unknown") {
      formFactor = "unknown";
    }

    const confRaw = Number(parsed.confidence);
    const confidence = Number.isFinite(confRaw)
      ? Math.min(1, Math.max(0, confRaw))
      : 0;
    const reasoningShort = String(parsed.reasoningShort || "")
      .trim()
      .slice(0, 100);

    const out = {
      mode: /** @type {const} */ ("ok"),
      formFactor,
      confidence,
      reasoningShort,
      durationMs,
      modelId,
    };

    console.log(
      JSON.stringify({
        event: "GEMINI_BRACELET_RESCUE_SUCCESS",
        scanResultIdPrefix: prefix,
        formFactor,
        confidence,
        durationMs,
        modelId,
      }),
    );

    return out;
  } catch (e) {
    const msg = String(e?.message || e);
    const isTimeout = msg.includes("timeout");
    const durationMs = Date.now() - started;
    console.log(
      JSON.stringify({
        event: "GEMINI_BRACELET_RESCUE_ERROR",
        scanResultIdPrefix: prefix,
        reason: isTimeout ? "timeout" : "request_error",
        message: msg.slice(0, 200),
        durationMs,
      }),
    );
    return {
      mode: isTimeout ? /** @type {const} */ ("timeout") : /** @type {const} */ ("error"),
      reason: isTimeout ? "timeout" : msg.slice(0, 120),
      durationMs,
      modelId: readGeminiBraceletRescueModelId(),
    };
  }
}
