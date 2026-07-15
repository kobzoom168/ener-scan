/**
 * OpenAI vision pass: extract angle-stable slugs for deterministic score seeds.
 */
import { openai } from "./openaiDeepScan.api.js";
import { env } from "../config/env.js";
import { buildStableFeatureSeed } from "../utils/stableFeatureSeed.util.js";

/** Bump when model, SYSTEM_PROMPT, or slug set changes. */
export const STABLE_FEATURE_EXTRACT_VERSION = "v2";

const STABLE_FEATURE_MODEL = "gpt-4.1-mini";

// v2 (กบ 15 ก.ค.): เพิ่ม 4 ช่องอัตลักษณ์พิมพ์ (shapeOutline/mainMotif/figureCount/casing)
// — เคสคุณชิต: พระเนื้อผงสีน้ำตาลคนละองค์ได้ 4 ช่องหยาบชุดเดียวกัน → seed ชน → คะแนน 6 แกนซ้ำเป๊ะ
// ช่องใหม่ต้องนิ่งข้ามมุมกล้อง (โครงพิมพ์/ลวดลาย/จำนวนองค์/กรอบเลี่ยม ไม่เปลี่ยนตามมุม)
const SYSTEM_PROMPT = `Extract stable visual features from this object image. These features must be
consistent across different camera angles of the same object.
Reply with JSON only:
{
  "primaryColor": "<dominant color slug: green|blue|purple|red|orange|yellow|white|black|brown|gold|silver|mixed>",
  "materialType": "<material: moldavite|quartz|amethyst|obsidian|jade|agate|tiger_eye|mixed_crystal|thai_amulet|brass|bronze|clay|unknown>",
  "formFactor": "<bracelet|pendant|amulet_coin|amulet_figure|loose_stone|necklace|ring|unknown>",
  "textureHint": "<smooth|rough|faceted|natural_raw|carved|polished|unknown>",
  "shapeOutline": "<overall silhouette: rectangular|triangular|oval|round|arch|shield|irregular|unknown>",
  "mainMotif": "<dominant relief/imagery: seated_figure|standing_figure|multi_figure|face_only|animal|yantra_or_text|pattern_only|plain|unknown>",
  "figureCount": "<count of depicted figures: none|one|two|three_plus|unknown>",
  "casing": "<framed_metal|clear_case|bare|unknown>",
  "beadPattern": "<beaded items only: uniform|two_tone|multi_color|gradient|not_beaded|unknown>",
  "accentPiece": "<beaded items only: charm|pendant_bead|metal_spacer|buddha_bead|none|not_beaded|unknown>"
}
Rules:
- Use exact slugs from the lists above only
- If unsure, use 'unknown' rather than guessing
- primaryColor = most dominant color visible
- shapeOutline = silhouette of the object itself (ignore hand/background); for amulets this is the
  outline of the votive tablet, not the frame
- mainMotif/figureCount = what is depicted in the relief; the SAME object must give the same answer
  from any angle, so judge overall composition, not fine detail
- casing = framed_metal when a metal bezel/frame surrounds it, clear_case for plastic/glass cases
- beadPattern/accentPiece: for bracelets/necklaces made of beads — beadPattern = how bead colors are
  arranged; accentPiece = the standout piece among the beads; use 'not_beaded' for amulets/pendants/stones
- Focus on what is stable: shape, material, dominant color, composition — NOT lighting or angle`;

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
 * @returns {boolean}
 */
function readStableFeatureSeedEnabled() {
  if (process.env.STABLE_FEATURE_SEED_ENABLED !== undefined) {
    return (
      String(process.env.STABLE_FEATURE_SEED_ENABLED).trim().toLowerCase() ===
      "true"
    );
  }
  return Boolean(env.STABLE_FEATURE_SEED_ENABLED);
}

/**
 * @param {{ primaryColor?: string, materialType?: string, formFactor?: string, textureHint?: string } | null | undefined} features
 * @returns {number}
 */
export function countUnknownFields(features) {
  if (!features || typeof features !== "object") return 4;
  const keys = ["primaryColor", "materialType", "formFactor", "textureHint"];
  let n = 0;
  for (const k of keys) {
    const v = String(features[k] ?? "unknown")
      .trim()
      .toLowerCase();
    if (!v || v === "unknown") n += 1;
  }
  return n;
}

/**
 * @returns {number}
 */
function readStableFeatureExtractTimeoutMs() {
  if (process.env.STABLE_FEATURE_EXTRACT_TIMEOUT_MS !== undefined) {
    const n = Number(process.env.STABLE_FEATURE_EXTRACT_TIMEOUT_MS);
    return Number.isFinite(n) ? Math.max(1000, Math.floor(n)) : 12000;
  }
  return env.STABLE_FEATURE_EXTRACT_TIMEOUT_MS;
}

/**
 * @param {object} p
 * @param {string} p.imageBase64
 * @param {string} [p.mimeType]
 * @param {string} [p.objectFamily]
 * @param {string} [p.scanResultIdPrefix]
 * @param {{ createResponses?: (o: object) => Promise<{ output_text?: string }>, forceEnabled?: boolean, timeoutMs?: number }} [deps] tests only — forceEnabled skips env gate; timeoutMs overrides default extract timeout
 * @returns {Promise<{
 *   features: { primaryColor: string, materialType: string, formFactor: string, textureHint: string } | null,
 *   seed: string | null,
 *   durationMs: number,
 * }>}
 */
export async function extractStableVisualFeatures(
  {
    imageBase64,
    mimeType = "image/jpeg",
    objectFamily = "",
    scanResultIdPrefix = "",
  },
  deps = {},
) {
  const prefix = String(scanResultIdPrefix || "").slice(0, 8);
  const started = Date.now();

  const forceEnabled = deps.forceEnabled === true;
  const envEnabled = readStableFeatureSeedEnabled();
  if (!forceEnabled && !envEnabled) {
    console.log(
      JSON.stringify({
        event: "STABLE_FEATURE_EXTRACT_DISABLED",
        scanResultIdPrefix: prefix,
        reason: "disabled_by_env",
      }),
    );
    return { features: null, seed: null, durationMs: Date.now() - started };
  }

  const rawB64 = String(imageBase64 || "").trim();
  const b64 = rawB64.replace(/^data:[^;]+;base64,/i, "");
  const timeoutOverride = Number(deps.timeoutMs);
  const timeoutMs = Number.isFinite(timeoutOverride)
    ? Math.max(100, Math.floor(timeoutOverride))
    : readStableFeatureExtractTimeoutMs();

  const userText = `objectFamily context (pipeline): ${String(objectFamily || "unknown").trim() || "unknown"}. Extract JSON only.`;
  const instructionText = `${SYSTEM_PROMPT}\n\n${userText}`;
  const mime = String(mimeType || "image/jpeg").trim() || "image/jpeg";

  const createResponses =
    deps.createResponses ?? ((o) => openai.responses.create(o));

  const run = createResponses({
    model: STABLE_FEATURE_MODEL,
    temperature: 0,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: instructionText },
          {
            type: "input_image",
            image_url: `data:${mime};base64,${b64}`,
          },
        ],
      },
    ],
  }).then((response) => String(response?.output_text || "").trim());

  const timed = new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error("stable_feature_extract_timeout")),
      timeoutMs,
    );
  });

  try {
    const rawText = await Promise.race([run, timed]);
    const durationMs = Date.now() - started;
    const parsed = safeParseJsonObject(rawText);

    if (!parsed) {
      console.log(
        JSON.stringify({
          event: "STABLE_FEATURE_EXTRACT_FAILED",
          scanResultIdPrefix: prefix,
          reason: "parse_fail",
          durationMs,
          rawLen: rawText.length,
        }),
      );
      return { features: null, seed: null, durationMs };
    }

    const features = {
      primaryColor: String(parsed.primaryColor ?? "unknown").trim() || "unknown",
      materialType: String(parsed.materialType ?? "unknown").trim() || "unknown",
      formFactor: String(parsed.formFactor ?? "unknown").trim() || "unknown",
      textureHint: String(parsed.textureHint ?? "unknown").trim() || "unknown",
      shapeOutline: String(parsed.shapeOutline ?? "unknown").trim() || "unknown",
      mainMotif: String(parsed.mainMotif ?? "unknown").trim() || "unknown",
      figureCount: String(parsed.figureCount ?? "unknown").trim() || "unknown",
      casing: String(parsed.casing ?? "unknown").trim() || "unknown",
      beadPattern: String(parsed.beadPattern ?? "unknown").trim() || "unknown",
      accentPiece: String(parsed.accentPiece ?? "unknown").trim() || "unknown",
    };

    const seed = buildStableFeatureSeed(features);

    console.log(
      JSON.stringify({
        event: "STABLE_FEATURE_EXTRACT_SUCCESS",
        scanResultIdPrefix: prefix,
        seedPresent: Boolean(seed),
        seedPrefix: seed ? String(seed).slice(0, 12) : null,
        durationMs,
      }),
    );

    return { features, seed, durationMs };
  } catch (e) {
    const durationMs = Date.now() - started;
    const msg = String(e?.message || e);
    const isTimeout = msg.includes("timeout");
    console.log(
      JSON.stringify({
        event: "STABLE_FEATURE_EXTRACT_FAILED",
        scanResultIdPrefix: prefix,
        reason: isTimeout ? "timeout" : "request_error",
        message: msg.slice(0, 200),
        durationMs,
      }),
    );
    return { features: null, seed: null, durationMs };
  }
}
