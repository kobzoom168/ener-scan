/**
 * Parse Supabase Storage public object URL into bucket + object path.
 * @param {string|null|undefined} url
 * @returns {{ bucket: string, path: string } | null}
 */
export function parseSupabasePublicObjectUrl(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  const m = s.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const bucket = m[1];
  const path = decodeURIComponent(m[2].split("?")[0] || "");
  if (!bucket || !path) return null;
  return { bucket, path };
}
