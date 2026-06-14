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
