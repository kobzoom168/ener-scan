/**
 * In-memory MVP manual payment flow (PromptPay QR → slip image → temporary unlock).
 * Lost on server restart. Does not replace DB paid_until / payments.
 */

import { supabase } from "../config/supabase.js";

const store = new Map();

/** How long we wait for a slip after prompting (then reset to none). */
const AWAITING_SLIP_TTL_MS = 24 * 60 * 60 * 1000;

/** How long unlock lasts after a slip image is accepted. */
const UNLOCK_TTL_MS = 24 * 60 * 60 * 1000;

const PAID_REMAINING_SCANS = 15;
const PAID_PLAN_CODE = "99baht_15scans_24h";

function nowMs() {
  return Date.now();
}

function pruneExpired(userId) {
  const row = store.get(userId);
  if (!row) return;

  const t = nowMs();

  if (row.state === "awaiting_slip") {
    const since = Number(row.awaitingSinceMs) || 0;
    if (since && t - since > AWAITING_SLIP_TTL_MS) {
      store.delete(userId);
    }
    return;
  }

  if (row.state === "unlocked") {
    const until = Number(row.unlockedUntilMs) || 0;
    if (until && t > until) {
      store.delete(userId);
    }
  }
}

/**
 * @returns {{ state: "none" } | { state: "awaiting_slip", awaitingSinceMs: number } | { state: "unlocked", unlockedUntilMs: number }}
 */
export function getPaymentState(userId) {
  const id = String(userId || "").trim();
  if (!id) return { state: "none" };

  pruneExpired(id);
  const row = store.get(id);
  if (!row) return { state: "none" };

  if (row.state === "awaiting_slip") {
    return { state: "awaiting_slip", awaitingSinceMs: row.awaitingSinceMs };
  }
  if (row.state === "unlocked") {
    return { state: "unlocked", unlockedUntilMs: row.unlockedUntilMs };
  }
  return { state: "none" };
}

/**
 * User must pay and send slip; next image may be treated as slip.
 * @param {string} userId
 * @param {Record<string, unknown>} [_data] reserved for future use
 */
export function setAwaitingPayment(userId, _data) {
  const id = String(userId || "").trim();
  if (!id) return;

  store.set(id, {
    state: "awaiting_slip",
    awaitingSinceMs: nowMs(),
  });
}

/**
 * Mark access granted after slip image (no OCR).
 * @param {string} userId
 * @param {number} [ttlMs] override unlock duration
 */
export async function unlockPaymentAccess(userId, ttlMs = UNLOCK_TTL_MS) {
  const id = String(userId || "").trim();
  if (!id) return;

  const ms = Number(ttlMs) > 0 ? Number(ttlMs) : UNLOCK_TTL_MS;
  const paidUntilIso = new Date(nowMs() + ms).toISOString();

  store.set(id, {
    state: "unlocked",
    unlockedUntilMs: nowMs() + ms,
  });

  // Keep manual unlock consistent with paid access source-of-truth in app_users.
  // Paid access requires: app_users.paid_until > now AND app_users.paid_remaining_scans > 0
  try {
    const nowIso = new Date().toISOString();
    await supabase
      .from("app_users")
      .update({
        paid_until: paidUntilIso,
        paid_remaining_scans: PAID_REMAINING_SCANS,
        paid_plan_code: PAID_PLAN_CODE,
        updated_at: nowIso,
      })
      .eq("line_user_id", id);
  } catch (error) {
    console.error("[PAYMENT_UNLOCK_MANUAL_DB] update app_users failed (ignored):", {
      lineUserId: id,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
  }
}

/**
 * True while manual MVP unlock window is active.
 */
export function hasPaymentAccess(userId) {
  const id = String(userId || "").trim();
  if (!id) return false;

  pruneExpired(id);
  const row = store.get(id);
  if (row?.state !== "unlocked") return false;
  const until = Number(row.unlockedUntilMs) || 0;
  return until > nowMs();
}

export function clearPaymentState(userId) {
  const id = String(userId || "").trim();
  if (!id) return;
  store.delete(id);
}
