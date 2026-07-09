/**
 * Phase 2F: same-object verifier agent.
 *
 * A vision LLM looks at TWO images — the new scan photo and a previously-registered baseline photo —
 * and decides whether they are the SAME individual physical object (allowing different angle, rotation,
 * flip, lighting, crop, background). This is the precision gate on top of embedding recall: it
 * recognises the same piece across poses while refusing to merge two different pieces that merely share
 * a material/shape/colour family (which fool the coarse trait-descriptor embedding).
 */
import { openai } from "../openaiDeepScan.api.js";
import { env } from "../../config/env.js";
import { parseSameObjectVerdict } from "./objectSameIdentityVerifier.util.js";

const VERIFIER_SYSTEM_PROMPT = `You are a forensic examiner of Thai amulets, charms and sacred stones. Compare TWO photos and decide if they show the SAME individual physical object (not merely the same model/type).
IMAGE A = a previously registered object. IMAGE B = a new photo.

Method — think step by step, focusing ONLY on unique imperfections (ignore angle, rotation, flip, lighting, shadows, reflections, crop, distance, background — those may differ freely):
1. Casing/frame: scratches on the plastic case, tarnish/dents on metal frames, prong shapes, bubbles in acrylic — do UNIQUE marks match?
2. Surface: specific dark spots (patina), mold cracks, chips on edges, wear patterns, inscription strokes — do they align exactly?
3. Proportions: exact outline, relative positions of features and defects.

Decision rules:
- SAME only when at least 2-3 UNIQUE imperfections/marks clearly match between the photos.
- Mass-produced pieces of the same model look nearly identical — if the shapes match but you cannot point to matching unique wear/damage/marks, answer same=false.
- If image quality is too poor to see unique marks, answer same=false.
- Be conservative: unsure → same=false.

Reply with STRICT JSON on one line, no preamble:
{"same": <true|false>, "confidence": <0.0-1.0>, "reason": "<short: the matched unique marks, or why rejected>"}`;

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
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), ms)),
  ]);
}

/**
 * Ask the vision agent whether two images are the same physical object.
 * Never throws — returns a conservative {same:false} verdict on any failure.
 *
 * @param {object} p
 * @param {string} p.newImageBase64 — raw base64 of the new scan (data-url prefix tolerated)
 * @param {string} [p.newImageMimeType]
 * @param {string} p.candidateImageUrl — HTTPS URL of the registered baseline image
 * @param {string} [p.objectFamily]
 * @param {{ createResponses?: Function, model?: string, timeoutMs?: number }} [deps]
 * @returns {Promise<{ same: boolean, confidence: number, reason: string, ok: boolean }>}
 */
export async function verifySameObject(
  { newImageBase64, newImageMimeType = "image/jpeg", candidateImageUrl, objectFamily = "" },
  deps = {},
) {
  const fail = (reason) => ({ same: false, confidence: 0, reason: String(reason || ""), ok: false });

  const url = String(candidateImageUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return fail("no_candidate_url");

  const b64 = String(newImageBase64 || "")
    .trim()
    .replace(/^data:[^;]+;base64,/i, "");
  if (!b64) return fail("no_new_image");

  const mime = String(newImageMimeType || "image/jpeg").trim() || "image/jpeg";
  const model = deps.model || env.OBJECT_SAME_IDENTITY_VERIFIER_MODEL;
  const timeoutMs = Number.isFinite(Number(deps.timeoutMs))
    ? Math.max(1000, Math.floor(Number(deps.timeoutMs)))
    : env.OBJECT_EMBEDDING_TIMEOUT_MS;
  const createResponses = deps.createResponses ?? ((o) => openai.responses.create(o));

  try {
    const respRaw = await withTimeout(
      createResponses({
        model,
        temperature: 0,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${VERIFIER_SYSTEM_PROMPT}\n\nobjectFamily context: ${String(objectFamily || "unknown").trim() || "unknown"}.`,
              },
              { type: "input_text", text: "IMAGE A (registered object):" },
              { type: "input_image", image_url: url },
              { type: "input_text", text: "IMAGE B (new photo):" },
              { type: "input_image", image_url: `data:${mime};base64,${b64}` },
            ],
          },
        ],
      }),
      timeoutMs,
      "same_object_verifier",
    );

    const verdict = parseSameObjectVerdict(
      typeof respRaw?.output_text === "string" ? respRaw.output_text : "",
    );
    if (!verdict) return fail("unparseable_verdict");
    return { ...verdict, ok: true };
  } catch (e) {
    return fail(String(e?.message || e).slice(0, 160));
  }
}
