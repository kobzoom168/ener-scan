/**
 * Pure helpers for the same-object verifier agent (Phase 2F). No I/O — unit-testable in isolation.
 */

/**
 * Parse the agent's reply into a normalized verdict. Tolerates surrounding prose by extracting the
 * first {...} block. Returns null when no usable JSON verdict is present.
 *
 * @param {unknown} raw — model output text
 * @returns {{ same: boolean, confidence: number, reason: string } | null}
 */
export function parseSameObjectVerdict(raw) {
  const text = typeof raw === "string" ? raw : "";
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const same = obj.same === true || String(obj.same).trim().toLowerCase() === "true";
  const confRaw = Number(obj.confidence);
  const confidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : same ? 0.5 : 0;
  const reason = String(obj.reason ?? "").trim().slice(0, 160);
  return { same, confidence, reason };
}

/**
 * Build the ordered, deduped candidate pool the verifier will inspect: embedding nearest-neighbors
 * first (most semantically similar), then recency-net rows not already present. Capped at `maxCount`.
 * Each entry is tagged with `recallSource` ("embedding" | "recent") for telemetry.
 *
 * @param {Array<{ id?: unknown, similarity?: unknown }>} embeddingCandidates — sorted by similarity desc
 * @param {Array<{ id?: unknown }>} recentCandidates — sorted by recency desc
 * @param {number} maxCount
 * @returns {Array<Record<string, unknown> & { id: string, similarity: number, recallSource: string }>}
 */
export function mergeVerifierCandidates(embeddingCandidates, recentCandidates, maxCount) {
  const max = Number.isFinite(Number(maxCount)) ? Math.max(1, Math.floor(Number(maxCount))) : 5;
  /** @type {Array<Record<string, unknown> & { id: string, similarity: number, recallSource: string }>} */
  const out = [];
  const seen = new Set();

  const push = (c, source) => {
    const id = c && typeof c === "object" && c.id != null ? String(c.id).trim() : "";
    if (!id || seen.has(id)) return;
    seen.add(id);
    const sim = Number(/** @type {{ similarity?: unknown }} */ (c).similarity);
    out.push({ ...c, id, similarity: Number.isFinite(sim) ? sim : 0, recallSource: source });
  };

  for (const c of Array.isArray(embeddingCandidates) ? embeddingCandidates : []) {
    if (out.length >= max) return out;
    push(c, "embedding");
  }
  for (const c of Array.isArray(recentCandidates) ? recentCandidates : []) {
    if (out.length >= max) return out;
    push(c, "recent");
  }
  return out;
}

/**
 * Decide whether a verdict is strong enough to treat two images as the same physical object.
 *
 * @param {{ same?: boolean, confidence?: number } | null | undefined} verdict
 * @param {number} minConfidence
 * @returns {boolean}
 */
export function isSameObjectAccepted(verdict, minConfidence) {
  if (!verdict || verdict.same !== true) return false;
  const c = Number(verdict.confidence);
  const min = Number.isFinite(Number(minConfidence)) ? Number(minConfidence) : 0.8;
  return Number.isFinite(c) && c >= min;
}
