/**
 * "Data agent" for the front AI: checks the customer's REAL records before the
 * model answers — stored birthdate, free/paid scan quota (with the actual reset
 * rule), and scan count — so อาจารย์ never asks for what the system already
 * knows and never guesses service facts. Cheap parallel DB reads (~50ms), no
 * extra model call.
 */
import { supabase } from "../../../config/supabase.js";
import { getSavedBirthdate } from "../../../stores/userProfile.db.js";
import {
  countScanResultsTodayForAppUser,
  getLocalDateKey,
} from "../../../stores/paymentAccess.db.js";
import { computePaidActive } from "../../../services/scanOfferAccess.resolver.js";
import { loadActiveScanOffer } from "../../../services/scanOffer.loader.js";
import { getValue } from "../../../redis/scanV2Redis.js";

const REJECT_REASON_THAI = {
  unclear: "ภาพไม่ชัด/ระบบมองวัตถุไม่เห็น",
  inconclusive: "ระบบอ่านภาพไม่ออกชัดเจน",
  multiple: "ในภาพมีหลายชิ้นปนกัน",
  unsupported: "วัตถุไม่ใช่ประเภทที่รับดู",
};

/**
 * @param {string} lineUserId
 * @returns {Promise<string|null>} Thai fact block for the prompt, or null on failure.
 */
export async function buildCustomerFactsContext(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;
  try {
    const now = new Date();
    const [birthdate, userRow] = await Promise.all([
      getSavedBirthdate(uid).catch(() => null),
      supabase
        .from("app_users")
        .select("id,paid_until,paid_remaining_scans,free_scan_daily_offset,free_scan_offset_date")
        .eq("line_user_id", uid)
        .maybeSingle()
        .then((r) => r?.data || null)
        .catch(() => null),
    ]);

    const offer = loadActiveScanOffer(now);
    const freeQuota = Number(offer?.freeQuotaPerDay) || 2;

    const paidUntil = userRow?.paid_until || null;
    const paidRemaining = Number(userRow?.paid_remaining_scans) || 0;
    const paidActive = computePaidActive(paidUntil, paidRemaining, now);

    let freeLine;
    if (paidActive) {
      freeLine = `สิทธิ์แบบชำระเงินยังใช้งานอยู่ เหลือ ${paidRemaining} ครั้ง (ระบบตัดสิทธิ์จ่ายก่อน โควต้าฟรีถูกกันไว้)`;
    } else {
      let freeUsed = 0;
      if (userRow?.id) {
        freeUsed = await countScanResultsTodayForAppUser(String(userRow.id), now).catch(() => 0);
      }
      const offsetDate = userRow?.free_scan_offset_date
        ? String(userRow.free_scan_offset_date).slice(0, 10)
        : null;
      const offsetN = Number(userRow?.free_scan_daily_offset) || 0;
      if (offsetDate && offsetDate === getLocalDateKey(now) && offsetN > 0) {
        freeUsed = Math.max(0, freeUsed - offsetN);
      }
      const freeLeft = Math.max(0, freeQuota - freeUsed);
      freeLine = `สิทธิ์ฟรีวันนี้เหลือ ${freeLeft} จาก ${freeQuota} ครั้ง${paidRemaining > 0 ? "" : " (ไม่มีแพ็กชำระเงินค้างอยู่)"}`;
    }

    // ดวงจากแอป Ener (LIFF) — คำอ่านชุดเดียวกับที่ลูกค้าเห็น ให้อาจารย์ตอบต่อยอดไม่ขัดกัน
    let liffReadingLines = null;
    try {
      const { buildLiffReadingFactsForChat } = await import("../../../routes/liff.routes.js");
      liffReadingLines = await buildLiffReadingFactsForChat(uid);
    } catch {
      liffReadingLines = null;
    }

    // เหตุการณ์สด: ลูกค้าเพิ่งโดนปัดรูปกี่ครั้ง เพราะอะไร — อาจารย์ต้องรู้ก่อนตอบ
    // (บทเรียน 12 ก.ค.: ลูกค้าโดนปัด 8 รอบแต่อาจารย์คุยเหมือนไม่รู้เรื่อง)
    let rejectLine = null;
    try {
      const [streakRaw, lastReason] = await Promise.all([
        getValue(`scan_v2:reject_streak:${uid}`),
        getValue(`scan_v2:reject_last:${uid}`),
      ]);
      const streak = Number(streakRaw) || 0;
      if (streak >= 1) {
        const reasonThai = REJECT_REASON_THAI[String(lastReason || "")] || "อ่านภาพไม่ผ่าน";
        rejectLine =
          `⚠️ เหตุการณ์สด: รูปที่ลูกค้าส่งมาโดนระบบปัดไปแล้ว ${streak} ครั้งติดใน 2 ชม.ล่าสุด ` +
          `(สาเหตุล่าสุด: ${reasonThai}) — ถ้าลูกค้าบ่นหรือถามว่าทำไมสแกนไม่ได้ ให้เห็นใจ ` +
          `ช่วยแนะวิธีถ่ายใหม่แบบใจเย็นและเจาะจง ห้ามตอบเหมือนไม่รู้ว่าเกิดอะไรขึ้น`;
      }
    } catch {
      rejectLine = null;
    }

    return [
      `• วันเกิดในระบบ: ${birthdate ? `${birthdate} (มีแล้ว — ห้ามถามซ้ำ)` : "ยังไม่มี"}`,
      `• ${freeLine}`,
      `• กติกาสิทธิ์ฟรี: วันละ ${freeQuota} ครั้ง รีเซ็ตหลังเที่ยงคืนเวลาไทย ใช้ไม่หมดไม่ทบไปวันถัดไป`,
      "• แพ็กชำระเงิน: ห้ามอาจารย์เชียร์ขาย ระบุราคา หรือเลือกแพ็กแทนลูกค้าเด็ดขาด — ถ้าลูกค้าถามเรื่องแพ็ก/อยากเปิดสิทธิ์/สิทธิ์หมด ให้บอกสั้น ๆ ว่าพิมพ์คำว่า จ่าย แล้วจะมีตัวเลือกให้เลือกเอง",

      ...(rejectLine ? [`• ${rejectLine}`] : []),
      ...(liffReadingLines ? [`• ${liffReadingLines}`] : []),
    ].join("\n");
  } catch {
    return null;
  }
}
