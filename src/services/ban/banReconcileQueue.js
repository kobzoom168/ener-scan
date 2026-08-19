/**
 * Durable pending-reconcile queue (Codex รอบ 8-9): DB request ที่ "ไม่รู้ผล"
 * (timeout) ต้องมีเจ้าของตามจนได้ผลสุดท้ายเสมอ และงานต้องรอดข้าม restart
 *
 * รอบ 9 (Codex):
 * - member เก็บ targetState + operationId: `uid|reason|targetState|opId` —
 *   ลบได้เฉพาะ exact member (กัน ABA: finalizer เก่าลบงานใหม่ชนิดเดียวกัน)
 * - sweeper ลบเฉพาะเมื่อ "ผล DB ตรง intent ของ operation" (rec.banned ===
 *   targetState) — อายุอย่างเดียวไม่พอ เพราะ server อาจทำ transaction ต่อหลัง
 *   client ตาย · mismatch = ค้างคิวไว้ retry + critical alert
 */
const QUEUE_KEY = "ban:reconcile:pending";
/** ต้องรออย่างน้อยเท่านี้ก่อนให้ sweeper แตะ (กันไปชนกับเจ้าของที่ยังทำงานอยู่) */
export const MIN_SETTLE_MS = 60_000;

async function redis(deps) {
  if (deps.getRedis) return deps.getRedis();
  const { getScanV2Redis } = await import("../../redis/scanV2Redis.js");
  return getScanV2Redis();
}

export function buildReconcileMember({ uid, reason, targetState, opId }) {
  return `${uid}|${String(reason || "unknown")}|${targetState === "banned" ? "banned" : "unbanned"}|${String(opId || "noop")}`;
}

export function parseReconcileMember(member) {
  const [uid, reason, targetState, opId] = String(member || "").split("|");
  return { uid: uid || "", reason: reason || "unknown", targetState: targetState === "banned" ? "banned" : "unbanned", opId: opId || "", member: String(member || "") };
}

/**
 * @param {{ uid: string, reason: string, targetState: "banned"|"unbanned", opId: string }} entry
 * @returns {Promise<{ ok: boolean, member?: string }>}
 */
export async function enqueuePendingReconcile(entry, deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return { ok: false };
    const member = buildReconcileMember(entry);
    const now = deps.now ? deps.now() : Date.now();
    await r.zadd(QUEUE_KEY, now, member);
    await r.expire(QUEUE_KEY, 7 * 24 * 3600).catch(() => {});
    return { ok: true, member };
  } catch {
    return { ok: false };
  }
}

/** ลบแบบ exact member เท่านั้น (กัน ABA) */
export async function removePendingReconcile(member, deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return { ok: false };
    await r.zrem(QUEUE_KEY, String(member));
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
      out.push({ ...parseReconcileMember(rows[i]), enqueuedAt: Number(rows[i + 1]) || 0 });
    }
    return out;
  } catch {
    return [];
  }
}

function fireMismatchAlert(entry, banned, deps) {
  void (async () => {
    try {
      if (deps.alert) return void deps.alert(entry, banned);
      const { tryDedupeOnce } = await import("../../redis/scanV2Redis.js");
      if (await tryDedupeOnce(`ban:reconcile:mismatch_alert:${entry.uid}`, 3600)) {
        const { sendTelegramText } = await import("../telegramNotify.service.js");
        await Promise.race([
          sendTelegramText(
            `[CRITICAL] แบน/ปลดแบนยังไม่ลงตัว: ${entry.uid}\nสั่ง ${entry.reason} (คาด ${entry.targetState}) แต่ DB เป็น ${banned ? "banned" : "unbanned"}\nระบบจะ retry ต่อ — ตรวจด้วยคำสั่ง ดูแบน`,
          ),
          new Promise((r) => setTimeout(r, 5000)),
        ]);
      }
    } catch { /* alert ห้ามล้มทับงาน */ }
  })();
}

/**
 * กวาดคิว — maintenance worker เรียกเป็นรอบ ๆ
 * ลบ entry เฉพาะเมื่อ reconcile สำเร็จ "และ" ผล DB ตรง intent (targetState)
 * mismatch = late commit อาจยังมาไม่ถึง หรือ operation ล้มถาวร → ค้างไว้ + alert
 * @param {{ reconcile: (uid: string) => Promise<{ ok: boolean, banned?: boolean }>,
 *   minSettleMs?: number, now?: () => number, getRedis?: Function, limit?: number, alert?: Function }} deps
 */
export async function sweepPendingBanReconciles(deps) {
  const stats = { scanned: 0, reconciled: 0, skipped: 0, mismatched: 0, failed: 0 };
  const entries = await listPendingReconciles(deps);
  const now = deps.now ? deps.now() : Date.now();
  const minSettle = Number(deps.minSettleMs) >= 0 ? Number(deps.minSettleMs) : MIN_SETTLE_MS;
  const limit = Number(deps.limit) > 0 ? Number(deps.limit) : 50;
  for (const e of entries.slice(0, limit)) {
    stats.scanned += 1;
    if (now - e.enqueuedAt < minSettle) { stats.skipped += 1; continue; }
    try {
      const rec = await deps.reconcile(e.uid);
      if (!rec?.ok) { stats.failed += 1; continue; }
      const matches = (rec.banned === true) === (e.targetState === "banned");
      if (!matches) {
        // DB ยังไม่ตรง intent — ห้ามถือว่าสำเร็จ (late commit อาจกำลังมา หรือ op ล้มจริง)
        stats.mismatched += 1;
        console.log(
          JSON.stringify({
            event: "BAN_RECONCILE_SWEEP_MISMATCH",
            uidPrefix: String(e.uid).slice(0, 8),
            reason: e.reason,
            expected: e.targetState,
            dbBanned: rec.banned === true,
          }),
        );
        fireMismatchAlert(e, rec.banned === true, deps);
        continue;
      }
      await removePendingReconcile(e.member, deps);
      stats.reconciled += 1;
      console.log(
        JSON.stringify({
          event: "BAN_RECONCILE_SWEEP_DONE",
          uidPrefix: String(e.uid).slice(0, 8),
          reason: e.reason,
          banned: rec.banned === true,
        }),
      );
    } catch {
      stats.failed += 1;
    }
  }
  return stats;
}
