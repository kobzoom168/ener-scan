import { supabase } from "../config/supabase.js";

const DEFAULT_UNLOCK_HOURS = 24;
const DEFAULT_AMOUNT = 0;
const DEFAULT_CURRENCY = "THB";
const PROVIDER_MANUAL = "promptpay_manual";

/**
 * Create a pending payment row (manual PromptPay flow).
 * Returns payment id (uuid string). Throws on DB error.
 */
export async function createPaymentPending({
  appUserId,
  amount = DEFAULT_AMOUNT,
  currency = DEFAULT_CURRENCY,
  scanRequestId = null,
  provider = PROVIDER_MANUAL,
} = {}) {
  const userId = String(appUserId || "").trim();
  if (!userId) throw new Error("payments_missing_app_user_id");

  const payload = {
    user_id: userId,
    scan_request_id: scanRequestId || null,
    provider: provider || PROVIDER_MANUAL,
    amount: Number(amount) || DEFAULT_AMOUNT,
    currency: String(currency || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY,
    status: "pending",
    unlock_hours: DEFAULT_UNLOCK_HOURS,
  };

  const { data, error } = await supabase
    .from("payments")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[SUPABASE] createPaymentPending error:", {
      appUserId: userId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  if (!data?.id) throw new Error("payment_insert_failed");
  return data.id;
}

/**
 * Mark payment as succeeded and extend app_users.paid_until by unlock_hours.
 * Uses greatest(now(), current paid_until) + interval so existing entitlement is extended.
 * Throws on DB error.
 */
export async function markPaymentSucceededAndExtendEntitlement({
  paymentId,
  verifiedBy = null,
  note = null,
  unlockHours = DEFAULT_UNLOCK_HOURS,
} = {}) {
  const id = String(paymentId || "").trim();
  if (!id) throw new Error("payments_missing_payment_id");

  const nowIso = new Date().toISOString();

  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("user_id, unlock_hours")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();

  if (fetchError) {
    console.error("[SUPABASE] markPaymentSucceeded fetch error:", {
      paymentId: id,
      message: fetchError.message,
      code: fetchError.code,
      details: fetchError.details,
      hint: fetchError.hint,
    });
    throw fetchError;
  }

  if (!payment?.user_id) {
    throw new Error("payment_not_found_or_not_pending");
  }

  const hours = Number(unlockHours) || Number(payment.unlock_hours) || DEFAULT_UNLOCK_HOURS;

  const { data: user, error: userError } = await supabase
    .from("app_users")
    .select("paid_until")
    .eq("id", payment.user_id)
    .maybeSingle();

  if (userError) {
    console.error("[SUPABASE] markPaymentSucceeded get paid_until error:", {
      appUserId: payment.user_id,
      message: userError.message,
      code: userError.code,
      details: userError.details,
      hint: userError.hint,
    });
    throw userError;
  }

  const paidUntilMs = user?.paid_until ? Date.parse(user.paid_until) : NaN;
  const baseMs = Number.isFinite(paidUntilMs) && paidUntilMs > Date.now() ? paidUntilMs : Date.now();
  const unlockedUntil = new Date(baseMs + hours * 60 * 60 * 1000).toISOString();

  const { error: updatePaymentError } = await supabase
    .from("payments")
    .update({
      status: "succeeded",
      paid_at: nowIso,
      unlocked_until: unlockedUntil,
      verified_by: verifiedBy || null,
      note: note || null,
    })
    .eq("id", id);

  if (updatePaymentError) {
    console.error("[SUPABASE] markPaymentSucceeded update payment error:", {
      paymentId: id,
      message: updatePaymentError.message,
      code: updatePaymentError.code,
      details: updatePaymentError.details,
      hint: updatePaymentError.hint,
    });
    throw updatePaymentError;
  }

  const { error: updateUserError } = await supabase
    .from("app_users")
    .update({
      paid_until: unlockedUntil,
      updated_at: nowIso,
    })
    .eq("id", payment.user_id);

  if (updateUserError) {
    console.error("[SUPABASE] markPaymentSucceeded update app_users.paid_until error:", {
      appUserId: payment.user_id,
      message: updateUserError.message,
      code: updateUserError.code,
      details: updateUserError.details,
      hint: updateUserError.hint,
    });
    throw updateUserError;
  }

  return { paidUntil: unlockedUntil };
}
