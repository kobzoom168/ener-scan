import crypto from "crypto";

/**
 * Generates a short human-readable payment reference.
 * Format: PAY- + 8 hex chars (16^8 collision space; retry on DB unique violation).
 */
export function generatePaymentRef() {
  const hex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `PAY-${hex}`;
}
