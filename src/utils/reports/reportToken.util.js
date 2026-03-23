import crypto from "node:crypto";

/** URL-safe public token for report links (not guessable). */
export function generatePublicToken() {
  return `rpt_${crypto.randomBytes(18).toString("base64url")}`;
}
