/**
 * Public report hero: only allow https URLs (blocks javascript:, data:, etc.).
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeHttpsPublicImageUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
}
