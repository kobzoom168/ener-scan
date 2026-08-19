/**
 * Monitor ลูกค้า (กบ 18 ส.ค. + Codex): แจ้งแอดมินเมื่อ (1) พิมพ์เล่น/กวน/ถามวน
 * (2) ถามว่าเป็น AI/บอท — alert เป็นสัญญาณเท่านั้น ห้าม auto-ban
 *
 * Honest delivery แบบเดียวกับ recovery owner: dedupe บันทึกเฉพาะส่งสำเร็จ ·
 * ส่งล้ม = clear ให้รอบหน้าลองใหม่ · alert ห้ามหน่วง/ล้มทับคำตอบลูกค้า (fire แบบ
 * แยก promise เสมอ) · redact เบอร์/URL/token + ตัวอย่างข้อความไม่เกิน 200 ตัวอักษร
 */
import {
  getValue,
  setLargeValueWithTtl,
  clearDedupeKey,
  tryDedupeOnce,
  acquireShortLock,
  releaseShortLock,
  renewShortLock,
} from "../../redis/scanV2Redis.js";

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
  const kvGet = deps.getValue || getValue;
  const kvSet = deps.setLargeValueWithTtl || setLargeValueWithTtl;
  // lease แบบ owner token (Codex รอบ 4 P1): compare-delete — request เก่าที่ล้มช้า
  // ปล่อยได้เฉพาะ lease ของตัวเอง ไม่มีทางลบ lease ของ request ใหม่แล้วเปิดทางส่งซ้ำ
  const acquireLease = deps.acquireLease || ((key, ttlMs) => acquireShortLock(key, ttlMs));
  const releaseLease = deps.releaseLease || ((key, token) => releaseShortLock(key, token));
  const renewLease = deps.renewLease || ((key, token, ttlMs) => renewShortLock(key, token, ttlMs));
  const sendTg =
    deps.sendTelegramText ||
    (async (t) => {
      const { sendTelegramText } = await import("../telegramNotify.service.js");
      return sendTelegramText(t);
    });
  const uidPrefix = String(p.userId).slice(0, 8);

  // Codex P1: lease สั้น (60s) กันส่งซ้อน + sent marker เต็ม TTL หลังส่งสำเร็จเท่านั้น
  // — process ตายกลางคันเสีย alert แค่ 60 วิ ไม่ใช่ทั้ง TTL · แต่ละ channel แยกส่ง
  // ขนานพร้อม timeout ของตัวเอง — ช่องหนึ่งค้างห้ามขวางอีกช่อง
  // bounded kv op (Codex P1 รอบ 3): redis ค้างห้ามลากทั้ง alert path — ทุกตัวมี
  // timeout ของตัวเองและ clearTimeout เก็บ timer เสมอ
  const kvBound = async (promise, fallback, ms = 1000) => {
    let timer = null;
    try {
      return await Promise.race([
        Promise.resolve(promise).catch(() => fallback),
        new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const sendViaChannel = async ({ channel, doSend }) => {
    const sentKey = `alert:${p.type}:${channel}:${p.userId}`;
    const leaseKey = `${sentKey}:lease`;
    try {
      if ((await kvBound(kvGet(sentKey), null)) === "1") return;
      const leaseToken = await kvBound(acquireLease(leaseKey, 60_000), null);
      if (!leaseToken) return; // มีคนกำลังส่งอยู่
      // renewal (Codex รอบ 5 P1): transport ที่ลากยาวกว่า lease → ต่ออายุไปเรื่อย
      // ตราบใดที่ request ยังไม่ settle — กัน process อื่นชิง lease แล้วส่งซ้ำ
      const renewEveryMs = Number(deps.renewIntervalMs) > 0 ? Number(deps.renewIntervalMs) : 20_000;
      const renewTimer = setInterval(() => {
        void Promise.resolve(renewLease(leaseKey, leaseToken, 60_000)).catch(() => {});
      }, renewEveryMs);
      if (typeof renewTimer.unref === "function") renewTimer.unref();
      const TIMEOUT = Symbol("timeout");
      let timer = null;
      const sendPromise = Promise.resolve()
        .then(() => doSend())
        .catch(() => false);
      void sendPromise.finally(() => clearInterval(renewTimer));
      let outcome;
      try {
        outcome = await Promise.race([
          sendPromise,
          new Promise((resolve) => { timer = setTimeout(() => resolve(TIMEOUT), deps.channelTimeoutMs || 8000); }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (outcome === TIMEOUT) {
        // ค้าง: คง lease ไว้ (กัน late success + รอบใหม่ยิงซ้อน) — ถ้า transport
        // มา settle ทีหลังว่าสำเร็จจริง ค่อยตั้ง sent marker ตอนนั้น (ไม่ส่งซ้ำ)
        log(channel === "tg" ? "CUSTOMER_ALERT_TG_TIMEOUT" : "CUSTOMER_ALERT_LINE_TIMEOUT", { type: p.type, uidPrefix });
        void sendPromise.then(async (lateOk) => {
          if (lateOk === true) {
            await kvBound(kvSet(sentKey, "1", p.dedupeSec), null);
            log("CUSTOMER_ALERT_LATE_SUCCESS", { type: p.type, channel, uidPrefix });
          } else {
            await kvBound(releaseLease(leaseKey, leaseToken), null);
          }
        });
        return;
      }
      if (outcome === true) {
        await kvBound(kvSet(sentKey, "1", p.dedupeSec), null);
        log("CUSTOMER_ALERT_SENT", { type: p.type, channel, uidPrefix });
      } else {
        await kvBound(releaseLease(leaseKey, leaseToken), null);
        log(channel === "tg" ? "CUSTOMER_ALERT_TG_FAILED" : "CUSTOMER_ALERT_LINE_FAILED", { type: p.type, uidPrefix });
      }
    } catch { /* alert ห้ามล้มทับงานหลัก */ }
  };

  const channels = [
    sendViaChannel({
      channel: "tg",
      doSend: async () => {
        const r = await sendTg(p.telegramText);
        return r?.ok === true;
      },
    }),
  ];
  if (p.lineText && p.lineClient) {
    channels.push(
      sendViaChannel({
        channel: "line",
        doSend: async () => {
          const adminUid = String(process.env.ADMIN_LINE_USER_ID || "").trim();
          if (!adminUid) return false; // admin id หาย = delivery failure (lease หลุด รอบหน้าลองใหม่)
          await p.lineClient.pushMessage(adminUid, { type: "text", text: p.lineText });
          return true;
        },
      }),
    );
  }
  await Promise.allSettled(channels);
}

/* ---------------- repeat detector (Codex ข้อ 6: แยกจาก troll counter เดิม) ---------------- */

const REPEAT_WINDOW_SEC = 15 * 60;
const REPEAT_THRESHOLD = 3;

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
  // status query = ลูกค้ารอผล — SSOT เดียวกับ router/troll guard (Codex รอบ 4)
  try {
    const { isStatusQueryText } = await import("../scanV2/statusQuery.util.js");
    if (isStatusQueryText(text)) return { hit: false, count: 0, recent: [] };
  } catch { /* SSOT พัง = นับตามปกติ */ }
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
