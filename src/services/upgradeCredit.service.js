/**
 * เครดิตอัปเกรด (แผนการตลาด W1 — กบ 15 ก.ค.): จ่ายแพ็กเริ่มต้น (49) แล้ว ภายใน N วัน
 * สมัครรายเดือนได้โดยหักค่าแพ็กนั้นออกจากราคาเต็ม (299 → เหลือโอน 250)
 *
 * กติกา:
 *  - ใช้ได้ครั้งเดียวต่อการจ่ายแพ็กเริ่มต้นหนึ่งรอบ (มีรายเดือนที่จ่ายใหม่กว่า = ใช้ไปแล้ว)
 *  - จ่ายแพ็กเริ่มต้นหลายรอบไม่ทบ (หักได้แค่ราคาแพ็กเดียว)
 *  - สมาชิกรายเดือนที่ยังแอคทีฟอยู่ = ไม่เข้าเงื่อนไข (ไปทางต่ออายุแทน)
 *  - เปิด/ปิด + ปรับจำนวนวันได้จาก /admin/promo (app_settings key "upgrade_credit")
 *  - fail-open: เช็คพลาด = ไม่มีเครดิต (ลูกค้าจ่ายราคาเต็มปกติ ไม่มีอะไรพัง)
 */
import { supabase } from "../config/supabase.js";
import { getAppSetting } from "../stores/appSettings.db.js";
import { loadActiveScanOffer } from "./scanOffer.loader.js";
import { listActivePackages } from "./scanOffer.packages.js";

export const UPGRADE_CREDIT_DEFAULTS = Object.freeze({
  enabled: true,
  days: 7,
});

/** @returns {Promise<{enabled: boolean, days: number}>} */
export async function getUpgradeCreditConfig() {
  try {
    const raw = await getAppSetting("upgrade_credit");
    const o = raw && typeof raw === "object" ? raw : {};
    const days = Math.floor(Number(o.days));
    return {
      enabled: o.enabled !== false,
      days: Number.isFinite(days) && days >= 1 && days <= 30 ? days : UPGRADE_CREDIT_DEFAULTS.days,
    };
  } catch {
    return { ...UPGRADE_CREDIT_DEFAULTS };
  }
}

function isUnlimitedCount(scanCount) {
  return Number(scanCount) >= 999999;
}

/**
 * เช็คสิทธิ์เครดิตอัปเกรดของลูกค้า ณ ตอนนี้
 * @param {string} lineUserId
 * @returns {Promise<null | {
 *   creditThb: number,
 *   payThb: number,
 *   monthlyPriceThb: number,
 *   monthlyPkgKey: string,
 *   sourcePaymentId: string,
 *   expiresAtMs: number
 * }>}
 */
export async function getUpgradeCreditForLineUser(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;
  try {
    const cfg = await getUpgradeCreditConfig();
    if (!cfg.enabled) return null;

    const offer = loadActiveScanOffer();
    const pkgs = listActivePackages(offer);
    const monthly = pkgs.find((p) => isUnlimitedCount(p.scanCount)) || null;
    if (!monthly) return null;
    const entries = pkgs
      .filter((p) => !isUnlimitedCount(p.scanCount))
      .sort((a, b) => a.priceThb - b.priceThb);
    const entry = entries[0] || null;
    if (!entry) return null;
    const payThb = Number(monthly.priceThb) - Number(entry.priceThb);
    if (!Number.isFinite(payThb) || payThb < 1) return null;

    // สมาชิกรายเดือนที่ยังแอคทีฟ = ไม่ต้องมีเครดิต (เข้าเลนต่ออายุ)
    const { data: u } = await supabase
      .from("app_users")
      .select("paid_until,paid_remaining_scans")
      .eq("line_user_id", uid)
      .maybeSingle();
    if (
      u?.paid_until &&
      new Date(u.paid_until).getTime() > Date.now() &&
      Number(u.paid_remaining_scans) >= 900000
    ) {
      return null;
    }

    const { data: rows, error } = await supabase
      .from("payments")
      .select("id,expected_amount,package_code,verified_at,created_at")
      .eq("line_user_id", uid)
      .eq("status", "paid")
      .order("verified_at", { ascending: false })
      .limit(12);
    if (error) throw error;

    const sinceMs = Date.now() - cfg.days * 24 * 3600 * 1000;
    const paidAtMs = (r) =>
      Date.parse(String(r?.verified_at || r?.created_at || "")) || 0;

    const source = (rows || []).find(
      (r) =>
        Number(r.expected_amount) === Number(entry.priceThb) &&
        paidAtMs(r) >= sinceMs,
    );
    if (!source) return null;

    // ใช้ไปแล้วหรือยัง: มีรายเดือน (ราคาเต็มหรือราคาหักเครดิต) ที่จ่ายใหม่กว่าแพ็กต้นทาง
    const usedAlready = (rows || []).some(
      (r) =>
        r.id !== source.id &&
        paidAtMs(r) > paidAtMs(source) &&
        (String(r.package_code) === String(monthly.key) ||
          Number(r.expected_amount) === Number(monthly.priceThb) ||
          Number(r.expected_amount) === payThb),
    );
    if (usedAlready) return null;

    return {
      creditThb: Number(entry.priceThb),
      payThb,
      monthlyPriceThb: Number(monthly.priceThb),
      monthlyPkgKey: String(monthly.key),
      sourcePaymentId: String(source.id),
      expiresAtMs: paidAtMs(source) + cfg.days * 24 * 3600 * 1000,
    };
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "UPGRADE_CREDIT_CHECK_FAILED",
        lineUserIdPrefix: uid.slice(0, 8),
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return null;
  }
}
