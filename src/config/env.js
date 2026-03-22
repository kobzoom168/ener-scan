import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "OPENAI_API_KEY",
  "CHANNEL_ACCESS_TOKEN",
  "CHANNEL_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`${key} missing`);
  }
}

/**
 * Public URL for LINE-accessible assets (QR image). Must be HTTPS in production.
 * Order: APP_BASE_URL / PUBLIC_APP_URL → Railway / Vercel → localhost (dev only).
 */
function resolvePublicAppBaseUrl() {
  const explicit = process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL;
  if (explicit) {
    return String(explicit).trim().replace(/\/+$/, "");
  }
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) {
    const host = railway.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (host) return `https://${host}`;
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (host) return `https://${host}`;
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

export const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CHANNEL_ACCESS_TOKEN: process.env.CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET: process.env.CHANNEL_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  PORT: process.env.PORT || 3000,
  /** Admin secret token for /admin endpoints (optional, but required for production use). */
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || "",
  /** Session signing for admin cookie (required in production). */
  SESSION_SECRET:
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === "production"
      ? ""
      : "ener-scan-dev-session-insecure"),
  /** Admin dashboard login (username/password). Optional when using only ADMIN_TOKEN. */
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  /** bcrypt hash for ADMIN_PASSWORD; if set, used instead of plain ADMIN_PASSWORD. */
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || "",
  /** Public base URL for PromptPay QR and LINE image URLs (set APP_BASE_URL on deploy). */
  APP_BASE_URL: resolvePublicAppBaseUrl(),
  /** Amount in THB for 24h unlock (manual PromptPay). Optional; 0 = "ตามที่แอดมินแจ้ง" */
  PAYMENT_UNLOCK_AMOUNT_THB: Number(process.env.PAYMENT_UNLOCK_AMOUNT_THB) || 0,
  PAYMENT_UNLOCK_CURRENCY: process.env.PAYMENT_UNLOCK_CURRENCY || "THB",
  /**
   * Second LLM pass (gpt-4o) to polish draft from gpt-4.1-mini. Set "false" to save cost/latency.
   * @type {boolean}
   */
  ENABLE_DEEP_SCAN_REWRITE: process.env.ENABLE_DEEP_SCAN_REWRITE === "true",
};