/**
 * "เคยจ่ายเงินอย่างน้อย 1 ครั้ง" — เกตของพรีเมียม (กบ 17 ก.ค. 2026):
 * คลังพระเต็ม / อันดับ 1-2 / หนุนดวงวันนี้ / เสียงอาจารย์ = เคยจ่ายก็เห็นตลอด
 * (เดิมผูกกับ "สมาชิกรายเดือนแอคทีฟ" — แพ็กรายเดือนเลิกขายแล้ว เหลือลูกค้าเก่า grandfather)
 *
 * แหล่งความจริง: payments แถว status=paid สักใบ → fallback app_users.paid_until
 * เคยถูกตั้งค่า (ครอบเคสแอดมินเติมสิทธิ์ชดเชยซึ่งไม่มีแถว payments)
 *
 * โยน error เมื่อ DB อ่านไม่ได้ — ผู้เรียกเลือกเองว่า fail-open (หน้ารายงาน) หรือ
 * fail-closed (เสียง มีต้นทุนต่อครั้ง)
 */
import { supabase } from "../config/supabase.js";

const POSITIVE_TTL_MS = 24 * 3600 * 1000; // เคยจ่าย = สถานะทางเดียว cache ยาวได้
const NEGATIVE_TTL_MS = 60 * 1000; // เพิ่งจ่ายใบแรกต้องปลดล็อกไว
/** @type {Map<string, { v: boolean, at: number }>} */
const cache = new Map();
const CACHE_MAX = 5000;

/**
 * @param {string} lineUserId
 * @returns {Promise<boolean>}
 */
export async function hasEverPaid(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return false;

  const hit = cache.get(uid);
  if (hit) {
    const age = Date.now() - hit.at;
    if (hit.v ? age < POSITIVE_TTL_MS : age < NEGATIVE_TTL_MS) return hit.v;
  }

  const { data: payRows, error: payErr } = await supabase
    .from("payments")
    .select("id")
    .eq("line_user_id", uid)
    .eq("status", "paid")
    .limit(1);
  if (payErr) throw payErr;

  let v = Array.isArray(payRows) && payRows.length > 0;
  if (!v) {
    const { data: u, error: userErr } = await supabase
      .from("app_users")
      .select("paid_until")
      .eq("line_user_id", uid)
      .maybeSingle();
    if (userErr) throw userErr;
    v = u?.paid_until != null;
  }

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(uid, { v, at: Date.now() });
  return v;
}
