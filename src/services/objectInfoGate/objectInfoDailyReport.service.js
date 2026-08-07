/**
 * สรุปรายวันการเก็บข้อมูลชิ้น → Telegram กบ (กบ 7 ส.ค. 2026: "สรุปรายวันว่าวันนี้ได้ข้อมูลพระครบไหม")
 * รันจาก maintenanceWorker ราวสองทุ่มไทย (OBJECT_INFO_REPORT_HOUR, default 20) — dedupe วันละครั้ง
 */
import { supabase } from "../../config/supabase.js";
import { tryDedupeOnce } from "../../redis/scanV2Redis.js";
import { isTelegramConfigured, sendTelegramText } from "../telegramNotify.service.js";
import { objectInfoGateEnabled } from "./objectInfoGate.service.js";

const REPORT_HOUR_BKK = (() => {
  const n = Number(process.env.OBJECT_INFO_REPORT_HOUR);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : 20;
})();

function bangkokParts(now = new Date()) {
  const s = now.toLocaleString("en-CA", {
    timeZone: "Asia/Bangkok",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  });
  const [date, hour] = s.split(", ");
  return { dateKey: date, hour: Number(hour) };
}

/** ช่วง UTC ของวันปฏิทินไทย [00:00, 24:00) */
function bangkokDayUtcRange(dateKey) {
  const startMs = Date.parse(`${dateKey}T00:00:00+07:00`);
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(startMs + 86400e3).toISOString() };
}

export async function runObjectInfoDailySweep(now = new Date()) {
  if (!objectInfoGateEnabled()) return { skipped: "gate_disabled" };
  if (!isTelegramConfigured()) return { skipped: "telegram_not_configured" };
  const { dateKey, hour } = bangkokParts(now);
  if (hour !== REPORT_HOUR_BKK) return { skipped: "not_report_hour" };
  const first = await tryDedupeOnce(`objinfo:daily_report:${dateKey}`, 40 * 3600);
  if (!first) return { skipped: "already_sent_today" };

  const range = bangkokDayUtcRange(dateKey);
  const { data: rows } = await supabase
    .from("object_owner_info")
    .select("lane,object_name,temple,era_year,stone_type,purpose,unknown,skipped,conflict_flag,source")
    .gte("created_at", range.startIso)
    .lt("created_at", range.endIso)
    .limit(2000);
  const list = rows || [];

  const n = list.length;
  const named = list.filter((r) => r.object_name || r.stone_type);
  const full = list.filter((r) => r.object_name && r.temple && r.era_year);
  const unknown = list.filter((r) => r.unknown && !r.skipped);
  const skipped = list.filter((r) => r.skipped);
  const withPurpose = list.filter((r) => r.purpose);
  const viaForm = list.filter((r) => r.source === "owner_form");
  const conflicts = list.filter((r) => r.conflict_flag);
  const pct = (x) => (n ? Math.round((x / n) * 100) : 0);

  const samples = named
    .slice(0, 8)
    .map((r) => `• ${[r.object_name || r.stone_type, r.temple, r.era_year].filter(Boolean).join(" · ")}`)
    .join("\n");

  const lines = [
    `📿 สรุปเก็บข้อมูลชิ้น ${dateKey}`,
    `ชิ้นใหม่ที่ถามวันนี้: ${n} ชิ้น`,
    n
      ? [
          `ได้ชื่อ/ชนิด: ${named.length} (${pct(named.length)}%)`,
          `ครบ ชื่อ+วัด+ปี: ${full.length} (${pct(full.length)}%)`,
          `ไม่ทราบ: ${unknown.length} · ข้าม(เคยจ่าย): ${skipped.length}`,
          `บอกจุดประสงค์พก: ${withPurpose.length} · ผ่านฟอร์ม: ${viaForm.length}` +
            (conflicts.length ? ` · ⚠️ขัดกับภาพ: ${conflicts.length}` : ""),
        ].join("\n")
      : "ยังไม่มีชิ้นใหม่เข้าเกตวันนี้",
    samples ? `\nตัวอย่างที่ได้วันนี้:\n${samples}` : "",
  ].filter(Boolean);

  await sendTelegramText(lines.join("\n"));
  console.log(JSON.stringify({ event: "OBJECT_INFO_DAILY_REPORT_SENT", dateKey, count: n }));
  return { sent: true, count: n };
}
