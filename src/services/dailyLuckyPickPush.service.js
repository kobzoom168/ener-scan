/**
 * Push หนุนดวงรายเช้า (กบ 19 ก.ค. 2026): ทุกเช้า 7 โมง (เวลาไทย) ส่ง LINE บอกลูกค้า
 * ที่มีชิ้นในคลัง ≥5 ว่า "วันนี้ชิ้นไหนหนุนดวงสุด กี่ % หนุนเรื่องอะไร" + ลิงก์รายงาน
 * - ส่งเฉพาะวันหนุนแรง (suit ≥ 75 ปรับได้) กันข้อความล้าจนคนบล็อก OA
 * - คนโดนเซ็นเซอร์ (>5 ชิ้น + ไม่มียอดจ่าย 3 วัน) ได้แบบ teaser: บอก % ไม่บอกชิ้น
 * - ลูกค้าพิมพ์ "หยุดแจ้งเตือน" = ปิด (redis optout TTL 400 วัน) / "เปิดแจ้งเตือน" = เปิดกลับ
 * - สูตร deterministic ชุดเดียวกับ LIFF "หนุนดวงวันนี้" — ไม่มีต้นทุน AI
 *
 * pattern เดียว renewalReminder: เรียกทุกนาทีจาก maintenanceWorker, self-gate ชั่วโมง 7,
 * global done key ต่อวัน + per-user dedupe (sweep ตายกลางทาง รอบถัดไปเก็บคนค้างต่อ ไม่ส่งซ้ำ)
 */
import { supabase } from "../config/supabase.js";
import { tryDedupeOnce, getValue, setValueWithTtl } from "../redis/scanV2Redis.js";
import { insertOutboundMessage } from "../stores/scanV2/outboundMessages.db.js";
import { OUTBOUND_PRIORITY } from "../stores/scanV2/outboundPriority.js";
import { hasRecentPaidAccess } from "./everPaid.service.js";
import { buildPublicReportUrl } from "./reports/reportLink.service.js";

const PUSH_HOUR_BKK = (() => {
  const n = Number(process.env.DAILY_PICK_PUSH_HOUR);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.floor(n) : 7;
})();
const MIN_SUIT = (() => {
  const n = Number(process.env.DAILY_PICK_PUSH_MIN_SUIT);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.floor(n) : 75;
})();
const MIN_PIECES = 5;
const MAX_USERS = 2000;

export const DAILY_PICK_OPTOUT_KEY_PREFIX = "scan_v2:daily_pick_optout:";
const OPTOUT_TTL_SECONDS = 400 * 86400;

export function dailyPickOptoutKey(lineUserId) {
  return `${DAILY_PICK_OPTOUT_KEY_PREFIX}${String(lineUserId || "").trim()}`;
}

export async function setDailyPickOptout(lineUserId) {
  await setValueWithTtl(dailyPickOptoutKey(lineUserId), "1", OPTOUT_TTL_SECONDS);
}

export async function clearDailyPickOptout(lineUserId) {
  // เขียนทับด้วยค่า "0" TTL สั้น แทนการลบ (scanV2Redis ไม่มี del ตรง ๆ สำหรับ key ทั่วไป)
  await setValueWithTtl(dailyPickOptoutKey(lineUserId), "0", 60);
}

export async function isDailyPickOptedOut(lineUserId) {
  const v = await getValue(dailyPickOptoutKey(lineUserId)).catch(() => null);
  return String(v || "") === "1";
}

function bangkokHour(now) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

function bangkokDateKey(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const OPTOUT_FOOTER = "(พิมพ์ หยุดแจ้งเตือน ถ้าไม่อยากรับข้อความตอนเช้าแบบนี้)";

/**
 * @param {{ suit: number, peakLabel: string|null, reason: string, token: string|null }} top
 */
function buildFullText(top) {
  const url = top.token ? buildPublicReportUrl(top.token) : "";
  return [
    "☀️ หนุนดวงเช้านี้",
    `วันนี้มีชิ้นในคลังหนุนดวงคุณถึง ${top.suit}%${top.peakLabel ? ` พลังเด่นด้าน${top.peakLabel}` : ""}`,
    top.reason,
    url ? `เปิดดูชิ้นนี้: ${url}` : "",
    "",
    OPTOUT_FOOTER,
  ]
    .filter((l, i) => l !== "" || i === 4)
    .join("\n");
}

/**
 * @param {{ suit: number, peakLabel: string|null, token: string|null }} top
 */
function buildTeaserText(top) {
  const libUrl = top.token ? `${buildPublicReportUrl(top.token)}/library` : "";
  return [
    "☀️ หนุนดวงเช้านี้",
    `วันนี้มีชิ้นในคลังของคุณหนุนดวงถึง ${top.suit}%${top.peakLabel ? ` พลังเด่นด้าน${top.peakLabel}` : ""}`,
    "เปิดสิทธิ์แล้วดูได้เลยว่าชิ้นไหน จะได้พกถูกชิ้นวันนี้ครับ",
    libUrl ? `ดูคลังของคุณ: ${libUrl}` : "",
    "",
    OPTOUT_FOOTER,
  ]
    .filter((l, i) => l !== "" || i === 4)
    .join("\n");
}

/**
 * เรียกทุกนาทีจาก maintenanceWorker — ยิงจริงวันละรอบตอน 7 โมงเช้า
 * @param {Date} [now]
 */
export async function runDailyLuckyPickSweep(now = new Date()) {
  if (
    String(process.env.DAILY_PICK_PUSH_ENABLED ?? "true").trim().toLowerCase() === "false"
  ) {
    return { skipped: "disabled" };
  }
  if (bangkokHour(now) !== PUSH_HOUR_BKK) return { skipped: "not_push_hour" };

  const dateKey = bangkokDateKey(now);
  const doneKey = `scan_v2:daily_pick_push_done:${dateKey}`;
  const done = await getValue(doneKey).catch(() => null);
  if (done) return { skipped: "already_done_today" };

  const { data: users, error } = await supabase
    .from("app_users")
    .select("line_user_id")
    .not("line_user_id", "is", null)
    .limit(MAX_USERS);
  if (error) throw error;

  const { buildDailyPickTopForLineUser } = await import("../routes/liff.routes.js");

  let sent = 0;
  let teaser = 0;
  let skippedLowSuit = 0;
  let skippedFewPieces = 0;
  for (const u of users || []) {
    const uid = String(u.line_user_id || "").trim();
    if (!uid) continue;
    try {
      if (await isDailyPickOptedOut(uid)) continue;
      // จองสิทธิ์รายวันก่อนงานหนัก — sweep ตายกลางทางจะไม่ส่งซ้ำคนเดิม
      const first = await tryDedupeOnce(
        `scan_v2:daily_pick_push:${dateKey}:${uid}`,
        40 * 3600,
      );
      if (!first) continue;

      const pick = await buildDailyPickTopForLineUser(uid);
      if (!pick || pick.piecesCount < MIN_PIECES) {
        skippedFewPieces += 1;
        continue;
      }
      if (pick.top.suit < MIN_SUIT) {
        skippedLowSuit += 1;
        continue;
      }
      // เกตเดียวกับเซ็นเซอร์คลัง: ≤5 เปิดเสมอ (แต่เกณฑ์ MIN_PIECES=5 → เคส 5 พอดีเปิด)
      let open = pick.piecesCount <= 5;
      if (!open) open = await hasRecentPaidAccess(uid).catch(() => false);

      const text = open ? buildFullText(pick.top) : buildTeaserText(pick.top);
      await insertOutboundMessage({
        line_user_id: uid,
        kind: "daily_pick_push",
        priority: OUTBOUND_PRIORITY.daily_pick_push ?? 88,
        related_job_id: null,
        payload_json: { text },
        status: "queued",
      });
      sent += 1;
      if (!open) teaser += 1;
    } catch (e) {
      console.log(
        JSON.stringify({
          event: "DAILY_PICK_PUSH_USER_ERROR",
          lineUserIdPrefix: uid.slice(0, 10),
          message: String(e?.message || e).slice(0, 160),
        }),
      );
    }
  }

  await setValueWithTtl(doneKey, "1", 40 * 3600).catch(() => {});
  console.log(
    JSON.stringify({
      event: "DAILY_PICK_PUSH_SWEEP_DONE",
      dateKey,
      usersChecked: (users || []).length,
      sent,
      teaser,
      skippedLowSuit,
      skippedFewPieces,
      minSuit: MIN_SUIT,
    }),
  );
  return { sent, teaser, skippedLowSuit, skippedFewPieces };
}
