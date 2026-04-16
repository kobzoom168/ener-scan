/**
 * Manual admin approve (slip verified) — same path as POST /admin/payments/:id/approve.
 * Usage: node scripts/verify-payment.js <paymentId> [approvedBy]
 * - paymentId: UUID; row must be status pending_verify (required)
 * - approvedBy: optional label (e.g. admin name or "manual")
 * Loads env from .env (via config); requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import {
  assertDangerousScriptEnvGuard,
  env,
  envRuntimeMeta,
} from "../src/config/env.js";
import { markPaymentApprovedAndUnlock } from "../src/stores/payments.db.js";

const paymentId = process.argv[2];
const approvedBy = process.argv[3] || "manual";

if (!paymentId) {
  console.error("Usage: node scripts/verify-payment.js <paymentId> [approvedBy]");
  process.exit(1);
}

function maskHost(host) {
  const s = String(host || "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s.length <= 6) return "***";
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

function getSupabaseHostMasked() {
  try {
    const u = new URL(String(env.SUPABASE_URL || ""));
    return maskHost(u.host || "");
  } catch {
    return maskHost(String(env.SUPABASE_URL || ""));
  }
}

try {
  assertDangerousScriptEnvGuard({ scriptName: "verify-payment" });
  console.log(
    JSON.stringify({
      event: "VERIFY_PAYMENT_TARGET_ENV",
      appEnv: envRuntimeMeta.appEnv,
      runningEnvSource: envRuntimeMeta.runningEnvSource,
      envFileUsed: envRuntimeMeta.envFileUsed,
      supabaseHostMasked: getSupabaseHostMasked(),
    }),
  );
  const result = await markPaymentApprovedAndUnlock({
    paymentId: paymentId.trim(),
    approvedBy: approvedBy.trim() || null,
  });
  console.log("Payment approved. paid_until:", result.paidUntil);
} catch (err) {
  console.error("Verification failed:", err?.message || err);
  process.exit(1);
}
