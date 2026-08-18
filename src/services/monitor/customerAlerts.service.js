/**
 * Monitor ลูกค้า (กบ 18 ส.ค. + Codex): แจ้งแอดมินเมื่อ (1) พิมพ์เล่น/กวน/ถามวน
 * (2) ถามว่าเป็น AI/บอท — alert เป็นสัญญาณเท่านั้น ห้าม auto-ban
 *
 * Honest delivery แบบเดียวกับ recovery owner: dedupe บันทึกเฉพาะส่งสำเร็จ ·
 * ส่งล้ม = clear ให้รอบหน้าลองใหม่ · alert ห้ามหน่วง/ล้มทับคำตอบลูกค้า (fire แบบ
 * แยก promise เสมอ) · redact เบอร์/URL/token + ตัวอย่างข้อความไม่เกิน 200 ตัวอักษร
 */
import { getValue, setLargeValueWithTtl, clearDedupeKey, tryDedupeOnce } from "../../redis/scanV2Redis.js";

const log = (event, extra = {}) => console.log(JSON.stringify({ event, ...extra }));

/** redact ข้อมูลอ่อนไหวในตัวอย่างข้อความ (Codex ข้อ 7) */
export function redactForAlert(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/g, "[ลิงก์]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[อีเมล]")
    .replace(/\+66[0-9\s-]{8,12}/g, "[เบอร์]")
    .replace(/\b0[0-9][0-9\s-]{7,12}\b/g, "[เบอร์]")
    .replace(/\b\d{13}\b/g, "[เลขบัตร]")
    .replace(/\b\d{10,12}\b/g, "[เลขบัญชี]")
    .replace(/\b(rpt|rs|ms|syn|PAY)[-_][A-Za-z0-9_-]+/g, "[token]")
    .replace(/\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b/g, "[วันที่]")
    .slice(0, 200);
}

/** สถานะจ่ายแบบหยาบสำหรับ alert */
export async function paidStatusForAlert(lineUserId, deps = {}) {
  try {
    const { db } = deps.dbModule || (await import("../../config/supabase.js"));
    const { data: u, error } = await db
      .from("app_users")
      .select("id,paid_until")
      .eq("line_user_id", String(lineUserId))
      .maybeSingle();
    if (error || !u) return "unknown";
    if (u.paid_until && new Date(u.paid_until).getTime() > Date.now()) return "paid_active";
    const { data: pay, error: pe } = await db
      .from("payments")
      .select("id")
      .eq("user_id", u.id)
      .in("status", ["paid", "succeeded"]) // ค่าจริงใน DB (ไม่มี approved — Codex จับได้)
      .limit(1)
      .maybeSingle();
    if (pe) return "unknown";
    return pay ? "paid_ever" : "free_only";
  } catch {
    return "unknown";
  }
}

/**
 * ส่ง alert แบบซื่อสัตย์: dedupe ต่อ (type, channel) — สำเร็จเท่านั้นที่คง dedupe
 * @param {{ type: string, userId: string, dedupeSec: number, telegramText: string,
 *   lineText?: string | null, lineClient?: { pushMessage: Function } | null }} p
 * @param {{ tryDedupeOnce?: Function, clearDedupeKey?: Function, sendTelegramText?: Function }} [deps]
 */
export async function sendCustomerAlert(p, deps = {}) {
  const dd = deps.tryDedupeOnce || tryDedupeOnce;
  const clear = deps.clearDedupeKey || clearDedupeKey;
  const sendTg =
    deps.sendTelegramText ||
    (async (t) => {
      const { sendTelegramText } = await import("../telegramNotify.service.js");
      return sendTelegramText(t);
    });

  // Telegram
  const tgKey = `alert:${p.type}:tg:${p.userId}`;
  try {
    if (await dd(tgKey, p.dedupeSec)) {
      let ok = false;
      try {
        const r = await sendTg(p.telegramText);
        ok = r?.ok === true;
      } catch {
        ok = false;
      }
      if (!ok) {
        await clear(tgKey).catch(() => {});
        log("CUSTOMER_ALERT_TG_FAILED", { type: p.type, uidPrefix: String(p.userId).slice(0, 8) });
      } else {
        log("CUSTOMER_ALERT_SENT", { type: p.type, channel: "telegram", uidPrefix: String(p.userId).slice(0, 8) });
      }
    }
  } catch { /* alert ห้ามล้มทับงานหลัก */ }

  // LINE (สั้น — เฉพาะ type ที่ส่ง lineText มา) · admin id หาย = delivery failure
  // (clear dedupe ให้รอบหน้าลองใหม่ ไม่ใช่เงียบ 24 ชม. — Codex)
  if (p.lineText && p.lineClient) {
    const lnKey = `alert:${p.type}:line:${p.userId}`;
    try {
      if (await dd(lnKey, p.dedupeSec)) {
        let sent = false;
        try {
          const adminUid = String(process.env.ADMIN_LINE_USER_ID || "").trim();
          if (adminUid) {
            await p.lineClient.pushMessage(adminUid, { type: "text", text: p.lineText });
            sent = true;
          }
        } catch { sent = false; }
        if (sent) {
          log("CUSTOMER_ALERT_SENT", { type: p.type, channel: "line", uidPrefix: String(p.userId).slice(0, 8) });
        } else {
          await clear(lnKey).catch(() => {});
          log("CUSTOMER_ALERT_LINE_FAILED", { type: p.type, uidPrefix: String(p.userId).slice(0, 8) });
        }
      }
    } catch { /* ignore */ }
  }
}

/* ---------------- repeat detector (Codex ข้อ 6: แยกจาก troll counter เดิม) ---------------- */

const REPEAT_WINDOW_SEC = 15 * 60;
const REPEAT_THRESHOLD = 3;
/** คำถามสถานะที่สมเหตุผล — ถามซ้ำเพราะระบบยังไม่ตอบ ไม่ใช่กวน */
const STATUS_QUERY_RE = /ผลออก|เสร็จยัง|ได้ยัง|สถานะ|ถึงไหน|นานไหม|กี่นาที/;

export function normalizeRepeatText(text) {
  return String(text || "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 120);
}

/**
 * นับข้อความเดิมซ้ำแบบ sliding window 15 นาทีจริง (redis zset — ข้าม container)
 * + เก็บ 3 ข้อความล่าสุด (redacted) ไว้ใส่ alert
 * @returns {Promise<{ hit: boolean, count: number, recent: string[] }>}
 */
export async function trackRepeatedInput(userId, text, deps = {}) {
  const norm = normalizeRepeatText(text);
  if (!norm || norm.length < 2) return { hit: false, count: 0, recent: [] };
  if (STATUS_QUERY_RE.test(norm)) return { hit: false, count: 0, recent: [] };
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (h * 31 + norm.charCodeAt(i)) >>> 0;
  const zkey = `repeat:z:${userId}:${h}`;
  const listKey = `repeat:recent:${userId}`;
  try {
    const getRedis = deps.getRedis ||
      (await import("../../redis/scanV2Redis.js")).getScanV2Redis;
    const r = await getRedis();
    if (!r) return { hit: false, count: 0, recent: [] };
    const now = Date.now();
    await r.zadd(zkey, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
    await r.zremrangebyscore(zkey, 0, now - REPEAT_WINDOW_SEC * 1000);
    await r.expire(zkey, REPEAT_WINDOW_SEC + 60);
    const count = Number(await r.zcard(zkey)) || 0;
    // เก็บข้อความล่าสุด 3 รายการ (redact ก่อนเก็บ)
    await r.lpush(listKey, redactForAlert(text));
    await r.ltrim(listKey, 0, 2);
    await r.expire(listKey, 1800);
    const recent = (await r.lrange(listKey, 0, 2).catch(() => [])) || [];
    return { hit: count >= REPEAT_THRESHOLD, count, recent };
  } catch {
    return { hit: false, count: 0, recent: [] };
  }
}
