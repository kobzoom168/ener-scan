import { supabase } from "../config/supabase.js";
import { upsertPaymentSlipRetentionRow } from "./paymentSlips.db.js";
import {
  emitPaymentApprovedFunnel,
  emitPaymentRejectedFunnel,
} from "../core/telemetry/paymentLifecycleTelemetry.service.js";
import { grantEntitlementForPackage } from "../services/entitlement.service.js";
import { generatePaymentRef } from "../utils/paymentRef.util.js";

const DEFAULT_UNLOCK_HOURS = 24;
const DEFAULT_CURRENCY = "THB";
const PROVIDER_MANUAL = "promptpay_manual";
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Backfill or return existing human-readable ref (for old rows without payment_ref).
 */
export async function ensurePaymentRefForPaymentId(paymentId) {
  const id = String(paymentId || "").trim();
  if (!id) return null;

  const { data: row, error } = await supabase
    .from("payments")
    .select("id,payment_ref")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!row) return null;
  if (row.payment_ref) return String(row.payment_ref);

  for (let i = 0; i < 12; i++) {
    const ref = generatePaymentRef();
    const { data: updated, error: uerr } = await supabase
      .from("payments")
      .update({ payment_ref: ref, updated_at: getNowIso() })
      .eq("id", id)
      .is("payment_ref", null)
      .select("payment_ref")
      .maybeSingle();

    if (uerr) throw uerr;
    if (updated?.payment_ref) return String(updated.payment_ref);

    const { data: again } = await supabase
      .from("payments")
      .select("payment_ref")
      .eq("id", id)
      .maybeSingle();
    if (again?.payment_ref) return String(again.payment_ref);
  }

  throw new Error("payment_ref_backfill_failed");
}

async function insertPaymentRowWithUniqueRef(payload) {
  const maxAttempts = 12;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const paymentRef = generatePaymentRef();
    const { data, error } = await supabase
      .from("payments")
      .insert({ ...payload, payment_ref: paymentRef })
      .select("id,payment_ref")
      .maybeSingle();

    if (error?.code === "23505") continue;
    if (error) throw error;
    if (!data?.id) throw new Error("payment_insert_failed");
    return {
      paymentId: normalizePaymentIdString(data.id),
      paymentRef: String(data.payment_ref || paymentRef),
    };
  }
  throw new Error("payment_ref_generation_failed");
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
      "id,user_id,line_user_id,status,package_code,package_name,expected_amount,amount,created_at,payment_ref"
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
  amount,
  currency = DEFAULT_CURRENCY,
  scanRequestId = null,
  provider = PROVIDER_MANUAL,
  packageCode,
  packageName,
  expectedAmount,
  unlockHours = DEFAULT_UNLOCK_HOURS,
} = {}) {
  const userId = String(appUserId || "").trim();
  if (!userId) throw new Error("payments_missing_app_user_id");

  const requestedPkg = String(packageCode || "").trim();
  if (!requestedPkg) throw new Error("payments_missing_package_code");

  const amt = Number(amount);
  const exp =
    expectedAmount != null && expectedAmount !== ""
      ? Number(expectedAmount)
      : amt;
  if (!Number.isFinite(amt) || amt < 1) {
    throw new Error("payments_invalid_amount");
  }
  if (!Number.isFinite(exp) || exp < 1) {
    throw new Error("payments_invalid_expected_amount");
  }
  const requestedAmt = exp;

  const pkgLabel = String(packageName || requestedPkg).trim() || requestedPkg;
  const uh = Math.floor(Number(unlockHours));
  const unlockH =
    Number.isFinite(uh) && uh >= 1 ? uh : DEFAULT_UNLOCK_HOURS;

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
      const ref = (await ensurePaymentRefForPaymentId(active.id)) || "";
      console.log(
        JSON.stringify({
          event: "payments_create",
          outcome: "reuse",
          paymentId: active.id,
          appUserId: userId,
          status: active.status,
          packageCode: requestedPkg,
          expectedAmount: requestedAmt,
        }),
      );
      return {
        paymentId: normalizePaymentIdString(active.id),
        paymentRef: ref,
      };
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
    amount: amt,
    currency: String(currency || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY,
    expected_amount: requestedAmt,
    package_code: requestedPkg,
    package_name: pkgLabel,
    status: "awaiting_payment",
    unlock_hours: unlockH,
  };

  const { paymentId, paymentRef } = await insertPaymentRowWithUniqueRef(payload);

  console.log(
    JSON.stringify({
      event: "PAYMENT_CREATED_WITH_PACKAGE",
      paymentId,
      paymentRef,
      appUserId: userId,
      packageKey: requestedPkg,
      packageName: pkgLabel,
      priceThb: amt,
      expectedAmount: requestedAmt,
      unlockHours: unlockH,
    }),
  );
  console.log(
    JSON.stringify({
      event: "payments_create",
      outcome: "insert",
      paymentId,
      paymentRef,
      appUserId: userId,
      packageCode: requestedPkg,
      expectedAmount: requestedAmt,
    }),
  );
  return { paymentId, paymentRef };
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
    .select(
      "id,user_id,line_user_id,status,package_code,package_name,expected_amount,created_at,payment_ref"
    )
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
  try {
    await upsertPaymentSlipRetentionRow(id);
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "PAYMENT_SLIP_RETENTION_UPSERT_FAIL",
        paymentIdPrefix: id.slice(0, 8),
        message: String(e?.message || e).slice(0, 200),
      }),
    );
  }
  return true;
}

/**
 * Clear slip image URL after raw object deleted from storage (record + amounts remain).
 * Does not modify `payment_slips.slip_hash` (retained for audit).
 * @param {string} paymentId
 */
export async function clearPaymentSlipUrlAfterRetention(paymentId) {
  const id = normalizePaymentIdString(paymentId);
  const { error } = await supabase
    .from("payments")
    .update({ slip_url: null, updated_at: getNowIso() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * @param {string} paymentId
 * @returns {Promise<object|null>}
 */
export async function getPaymentById(paymentId) {
  const id = String(paymentId || "").trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Update additive slip verification fields only.
 * @param {string} paymentId
 * @param {Record<string, unknown>} patch
 */
export async function updatePaymentSlipVerificationFields(paymentId, patch = {}) {
  const id = String(paymentId || "").trim();
  if (!id) throw new Error("payments_missing_payment_id");
  const nowIso = getNowIso();
  const safePatch = {
    ...patch,
    updated_at: nowIso,
  };
  const { error } = await supabase.from("payments").update(safePatch).eq("id", id);
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
 * @param {{ status?: string, limit?: number, q?: string }} opts
 */
const ADMIN_PAYMENT_LIST_SELECT = `
      id,
      user_id,
      line_user_id,
      payment_ref,
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
    `;

export async function getPaymentsForAdminByStatus({
  status = "pending_verify",
  limit = 200,
  q = "",
} = {}) {
  const s = String(status || "").trim();
  const safeStatus = ADMIN_LIST_STATUSES.includes(s) ? s : "pending_verify";
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const searchRaw = String(q || "").trim();

  if (searchRaw && UUID_RE.test(searchRaw)) {
    const { data, error } = await supabase
      .from("payments")
      .select(ADMIN_PAYMENT_LIST_SELECT)
      .eq("status", safeStatus)
      .eq("id", searchRaw)
      .order("created_at", { ascending: false })
      .limit(lim);
    if (error) throw error;
    return { rows: data || [], filterStatus: safeStatus };
  }

  if (searchRaw) {
    const safe = searchRaw.replace(/%/g, "").slice(0, 80);
    const pat = `%${safe}%`;
    const [r1, r2] = await Promise.all([
      supabase
        .from("payments")
        .select(ADMIN_PAYMENT_LIST_SELECT)
        .eq("status", safeStatus)
        .ilike("payment_ref", pat)
        .order("created_at", { ascending: false })
        .limit(lim),
      supabase
        .from("payments")
        .select(ADMIN_PAYMENT_LIST_SELECT)
        .eq("status", safeStatus)
        .ilike("line_user_id", pat)
        .order("created_at", { ascending: false })
        .limit(lim),
    ]);
    if (r1.error) throw r1.error;
    if (r2.error) throw r2.error;
    const map = new Map();
    for (const row of [...(r1.data || []), ...(r2.data || [])]) {
      if (row?.id) map.set(String(row.id), row);
    }
    const merged = Array.from(map.values()).sort((x, y) => {
      const ax = Date.parse(String(x.created_at || "")) || 0;
      const ay = Date.parse(String(y.created_at || "")) || 0;
      return ay - ax;
    });
    return { rows: merged.slice(0, lim), filterStatus: safeStatus };
  }

  const { data, error } = await supabase
    .from("payments")
    .select(ADMIN_PAYMENT_LIST_SELECT)
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
    .select(
      "id,user_id,line_user_id,status,package_code,package_name,expected_amount,unlock_hours",
    )
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

  const packageCode = String(payment.package_code || "").trim();
  if (!packageCode) {
    throw new Error("payment_missing_package_code");
  }

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
    expectedAmountThb:
      payment.expected_amount != null ? Number(payment.expected_amount) : null,
    unlockHoursFromPayment:
      payment.unlock_hours != null ? Number(payment.unlock_hours) : null,
  });

  console.log(
    JSON.stringify({
      event: "PAYMENT_APPROVED_ENTITLEMENT_GRANTED",
      paymentId: id,
      appUserId: payment.user_id,
      packageKey: entitlement.paidPlanCode,
      priceThb: payment.expected_amount != null ? Number(payment.expected_amount) : null,
      scanCount: entitlement.paidRemainingScans,
      windowHours: payment.unlock_hours != null ? Number(payment.unlock_hours) : null,
    }),
  );

  await safeCleanupOtherActivePaymentsForUser(payment.user_id, id);

  const lineUid = String(payment.line_user_id || "").trim();
  if (lineUid) {
    emitPaymentApprovedFunnel({
      userId: lineUid,
      paymentId: id,
      paymentRef: payment.payment_ref ?? null,
      packageKey: payment.package_code ?? null,
      reason: "admin_approve",
    });
  }

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
    .select("id,line_user_id,status,payment_ref,package_code")
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

  const lineUid = String(payment.line_user_id || "").trim();
  if (lineUid) {
    emitPaymentRejectedFunnel({
      userId: lineUid,
      paymentId: id,
      paymentRef: payment.payment_ref ?? null,
      packageKey: payment.package_code ?? null,
      reason: rejectReason != null ? String(rejectReason).slice(0, 200) : "admin_reject",
    });
  }

  return { lineUserId: payment.line_user_id || null };
}
