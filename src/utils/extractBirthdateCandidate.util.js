/**
 * Extract likely birthdate candidate(s) from mixed Thai/English text.
 * This helper does not validate date correctness; it only extracts candidate strings.
 */

/**
 * @param {string} text
 * @returns {{
 *   candidate: string | null,
 *   candidates: string[],
 *   ambiguous: boolean,
 *   reason: "none" | "single" | "multiple",
 * }}
 */
export function extractBirthdateCandidate(text) {
  const raw = String(text || "");
  if (!raw.trim()) {
    return { candidate: null, candidates: [], ambiguous: false, reason: "none" };
  }

  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const push = (v) => {
    const s = String(v || "").trim();
    if (!s) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
  const delim = /\b(\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{4})\b/g;
  for (const m of raw.matchAll(delim)) {
    push(m[1].replace(/\s+/g, ""));
  }

  // dd mm yyyy
  const spaced = /(?:^|[^\d])(\d{1,2}\s+\d{1,2}\s+\d{4})(?:$|[^\d])/g;
  for (const m of raw.matchAll(spaced)) {
    push(m[1].replace(/\s+/g, " ").trim());
  }

  // compact ddmmyyyy
  const compact = /(?:^|[^\d])(\d{8})(?:$|[^\d])/g;
  for (const m of raw.matchAll(compact)) {
    push(m[1]);
  }

  if (out.length === 0) {
    return { candidate: null, candidates: [], ambiguous: false, reason: "none" };
  }
  if (out.length === 1) {
    return { candidate: out[0], candidates: out, ambiguous: false, reason: "single" };
  }
  return { candidate: null, candidates: out, ambiguous: true, reason: "multiple" };
}

