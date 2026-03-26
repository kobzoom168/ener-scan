import { supabase } from "../config/supabase.js";

export async function getSavedBirthdate(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("birthdate")
    .eq("id", String(userId))
    .maybeSingle();

  if (error) {
    console.error("[SUPABASE] getSavedBirthdate error:", {
      userId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  console.log("[SUPABASE] getSavedBirthdate success:", {
    userId,
    birthdate: data?.birthdate || null,
  });

  return data?.birthdate || null;
}

/**
 * @param {string} userId
 * @param {string} birthdate — normalized display stored in DB (CE DD/MM/YYYY from parser).
 * @param {{ rawBirthdateInput?: string | null }} [options]
 */
export async function saveBirthdate(userId, birthdate, options = {}) {
  const rawIn = options.rawBirthdateInput;
  console.log("[SUPABASE] saveBirthdate input:", {
    userId,
    birthdate,
    rawBirthdateInput: rawIn ?? null,
  });
  console.log(
    JSON.stringify({
      event: "BIRTHDATE_SAVED",
      userId,
      normalizedBirthdate: String(birthdate),
      rawBirthdateInput: rawIn == null ? null : String(rawIn),
    }),
  );

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
      userId,
      birthdate,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  console.log("[SUPABASE] saveBirthdate success:", {
    userId,
    birthdate,
  });

  return true;
}