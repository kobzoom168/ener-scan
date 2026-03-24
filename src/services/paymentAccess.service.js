import { ensureUserByLineUserId } from "../stores/users.db.js";
import {
  countScanResultsTodayForAppUser,
  getLocalDateKey,
} from "../stores/paymentAccess.db.js";
import { supabase } from "../config/supabase.js";
import { loadActiveScanOffer } from "./scanOffer.loader.js";
import {
  decideScanGate,
  resolveScanOfferAccessContext,
} from "./scanOfferAccess.resolver.js";
import { buildScanOfferReply } from "./scanOffer.copy.js";

export async function checkScanAccess({ userId, now = new Date() }) {
  const lineUserId = String(userId || "").trim();
  const nowIso = now.toISOString();
  const offer = loadActiveScanOffer(now);
  const freeQuotaPerDay = offer.freeQuotaPerDay;

  if (!lineUserId) {
    const finalDecision = { allowed: false, reason: "payment_required" };
    console.log("[SCAN_ACCESS_DEBUG]", {
      userId: lineUserId,
      nowIso,
      paidUntil: null,
      paidRemainingScans: 0,
      freeUsedToday: 0,
      freeRemainingToday: 0,
      finalDecision,
    });
    return {
      allowed: false,
      reason: "payment_required",
      remaining: 0,
      usedScans: 0,
      freeScansLimit: freeQuotaPerDay,
      freeScansRemaining: 0,
      paidUntil: null,
      paidRemainingScans: 0,
    };
  }

  // Ensure app_users row exists for this LINE user (safe, non-fatal).
  try {
    await ensureUserByLineUserId(lineUserId);
  } catch (error) {
    console.error("[SCAN_ACCESS] ensureUserByLineUserId failed (ignored):", {
      lineUserId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    // Keep payment gate semantics unchanged: fall through to fail-closed behavior.
  }

  // Get app_user + entitlement
  const { data: appUserRow, error: appUserErr } = await supabase
    .from("app_users")
    .select(
      "id, paid_until, paid_remaining_scans, free_scan_daily_offset, free_scan_offset_date"
    )
    .eq("line_user_id", lineUserId)
    .limit(1)
    .maybeSingle();

  if (appUserErr) {
    // Make future schema drift obvious in logs (does not change behavior).
    const missingColumn =
      typeof appUserErr?.message === "string"
        ? appUserErr.message.match(/column\s+([a-zA-Z0-9_.]+)\s+does not exist/i)?.[1] ||
          null
        : null;

    console.error("[PAYMENT_ACCESS_SCHEMA_MISMATCH]", {
      userId: lineUserId,
      supabaseCode: appUserErr?.code,
      supabaseMessage: appUserErr?.message,
      missingColumn,
      hint:
        "Check SQL migrations for app_users paid columns: paid_remaining_scans, paid_until, paid_plan_code",
    });

    throw appUserErr;
  }

  const appUserId = appUserRow?.id ? String(appUserRow.id) : null;

  const paidUntil = appUserRow?.paid_until ? String(appUserRow.paid_until) : null;
  const paidRemainingScans = appUserRow?.paid_remaining_scans
    ? Number(appUserRow.paid_remaining_scans)
    : 0;

  // Free usage: count scans created today (server local time), minus admin reset offset.
  let freeUsedToday = 0;
  if (appUserId) {
    freeUsedToday = await countScanResultsTodayForAppUser(appUserId, now);
  }

  const offsetDate = appUserRow?.free_scan_offset_date
    ? String(appUserRow.free_scan_offset_date).slice(0, 10)
    : null;
  const offsetN = Number(appUserRow?.free_scan_daily_offset) || 0;
  if (
    offsetDate &&
    offsetDate === getLocalDateKey(now) &&
    offsetN > 0
  ) {
    freeUsedToday = Math.max(0, freeUsedToday - offsetN);
  }

  const gate = decideScanGate({
    freeUsedToday,
    freeQuotaPerDay,
    paidUntil,
    paidRemainingScans,
    now,
  });

  const ctx = resolveScanOfferAccessContext({
    offer,
    freeUsedToday,
    paidUntil,
    paidRemainingScans,
    now,
  });

  console.log(
    JSON.stringify({
      event: "SCAN_OFFER_ACCESS_RESOLVED",
      userIdPrefix: lineUserId.slice(0, 8),
      scenario: ctx.scenario,
      offerLabel: ctx.offerLabel,
      configVersion: ctx.offerConfigVersion,
      freeQuotaPerDay: ctx.freeQuotaPerDay,
      paidPriceThb: ctx.paidPriceThb,
      paidScanCount: ctx.paidScanCount,
      paidWindowHours: ctx.paidWindowHours,
    }),
  );

  const finalDecision = gate.allowed
    ? { allowed: true, reason: gate.reason }
    : { allowed: false, reason: "payment_required" };

  console.log("[SCAN_ACCESS_DEBUG]", {
    userId: lineUserId,
    nowIso,
    paidUntil,
    paidRemainingScans,
    freeUsedToday,
    freeRemainingToday: gate.freeScansRemaining,
    finalDecision,
  });

  return {
    allowed: gate.allowed,
    reason: gate.reason,
    remaining: gate.remaining,
    usedScans: gate.usedScans,
    freeScansLimit: gate.freeScansLimit,
    freeScansRemaining: gate.freeScansRemaining,
    paidUntil: gate.paidUntil,
    paidRemainingScans,
  };
}

/** Text-only paywall reply (LINE Flex reserved for final scan result). */
export async function buildPaymentGateReply({ decision, userId = null }) {
  const offer = loadActiveScanOffer();
  const ctx = resolveScanOfferAccessContext({
    offer,
    freeUsedToday: decision?.usedScans ?? 0,
    paidUntil: decision?.paidUntil ?? null,
    paidRemainingScans: decision?.paidRemainingScans ?? 0,
    now: new Date(),
  });
  const gate = {
    allowed: Boolean(decision?.allowed),
    reason: String(decision?.reason || "payment_required"),
  };
  const built = buildScanOfferReply({
    offer,
    accessContext: ctx,
    gate,
    userId,
  });
  return {
    fallbackText: built.primaryText,
    scanOffer: {
      replyType: built.replyType,
      semanticKey: built.semanticKey,
      primaryText: built.primaryText,
      alternateTexts: built.alternateTexts,
      scanOfferMeta: built.scanOfferMeta,
    },
    decision,
  };
}
