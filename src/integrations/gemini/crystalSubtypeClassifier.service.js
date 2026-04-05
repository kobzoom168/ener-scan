/**
 * Gemini vision pass: crystal subtype specialist for Moldavite routing only.
 * Does not replace the main scan LLM; runs only when object family is already crystal.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env.js";

const CLASSIFIER_SYSTEM = `You are a mineral/crystal subtype specialist. The photographed object was already routed as a crystal/stone (not a Thai amulet). Your only job is to estimate the likely material subtype for product UX routing — not lab certification.

Reply with JSON only (no markdown fences), exactly this shape:
{
  "crystalSubtype": "<slug>",
  "subtypeConfidence": <number 0 to 1>,
  "subtypeCandidates": ["<slug>", ...],
  "reasoningShort": "<=120 chars, Thai or English>"
}

Slug rules:
- Use lowercase English slugs: moldavite, quartz, amethyst, obsidian, citrine, other, unknown.
- Moldavite = Czech green tektite (meteoritic glass), often olive-green and textured.
- If the piece could be Moldavite but you are not reasonably sure, prefer unknown or other with LOW subtypeConfidence — do not guess a rare subtype.
- subtypeCandidates: up to 4 strings, most likely first.
- subtypeConfidence: confidence that crystalSubtype is correct (not business/legal certainty).`;

const USER_PROMPT = `Classify this crystal/stone image. Focus on whether it is plausibly Moldavite (green tektite) versus other common crystals.`;

/**
 * @param {string} raw
 * @returns {object|null}
 */
function safeParseJsonObject(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const unfenced = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  try {
    const v = JSON.parse(unfenced);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} o
 * @returns {boolean}
 */
export function deriveMoldaviteLikelyFromGeminiJson(o) {
  const st = String(o.crystalSubtype || "")
    .trim()
    .toLowerCase();
  if (st === "moldavite" || st.includes("moldavite")) return true;

  const cands = Array.isArray(o.subtypeCandidates) ? o.subtypeCandidates : [];
  for (const c of cands) {
    const x = String(c || "")
      .trim()
      .toLowerCase();
    if (
      x === "moldavite" ||
      x.includes("moldavite") ||
      x === "green_tektite" ||
      x.includes("green tektite")
    ) {
      return true;
    }
  }
  return false;
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
 * @returns {Promise<object>}
 */
export async function classifyCrystalSubtypeWithGemini({
  imageBuffer,
  mimeType = "image/jpeg",
  scanResultIdPrefix = "",
}) {
  const prefix = String(scanResultIdPrefix || "").slice(0, 8);

  if (!env.GEMINI_CRYSTAL_SUBTYPE_ENABLED) {
    console.log(
      JSON.stringify({
        event: "GEMINI_CRYSTAL_SUBTYPE_SKIPPED",
        scanResultIdPrefix: prefix,
        reason: "disabled_by_env",
      }),
    );
    return { mode: "disabled", reason: "disabled_by_env" };
  }

  const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!String(key || "").trim()) {
    console.log(
      JSON.stringify({
        event: "GEMINI_CRYSTAL_SUBTYPE_SKIPPED",
        scanResultIdPrefix: prefix,
        reason: "no_gemini_api_key",
      }),
    );
    return { mode: "disabled", reason: "no_gemini_api_key" };
  }

  const started = Date.now();
  console.log(
    JSON.stringify({
      event: "GEMINI_CRYSTAL_SUBTYPE_REQUESTED",
      scanResultIdPrefix: prefix,
      mimeType: String(mimeType || "image/jpeg").slice(0, 32),
    }),
  );

  const modelId =
    String(env.GEMINI_CRYSTAL_SUBTYPE_MODEL || "").trim() ||
    env.GEMINI_FRONT_MODEL ||
    "gemini-2.5-flash-lite";
  const timeoutMs = Math.max(
    2000,
    Number(env.GEMINI_CRYSTAL_SUBTYPE_TIMEOUT_MS) || 12000,
  );

  const client = new GoogleGenerativeAI(String(key).trim());
  const model = client.getGenerativeModel({
    model: modelId,
    systemInstruction: CLASSIFIER_SYSTEM,
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 512,
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
    setTimeout(() => reject(new Error("gemini_crystal_subtype_timeout")), timeoutMs);
  });

  try {
    const rawText = await Promise.race([run, timed]);
    const parsed = safeParseJsonObject(rawText);
    const durationMs = Date.now() - started;

    if (!parsed) {
      console.log(
        JSON.stringify({
          event: "GEMINI_CRYSTAL_SUBTYPE_PARSE_FAIL",
          scanResultIdPrefix: prefix,
          durationMs,
          rawLen: rawText.length,
        }),
      );
      return {
        mode: "error",
        reason: "parse_fail",
        durationMs,
      };
    }

    const crystalSubtype = String(parsed.crystalSubtype || "unknown").trim() || "unknown";
    const subtypeConfidence = Number(parsed.subtypeConfidence);
    const conf = Number.isFinite(subtypeConfidence)
      ? Math.min(1, Math.max(0, subtypeConfidence))
      : 0;
    const subtypeCandidates = Array.isArray(parsed.subtypeCandidates)
      ? parsed.subtypeCandidates
          .map((x) => String(x || "").trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const reasoningShort = String(parsed.reasoningShort || "")
      .trim()
      .slice(0, 160);

    const moldaviteLikely = deriveMoldaviteLikelyFromGeminiJson({
      crystalSubtype,
      subtypeCandidates,
    });

    const out = {
      mode: /** @type {const} */ ("ok"),
      crystalSubtype,
      subtypeConfidence: conf,
      subtypeCandidates,
      reasoningShort,
      moldaviteLikely,
      durationMs,
      modelId,
    };

    console.log(
      JSON.stringify({
        event: "GEMINI_CRYSTAL_SUBTYPE_SUCCESS",
        scanResultIdPrefix: prefix,
        crystalSubtype,
        subtypeConfidence: conf,
        moldaviteLikely,
        subtypeCandidatesCount: subtypeCandidates.length,
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
        event: "GEMINI_CRYSTAL_SUBTYPE_ERROR",
        scanResultIdPrefix: prefix,
        reason: isTimeout ? "timeout" : "request_error",
        message: msg.slice(0, 200),
        durationMs,
      }),
    );
    return {
      mode: isTimeout ? "timeout" : "error",
      reason: isTimeout ? "timeout" : msg.slice(0, 120),
      durationMs,
    };
  }
}
