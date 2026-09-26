/**
 * Push หนุนดวง "อาจารย์เลือกให้วันนี้" (กบ 19-20 ก.ค. 2026): **ทุกวันศุกร์ 07:00** (เวลาไทย)
 * ส่ง LINE บอกลูกค้า
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
import { buildPublicReportUrl } from "./reports/reportLink.service.js";
import { buildDailyPickPushFlex } from "./flex/dailyPickPush.flex.js";

const PUSH_HOUR_BKK = (() => {
  const n = Number(process.env.DAILY_PICK_PUSH_HOUR);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.floor(n) : 7;
})();
// กบ 19 ก.ค. (รอบสอง): ยิงทุกวันทุกคนที่คลัง ≥5 ชิ้น — ไม่รอวันหนุนแรง (default 0)
// อยากกลับไปส่งเฉพาะวันแรง ตั้ง DAILY_PICK_PUSH_MIN_SUIT=75
const MIN_SUIT = (() => {
  const n = Number(process.env.DAILY_PICK_PUSH_MIN_SUIT);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.floor(n) : 0;
})();
// กบ 20 ก.ค.: ส่งเฉพาะวันศุกร์ — ปรับได้ DAILY_PICK_PUSH_WEEKDAYS เช่น "5" (ศุกร์),
// "1,5" (จันทร์+ศุกร์), "*" (ทุกวัน) · 0=อาทิตย์ ... 6=เสาร์
const PUSH_WEEKDAYS = (() => {
  const raw = String(process.env.DAILY_PICK_PUSH_WEEKDAYS ?? "5").trim();
  if (raw === "*") return new Set([0, 1, 2, 3, 4, 5, 6]);
  const days = raw
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return new Set(days.length ? days : [5]);
})();
const MIN_PIECES = 5;
const MAX_USERS = 2000;

export const DAILY_PICK_OPTOUT_KEY_PREFIX = "scan_v2:daily_pick_optout:";

export function dailyPickOptoutKey(lineUserId) {
  return `${DAILY_PICK_OPTOUT_KEY_PREFIX}${String(lineUserId || "").trim()}`;
}

/**
 * ความต้องการของลูกค้าต้องอยู่ถาวร (16 ก.ย. 2026)
 * เดิมเก็บใน Redis ด้วย setValueWithTtl ซึ่ง cap TTL ไว้ที่ 604800 วิ = 7 วัน
 * ทั้งที่ขอ 400 วัน → การปิดหมดอายุเองเงียบ ๆ แล้วแจ้งเตือนกลับมาอีก
 * ตอนนี้ DB (migration 058) เป็นแหล่งความจริง · คืน boolean ที่อ่านกลับจากแถวจริง
 * เพื่อให้ผู้เรียก "ยืนยันกับลูกค้าหลังบันทึกสำเร็จเท่านั้น"
 */
async function writeDailyPickOptout(lineUserId, optedOut) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return { ok: false, optedOut: null, reason: "no_user" };
  const { data, error } = await supabase.rpc("set_daily_pick_optout", {
    p_line_user_id: uid,
    p_opted_out: Boolean(optedOut),
  });
  if (error) {
    console.log(JSON.stringify({
      event: "DAILY_PICK_OPTOUT_WRITE_FAILED",
      lineUserIdPrefix: uid.slice(0, 8),
      wanted: Boolean(optedOut),
      reason: String(error?.message || error).slice(0, 120),
    }));
    return { ok: false, optedOut: null, reason: "db_error" };
  }
  const stored = data === true;
  console.log(JSON.stringify({
    event: "DAILY_PICK_OPTOUT_SAVED",
    lineUserIdPrefix: uid.slice(0, 8),
    optedOut: stored,
  }));
  return { ok: stored === Boolean(optedOut), optedOut: stored };
}

export async function setDailyPickOptout(lineUserId) {
  return writeDailyPickOptout(lineUserId, true);
}

export async function clearDailyPickOptout(lineUserId) {
  return writeDailyPickOptout(lineUserId, false);
}

/**
 * fail-safe: อ่านไม่ได้ = ถือว่า "ปิดอยู่" เพื่อไม่ส่งหาคนที่อาจเคยกดปิด
 * (แจ้งเตือนแนะนำเป็นงาน optional — พลาดไม่ส่งดีกว่าส่งหาคนที่ไม่อยากรับ)
 */
export async function isDailyPickOptedOut(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return true;
  const { data, error } = await supabase.rpc("get_daily_pick_optout", { p_line_user_id: uid });
  if (error) {
    console.log(JSON.stringify({
      event: "DAILY_PICK_OPTOUT_READ_FAILED",
      lineUserIdPrefix: uid.slice(0, 8),
      reason: String(error?.message || error).slice(0, 120),
    }));
    return true;
  }
  // รูปแบบคำตอบต้องเป็นออบเจ็กต์ที่มี known เป็น boolean เท่านั้น
  // ผิดรูป (null / string / ไม่มี known) = อ่านค่าไม่ได้ → ห้ามตีความว่า "ส่งได้"
  if (!data || typeof data !== "object" || typeof data.known !== "boolean") {
    console.log(JSON.stringify({
      event: "DAILY_PICK_OPTOUT_READ_MALFORMED",
      lineUserIdPrefix: uid.slice(0, 8),
      gotType: data === null ? "null" : typeof data,
    }));
    return true;
  }
  if (data.known === true) return data.optedOut === true;

  // ยังไม่มีแถวใน DB — ห้ามตีความว่า "เปิดรับแจ้งเตือน" ทันที
  // ค่าที่ลูกค้าเคยตั้งไว้ก่อน migration อาจยังค้างใน Redis (ที่ TTL โดน cap 7 วัน)
  const legacy = await getValue(dailyPickOptoutKey(uid)).catch(() => null);
  if (String(legacy || "") !== "1") return false;

  // ย้ายค่าเก่าแบบ atomic insert-if-absent แล้วยึด "ค่าที่ชนะจริง" (Codex 18 ก.ย.)
  // ถ้าลูกค้าสั่งเปิดคืนระหว่างนี้จนมีแถวใน DB แล้ว ค่านั้นต้องชนะ — migration ห้ามทับ
  const { data: m, error: mErr } = await supabase.rpc(
    "migrate_daily_pick_optout_if_absent",
    { p_line_user_id: uid },
  );
  if (mErr || !m || typeof m !== "object" || typeof m.optedOut !== "boolean") {
    console.log(JSON.stringify({
      event: "DAILY_PICK_OPTOUT_LEGACY_MIGRATE_FAILED",
      lineUserIdPrefix: uid.slice(0, 8),
      reason: String(mErr?.message || mErr || "malformed").slice(0, 120),
    }));
    return true; // ย้ายไม่สำเร็จ = ไม่รู้ค่าแน่ชัด → ไม่ส่ง
  }
  console.log(JSON.stringify({
    event: "DAILY_PICK_OPTOUT_LEGACY_MIGRATED",
    lineUserIdPrefix: uid.slice(0, 8),
    migrated: m.migrated === true,
    optedOut: m.optedOut === true,
  }));
  return m.optedOut === true;
}

function bangkokWeekday(now) {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
  }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
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
    `อาจารย์เลือกให้วันนี้: ${top.name || "ชิ้นเด่นในคลังของคุณ"} เหมาะกับวันนี้ ${top.suit}%`,
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
  if (!PUSH_WEEKDAYS.has(bangkokWeekday(now))) return { skipped: "not_push_day" };
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
      // Codex 26 ก.ย. 2026: ชิ้นหนุนดวงจากคลังเดิมของเจ้าของ = เปิดเสมอ ไม่ผูกกับแพ็ก
      // (เดิม: >5 ชิ้น + ไม่จ่ายใน 3 วัน = teaser เบลอ — ยกเลิก) · optout/ban/ตารางส่ง/dedupe คงเดิม
      const open = true;

      const text = open ? buildFullText(pick.top) : buildTeaserText(pick.top);
      const reportUrl = pick.top.token ? buildPublicReportUrl(pick.top.token) : "";
      const flexMessage = buildDailyPickPushFlex(pick.top, {
        mode: open ? "open" : "teaser",
        reportUrl: reportUrl || undefined,
        libraryUrl: reportUrl ? `${reportUrl}/library` : undefined,
        dayStar: pick.dayStar,
        streak: pick.streak,
        movedUp: pick.movedUp,
        altText: text,
      });
      await insertOutboundMessage({
        line_user_id: uid,
        kind: "daily_pick_push",
        priority: OUTBOUND_PRIORITY.daily_pick_push ?? 88,
        related_job_id: null,
        payload_json: { text, flexMessage },
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
