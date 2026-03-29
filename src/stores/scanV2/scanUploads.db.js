import { supabase } from "../../config/supabase.js";

/**
 * @param {object} row
 * @returns {Promise<{ id: string } | null>}
 */
export async function insertScanUpload(row) {
  const { data, error } = await supabase
    .from("scan_uploads")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * @param {string} lineMessageId
 * @returns {Promise<{ id: string } | null>}
 */
export async function getScanUploadByLineMessageId(lineMessageId) {
  const { data, error } = await supabase
    .from("scan_uploads")
    .select("id")
    .eq("line_message_id", lineMessageId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function getScanUploadById(id) {
  const { data, error } = await supabase
    .from("scan_uploads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
