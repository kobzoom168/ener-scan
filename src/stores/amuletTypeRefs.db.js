/**
 * คลังพิมพ์พระ (sql/039): admin-curated type examples + scan-time kNN match.
 */
import { supabase } from "../config/supabase.js";

export async function listAmuletTypes() {
  const { data, error } = await supabase
    .from("amulet_types")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createAmuletType({ typeKey, labelThai }) {
  const key = String(typeKey || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 60);
  const { error } = await supabase.from("amulet_types").insert({
    type_key: key || `type_${Date.now()}`,
    label_thai: String(labelThai || "").trim().slice(0, 120),
  });
  if (error) throw error;
}

export async function setAmuletTypeEnabled(typeKey, enabled) {
  const { error } = await supabase
    .from("amulet_types")
    .update({ enabled: Boolean(enabled), updated_at: new Date().toISOString() })
    .eq("type_key", String(typeKey));
  if (error) throw error;
}

export async function deleteAmuletType(typeKey) {
  const { error } = await supabase.from("amulet_types").delete().eq("type_key", String(typeKey));
  if (error) throw error;
}

/** @returns {Promise<Array<{id:string,type_key:string,image_path:string|null,source:string,created_at:string}>>} */
export async function listExamplesForType(typeKey) {
  const { data, error } = await supabase
    .from("amulet_type_examples")
    .select("id, type_key, image_path, source_baseline_id, source, status, created_at")
    .eq("type_key", String(typeKey))
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * @param {{ typeKey: string, embedding: number[], imagePath?: string|null, sourceBaselineId?: string|null, source?: string, status?: string }} p
 * status "rejected" = ตัวอย่างลบ (กบกด ✗ ไม่ใช่) — ใช้กันเสนอซ้ำ/สอนจุดต่าง
 * ไม่ถูกใช้ตอนสแกน (RPC กรอง confirmed) และไม่โชว์ในแถบตัวอย่าง
 */
export async function addTypeExample(p) {
  if (!Array.isArray(p.embedding) || p.embedding.length !== 384) throw new Error("bad_embedding");
  const { error } = await supabase.from("amulet_type_examples").insert({
    type_key: String(p.typeKey),
    embedding: JSON.stringify(p.embedding.map(Number)),
    image_path: p.imagePath != null ? String(p.imagePath) : null,
    source_baseline_id: p.sourceBaselineId != null ? String(p.sourceBaselineId) : null,
    source: ["upload", "library", "suggested"].includes(String(p.source)) ? String(p.source) : "upload",
    status: String(p.status) === "rejected" ? "rejected" : "confirmed",
  });
  if (error) throw error;
}

export async function deleteTypeExample(id) {
  const { error } = await supabase.from("amulet_type_examples").delete().eq("id", String(id));
  if (error) throw error;
}

/**
 * Scan-time kNN: top matches across all confirmed examples of enabled types.
 * @param {number[]} embedding
 * @param {number} [k]
 * @returns {Promise<Array<{ example_id: string, type_key: string, label_thai: string, similarity: number }>>}
 */
export async function matchAmuletTypeExamples(embedding, k = 8) {
  if (!Array.isArray(embedding) || embedding.length !== 384) return [];
  const { data, error } = await supabase.rpc("match_amulet_type_examples", {
    query_embedding: embedding.map(Number),
    match_count: Math.min(50, Math.max(1, Math.floor(k))),
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
