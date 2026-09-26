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
  computePaidActive,
} from "./scanOfferAccess.resolver.js";
import { buildScanOfferReply } from "./scanOffer.copy.js";
import { getNewCustomerTrialStatus, applyTrialToGate, buildTrialPaywallText } from "./newCustomerTrial.service.js";

export async function checkScanAccess({ userId, now = new Date(), consumeBonus = false }) {
  const lineUserId = String(userId || "").trim();
  const nowIso = now.toISOString();
  const offer = loadActiveScanOffer(now);
  const freeQuotaPerDay = offer.freeQuotaPerDay;

  if (!lineUserId) {
    const finalDecision = { allowed: false, reason: "payment_required" };
    const freeUsedTodayForGate = 0;
    console.log("[SCAN_ACCESS_DEBUG]", {
      userId: lineUserId,
      nowIso,
      paidUntil: null,
      paidRemainingScans: 0,
      freeUsedToday: freeUsedTodayForGate,
      freeUsedTodayForGate,
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

  // Get app_user + entitlement.
  const baseCols =
    "id, paid_until, paid_remaining_scans, free_scan_daily_offset, free_scan_offset_date, bonus_scans";
  const { data: appUserRow, error: appUserErr } = await supabase
    .from("app_users")
    .select(baseCols)
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

  const paidActiveNow = computePaidActive(paidUntil, paidRemainingScans, now);
  const trial = await getNewCustomerTrialStatus(lineUserId);

  // Free usage for gate math:
  // - paid_active => keep free quota untouched for this request (prevents paid scans from exhausting free quota)
  // - non-paid path => count scans created today, then apply admin offset
  let freeUsedToday = 0;
  if (appUserId && !paidActiveNow && !trial.enabled) {
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

  const gate = applyTrialToGate(decideScanGate({
    freeUsedToday,
    freeQuotaPerDay,
    paidUntil,
    paidRemainingScans,
    now,
  }), trial);

  const ctx = resolveScanOfferAccessContext({
    offer: trial.enabled ? { ...offer, freeQuotaPerDay: gate.freeScansLimit } : offer,
    freeUsedToday: trial.enabled ? gate.usedScans : freeUsedToday,
    paidUntil,
    paidRemainingScans,
    now,
  });

  const pkgKeys = Array.isArray(offer.packages)
    ? offer.packages.filter((p) => p?.active !== false).map((p) => p.key)
    : [];

  console.log(
    JSON.stringify({
      event: "SCAN_OFFER_ACCESS_RESOLVED",
      freePolicy: trial.enabled ? "new_customer" : "daily",
      userIdPrefix: lineUserId.slice(0, 8),
      scenario: ctx.scenario,
      offerLabel: ctx.offerLabel,
      configVersion: ctx.offerConfigVersion,
      freeQuotaPerDay: ctx.freeQuotaPerDay,
      defaultPackageKey: offer.defaultPackageKey,
      packageKeys: pkgKeys,
      freeUsedToday: ctx.freeUsedToday,
      freeUsedTodayForGate: ctx.freeUsedToday,
      paidPriceThb: ctx.paidPriceThb,
      paidScanCount: ctx.paidScanCount,
      paidWindowHours: ctx.paidWindowHours,
    }),
  );

  // สิทธิ์โบนัสจากชวนเพื่อน (กบ 23 ก.ค.) — ใช้เมื่อฟรีรายวันหมดเท่านั้น
  // ฟังก์ชันนี้ **ดูอย่างเดียว ไม่หัก** (064, 26 ก.ย. 2026): การจองโบนัสเกิดที่ INSERT scan_jobs
  // (trigger guard_new_customer_trial_job ใต้ row lock) และคืนครั้งเดียวเมื่อ failed/รูปซ้ำ
  // เดิมหักที่นี่เมื่อ consumeBonus=true แต่ด่านรับรูปหยิบผลจาก turnCache (ไม่หัก) ไปใช้ →
  // งานเป็น bonus โดยยอดไม่ลด และหักที่ webhook ไม่มีทางคืนเมื่องานล้ม/รูปซ้ำ
  // `consumeBonus` คงรับไว้เพื่อ compat ของผู้เรียกเดิม — ไม่มีผลใด ๆ
  void consumeBonus;
  let viaBonus = false;
  const bonusScansAvail = Number(appUserRow?.bonus_scans) || 0;
  if (!gate.allowed && bonusScansAvail > 0 && appUserId) viaBonus = true;
  if (viaBonus) {
    gate.allowed = true;
    gate.reason = "free";
    gate.remaining = trial.enabled ? bonusScansAvail : Math.max(1, Number(gate.remaining) || 0);
  }

  const finalDecision = gate.allowed
    ? { allowed: true, reason: gate.reason }
    : { allowed: false, reason: "payment_required" };

  console.log("[SCAN_ACCESS_DEBUG]", {
    userId: lineUserId,
    nowIso,
    paidUntil,
    paidRemainingScans,
    paidActiveNow,
    freeUsedToday,
    freeUsedTodayForGate: freeUsedToday,
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
    freePolicy: gate.freePolicy || "daily",
    freeAccessKind: viaBonus ? "bonus" : trial.enabled ? "trial" : "daily",
    // อนุญาตเพราะโบนัส (ยังไม่จอง — จองตอน INSERT งาน)
    viaBonus,
    // โบนัสคงเหลือจริง — ให้ LIFF แยกแสดง "โบนัส" ออกจากฟรี/ทดลอง/ซื้อ
    bonusScansAvailable: bonusScansAvail,
    trialEligible: gate.trialEligible ?? null,
    trialPending: trial.enabled ? Number(trial.pending) || 0 : 0,
  };
}

/** Text-only paywall reply (LINE Flex reserved for final scan result). */
export async function buildPaymentGateReply({ decision, userId = null }) {
  const offer = loadActiveScanOffer();
  if (decision?.freePolicy === "new_customer") {
    const primaryText = buildTrialPaywallText(offer);
    return {
      fallbackText: primaryText,
      scanOffer: {
        replyType: "free_quota_exhausted",
        semanticKey: "scan_offer:new_customer_trial_exhausted",
        primaryText,
        alternateTexts: [],
        scanOfferMeta: { freePolicy: "new_customer" },
      },
      decision,
    };
  }
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
