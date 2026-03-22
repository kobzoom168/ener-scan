import { supabase } from "../config/supabase.js";
import { grantEntitlementForPackage } from "../services/entitlement.service.js";

const DEFAULT_UNLOCK_HOURS = 24;
const DEFAULT_AMOUNT = 0;
const DEFAULT_CURRENCY = "THB";
const PROVIDER_MANUAL = "promptpay_manual";

const PAID_PLAN_CODE = "99baht_15scans_24h";
const PAID_REMAINING_SCANS = 15;
const DEFAULT_PACKAGE_CODE = PAID_PLAN_CODE;
const DEFAULT_PACKAGE_NAME = "15 scans / 24 hours";
const DEFAULT_EXPECTED_AMOUNT = 99;
/** User must complete PromptPay + slip within this window (awaiting_payment only). */
const AWAITING_PAYMENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Manual flow only: open checkout / slip verification.
 */
const ACTIVE_PAYMENT_STATUSES = ["awaiting_payment", "pending_verify"];

function getNowIso() {
  return new Date().toISOString();
}

/** @param {unknown} id */
function normalizePaymentIdString(id) {
  const s = String(id ?? "").trim();
  if (!s) throw new Error("payment_id_empty");
  return s;
}

/**
 * Expire only stale awaiting_payment. pending_verify is never auto-expired in this patch.
 */
async function expirePaymentRowIfStale(paymentRow) {
  if (!paymentRow?.id) return null;
  if (String(paymentRow.status) === "pending_verify") {
    return paymentRow;
  }
  const createdAt = paymentRow.created_at ? Date.parse(String(paymentRow.created_at)) : NaN;
  if (
    String(paymentRow.status) === "awaiting_payment" &&
    Number.isFinite(createdAt) &&
    Date.now() - createdAt > AWAITING_PAYMENT_TTL_MS
  ) {
    const { error } = await supabase
      .from("payments")
      .update({ status: "expired", updated_at: getNowIso() })
      .eq("id", paymentRow.id);
    if (error) throw error;
    return null;
  }
  return paymentRow;
}

async function expirePaymentRowById(paymentId) {
  const pid = String(paymentId || "").trim();
  if (!pid) return;
  const { error } = await supabase
    .from("payments")
    .update({ status: "expired", updated_at: getNowIso() })
    .eq("id", pid);
  if (error) throw error;
}

/**
 * Latest active payment for an app user (for deduping createPaymentPending).
 */
export async function getLatestActivePaymentForAppUser(appUserId) {
  const uid = String(appUserId || "").trim();
  if (!uid) return null;

  const { data, error } = await supabase
    .from("payments")
    .select(
      "id,user_id,line_user_id,status,package_code,package_name,expected_amount,amount,created_at"
    )
    .eq("user_id", uid)
    .in("status", ACTIVE_PAYMENT_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return expirePaymentRowIfStale(data);
}

/**
 * After a payment is confirmed paid, expire any other open rows for the same user
 * so slip lookup / admin queues are not confused by stale actives.
 */
export async function cleanupOtherActivePaymentsForUser({
  appUserId,
  keepPaymentId,
} = {}) {
  const uid = String(appUserId || "").trim();
  const keepId = String(keepPaymentId || "").trim();
  if (!uid || !keepId) return { expiredCount: 0 };

  const { data, error } = await supabase
    .from("payments")
    .update({ status: "expired", updated_at: getNowIso() })
    .eq("user_id", uid)
    .neq("id", keepId)
    .in("status", ACTIVE_PAYMENT_STATUSES)
    .select("id");

  if (error) throw error;
  const count = Array.isArray(data) ? data.length : 0;
  console.log(
    JSON.stringify({
      event: "payments_cleanup",
      outcome: "ok",
      action: "expired_other_active",
      appUserId: uid,
      keepPaymentId: keepId,
      count,
    })
  );
  return { expiredCount: count };
}

async function safeCleanupOtherActivePaymentsForUser(appUserId, keepPaymentId) {
  try {
    return await cleanupOtherActivePaymentsForUser({
      appUserId,
      keepPaymentId,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "payments_cleanup",
        outcome: "error",
        appUserId,
        keepPaymentId,
        message: err?.message || null,
        code: err?.code || null,
      })
    );
    return { expiredCount: 0 };
  }
}

/**
 * Create a pending payment row (manual PromptPay flow), or reuse one active row
 * when package_code + expected_amount match.
 * @returns {Promise<string>} payment UUID (same shape for insert and reuse)
 */
export async function createPaymentPending({
  appUserId,
  amount = DEFAULT_AMOUNT,
  currency = DEFAULT_CURRENCY,
  scanRequestId = null,
  provider = PROVIDER_MANUAL,
  packageCode = DEFAULT_PACKAGE_CODE,
  packageName = DEFAULT_PACKAGE_NAME,
  expectedAmount = amount || DEFAULT_EXPECTED_AMOUNT,
} = {}) {
  const userId = String(appUserId || "").trim();
  if (!userId) throw new Error("payments_missing_app_user_id");

  const requestedPkg = String(packageCode ?? DEFAULT_PACKAGE_CODE);
  const requestedAmt =
    Number(expectedAmount) ||
    Number(amount) ||
    DEFAULT_EXPECTED_AMOUNT;

  // Store LINE user id for admin + slip verify flows.
  const { data: appUserRow, error: appUserErr } = await supabase
    .from("app_users")
    .select("line_user_id")
    .eq("id", userId)
    .maybeSingle();
  if (appUserErr) throw appUserErr;

  const lineUserId = appUserRow?.line_user_id ? String(appUserRow.line_user_id) : null;

  let guard = 0;
  while (guard++ < 12) {
    const active = await getLatestActivePaymentForAppUser(userId);
    if (!active?.id) break;

    const rowPkg = String(active.package_code || "");
    const rowAmt = Number(
      active.expected_amount != null && active.expected_amount !== ""
        ? active.expected_amount
        : active.amount
    );

    const pkgMatch = rowPkg === requestedPkg;
    const amtMatch =
      Number.isFinite(rowAmt) && rowAmt === requestedAmt;

    if (pkgMatch && amtMatch) {
      console.log(
        JSON.stringify({
          event: "payments_create",
          outcome: "reuse",
          paymentId: active.id,
          appUserId: userId,
          status: active.status,
          packageCode: requestedPkg,
          expectedAmount: requestedAmt,
        })
      );
      return normalizePaymentIdString(active.id);
    }

    await expirePaymentRowById(active.id);
    console.log(
      JSON.stringify({
        event: "payments_create",
        outcome: "expire_mismatch",
        paymentId: active.id,
        appUserId: userId,
        rowPackageCode: rowPkg,
        rowAmount: rowAmt,
        requestedPackageCode: requestedPkg,
        requestedAmount: requestedAmt,
      })
    );
  }

  const payload = {
    user_id: userId,
    line_user_id: lineUserId,
    scan_request_id: scanRequestId || null,
    provider: provider || PROVIDER_MANUAL,
    amount: Number(amount) || DEFAULT_AMOUNT,
    currency: String(currency || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY,
    expected_amount: Number(expectedAmount) || DEFAULT_EXPECTED_AMOUNT,
    package_code: packageCode,
    package_name: packageName,
    status: "awaiting_payment",
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
  console.log(
    JSON.stringify({
      event: "payments_create",
      outcome: "insert",
      paymentId: data.id,
      appUserId: userId,
      packageCode: requestedPkg,
      expectedAmount: requestedAmt,
    })
  );
  return normalizePaymentIdString(data.id);
}

/**
 * Latest row for slip flow only: awaiting_payment (need slip) or pending_verify (re-upload slip).
 * Never matches paid | rejected | expired (those must not capture scan images as slips).
 */
export async function getLatestAwaitingPaymentForLineUserId(lineUserId) {
  const lu = String(lineUserId || "").trim();
  console.log("[PAYMENTS_DB] getLatestAwaitingPaymentForLineUserId:start", {
    lineUserId: lu || null,
  });
  if (!lu) return null;

  const { data, error } = await supabase
    .from("payments")
    .select("id,user_id,line_user_id,status,package_code,package_name,expected_amount,created_at")
    .eq("line_user_id", lu)
    .in("status", ["awaiting_payment", "pending_verify"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // awaiting_payment: 24h TTL. pending_verify: no auto-expire here.
  try {
    if (String(data.status) === "awaiting_payment") {
      const createdAt = data?.created_at ? Date.parse(String(data.created_at)) : NaN;
      if (
        Number.isFinite(createdAt) &&
        Date.now() - createdAt > AWAITING_PAYMENT_TTL_MS
      ) {
        await supabase
          .from("payments")
          .update({ status: "expired", updated_at: getNowIso() })
          .eq("id", data.id);
        return null;
      }
    }
  } catch (ttlErr) {
    // Non-fatal: do not block the flow if TTL check fails.
    console.error("[PAYMENTS_TTL] expire check failed (ignored):", {
      userId: lu,
      message: ttlErr?.message,
      code: ttlErr?.code,
    });
  }

  return data;
}

export async function setPaymentSlipPendingVerify({
  paymentId,
  slipUrl,
  slipMessageId,
} = {}) {
  const id = String(paymentId || "").trim();
  if (!id) throw new Error("payments_missing_payment_id");

  const nowIso = getNowIso();
  const { error } = await supabase
    .from("payments")
    .update({
      slip_url: slipUrl || null,
      slip_message_id: slipMessageId || null,
      status: "pending_verify",
      updated_at: nowIso,
    })
    .eq("id", id);

  if (error) throw error;
  return true;
}

export async function getPaymentsPendingVerifyForAdmin({
  limit = 50,
} = {}) {
  console.log("[PAYMENTS_DB] getPaymentsPendingVerifyForAdmin:start", {
    limit,
  });
  const { data, error } = await supabase
    .from("payments")
    .select("id,line_user_id,package_code,package_name,expected_amount,status,slip_url,slip_message_id,created_at")
    .eq("status", "pending_verify")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

const ADMIN_LIST_STATUSES = [
  "pending_verify",
  "awaiting_payment",
  "paid",
  "rejected",
];

/**
 * Admin dashboard list with current entitlement snapshot from app_users.
 * @param {{ status?: string, limit?: number }} opts
 */
export async function getPaymentsForAdminByStatus({
  status = "pending_verify",
  limit = 200,
} = {}) {
  const s = String(status || "").trim();
  const safeStatus = ADMIN_LIST_STATUSES.includes(s) ? s : "pending_verify";
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);

  const { data, error } = await supabase
    .from("payments")
    .select(
      `
      id,
      user_id,
      line_user_id,
      package_code,
      package_name,
      expected_amount,
      amount,
      currency,
      status,
      slip_url,
      created_at,
      verified_at,
      rejected_at,
      reject_reason,
      app_users ( paid_until, paid_remaining_scans )
    `
    )
    .eq("status", safeStatus)
    .order("created_at", { ascending: false })
    .limit(lim);

  if (error) throw error;
  return { rows: data || [], filterStatus: safeStatus };
}

/**
 * Row counts per status for admin dashboard summary (manual flow statuses only).
 */
export async function getPaymentStatusCountsForAdmin() {
  const statuses = [
    "pending_verify",
    "awaiting_payment",
    "paid",
    "rejected",
  ];
  const pairs = await Promise.all(
    statuses.map(async (s) => {
      const { count, error } = await supabase
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("status", s);
      if (error) throw error;
      return [s, count ?? 0];
    })
  );
  return Object.fromEntries(pairs);
}

/**
 * Single payment + nested app_users for admin detail.
 */
export async function getPaymentDetailForAdmin(paymentId) {
  const id = String(paymentId || "").trim();
  if (!id) throw new Error("payments_missing_payment_id");

  const { data, error } = await supabase
    .from("payments")
    .select(
      `
      *,
      app_users ( id, line_user_id, paid_until, paid_remaining_scans, paid_plan_code )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function markPaymentApprovedAndUnlock({
  paymentId,
  approvedBy = null,
} = {}) {
  const id = String(paymentId || "").trim();
  if (!id) throw new Error("payments_missing_payment_id");

  const nowIso = getNowIso();
  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id,user_id,line_user_id,status,package_code,package_name,expected_amount")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!payment) throw new Error("payment_not_found");

  if (payment.status === "paid") {
    await safeCleanupOtherActivePaymentsForUser(payment.user_id, id);
    return { lineUserId: payment.line_user_id || null };
  }
  if (payment.status !== "pending_verify") {
    throw new Error(`payment_not_approvable_in_status_${payment.status}`);
  }

  const packageCode = payment.package_code || DEFAULT_PACKAGE_CODE;

  // 1) Claim row: only pending_verify -> paid (prevents double grant on concurrent approve)
  const { data: updatedRows, error: updatePaymentError } = await supabase
    .from("payments")
    .update({
      status: "paid",
      verified_at: nowIso,
      approved_by: approvedBy || null,
      updated_at: nowIso,
    })
    .eq("id", id)
    .eq("status", "pending_verify")
    .select("id");

  if (updatePaymentError) throw updatePaymentError;

  if (!updatedRows || updatedRows.length === 0) {
    const { data: rowAgain, error: againErr } = await supabase
      .from("payments")
      .select("id,user_id,line_user_id,status")
      .eq("id", id)
      .maybeSingle();
    if (againErr) throw againErr;
    if (rowAgain?.status === "paid") {
      await safeCleanupOtherActivePaymentsForUser(rowAgain.user_id, id);
      return { lineUserId: rowAgain.line_user_id || null };
    }
    throw new Error(
      `payment_not_approvable_in_status_${rowAgain?.status || "unknown"}`
    );
  }

  // 2) Grant entitlement by package code.
  const entitlement = await grantEntitlementForPackage({
    appUserId: payment.user_id,
    packageCode,
  });

  await safeCleanupOtherActivePaymentsForUser(payment.user_id, id);

  return {
    lineUserId: payment.line_user_id || null,
    paidUntil: entitlement.paidUntil,
    paidRemainingScans: entitlement.paidRemainingScans,
    paidPlanCode: entitlement.paidPlanCode,
  };
}

export async function markPaymentRejected({
  paymentId,
  rejectReason = null,
  approvedBy = null,
} = {}) {
  const id = String(paymentId || "").trim();
  if (!id) throw new Error("payments_missing_payment_id");

  const nowIso = getNowIso();

  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id,line_user_id,status")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!payment) throw new Error("payment_not_found");

  if (payment.status === "rejected") {
    return { lineUserId: payment.line_user_id || null };
  }
  if (payment.status !== "pending_verify") {
    throw new Error(`payment_not_rejectable_in_status_${payment.status}`);
  }

  const { error: updateError } = await supabase
    .from("payments")
    .update({
      status: "rejected",
      rejected_at: nowIso,
      reject_reason: rejectReason || null,
      approved_by: approvedBy || null,
      updated_at: nowIso,
    })
    .eq("id", id);

  if (updateError) throw updateError;

  return { lineUserId: payment.line_user_id || null };
}
