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

/* ---------------- pending-operation guard (Codex รอบ 10 ข้อ 2) ----------------
 * ระหว่างมี operation ที่ "ไม่รู้ผล DB" ค้างอยู่ ห้ามรับ ban/unban รอบใหม่ของ uid
 * เดียวกัน — DB commit อาจกลับลำดับแล้วคำสั่งเก่าทับคำสั่งล่าสุด · guard ถูกตั้ง
 * ภายใต้ mutation lock และเคลียร์แบบ compare-exact opId หลัง state-confirmed เท่านั้น */
const PENDING_OP_PREFIX = "ban:pendingop:";
const PENDING_OP_TTL_SEC = 7 * 24 * 3600;

export async function setPendingOp(uid, opId, deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return { ok: false };
    await r.set(`${PENDING_OP_PREFIX}${uid}`, String(opId), "EX", PENDING_OP_TTL_SEC);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function getPendingOp(uid, deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return null;
    return await r.get(`${PENDING_OP_PREFIX}${uid}`);
  } catch {
    return null;
  }
}

/** เคลียร์เฉพาะเมื่อ opId ตรง (compare-exact — งานใหม่ห้ามโดนงานเก่าเคลียร์ทิ้ง) */
export async function clearPendingOp(uid, opId, deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return { ok: false };
    const res = await r.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
      1,
      `${PENDING_OP_PREFIX}${uid}`,
      String(opId),
    );
    return { ok: true, cleared: Number(res) === 1 };
  } catch {
    return { ok: false };
  }
}

/** alert แบบซื่อสัตย์ (Codex รอบ 10 P1): ส่งล้ม = ปล่อย dedupe ให้รอบหน้าลองใหม่ */
function fireMismatchAlert(entry, banned, deps) {
  void (async () => {
    try {
      if (deps.alert) return void deps.alert(entry, banned);
      const { tryDedupeOnce, clearDedupeKey } = await import("../../redis/scanV2Redis.js");
      const key = `ban:reconcile:mismatch_alert:${entry.uid}`;
      if (!(await tryDedupeOnce(key, 3600))) return;
      let sent = false;
      try {
        const { sendTelegramText } = await import("../telegramNotify.service.js");
        const res = await Promise.race([
          sendTelegramText(
            `[CRITICAL] แบน/ปลดแบนยังไม่ลงตัว: ${entry.uid}\nสั่ง ${entry.reason} (คาด ${entry.targetState}) แต่ DB เป็น ${banned ? "banned" : "unbanned"}\nระบบจะ retry ต่อ — ตรวจด้วยคำสั่ง ดูแบน`,
          ),
          new Promise((r) => setTimeout(r, 5000)),
        ]);
        sent = res?.ok === true;
      } catch { sent = false; }
      if (!sent) await clearDedupeKey(key).catch(() => {});
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
      // 1) observe DB แบบ read-only ก่อน (Codex รอบ 10 ข้อ 1): ห้ามแตะ cache
      //    จนกว่าจะรู้ว่า DB ตรง intent — reconcile ทันทีจะพลิก fail-closed
      //    ของ ban ที่ late commit ยังไม่มาถึง
      const obs = await deps.observe(e.uid);
      if (!obs?.ok) { stats.failed += 1; continue; }
      const matches = (obs.banned === true) === (e.targetState === "banned");
      if (!matches) {
        stats.mismatched += 1;
        console.log(
          JSON.stringify({
            event: "BAN_RECONCILE_SWEEP_MISMATCH",
            uidPrefix: String(e.uid).slice(0, 8),
            reason: e.reason,
            expected: e.targetState,
            dbBanned: obs.banned === true,
          }),
        );
        fireMismatchAlert(e, obs.banned === true, deps);
        continue; // cache/fail-closed state ไม่ถูกแตะ · entry ค้างไว้ retry
      }
      // 2) DB ตรง intent แล้ว → ค่อย apply cache แล้วลบ exact member
      const rec = await deps.reconcile(e.uid);
      const applied = rec?.ok === true && (rec.banned === true) === (e.targetState === "banned");
      if (!applied) { stats.failed += 1; continue; }
      const removed = await removePendingReconcile(e.member, deps);
      if (removed?.ok !== true) {
        // ลบไม่สำเร็จ = งานยังไม่จบ ห้ามนับ/log ว่าสำเร็จ (Codex รอบ 10 H)
        stats.failed += 1;
        console.log(JSON.stringify({ event: "BAN_RECONCILE_SWEEP_REMOVE_FAILED", uidPrefix: String(e.uid).slice(0, 8) }));
        continue;
      }
      if (deps.clearPendingOp) await Promise.resolve(deps.clearPendingOp(e.uid, e.opId)).catch(() => {});
      stats.reconciled += 1;
      console.log(
        JSON.stringify({
          event: "BAN_RECONCILE_SWEEP_DONE",
          uidPrefix: String(e.uid).slice(0, 8),
          reason: e.reason,
          banned: e.targetState === "banned",
        }),
      );
    } catch {
      stats.failed += 1;
    }
  }
  return stats;
}
