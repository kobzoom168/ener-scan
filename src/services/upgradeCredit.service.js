/**
 * Spend-to-upgrade (กบเคาะ 30 ก.ค. 2026 — D ส่วนที่ 2 ใน roadmap 90 วัน):
 * ค่าครูรายย่อย (29/49) ที่จ่าย "วันนี้" (วันไทย) สะสมแล้วหักออกจากค่าครูดูแลคลังพลัง
 * (แพ็กใหญ่สุด 399) ได้ทั้งก้อน — อุดรอยรั่วเคสจริง: ลูกค้าจ่าย 49 ห้ารอบ (245 บาท)
 * ในวันเดียวแต่ไม่มีใครชวนขึ้น 399
 *
 * กติกา (กบ: "ตามพี่เลย"):
 *  - เครดิต = ยอดจ่ายสำเร็จของแพ็กเล็กสะสมภายในวันนี้ (เที่ยงคืนไทยรีเซ็ต)
 *  - ระบบเสนออัตโนมัติเมื่อจ่ายรอบที่ 2 ของวันขึ้นไป · เสนอวันละ 1 ครั้ง (redis dedupe)
 *  - ไม่เสนอคนที่แพ็กใหญ่ยังแอคทีฟอยู่ (เข้าเลนต่ออายุแทน)
 *  - จ่ายส่วนต่างผ่าน flow เดิมทั้งหมด (ปุ่ม/พิมพ์ "จ่าย 399" — แชทกับ LIFF หักเครดิตให้อยู่แล้ว)
 *  - เปิด/ปิดจาก /admin/promo (app_settings key "upgrade_credit") · fail-open: เช็คพลาด = ไม่มีเครดิต
 *
 * เดิม (แผน W1 15 ก.ค.): เครดิตแพ็กเดียวภายใน 7 วัน ผูกกับแพ็ก unlimited 299 ที่เลิกขายแล้ว
 * → ตัวเช็คคืน null ตลอด ฟีเจอร์ตายเงียบ — เวอร์ชันนี้แทนที่ทั้งตัว (คงโครงผลลัพธ์เดิม
 * เพื่อให้จุดใช้งานเดิมใน lineWebhook / liff / deliverOutbound ทำงานต่อได้ทันที)
 */
import { supabase } from "../config/supabase.js";
import { getAppSetting } from "../stores/appSettings.db.js";
import { loadActiveScanOffer } from "./scanOffer.loader.js";
import { listActivePackages } from "./scanOffer.packages.js";
import { tryDedupeOnce } from "../redis/scanV2Redis.js";

export const UPGRADE_CREDIT_DEFAULTS = Object.freeze({
  enabled: true,
  minPaymentsForOffer: 2,
});

/** @returns {Promise<{enabled: boolean, minPaymentsForOffer: number}>} */
export async function getUpgradeCreditConfig() {
  try {
    const raw = await getAppSetting("upgrade_credit");
    const o = raw && typeof raw === "object" ? raw : {};
    const minN = Math.floor(Number(o.minPaymentsForOffer));
    return {
      enabled: o.enabled !== false,
      minPaymentsForOffer:
        Number.isFinite(minN) && minN >= 1 && minN <= 10
          ? minN
          : UPGRADE_CREDIT_DEFAULTS.minPaymentsForOffer,
    };
  } catch {
    return { ...UPGRADE_CREDIT_DEFAULTS };
  }
}

function bangkokDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}
/** เที่ยงคืนไทยของวันนี้ (ISO UTC) */
function bangkokDayStartIso(now = new Date()) {
  return new Date(`${bangkokDateKey(now)}T00:00:00+07:00`).toISOString();
}
/** เที่ยงคืนไทยของพรุ่งนี้ (ms) — จุดหมดอายุเครดิต */
function bangkokDayEndMs(now = new Date()) {
  return new Date(`${bangkokDateKey(now)}T00:00:00+07:00`).getTime() + 24 * 3600e3;
}

/** แพ็กเป้าหมาย = แพ็กราคาสูงสุดที่เปิดขาย (ตอนนี้ = ค่าครูดูแลคลังพลัง 399) */
function resolveTargetPackage(offer) {
  const pkgs = listActivePackages(offer);
  if (!pkgs.length) return { target: null, smalls: [] };
  const sorted = [...pkgs].sort((a, b) => Number(b.priceThb) - Number(a.priceThb));
  return { target: sorted[0], smalls: sorted.slice(1) };
}

/**
 * เช็คเครดิต Spend-to-upgrade ของลูกค้า ณ ตอนนี้ (คงโครงผลลัพธ์เดิม + ฟิลด์ใหม่)
 * @param {string} lineUserId
 * @returns {Promise<null | {
 *   creditThb: number,
 *   payThb: number,
 *   monthlyPriceThb: number,
 *   monthlyPkgKey: string,
 *   monthlyScanCount: number,
 *   paymentsTodayCount: number,
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
    const { target, smalls } = resolveTargetPackage(offer);
    if (!target || !smalls.length) return null;
    const targetPrice = Number(target.priceThb);

    // แพ็กใหญ่ยังแอคทีฟ = เข้าเลนต่ออายุ ไม่ใช่อัปเกรด
    const { data: u } = await supabase
      .from("app_users")
      .select("paid_until,paid_plan_code")
      .eq("line_user_id", uid)
      .maybeSingle();
    if (
      u?.paid_until &&
      new Date(u.paid_until).getTime() > Date.now() &&
      String(u.paid_plan_code || "") === String(target.key)
    ) {
      return null;
    }

    const sinceIso = bangkokDayStartIso();
    const { data: rows, error } = await supabase
      .from("payments")
      .select("id,expected_amount,package_code,verified_at,created_at")
      .eq("line_user_id", uid)
      .eq("status", "paid")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;

    const smallPrices = new Set(smalls.map((p) => Number(p.priceThb)));
    const paidToday = rows || [];

    // จ่าย/อัปเกรดแพ็กใหญ่ไปแล้ววันนี้ = จบ ไม่ต้องเสนอซ้ำ
    const targetPaidToday = paidToday.some(
      (r) =>
        String(r.package_code || "") === String(target.key) ||
        Number(r.expected_amount) === targetPrice,
    );
    if (targetPaidToday) return null;

    const smallsToday = paidToday.filter((r) =>
      smallPrices.has(Number(r.expected_amount)),
    );
    if (!smallsToday.length) return null;

    const creditThb = smallsToday.reduce(
      (sum, r) => sum + Number(r.expected_amount || 0),
      0,
    );
    const payThb = targetPrice - creditThb;
    if (!Number.isFinite(payThb) || payThb < 1) return null;

    return {
      creditThb,
      payThb,
      monthlyPriceThb: targetPrice,
      monthlyPkgKey: String(target.key),
      monthlyScanCount: Number(target.scanCount) || 0,
      paymentsTodayCount: smallsToday.length,
      sourcePaymentId: String(smallsToday[0].id),
      expiresAtMs: bangkokDayEndMs(),
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

/**
 * เสนอ Spend-to-upgrade อัตโนมัติหลังจ่ายสำเร็จ (เรียก fire-and-forget จากทุกเส้นอนุมัติสลิป)
 * เงื่อนไข: จ่ายแพ็กเล็กรอบที่ 2 ของวันขึ้นไป + มีเครดิต + ยังไม่เคยเสนอวันนี้
 * @param {string} lineUserId
 */
export async function maybeOfferSpendUpgrade(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return { skipped: "no_uid" };
  try {
    const cfg = await getUpgradeCreditConfig();
    if (!cfg.enabled) return { skipped: "disabled" };

    const credit = await getUpgradeCreditForLineUser(uid);
    if (!credit) return { skipped: "no_credit" };
    if (credit.paymentsTodayCount < cfg.minPaymentsForOffer) {
      return { skipped: "below_min_payments" };
    }

    const first = await tryDedupeOnce(
      `scan_v2:spend_upgrade_offer:${uid}:${bangkokDateKey()}`,
      20 * 3600,
    );
    if (!first) return { skipped: "offered_today" };

    // รอข้อความยืนยันเปิดสิทธิ์ถึงมือลูกค้าก่อน ค่อยตามด้วยข้อเสนอ
    await new Promise((r) => setTimeout(r, 8000));

    const token = String(process.env.CHANNEL_ACCESS_TOKEN || "").trim();
    if (!token) return { skipped: "no_line_token" };

    const text = [
      `วันนี้คุณเปิดค่าครูไปแล้ว ${credit.creditThb} บาท (${credit.paymentsTodayCount} รายการ)`,
      `ยอดนี้นำไปหักจากค่าครูดูแลคลังพลัง ${credit.monthlyPriceThb} บาทได้`,
      `เพิ่มอีก ${credit.payThb} บาท ได้สิทธิ์สแกน ${credit.monthlyScanCount} ครั้ง ตลอด 30 วัน และสิทธิ์ที่เหลืออยู่ตอนนี้ไม่หายไปไหน ระบบทบให้`,
      "สนใจแตะปุ่มด้านล่างได้ หรือจะไว้ก่อนก็ได้",
    ].join("\n");

    {
      const { allowCustomerPush } = await import("./lineOutbound/customerPush.gateway.js");
      const gate = await allowCustomerPush(uid, { source: "upgrade_offer" });
      if (!gate.allowed) return { skipped: gate.suppressedBanned ? "suppressed_banned" : "no_uid" };
    }
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        to: uid,
        messages: [
          {
            type: "text",
            text,
            quickReply: {
              items: [
                {
                  type: "action",
                  action: {
                    type: "message",
                    label: `อัปเกรด เหลือโอน ${credit.payThb} บาท`,
                    text: `จ่าย ${credit.monthlyPriceThb}`,
                  },
                },
                {
                  type: "action",
                  action: { type: "message", label: "ไว้ก่อน", text: "ไว้ก่อน" },
                },
              ],
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const { insertLineConversationMessage } = await import(
        "../stores/conversationMessages.db.js"
      );
      void insertLineConversationMessage(uid, "bot", text);
    }
    console.log(
      JSON.stringify({
        event: res.ok ? "SPEND_UPGRADE_OFFER_SENT" : "SPEND_UPGRADE_OFFER_PUSH_FAILED",
        lineUserIdPrefix: uid.slice(0, 8),
        creditThb: credit.creditThb,
        payThb: credit.payThb,
      }),
    );
    return { offered: res.ok };
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "SPEND_UPGRADE_OFFER_FAILED",
        lineUserIdPrefix: uid.slice(0, 8),
        message: String(e?.message || e).slice(0, 160),
      }),
    );
    return { error: true };
  }
}
