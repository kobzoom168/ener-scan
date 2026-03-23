import { env } from "../../config/env.js";

/**
 * Absolute URL for GET /r/:publicToken (uses APP_BASE_URL / PUBLIC_APP_URL).
 * @param {string} publicToken
 * @returns {string}
 */
export function buildPublicReportUrl(publicToken) {
  const tok = String(publicToken || "").trim();
  if (!tok) return "";
  const base = String(env.APP_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return `/r/${encodeURIComponent(tok)}`;
  return `${base}/r/${encodeURIComponent(tok)}`;
}
