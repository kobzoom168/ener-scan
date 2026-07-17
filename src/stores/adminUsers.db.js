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
  }

  // LIFF onboarding data (ชื่อเล่น/วันเกิด/เบอร์/ช่องทาง) + คนที่ลงทะเบียนผ่าน
  // LIFF แต่ยังไม่เคยสแกน (ads leads). Best-effort — table may not exist yet.
  let liffMap = new Map();
  try {
    const { data: liffRows } = await supabase
      .from("liff_profiles")
      .select("line_user_id,display_name,nickname,phone,birthdate,birth_time,gender,interest,channel,updated_at")
      .order("updated_at", { ascending: false })
      .limit(300);
    liffMap = new Map((liffRows || []).map((r) => [String(r.line_user_id), r]));
    for (const r of liffRows || []) {
      const uid = String(r?.line_user_id || "").trim();
      if (!uid || byUser.has(uid)) continue;
      byUser.set(uid, { lineUserId: uid, lastScanAt: null, recentScans: 0 });
    }
  } catch {
    /* liff_profiles absent → admin page still works without those columns */
  }

  const searchDigits = search.replace(/[^0-9]/g, "");
  const matches = (u) => {
    if (!search) return true;
    if (u.lineUserId.toLowerCase().includes(search)) return true;
    const p = liffMap.get(u.lineUserId);
    if (!p) return false;
    return (
      String(p.nickname || "").toLowerCase().includes(search) ||
      String(p.display_name || "").toLowerCase().includes(search) ||
      (searchDigits.length >= 3 &&
        String(p.phone || "").replace(/[^0-9]/g, "").includes(searchDigits))
    );
  };
  const users = Array.from(byUser.values()).filter(matches).slice(0, limit);
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
    const p = liffMap.get(u.lineUserId) || null;
    u.liff = p
      ? {
          displayName: p.display_name || "",
          nickname: p.nickname || "",
          phone: p.phone || "",
          birthdate: p.birthdate ? String(p.birthdate).slice(0, 10) : "",
          birthTime: p.birth_time || "",
          gender: p.gender || "",
          interest: p.interest || "",
          channel: p.channel || "",
        }
      : null;
  }
  return { users, scanWindow: scans?.length ?? 0 };
}

/** Save the admin's free-text label for a user (e.g. "admin", "test", "VIP"). */
/**
 * แอดมินแก้ข้อมูลลงทะเบียน LIFF (กบ 17 ก.ค. 2026: เคสลูกค้ากดเพศผิด) —
 * แก้ได้เฉพาะฟิลด์ที่อนุญาต (gender/nickname) ในตาราง liff_profiles
 * @param {{ lineUserId: string, gender?: string|null, nickname?: string|null }} p
 */
export async function updateLiffProfileByAdmin({ lineUserId, gender, nickname }) {
  const lu = String(lineUserId || "").trim();
  if (!lu) throw new Error("line_user_id_missing");
  /** @type {Record<string, string|null>} */
  const patch = {};
  if (gender !== undefined) {
    const g = String(gender ?? "").trim();
    const allowed = new Set(["ชาย", "หญิง", "ไม่ระบุ"]);
    if (g && !allowed.has(g)) throw new Error("gender_invalid");
    patch.gender = g || null;
  }
  if (nickname !== undefined) {
    patch.nickname = String(nickname ?? "").trim().slice(0, 60) || null;
  }
  if (Object.keys(patch).length === 0) throw new Error("no_fields");
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("liff_profiles")
    .update(patch)
    .eq("line_user_id", lu)
    .select("line_user_id,gender,nickname")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("liff_profile_not_found");
  console.log(
    JSON.stringify({
      event: "admin_liff_profile_updated",
      lineUserIdPrefix: lu.slice(0, 8),
      fields: Object.keys(patch).filter((k) => k !== "updated_at"),
    }),
  );
  return { lineUserId: lu, gender: data.gender, nickname: data.nickname };
}

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
