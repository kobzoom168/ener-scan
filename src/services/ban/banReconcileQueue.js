/**
 * Durable pending-reconcile queue (Codex รอบ 8): DB request ที่ "ไม่รู้ผล"
 * (timeout) ต้องมีเจ้าของตามจนได้ผลสุดท้ายเสมอ — Promise ใน memory หายเมื่อ
 * container restart จึงต้องมีคิวใน redis ที่ maintenance worker กวาดต่อได้
 *
 * ชีวิตของ entry:
 *  1. mutation เจอ unknown outcome → enqueue (score = เวลาที่ enqueue)
 *  2. เจ้าของใน process รอ request เดิม settle → reconcile → mark done → ลบ entry
 *  3. ถ้า process ตายก่อน: entry ยังอยู่ · sweeper กวาดหลัง MIN_SETTLE_MS
 *     (ตอนนั้น request เดิมจบไปแล้วแน่นอนเพราะ connection ตายไปกับ process)
 *     → reconcile กับ DB → ลบ entry เมื่อสำเร็จ
 */
const QUEUE_KEY = "ban:reconcile:pending";
/** ต้องรออย่างน้อยเท่านี้ก่อนให้ sweeper แตะ (กันไปชนกับเจ้าของที่ยังทำงานอยู่) */
export const MIN_SETTLE_MS = 60_000;

async function redis(deps) {
  if (deps.getRedis) return deps.getRedis();
  const { getScanV2Redis } = await import("../../redis/scanV2Redis.js");
  return getScanV2Redis();
}

/** @returns {Promise<{ ok: boolean }>} */
export async function enqueuePendingReconcile(uid, reason, deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return { ok: false };
    const now = deps.now ? deps.now() : Date.now();
    await r.zadd(QUEUE_KEY, now, `${uid}|${String(reason || "unknown")}`);
    await r.expire(QUEUE_KEY, 7 * 24 * 3600).catch(() => {});
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function removePendingReconcile(uid, reason, deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return { ok: false };
    await r.zrem(QUEUE_KEY, `${uid}|${String(reason || "unknown")}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** entry ที่ค้างอยู่ (ใช้ในเทสต์/ตรวจสถานะ) */
export async function listPendingReconciles(deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return [];
    const rows = await r.zrange(QUEUE_KEY, 0, -1, "WITHSCORES");
    const out = [];
    for (let i = 0; i < rows.length; i += 2) {
      const [uid, reason] = String(rows[i]).split("|");
      out.push({ uid, reason, enqueuedAt: Number(rows[i + 1]) || 0 });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * กวาดคิว — ใช้โดย maintenance worker (และตอน worker เริ่มทำงานหลัง restart)
 * @param {{ reconcile: (uid: string) => Promise<{ ok: boolean, banned?: boolean }>,
 *   minSettleMs?: number, now?: () => number, getRedis?: Function, limit?: number }} deps
 * @returns {Promise<{ scanned: number, reconciled: number, skipped: number, failed: number }>}
 */
export async function sweepPendingBanReconciles(deps) {
  const stats = { scanned: 0, reconciled: 0, skipped: 0, failed: 0 };
  const entries = await listPendingReconciles(deps);
  const now = deps.now ? deps.now() : Date.now();
  const minSettle = Number(deps.minSettleMs) >= 0 ? Number(deps.minSettleMs) : MIN_SETTLE_MS;
  const limit = Number(deps.limit) > 0 ? Number(deps.limit) : 50;
  for (const e of entries.slice(0, limit)) {
    stats.scanned += 1;
    if (now - e.enqueuedAt < minSettle) { stats.skipped += 1; continue; }
    try {
      const rec = await deps.reconcile(e.uid);
      if (rec?.ok) {
        await removePendingReconcile(e.uid, e.reason, deps);
        stats.reconciled += 1;
        console.log(
          JSON.stringify({
            event: "BAN_RECONCILE_SWEEP_DONE",
            uidPrefix: String(e.uid).slice(0, 8),
            reason: e.reason,
            banned: rec.banned === true,
          }),
        );
      } else {
        stats.failed += 1;
      }
    } catch {
      stats.failed += 1;
    }
  }
  return stats;
}
