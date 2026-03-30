import { supabase } from "../config/supabase.js";

/**
 * @param {string} lineUserId
 * @returns {Promise<object | null>}
 */
export async function getConversationStateByLineUserId(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;

  const { data, error } = await supabase
    .from("conversation_state")
    .select("*")
    .eq("line_user_id", uid)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * @param {object} row Full row including line_user_id + app_user_id
 */
export async function upsertConversationState(row) {
  const { error } = await supabase.from("conversation_state").upsert(row, {
    onConflict: "line_user_id",
  });

  if (error) throw error;
}
