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
const banNegCacheKey = (uid) => `ban:neg:${uid}`;
const banTombstoneKey = (uid) => `ban:tomb:${uid}`;
export const BAN_UID_RE = /^U[0-9a-f]{32}$/;
const CHECK_TIMEOUT_MS = 800;

/** bounded await (Codex P0-4): cache/DB ค้าง = ตอบ fallback ภายใน timeout ห้ามลาก webhook */
async function bounded(promise, fallback, ms = CHECK_TIMEOUT_MS) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  // tombstone (P0-3): เพิ่งปลดแบน — ห้ามเชื่อ positive cache / ห้าม query เก่าเขียนกลับ
  const tomb = await bounded(cacheGet(banTombstoneKey(uid)), null);
  if (tomb !== "1") {
    // positive cache ก่อน — มี = drop แม้ DB จะสะดุด
    const pos = await bounded(cacheGet(banCacheKey(uid)), null);
    if (pos === "1") return true;
  }
  // negative cache 45s (P0-4): ลูกค้าปกติไม่อ่าน DB ทุก event
  const neg = await bounded(cacheGet(banNegCacheKey(uid)), null);
  if (neg === "1" && tomb !== "1") return false;
  const client = deps.dbClient || db;
  try {
    const q = client
      .from("banned_users")
      .select("id")
      .eq("line_user_id", uid)
      .is("unbanned_at", null)
      .limit(1)
      .maybeSingle();
    const res = await bounded(Promise.resolve(q), { __timeout: true });
    if (res.__timeout) throw new Error("ban_check_timeout");
    const { data, error } = res;
    if (error) throw new Error(error.message || "db_error");
    const banned = Boolean(data);
    if (banned && tomb !== "1") {
      await bounded(cacheSet(banCacheKey(uid), "1", 30 * 24 * 3600).catch(() => {}), null);
    }
    if (!banned) {
      await bounded(cacheSet(banNegCacheKey(uid), "1", 45).catch(() => {}), null);
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
    const cacheDel = deps.cacheDel || clearDedupeKey;
    await cacheDel(banNegCacheKey(uid)).catch(() => {});
    await cacheDel(banTombstoneKey(uid)).catch(() => {});
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
    const wasBanned = Array.isArray(data) && data.length > 0;
    // ล้าง cache/temporary states เสมอ — แม้ DB บอก not_banned (P0-3: กัน stale cache ค้าง)
    const cacheSet = deps.cacheSet || setLargeValueWithTtl;
    let cacheCleared = true;
    try {
      await cacheDel(banCacheKey(uid));
    } catch {
      cacheCleared = false;
    }
    // tombstone 120s: กัน query เก่า/race เขียน positive cache กลับหลังปลด
    await cacheSet(banTombstoneKey(uid), "1", 120).catch(() => {});
    // ล้าง mute/troll ชั่วคราวทั้งชุด (Codex P0-3) — ไม่งั้นปลดแล้วยังเงียบ
    for (const k of [
      `scan_v2:banned:${uid}`,
      `scan_v2:troll:${uid}`,
      `scan_v2:troll_notice:${uid}`,
      `scan_v2:last_text:${uid}`,
      `scan_v2:sticker_streak:${uid}`,
    ]) {
      try { await cacheDel(k); } catch { cacheCleared = false; }
    }
    if (!wasBanned) return { ok: false, reason: "not_banned", cacheCleared };
    if (!cacheCleared) {
      // DEL พลาด = ห้ามอ้างว่าสำเร็จเฉย ๆ (Codex: strict result)
      log("BAN_USER_UNBAN_CACHE_CLEAR_FAILED", { uidPrefix: uid.slice(0, 8) });
      return { ok: true, cacheCleared: false };
    }
    log("BAN_USER_UNBANNED", { uidPrefix: uid.slice(0, 8), unbannedBy: String(unbannedBy || "").slice(0, 10) });
    return { ok: true, cacheCleared: true };
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
