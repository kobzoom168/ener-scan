/**
 * ระบบแบน ID (กบ 18 ส.ค. + Codex รีวิว 6 ข้อ)
 *
 * Cache contract (Codex ข้อ 3): DB (PostgREST ของเราเอง) = SSOT · positive-only
 * cache ใน redis — cache เฉพาะ banned=true · ban สำเร็จ → เขียน cache ทันที ·
 * unban สำเร็จ → ลบ cache ทันที (ห้ามรอ TTL) · DB พัง + ไม่มี positive cache →
 * fail-open + critical alert (ห้ามให้ outage ทำลูกค้าทั้งระบบเงียบ) · มี positive
 * cache = drop ต่อแม้ DB สะดุด
 */
import { db } from "../../config/supabase.js";
import { getValue, setLargeValueWithTtl, clearDedupeKey, tryDedupeOnce } from "../../redis/scanV2Redis.js";

const banCacheKey = (uid) => `ban:active:${uid}`;
export const BAN_UID_RE = /^U[0-9a-f]{32}$/;

const log = (event, extra = {}) => console.log(JSON.stringify({ event, ...extra }));

/**
 * @param {string} lineUserId
 * @param {{ dbClient?: any }} [deps]
 * @returns {Promise<boolean>} true = แบนอยู่ (drop ทุกอย่าง)
 */
export async function isBanned(lineUserId, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return false;
  const cacheGet = deps.cacheGet || getValue;
  const cacheSet = deps.cacheSet || setLargeValueWithTtl;
  // positive cache ก่อน — มี = drop แม้ DB จะสะดุด
  try {
    if ((await cacheGet(banCacheKey(uid))) === "1") return true;
  } catch { /* cache พัง = ไปถาม DB */ }
  const client = deps.dbClient || db;
  try {
    const { data, error } = await client
      .from("banned_users")
      .select("id")
      .eq("line_user_id", uid)
      .is("unbanned_at", null)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || "db_error");
    const banned = Boolean(data);
    if (banned) {
      // เติม positive cache (self-heal กรณี cache หาย)
      await cacheSet(banCacheKey(uid), "1", 30 * 24 * 3600).catch(() => {});
    }
    return banned;
  } catch (e) {
    // DB พัง + ไม่มี positive cache → fail-open + critical alert (dedupe 10 นาที)
    log("BAN_CHECK_DB_ERROR_FAIL_OPEN", { uidPrefix: uid.slice(0, 8), message: String(e?.message || e).slice(0, 100) });
    try {
      const alertDedupe = deps.alertDedupe || tryDedupeOnce;
      if (await alertDedupe("ban_check_db_error_alert", 600)) {
        const { sendTelegramText } = await import("../telegramNotify.service.js");
        void sendTelegramText("[CRITICAL] เช็คแบนอ่าน DB ไม่ได้ — ระบบ fail-open ชั่วคราว รีบเช็คฐานข้อมูลครับ").catch(() => {});
      }
    } catch { /* ignore */ }
    return false;
  }
}

/**
 * แบน — insert active row + เขียน positive cache ทันที
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function banUser({ lineUserId, reason, bannedBy }, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!BAN_UID_RE.test(uid)) return { ok: false, reason: "invalid_uid" };
  const cacheSet = deps.cacheSet || setLargeValueWithTtl;
  const client = deps.dbClient || db;
  try {
    const { error } = await client.from("banned_users").insert({
      line_user_id: uid,
      reason: String(reason || "").slice(0, 300) || null,
      source: "manual",
      banned_by: String(bannedBy || "").trim(),
    });
    if (error) {
      // unique active violation = แบนอยู่แล้ว
      if (String(error.message || "").includes("idx_banned_users_active") || String(error.code) === "23505") {
        await cacheSet(banCacheKey(uid), "1", 30 * 24 * 3600).catch(() => {});
        return { ok: false, reason: "already_banned" };
      }
      throw new Error(error.message || "db_error");
    }
    await cacheSet(banCacheKey(uid), "1", 30 * 24 * 3600).catch(() => {});
    log("BAN_USER_BANNED", { uidPrefix: uid.slice(0, 8), bannedBy: String(bannedBy || "").slice(0, 10) });
    return { ok: true };
  } catch (e) {
    log("BAN_USER_BAN_FAILED", { uidPrefix: uid.slice(0, 8), message: String(e?.message || e).slice(0, 100) });
    return { ok: false, reason: "db_error" };
  }
}

/**
 * ปลดแบน — ปิด active row (append-only: เติม unbanned_*) + ลบ cache ทันที
 * และล้าง temporary mute/troll state (Codex ข้อ 3: ไม่งั้นลูกค้ายังเงียบหลังปลด)
 */
export async function unbanUser({ lineUserId, unbannedBy, unbanReason }, deps = {}) {
  const uid = String(lineUserId || "").trim();
  if (!BAN_UID_RE.test(uid)) return { ok: false, reason: "invalid_uid" };
  const cacheDel = deps.cacheDel || clearDedupeKey;
  const client = deps.dbClient || db;
  try {
    const { data, error } = await client
      .from("banned_users")
      .update({
        unbanned_by: String(unbannedBy || "").trim(),
        unbanned_at: new Date().toISOString(),
        unban_reason: String(unbanReason || "").slice(0, 300) || null,
      })
      .eq("line_user_id", uid)
      .is("unbanned_at", null)
      .select("id");
    if (error) throw new Error(error.message || "db_error");
    if (!Array.isArray(data) || data.length === 0) return { ok: false, reason: "not_banned" };
    await cacheDel(banCacheKey(uid)).catch(() => {});
    // ล้าง temporary states ที่ทำให้เงียบต่อ
    for (const k of [`scan_v2:troll_notice:${uid}`, `scan_v2:sticker_streak:${uid}`]) {
      await cacheDel(k).catch(() => {});
    }
    log("BAN_USER_UNBANNED", { uidPrefix: uid.slice(0, 8), unbannedBy: String(unbannedBy || "").slice(0, 10) });
    return { ok: true };
  } catch (e) {
    log("BAN_USER_UNBAN_FAILED", { uidPrefix: uid.slice(0, 8), message: String(e?.message || e).slice(0, 100) });
    return { ok: false, reason: "db_error" };
  }
}

/** ลิสต์แบน active (สำหรับคำสั่ง ดูแบน) */
export async function listActiveBans(deps = {}) {
  const client = deps.dbClient || db;
  try {
    const { data, error } = await client
      .from("banned_users")
      .select("line_user_id,reason,banned_at")
      .is("unbanned_at", null)
      .order("banned_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message || "db_error");
    return { ok: true, rows: data || [] };
  } catch {
    return { ok: false, rows: [] };
  }
}
