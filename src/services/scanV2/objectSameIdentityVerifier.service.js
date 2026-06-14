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

const VERIFIER_SYSTEM_PROMPT = `You compare TWO photos of sacred objects (amulets/charms/stones) and decide if they show the SAME individual physical object.
IMAGE A = a previously registered object. IMAGE B = a new photo.
Treat them as the SAME object only if it is plausibly the very same individual piece seen again — allow ANY difference in camera angle, rotation, upside-down/flip, lighting, shadows, reflections, crop, distance, or background.
Say they are DIFFERENT when they are merely the same type/model/material but clearly distinct pieces (different wear, casting, inscriptions, proportions, frame, damage, or distinctive marks).
Be conservative: if unsure, prefer "same": false.
Reply with STRICT JSON on one line, no preamble:
{"same": <true|false>, "confidence": <0.0-1.0>, "reason": "<short>"}`;

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
