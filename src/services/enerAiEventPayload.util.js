const FORBIDDEN_KEY_RE =
  /^(image|image_base64|base64|slip_image|slip_url|slipimage|slipurl|payment_slip|paymentslip)$/i;
const BASE64_IMAGE_RE = /^data:image\/[^;]+;base64,/i;

/**
 * Strip image/slip/base64 fields from event payloads before sending to Ener-AI.
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function sanitizeEventPayload(value, depth = 0) {
  if (depth > 4) return null;
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value
      .slice(0, 30)
      .map((item) => sanitizeEventPayload(item, depth + 1))
      .filter((item) => item !== null && item !== undefined);
  }
  if (typeof value !== "object") {
    if (typeof value === "string" && BASE64_IMAGE_RE.test(value)) {
      return null;
    }
    return value;
  }
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(String(key))) continue;
    if (/slip/i.test(key) && /image|url|base64/i.test(key)) continue;
    const cleaned = sanitizeEventPayload(raw, depth + 1);
    if (cleaned === null || cleaned === undefined) continue;
    out[key] = cleaned;
  }
  return out;
}
