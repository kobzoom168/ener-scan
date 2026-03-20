import { supabase } from "../config/supabase.js";

const PAID_PLAN_CODE_15SCANS_24H = "99baht_15scans_24h";

function parsePackageCodeToEntitlement(packageCode) {
  const code = String(packageCode || "").trim();

  // Count-based packages
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

export async function grantEntitlementForPackage({ appUserId, packageCode }) {
  const appUserIdStr = String(appUserId || "").trim();
  if (!appUserIdStr) throw new Error("grantEntitlement_missing_appUserId");

  const entitlement = parsePackageCodeToEntitlement(packageCode);
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

