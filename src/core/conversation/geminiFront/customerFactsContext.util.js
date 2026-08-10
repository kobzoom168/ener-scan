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
import { getValue, setLargeValueWithTtl } from "../../../redis/scanV2Redis.js";

const REJECT_REASON_THAI = {
  unclear: "ภาพไม่ชัด/ระบบมองวัตถุไม่เห็น",
  inconclusive: "ระบบอ่านภาพไม่ออกชัดเจน",
  multiple: "ในภาพมีหลายชิ้นปนกัน",
  unsupported: "วัตถุไม่ใช่ประเภทที่รับดู",
};

// สถิติคะแนนรวมทั้งระบบ (กบ 4 ส.ค. — เคสลูกค้าถาม "ของคนอื่นแรงสุดเท่าไหร่"): ตัวเลขจริงจาก DB
// ตอบได้เฉพาะภาพรวม ห้ามเผยรายชิ้น/รายชื่อของลูกค้าคนอื่น · cache 6 ชม.
async function buildScoreStatsLine() {
  const cacheKey = "ener:score_stats_line:v1";
  try {
    const c = await getValue(cacheKey);
    if (c) return c;
  } catch { /* ignore */ }
  try {
    const { data, error } = await supabase.rpc("ener_score_stats");
    if (error || !data) return null;
    const j = typeof data === "string" ? JSON.parse(data) : data;
    const max = Number(j.max);
    if (!Number.isFinite(max)) return null;
    const line =
      `สถิติคะแนนรวมทั้งระบบ (ตัวเลขจริง — ใช้ตอบเมื่อลูกค้าถามเทียบกับของคนอื่น/แรงสุดเท่าไหร่ ` +
      `บอกได้เฉพาะภาพรวม ⛔️ ห้ามเผยว่าชิ้นไหนของใคร): จากการอ่านทั้งหมด ${Number(j.total).toLocaleString()} ครั้ง ` +
      `แรงสุดที่เคยเจอคือ ${max}/10 (มี ${j.cntAtMax} ชิ้น จากลูกค้า ${j.ownersAtMax} คน) · ` +
      `ระดับ 8.5 ขึ้นไปเจอ ${j.cnt85} ครั้ง · ` +
      (Number(j.cnt89) > 0
        ? `เกรด S (8.9 ขึ้นไป) เจอแล้ว ${j.cnt89} ครั้ง`
        : `เกรด S (8.9 ขึ้นไป) ยังไม่เคยเจอเลย — ถ้าลูกค้ามีชิ้นที่ถึง จะเป็นชิ้นแรกของระบบ`);
    try {
      await setLargeValueWithTtl(cacheKey, line, 21600);
    } catch { /* ignore */ }
    return line;
  } catch {
    return null;
  }
}

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
    let adminResetLine = null;
    if (paidActive) {
      freeLine =
        `สิทธิ์แบบชำระเงินยังใช้งานอยู่ เหลือ ${paidRemaining} ครั้ง (ระบบตัดสิทธิ์จ่ายก่อน โควต้าฟรีถูกกันไว้)` +
        ` — ลูกค้าจ่ายเงินและระบบเปิดสิทธิ์เรียบร้อยแล้ว ⛔️ ห้ามทวงสลิป ห้ามพูดเรื่องโอน/QR เด็ดขาด แม้ประวัติแชทจะค้างเรื่องโอนอยู่ (เรื่องจ่ายจบไปแล้ว) — ลูกค้าทักสั้น ๆ เฉย ๆ ให้รับทราบและบอกว่าส่งรูปมาใช้สิทธิ์ได้เลย`;
    } else {
      let freeUsed = 0;
      if (userRow?.id) {
        freeUsed = await countScanResultsTodayForAppUser(String(userRow.id), now).catch(() => 0);
      }
      const offsetDate = userRow?.free_scan_offset_date
        ? String(userRow.free_scan_offset_date).slice(0, 10)
        : null;
      const offsetN = Number(userRow?.free_scan_daily_offset) || 0;
      const resetAppliedToday =
        offsetDate && offsetDate === getLocalDateKey(now) && offsetN > 0;
      if (resetAppliedToday) {
        freeUsed = Math.max(0, freeUsed - offsetN);
      }
      const freeLeft = Math.max(0, freeQuota - freeUsed);
      freeLine = `สิทธิ์ฟรีวันนี้เหลือ ${freeLeft} จาก ${freeQuota} ครั้ง${paidRemaining > 0 ? "" : " (ไม่มีค่าครูค้างอยู่)"}`;
      // เหตุการณ์สด (เคส Nart 15 ก.ค.: แอดมินรีเซ็ตแล้ว AI ยังบอกให้รอพรุ่งนี้):
      // แอดมินเพิ่งรีเซ็ต/เพิ่มสิทธิ์ให้วันนี้ — ห้ามพูดสวนว่าสิทธิ์หมด
      if (resetAppliedToday && freeLeft > 0) {
        adminResetLine =
          `⚠️ เหตุการณ์สด: แอดมินเพิ่งเพิ่มสิทธิ์ฟรีให้ลูกค้าคนนี้วันนี้ (ตอนนี้เหลือ ${freeLeft} ครั้ง) — ` +
          `ห้ามบอกว่าสิทธิ์หมดหรือให้รอพรุ่งนี้ ให้ชวนส่งรูปมาใช้สิทธิ์ได้เลย`;
      }
    }

    // ดวงจากแอป Ener (LIFF) — คำอ่านชุดเดียวกับที่ลูกค้าเห็น ให้อาจารย์ตอบต่อยอดไม่ขัดกัน
    let liffReadingLines = null;
    try {
      const { buildLiffReadingFactsForChat } = await import("../../../routes/liff.routes.js");
      liffReadingLines = await buildLiffReadingFactsForChat(uid);
    } catch {
      liffReadingLines = null;
    }

    const scoreStatsLine = await buildScoreStatsLine();

    // ชุดจัดพลังวันนี้ (กบ 4 ส.ค.): ลูกค้าถามชุดที่ระบบจัดให้ อาจารย์ต้องตอบตรงกับรายงาน
    let synergyLines = null;
    try {
      const { buildSynergyFactsForChat } = await import(
        "../../../services/synergy/synergyReport.service.js"
      );
      synergyLines = await buildSynergyFactsForChat(uid);
    } catch {
      synergyLines = null;
    }

    // โน้ตเคสจากแอดมิน (เคสคุณชิต 15 ก.ค.: แอดมินลบผลผิด+เติมสิทธิ์ แต่บอทไม่รู้เรื่อง พูดคนละทาง):
    // แอดมินฝากเรื่องต่อบอทผ่าน redis `admin_case_note:{uid}` (TTL ตามเคส) — บอทต้องเล่าตรงกัน
    let adminCaseLine = null;
    try {
      const note = String((await getValue(`admin_case_note:${uid}`)) || "").trim();
      if (note) {
        adminCaseLine =
          `⚠️ เหตุการณ์สด (แอดมินฝากบอก): ${note} — ` +
          `ตอบให้ตรงกับเรื่องนี้ ห้ามพูดสวนหรือทำเหมือนไม่รู้เรื่อง`;
      }
    } catch {
      adminCaseLine = null;
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
      "• ค่าครู (ภาษาการเงิน — กบ 30 ก.ค.): เรียกการชำระเงินทุกแบบว่า ค่าครู เสมอ ห้ามใช้คำว่า ซื้อแพ็ก/แพ็กเกจ/สมัครสมาชิก · ห้ามอาจารย์เชียร์ขายหรือเลือกแทนลูกค้าเด็ดขาด — ลูกค้าอยากเปิดสิทธิ์ ให้บอกว่าบอกอาจารย์มาได้เลย เดี๋ยวมีตัวเลือกเด้งให้แตะเลือก (ห้ามสอนพิมพ์คำสั่ง) · ⛔️ ถ้าข้อความล่าสุดของลูกค้าเป็นการตอบคำถามที่อาจารย์ถามไป (เช่น บอกว่าพกเพื่ออะไร บอกชื่อพระ) ให้รับทราบเรื่องนั้น ห้ามสวนด้วยการพูดราคา/ชวนจ่ายเด็ดขาด (เคสจริง 8 ส.ค.: ลูกค้าตอบว่าใส่เสริมงาน แต่บอทตอบราคา 49 จนแอดมินต้องขอโทษ)",
      `• โปรตอนนี้ (ข้อเท็จจริง — ตอบได้เฉพาะเมื่อลูกค้าถามเรื่องโปร/แพ็ก/ราคาเอง ห้ามยกขึ้นมาเสนอก่อน): ${(offer?.packages || [])
        .filter((p) => p && p.active !== false)
        .sort((a, b) => a.priceThb - b.priceThb)
        .map((p) =>
          Number(p.scanCount) >= 999999
            ? `${p.priceThb} บาท สมาชิกรายเดือน อาจารย์ดูแลทั้งเดือน สแกนไม่จำกัด`
            : `${p.priceThb} บาท สแกน ${p.scanCount} ครั้ง`,
        )
        .join(", ") || "ยังไม่เปิดรับค่าครู"} และมีฟรีวันละ ${freeQuota} ครั้ง`,

      ...(adminCaseLine ? [`• ${adminCaseLine}`] : []),
      ...(adminResetLine ? [`• ${adminResetLine}`] : []),
      ...(rejectLine ? [`• ${rejectLine}`] : []),
      ...(liffReadingLines ? [`• ${liffReadingLines}`] : []),
      ...(scoreStatsLine ? [`• ${scoreStatsLine}`] : []),
      ...(synergyLines ? [synergyLines] : []),
    ].join("\n");
  } catch {
    return null;
  }
}
