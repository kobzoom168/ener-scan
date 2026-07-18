/**
 * เกตพรีเมียม 2 ชั้น:
 *
 * hasEverPaid — "เคยจ่ายเงินอย่างน้อย 1 ครั้ง" (กบ 17 ก.ค. 2026): ใช้กับเสียงอาจารย์
 *
 * hasRecentPaidAccess — เกตเซ็นเซอร์คลังพระ/อันดับ/พระเด่น (กบ 18 ก.ค. 2026):
 * เปิดเมื่อ paid_until ยังไม่หมด (399 เปิดตลอด 30 วัน + ลูกค้ารายเดือน grandfather
 * + ชั่วโมงแรกของ 29/49 + แอดมินเติมสิทธิ์) หรือจ่ายใบล่าสุดภายใน 3 วัน
 * นอกนั้นเซ็นเซอร์ — จุดประสงค์: ดึงคนกลับมาจ่ายซ้ำ
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

const RECENT_PAY_WINDOW_MS = 3 * 24 * 3600 * 1000;
// สถานะพลิกได้สองทาง (หมดหน้าต่าง 3 วัน → ปิด) เลย cache บวกสั้นกว่า hasEverPaid
const RECENT_POSITIVE_TTL_MS = 10 * 60 * 1000;
/** @type {Map<string, { v: boolean, at: number }>} */
const recentCache = new Map();

/**
 * เปิดคลัง/อันดับ/พระเด่นไหม: paid_until ยังไม่หมด หรือจ่ายใบล่าสุดภายใน 3 วัน
 * @param {string} lineUserId
 * @returns {Promise<boolean>}
 */
export async function hasRecentPaidAccess(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return false;

  const hit = recentCache.get(uid);
  if (hit) {
    const age = Date.now() - hit.at;
    if (hit.v ? age < RECENT_POSITIVE_TTL_MS : age < NEGATIVE_TTL_MS) return hit.v;
  }

  const now = Date.now();
  let v = false;

  const { data: u, error: userErr } = await supabase
    .from("app_users")
    .select("paid_until")
    .eq("line_user_id", uid)
    .maybeSingle();
  if (userErr) throw userErr;
  if (u?.paid_until) {
    const untilMs = Date.parse(String(u.paid_until));
    if (Number.isFinite(untilMs) && untilMs >= now) v = true;
  }

  if (!v) {
    const { data: payRows, error: payErr } = await supabase
      .from("payments")
      .select("verified_at,created_at")
      .eq("line_user_id", uid)
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(3);
    if (payErr) throw payErr;
    for (const row of payRows || []) {
      const ts = Date.parse(String(row.verified_at || row.created_at || ""));
      if (Number.isFinite(ts) && now - ts <= RECENT_PAY_WINDOW_MS) {
        v = true;
        break;
      }
    }
  }

  if (recentCache.size >= CACHE_MAX) recentCache.clear();
  recentCache.set(uid, { v, at: Date.now() });
  return v;
}
