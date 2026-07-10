/**
 * Runtime key→jsonb settings (app_settings, sql/041) — admin เปลี่ยนค่าได้สด ๆ
 * ไม่ต้อง restart. อ่านผ่าน cache สั้น ๆ กัน DB โดนถามทุก scan.
 */
import { supabase } from "../config/supabase.js";

/** @type {Map<string, { value: unknown, at: number }>} */
const cache = new Map();
const CACHE_MS = 30_000;

/**
 * @param {string} key
 * @returns {Promise<unknown | null>} jsonb value or null when unset
 */
export async function getAppSetting(key) {
  const k = String(key || "").trim();
  if (!k) return null;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", k)
    .maybeSingle();
  if (error) throw error;
  const value = data ? data.value : null;
  cache.set(k, { value, at: Date.now() });
  return value;
}

/**
 * @param {string} key
 * @param {unknown} value plain JSON-serializable object
 */
export async function setAppSetting(key, value) {
  const k = String(key || "").trim();
  if (!k) throw new Error("app_setting_key_missing");
  const row = { key: k, value, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("app_settings").upsert(row, { onConflict: "key" });
  if (error) throw error;
  cache.set(k, { value, at: Date.now() });
  console.log(JSON.stringify({ event: "APP_SETTING_SAVED", key: k }));
}
