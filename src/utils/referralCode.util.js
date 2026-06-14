/**
 * Referral code format + detection helpers (share-to-earn).
 *
 * Codes look like `EN-XXXXXX` using an unambiguous alphabet (no 0/O/1/I/L)
 * so they are easy to read aloud, easy to type, and easy to detect in free
 * text without colliding with birthdates or other user input.
 */

/** Unambiguous uppercase base32-ish alphabet (excludes 0 O 1 I L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_BODY_LENGTH = 6;
const CODE_PREFIX = "EN-";

/** Matches a referral code anywhere in a string (case-insensitive). */
export const REFERRAL_CODE_REGEX = new RegExp(
  `\\bEN-[${CODE_ALPHABET}]{${CODE_BODY_LENGTH}}\\b`,
  "i",
);

/**
 * @param {() => number} [rng] injectable RNG for tests (defaults to Math.random)
 * @returns {string} e.g. "EN-7KMQ9P"
 */
export function generateReferralCodeCandidate(rng = Math.random) {
  let body = "";
  for (let i = 0; i < CODE_BODY_LENGTH; i += 1) {
    const idx = Math.floor(rng() * CODE_ALPHABET.length) % CODE_ALPHABET.length;
    body += CODE_ALPHABET[idx];
  }
  return `${CODE_PREFIX}${body}`;
}

/**
 * Normalize user input into canonical code form (uppercase, EN- prefix, no spaces).
 * Accepts "en7kmq9p", "EN 7KMQ9P", "en-7kmq9p" → "EN-7KMQ9P".
 * @param {string} raw
 * @returns {string} normalized code, or "" if it does not look like a code
 */
export function normalizeReferralCode(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "");
  if (!s) return "";
  const compact = s.startsWith("EN-")
    ? s
    : s.startsWith("EN")
      ? `EN-${s.slice(2)}`
      : s;
  return isReferralCodeFormat(compact) ? compact : "";
}

/**
 * @param {string} code
 * @returns {boolean}
 */
export function isReferralCodeFormat(code) {
  const s = String(code || "").trim().toUpperCase();
  return new RegExp(`^EN-[${CODE_ALPHABET}]{${CODE_BODY_LENGTH}}$`).test(s);
}

/**
 * Find a referral code embedded in arbitrary free text (e.g. a forwarded share message).
 * @param {string} text
 * @returns {string} normalized code or ""
 */
export function extractReferralCodeFromText(text) {
  const m = String(text || "").match(REFERRAL_CODE_REGEX);
  if (!m) return "";
  return normalizeReferralCode(m[0]);
}
