import { supabase } from "../config/supabase.js";

function normalizeLineUserId(lineUserId) {
  return String(lineUserId || "").trim();
}

export async function ensureUserByLineUserId(lineUserId, { displayName } = {}) {
  const normalizedLineUserId = normalizeLineUserId(lineUserId);
  if (!normalizedLineUserId) {
    throw new Error("line_user_id_missing");
  }

  const { data: existing, error: selectError } = await supabase
    .from("app_users")
    .select("id,line_user_id,display_name,birthdate,paid_until,status")
    .eq("line_user_id", normalizedLineUserId)
    .maybeSingle();

  if (selectError) {
    console.error("[SUPABASE] ensureUserByLineUserId select error:", {
      lineUserId: normalizedLineUserId,
      message: selectError.message,
      code: selectError.code,
      details: selectError.details,
      hint: selectError.hint,
    });
    throw selectError;
  }

  if (existing?.id) {
    // Optionally backfill display_name when missing
    if (displayName && !existing.display_name) {
      const { error: updateError } = await supabase
        .from("app_users")
        .update({
          display_name: String(displayName),
          last_active_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("[SUPABASE] ensureUserByLineUserId update error:", {
          userId: existing.id,
          lineUserId: normalizedLineUserId,
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
        });
        // Keep non-fatal: user exists, mapping works.
      }
    }

    return {
      id: existing.id,
      lineUserId: existing.line_user_id,
      displayName: existing.display_name || null,
      birthdate: existing.birthdate || null,
      paidUntil: existing.paid_until ? String(existing.paid_until) : null,
      status: existing.status || "active",
    };
  }

  const payload = {
    line_user_id: normalizedLineUserId,
    display_name: displayName ? String(displayName) : null,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_active_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertError } = await supabase
    .from("app_users")
    .insert(payload)
    .select("id,line_user_id,display_name,birthdate,paid_until,status")
    .maybeSingle();

  if (insertError) {
    console.error("[SUPABASE] ensureUserByLineUserId insert error:", {
      lineUserId: normalizedLineUserId,
      message: insertError.message,
      code: insertError.code,
      details: insertError.details,
      hint: insertError.hint,
    });
    throw insertError;
  }

  if (!inserted?.id) {
    throw new Error("app_user_insert_failed");
  }

  return {
    id: inserted.id,
    lineUserId: inserted.line_user_id,
    displayName: inserted.display_name || null,
    birthdate: inserted.birthdate || null,
    paidUntil: inserted.paid_until ? String(inserted.paid_until) : null,
    status: inserted.status || "active",
  };
}

export async function touchUserLastActive(appUserId) {
  const normalizedId = String(appUserId || "").trim();
  if (!normalizedId) return false;

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("app_users")
    .update({
      last_active_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", normalizedId);

  if (error) {
    console.error("[SUPABASE] touchUserLastActive error:", {
      userId: normalizedId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return true;
}
