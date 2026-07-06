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
    .select("line_user_id,paid_until,paid_remaining_scans,paid_plan_code,admin_note")
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
    u.adminNote = a?.admin_note ? String(a.admin_note) : "";
    u.hasAppUser = Boolean(a);
  }
  return { users, scanWindow: scans?.length ?? 0 };
}

/** Save the admin's free-text label for a user (e.g. "admin", "test", "VIP"). */
export async function setAdminNoteForLineUser({ lineUserId, note }) {
  const lu = String(lineUserId || "").trim();
  if (!lu) throw new Error("line_user_id_missing");
  const clean = String(note ?? "").trim().slice(0, 60);
  const { data, error } = await supabase
    .from("app_users")
    .update({ admin_note: clean || null, updated_at: new Date().toISOString() })
    .eq("line_user_id", lu)
    .select("line_user_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("app_user_not_found");
  console.log(
    JSON.stringify({
      event: "admin_user_note_saved",
      lineUserIdPrefix: lu.slice(0, 8),
      note: clean || null,
    }),
  );
  return { lineUserId: lu, note: clean };
}
