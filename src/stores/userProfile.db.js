import { supabase } from "../config/supabase.js";

export async function getSavedBirthdate(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("birthdate")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[SUPABASE] getSavedBirthdate error:", error.message);
    throw error;
  }

  return data?.birthdate || null;
}

export async function saveBirthdate(userId, birthdate) {
  const { error } = await supabase
    .from("users")
    .upsert({
      id: userId,
      birthdate,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("[SUPABASE] saveBirthdate error:", error.message);
    throw error;
  }

  return true;
}