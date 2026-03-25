import { supabase } from "../config/supabase.js";
import { resolveActiveScanOfferCalm } from "./scanOffer.loader.js";
import {
  findActivePackageByPriceThb,
  findPackageByKey,
} from "./scanOffer.packages.js";

/** Legacy แพ็กเกจเดิม (อนุมัติสลิปเก่าที่ยังอ้าง package นี้) */
const PAID_PLAN_CODE_15SCANS_24H = "99baht_15scans_24h";

function parsePackageCodeToEntitlement(packageCode) {
  const code = String(packageCode || "").trim();

  // Count-based packages (legacy keys — prefer config-backed grant when possible)
  if (code.includes("10scans") || code === "99baht_10scans_24h") {
    return {
      paid_until_ms: Date.now() + 24 * 60 * 60 * 1000,
      paid_remaining_scans: 10,
      paid_plan_code: code || "99baht_10scans_24h",
    };
  }

  if (code.includes("4scans") || code === "49baht_4scans_24h") {
    return {
      paid_until_ms: Date.now() + 24 * 60 * 60 * 1000,
      paid_remaining_scans: 4,
      paid_plan_code: code || "49baht_4scans_24h",
    };
  }

  if (code.includes("15scans") || code === PAID_PLAN_CODE_15SCANS_24H) {
    return {
      paid_until_ms: Date.now() + 24 * 60 * 60 * 1000,
      paid_remaining_scans: 15,
      paid_plan_code: code || PAID_PLAN_CODE_15SCANS_24H,
    };
  }

  if (code.includes("3scans")) {
    return {
      paid_until_ms: Date.now() + 24 * 60 * 60 * 1000,
      paid_remaining_scans: 3,
      paid_plan_code: code,
    };
  }

  if (code.includes("single")) {
    return {
      paid_until_ms: Date.now() + 24 * 60 * 60 * 1000,
      paid_remaining_scans: 1,
      paid_plan_code: code,
    };
  }

  // Time-based packages (unlimited scans within the window)
  if (code.includes("7_days")) {
    return {
      paid_until_ms: Date.now() + 7 * 24 * 60 * 60 * 1000,
      paid_remaining_scans: 999999,
      paid_plan_code: code,
    };
  }

  if (code.includes("30_days")) {
    return {
      paid_until_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
      paid_remaining_scans: 999999,
      paid_plan_code: code,
    };
  }

  // Default fail-safe: treat as 0 entitlement rather than opening incorrectly.
  return {
    paid_until_ms: 0,
    paid_remaining_scans: 0,
    paid_plan_code: code,
  };
}

function paidUntilMsFromUnlockHint(unlockHoursFromPayment, pkg) {
  const u = Number(unlockHoursFromPayment);
  if (Number.isFinite(u) && u > 0) {
    return Date.now() + u * 60 * 60 * 1000;
  }
  if (pkg && Number.isFinite(Number(pkg.windowHours)) && Number(pkg.windowHours) > 0) {
    return Date.now() + Number(pkg.windowHours) * 60 * 60 * 1000;
  }
  return null;
}

export async function grantEntitlementForPackage({
  appUserId,
  packageCode,
  expectedAmountThb = null,
  unlockHoursFromPayment = null,
} = {}) {
  const appUserIdStr = String(appUserId || "").trim();
  if (!appUserIdStr) throw new Error("grantEntitlement_missing_appUserId");

  const offer = resolveActiveScanOfferCalm();
  let pkg = findPackageByKey(offer, packageCode);
  if (!pkg && expectedAmountThb != null) {
    const amt = Number(expectedAmountThb);
    if (Number.isFinite(amt) && amt > 0) {
      pkg = findActivePackageByPriceThb(offer, amt);
    }
  }
  if (pkg) {
    const paid_until_ms =
      paidUntilMsFromUnlockHint(unlockHoursFromPayment, pkg) ??
      Date.now() + 24 * 60 * 60 * 1000;
    const entitlement = {
      paid_until_ms,
      paid_remaining_scans: pkg.scanCount,
      paid_plan_code: pkg.key,
    };
    const paidUntilIso = new Date(entitlement.paid_until_ms).toISOString();
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("app_users")
      .update({
        paid_until: paidUntilIso,
        paid_remaining_scans: entitlement.paid_remaining_scans,
        paid_plan_code: entitlement.paid_plan_code,
        updated_at: nowIso,
      })
      .eq("id", appUserIdStr);

    if (error) throw error;

    return {
      paidUntil: paidUntilIso,
      paidRemainingScans: entitlement.paid_remaining_scans,
      paidPlanCode: entitlement.paid_plan_code,
    };
  }

  const entitlement = parsePackageCodeToEntitlement(packageCode);
  let paidUntilMs = entitlement.paid_until_ms;
  const unlock = Number(unlockHoursFromPayment);
  if (Number.isFinite(unlock) && unlock > 0) {
    paidUntilMs = Date.now() + unlock * 60 * 60 * 1000;
  }
  const legacy = { ...entitlement, paid_until_ms: paidUntilMs };
  const paidUntilIso = new Date(legacy.paid_until_ms).toISOString();

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("app_users")
    .update({
      paid_until: paidUntilIso,
      paid_remaining_scans: legacy.paid_remaining_scans,
      paid_plan_code: legacy.paid_plan_code,
      updated_at: nowIso,
    })
    .eq("id", appUserIdStr);

  if (error) throw error;

  return {
    paidUntil: paidUntilIso,
    paidRemainingScans: legacy.paid_remaining_scans,
    paidPlanCode: legacy.paid_plan_code,
  };
}

