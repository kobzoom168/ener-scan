import { supabase } from "../config/supabase.js";

export async function getSavedBirthdate(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("birthdate")
    .eq("id", String(userId))
    .maybeSingle();

  if (error) {
    console.error("[SUPABASE] getSavedBirthdate error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return data?.birthdate || null;
}

export async function saveBirthdate(userId, birthdate) {
  console.log("[SUPABASE] saveBirthdate input:", { userId, birthdate });

  const payload = {
    id: String(userId),
    birthdate: String(birthdate),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("users")
    .upsert(payload, {
      onConflict: "id",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error("[SUPABASE] saveBirthdate error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  console.log("[SUPABASE] saveBirthdate success");
  return true;
}