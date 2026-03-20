import { env } from "../config/env.js";

const QR_PUBLIC_PATH = "/payment/promptpay-qr.jpg";

/**
 * Returns an absolute URL to the hosted PromptPay QR image.
 * Falls back to localhost if APP_BASE_URL is not set.
 */
export function getPromptPayQrPublicUrl() {
  const base = String(env.APP_BASE_URL || "").trim();

  // Ensure exactly one slash between base and path.
  const normalizedBase = base.replace(/\/+$/, "");
  if (!normalizedBase) {
    return `http://localhost:${env.PORT || 3000}${QR_PUBLIC_PATH}`;
  }

  return `${normalizedBase}${QR_PUBLIC_PATH}`;
}

