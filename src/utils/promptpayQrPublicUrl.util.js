import { env } from "../config/env.js";

const QR_PUBLIC_PATH = "/payment/promptpay-qr.jpg";

/**
 * Returns an absolute URL to the hosted PromptPay QR image.
 * Uses `env.APP_BASE_URL` (see `resolvePublicAppBaseUrl` in env.js): Railway/Vercel when unset.
 */
export function getPromptPayQrPublicUrl() {
  const normalizedBase = String(env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  return `${normalizedBase}${QR_PUBLIC_PATH}`;
}

/**
 * LINE image messages require HTTPS URLs that LINE servers can fetch.
 * http://localhost is never usable from LINE.
 */
export function isPromptPayQrUrlHttpsForLine(qrUrl) {
  try {
    const u = new URL(String(qrUrl || ""));
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

