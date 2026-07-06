import { supabase } from "../config/supabase.js";

/**
 * Recent scanners for the admin user page: distinct LINE users from the latest
 * scan_results_v2 rows (newest first) merged with their app_users entitlement.
 * @param {{ limit?: number, scanWindow?: number, q?: string }} opts
 */
export async function listRecentScanUsersForAdmin({
  limit = 100,
  scanWindow = 600,
  q = "",
} = {}) {
  const { data: scans, error } = await supabase
    .from("scan_results_v2")
    .select("line_user_id,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(scanWindow, 50), 2000));
  if (error) throw error;

  const search = String(q || "").trim().toLowerCase();
  const byUser = new Map();
  for (const row of scans || []) {
    const uid = String(row?.line_user_id || "").trim();
    if (!uid) continue;
    if (search && !uid.toLowerCase().includes(search)) continue;
    const cur = byUser.get(uid);
    if (cur) {
      cur.recentScans += 1;
    } else {
      byUser.set(uid, {
        lineUserId: uid,
        lastScanAt: row.created_at ? String(row.created_at) : null,
        recentScans: 1,
      });
    }
    if (byUser.size >= limit && !search) {
      // keep counting only for users already collected
    }
  }

  const users = Array.from(byUser.values()).slice(0, limit);
  if (!users.length) return { users: [], scanWindow: scans?.length ?? 0 };

  const ids = users.map((u) => u.lineUserId);
  const { data: appUsers, error: auErr } = await supabase
    .from("app_users")
    .select("line_user_id,paid_until,paid_remaining_scans,paid_plan_code")
    .in("line_user_id", ids);
  if (auErr) throw auErr;

  const auMap = new Map(
    (appUsers || []).map((a) => [String(a.line_user_id), a]),
  );
  for (const u of users) {
    const a = auMap.get(u.lineUserId);
    u.paidRemainingScans = a?.paid_remaining_scans != null ? Number(a.paid_remaining_scans) : 0;
    u.paidUntil = a?.paid_until ? String(a.paid_until) : null;
    u.paidPlanCode = a?.paid_plan_code ? String(a.paid_plan_code) : null;
    u.hasAppUser = Boolean(a);
  }
  return { users, scanWindow: scans?.length ?? 0 };
}
