import { supabase } from "../config/supabase.js";

const MAX_HISTORY = 20;

function createHistoryItem(input) {
  if (typeof input === "string") {
    return {
      time: new Date().toISOString(),
      result: input,
      energyScore: "-",
      mainEnergy: "-",
      compatibility: "-",
      imageHash: null,
    };
  }

  return {
    time: input?.time
      ? new Date(input.time).toISOString()
      : new Date().toISOString(),
    result: input?.result || "",
    energyScore: input?.energyScore || "-",
    mainEnergy: input?.mainEnergy || "-",
    compatibility: input?.compatibility || "-",
    imageHash: input?.imageHash || null,
  };
}

export async function addScanHistory(userId, input) {
  if (!userId) return false;

  const item = createHistoryItem(input);

  const score =
    item.energyScore !== "-" && item.energyScore !== ""
      ? Number(item.energyScore)
      : null;

  const { error } = await supabase.from("scans").insert({
    user_id: userId,
    image_hash: item.imageHash,
    score: Number.isFinite(score) ? score : null,
    main_energy: item.mainEnergy !== "-" ? item.mainEnergy : null,
    compatibility: item.compatibility !== "-" ? item.compatibility : null,
    raw_text: item.result || null,
    created_at: item.time,
  });

  if (error) {
    console.error("[SUPABASE] addScanHistory error:", error.message);
    throw error;
  }

  return true;
}

export async function getScanHistory(userId, limit = MAX_HISTORY) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("scans")
    .select("id, score, main_energy, compatibility, raw_text, image_hash, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[SUPABASE] getScanHistory error:", error.message);
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id,
    time: row.created_at,
    result: row.raw_text || "",
    energyScore:
      row.score === null || row.score === undefined ? "-" : String(row.score),
    mainEnergy: row.main_energy || "-",
    compatibility: row.compatibility || "-",
    imageHash: row.image_hash || null,
  }));
}

export async function getLatestScanHistory(userId) {
  const history = await getScanHistory(userId, 1);
  return history.length > 0 ? history[0] : null;
}

export async function getScanHistoryCount(userId) {
  if (!userId) return 0;

  const { count, error } = await supabase
    .from("scans")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    console.error("[SUPABASE] getScanHistoryCount error:", error.message);
    throw error;
  }

  return count || 0;
}

export async function clearScanHistory(userId) {
  if (!userId) return false;

  const { error } = await supabase.from("scans").delete().eq("user_id", userId);

  if (error) {
    console.error("[SUPABASE] clearScanHistory error:", error.message);
    throw error;
  }

  return true;
}

export async function clearAllScanHistory() {
  const { error } = await supabase
    .from("scans")
    .delete()
    .not("id", "is", null);

  if (error) {
    console.error("[SUPABASE] clearAllScanHistory error:", error.message);
    throw error;
  }

  return true;
}