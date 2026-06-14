/**
 * Semantic object fingerprint (Phase 2D): produce an angle-robust embedding vector for an object
 * image so the same physical piece photographed from different angles maps to nearby vectors.
 *
 * Strategy (uses the existing OpenAI client; no new infra/provider):
 *  1. Vision model emits a compact, ANGLE-INVARIANT identity descriptor (temperature 0) — it is told
 *     to describe stable identity (material, motif, color family, distinctive marks) and to ignore
 *     pose, lighting, crop, and background.
 *  2. The descriptor text is embedded with a text-embedding model → a stable float vector.
 *
 * Two angles of the same object yield very similar descriptors → high cosine similarity. This is far
 * more tolerant of pose/perspective than dHash (which compares global pixel structure).
 */
import { openai } from "./openaiDeepScan.api.js";
import { env } from "../config/env.js";

export const OBJECT_EMBEDDING_VERSION = "v1";

const DESCRIPTOR_SYSTEM_PROMPT = `You produce a STABLE IDENTITY FINGERPRINT for a physical sacred object (amulet/charm/stone).
Describe ONLY traits that stay the same across camera angles, lighting, crop, and background:
- material / substance family
- overall form and silhouette
- dominant color family
- distinctive motifs, figures, inscriptions, framing, or wear marks
Do NOT mention: pose, angle, rotation, lighting, shadows, reflections, background, hand, or photo quality.
Do NOT identify the deity/figure by name. Keep it factual and compact.
Reply with ONE line: 12-30 lowercase words, comma-separated trait phrases. No JSON, no preamble.`;

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeDescriptor(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 600);
}

/**
 * @param {Promise<T>} p
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 * @template T
 */
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout`)), ms),
    ),
  ]);
}

/**
 * Compute an angle-robust embedding for an object image.
 *
 * @param {object} p
 * @param {string} p.imageBase64 — raw base64 (data-url prefix tolerated)
 * @param {string} [p.mimeType]
 * @param {string} [p.objectFamily]
 * @param {string} [p.scanResultIdPrefix]
 * @param {{ createResponses?: Function, createEmbedding?: Function, forceEnabled?: boolean, timeoutMs?: number }} [deps]
 * @returns {Promise<{ embedding: number[]|null, descriptor: string|null, model: string, version: string, durationMs: number }>}
 */
export async function computeObjectEmbedding(
  { imageBase64, mimeType = "image/jpeg", objectFamily = "", scanResultIdPrefix = "" },
  deps = {},
) {
  const started = Date.now();
  const prefix = String(scanResultIdPrefix || "").slice(0, 8);
  const model = env.OBJECT_EMBEDDING_MODEL;
  const descriptorModel = env.OBJECT_EMBEDDING_DESCRIPTOR_MODEL;
  const timeoutMs = Number.isFinite(Number(deps.timeoutMs))
    ? Math.max(1000, Math.floor(Number(deps.timeoutMs)))
    : env.OBJECT_EMBEDDING_TIMEOUT_MS;

  const enabled =
    deps.forceEnabled === true ||
    env.OBJECT_EMBEDDING_PERSIST_ENABLED ||
    env.CROSS_ACCOUNT_BASELINE_EMBEDDING_REUSE_ENABLED;
  if (!enabled) {
    return { embedding: null, descriptor: null, model, version: OBJECT_EMBEDDING_VERSION, durationMs: 0 };
  }

  const b64 = String(imageBase64 || "").trim().replace(/^data:[^;]+;base64,/i, "");
  if (!b64) {
    return { embedding: null, descriptor: null, model, version: OBJECT_EMBEDDING_VERSION, durationMs: Date.now() - started };
  }
  const mime = String(mimeType || "image/jpeg").trim() || "image/jpeg";

  const createResponses = deps.createResponses ?? ((o) => openai.responses.create(o));
  const createEmbedding = deps.createEmbedding ?? ((o) => openai.embeddings.create(o));

  try {
    const respRaw = await withTimeout(
      createResponses({
        model: descriptorModel,
        temperature: 0,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${DESCRIPTOR_SYSTEM_PROMPT}\n\nobjectFamily context: ${String(objectFamily || "unknown").trim() || "unknown"}.`,
              },
              { type: "input_image", image_url: `data:${mime};base64,${b64}` },
            ],
          },
        ],
      }),
      timeoutMs,
      "object_embedding_descriptor",
    );

    const descriptor = normalizeDescriptor(
      typeof respRaw?.output_text === "string" ? respRaw.output_text : "",
    );
    if (!descriptor) {
      console.log(
        JSON.stringify({
          event: "OBJECT_EMBEDDING_FAILED",
          scanResultIdPrefix: prefix,
          reason: "empty_descriptor",
          durationMs: Date.now() - started,
        }),
      );
      return { embedding: null, descriptor: null, model, version: OBJECT_EMBEDDING_VERSION, durationMs: Date.now() - started };
    }

    const embRaw = await withTimeout(
      createEmbedding({ model, input: descriptor }),
      timeoutMs,
      "object_embedding_vector",
    );
    const vec = embRaw?.data?.[0]?.embedding;
    const embedding =
      Array.isArray(vec) && vec.length > 0 && vec.every((x) => Number.isFinite(Number(x)))
        ? vec.map((x) => Number(x))
        : null;

    console.log(
      JSON.stringify({
        event: embedding ? "OBJECT_EMBEDDING_SUCCESS" : "OBJECT_EMBEDDING_FAILED",
        scanResultIdPrefix: prefix,
        reason: embedding ? undefined : "no_vector",
        dims: embedding ? embedding.length : 0,
        descriptorPrefix: descriptor.slice(0, 48),
        durationMs: Date.now() - started,
      }),
    );

    return { embedding, descriptor, model, version: OBJECT_EMBEDDING_VERSION, durationMs: Date.now() - started };
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "OBJECT_EMBEDDING_FAILED",
        scanResultIdPrefix: prefix,
        reason: String(e?.message || e).includes("timeout") ? "timeout" : "request_error",
        message: String(e?.message || e).slice(0, 200),
        durationMs: Date.now() - started,
      }),
    );
    return { embedding: null, descriptor: null, model, version: OBJECT_EMBEDDING_VERSION, durationMs: Date.now() - started };
  }
}

/**
 * Cosine similarity (vectors assumed comparable length). Returns -1 on bad input.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
