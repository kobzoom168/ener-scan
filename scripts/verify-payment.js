/**
 * Manual payment verification (PromptPay / manual flow).
 * Usage: node scripts/verify-payment.js <paymentId> [verifiedBy]
 * - paymentId: UUID of the pending payment (required)
 * - verifiedBy: optional label (e.g. admin name or "manual")
 * Loads env from .env (via config); requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import "../src/config/env.js";
import { markPaymentSucceededAndExtendEntitlement } from "../src/stores/payments.db.js";

const paymentId = process.argv[2];
const verifiedBy = process.argv[3] || "manual";

if (!paymentId) {
  console.error("Usage: node scripts/verify-payment.js <paymentId> [verifiedBy]");
  process.exit(1);
}

try {
  const result = await markPaymentSucceededAndExtendEntitlement({
    paymentId: paymentId.trim(),
    verifiedBy: verifiedBy.trim() || null,
  });
  console.log("Payment verified. paid_until:", result.paidUntil);
} catch (err) {
  console.error("Verification failed:", err?.message || err);
  process.exit(1);
}
