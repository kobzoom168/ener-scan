/**
 * เตือนต่ออายุแพ็กรายเดือนอัตโนมัติ (กบ 12 ก.ค.): ลูกค้ารายเดือน (ไม่จำกัด) ที่โปร
 * จะหมดในอีก N วัน แม้ไม่ได้ส่งอะไรมา ระบบ push เตือนเอง 1 ครั้งต่อรอบสมาชิก
 * พร้อมปุ่มเลือก จ่าย 49/149/299 กับ ไว้ก่อน — เฉพาะแพ็กรายเดือนเท่านั้น
 *
 * ตั้งค่าสดได้ที่ /admin/promo → app_settings key "renewal_reminder"
 * ส่งผ่านคิว outbound (kind "renewal_reminder") ให้ delivery worker คุมเรตเหมือนข้อความอื่น
 */
import { supabase } from "../../config/supabase.js";
import { getAppSetting } from "../../stores/appSettings.db.js";
import { insertOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import { OUTBOUND_PRIORITY } from "../../stores/scanV2/outboundPriority.js";
import { tryDedupeOnce } from "../../redis/scanV2Redis.js";
import { loadActiveScanOffer } from "../scanOffer.loader.js";

const UNLIMITED_MIN = 900000;

export const RENEWAL_REMINDER_DEFAULTS = Object.freeze({
  enabled: true,
  daysBefore: 2,
  text: "แพ็กรายเดือนของคุณจะหมด {date} นี้ครับ ต่อเลยหรือไว้ก่อนก็ได้ เลือกได้เลย",
});

/** @returns {Promise<{enabled: boolean, daysBefore: number, text: string}>} */
export async function getRenewalReminderConfig() {
  try {
    const raw = await getAppSetting("renewal_reminder");
    const o = raw && typeof raw === "object" ? raw : {};
    const days = Math.floor(Number(o.daysBefore));
    return {
      enabled: typeof o.enabled === "boolean" ? o.enabled : RENEWAL_REMINDER_DEFAULTS.enabled,
      daysBefore: Number.isFinite(days) && days >= 1 && days <= 10 ? days : RENEWAL_REMINDER_DEFAULTS.daysBefore,
      text: String(o.text || "").trim() || RENEWAL_REMINDER_DEFAULTS.text,
    };
  } catch {
    return { ...RENEWAL_REMINDER_DEFAULTS };
  }
}

const THAI_SHORT_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function thaiShortDateBkk(ms) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "numeric",
  }).formatToParts(new Date(ms));
  const day = parts.find((p) => p.type === "day")?.value || "";
  const mon = Number(parts.find((p) => p.type === "month")?.value || 0);
  return `${day} ${THAI_SHORT_MONTHS[mon - 1] || ""}`.trim();
}

function bangkokHour(now) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
}

/** ปุ่มเลือก: จ่ายทุกแพ็กที่เปิดขาย + ไว้ก่อน (ป้ายปุ่มไม่ใส่ไอคอน) */
function buildRenewalQuickReply() {
  const offer = loadActiveScanOffer();
  const pkgs = (offer?.packages || [])
    .filter((p) => p.active)
    .sort((a, b) => a.priceThb - b.priceThb)
    .slice(0, 3);
  return {
    items: [
      ...pkgs.map((p) => ({
        type: "action",
        action: { type: "message", label: `จ่าย ${p.priceThb}`, text: `จ่าย ${p.priceThb}` },
      })),
      { type: "action", action: { type: "message", label: "ไว้ก่อน", text: "ไว้ก่อน" } },
    ],
  };
}

/**
 * เรียกจาก maintenance worker ทุกนาที — ของจริงทำงานเฉพาะช่วง 10:00-20:00 ไทย
 * และยิงแต่ละ user ครั้งเดียวต่อรอบสมาชิก (dedupe ด้วย paid_until)
 */
export async function runRenewalReminderSweep(now = new Date()) {
  const cfg = await getRenewalReminderConfig();
  if (!cfg.enabled) return { sent: 0, skipped: "disabled" };
  const hr = bangkokHour(now);
  if (hr < 10 || hr >= 20) return { sent: 0, skipped: "quiet_hours" };

  const { data, error } = await supabase
    .from("app_users")
    .select("line_user_id, paid_until, paid_remaining_scans")
    .gte("paid_remaining_scans", UNLIMITED_MIN)
    .gt("paid_until", now.toISOString())
    .lt("paid_until", new Date(now.getTime() + cfg.daysBefore * 86400000).toISOString());
  if (error) throw error;

  let sent = 0;
  for (const u of data || []) {
    const uid = String(u.line_user_id || "").trim();
    if (!uid) continue;
    const untilMs = Date.parse(u.paid_until);
    if (!Number.isFinite(untilMs)) continue;
    // ครั้งเดียวต่อรอบ: คีย์ผูกกับวันหมดอายุ — ต่ออายุแล้ว paid_until เปลี่ยน = รอบใหม่
    const dedupeKey = `scan_v2:renewal_notice:${uid}:${String(u.paid_until).slice(0, 10)}`;
    const first = await tryDedupeOnce(dedupeKey, 15 * 86400).catch(() => false);
    if (!first) continue;
    const daysLeft = Math.max(1, Math.ceil((untilMs - now.getTime()) / 86400000));
    const text = cfg.text
      .replaceAll("{date}", thaiShortDateBkk(untilMs))
      .replaceAll("{days}", String(daysLeft));
    await insertOutboundMessage({
      line_user_id: uid,
      kind: "renewal_reminder",
      priority: OUTBOUND_PRIORITY.renewal_reminder ?? 90,
      related_job_id: null,
      payload_json: { text, quickReply: buildRenewalQuickReply() },
      status: "queued",
    });
    sent += 1;
    console.log(
      JSON.stringify({
        event: "RENEWAL_REMINDER_QUEUED",
        lineUserIdPrefix: uid.slice(0, 8),
        paidUntil: u.paid_until,
        daysLeft,
      }),
    );
  }
  return { sent };
}
