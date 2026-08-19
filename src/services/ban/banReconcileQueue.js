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

/* ---------------- pending-operation lifecycle (Codex รอบ 10-11) ----------------
 * รอบ 11: guard กับ queue ต้องเป็นก้อนเดียวกัน — แยกสองคำสั่งเปิดช่อง 3 ทาง
 * (อ่าน guard ล้มแล้ว fail-open · เขียน guard ล้มแต่อ้าง durable · complete ครึ่งเดียว)
 *
 * beginPendingOperation: SET guard NX + ZADD queue ใน Lua เดียว — ล้มข้อใด = ห้ามแตะ DB
 * completePendingOperation: ตรวจ guard==opId → ZREM exact member + DEL guard พร้อมกัน
 *   คืน removed/cleared ตามจำนวนจริง · guard เป็นของ op อื่น = ไม่แตะอะไรเลย
 */
const PENDING_OP_PREFIX = "ban:pendingop:";
const PENDING_OP_TTL_SEC = 7 * 24 * 3600;

/** อ่านสถานะ guard แบบ typed (Codex รอบ 11 ข้อ 1: อ่านล้ม ≠ ไม่มีงานค้าง) */
export async function getPendingOpStatus(uid, deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return { ok: false };
    const v = await r.get(`${PENDING_OP_PREFIX}${uid}`);
    return { ok: true, pending: v || null };
  } catch {
    return { ok: false };
  }
}

/**
 * ลงทะเบียน operation ก่อนแตะ DB — atomic ทั้ง guard และ queue entry
 * @returns {Promise<{ ok: boolean, reason?: "conflict"|"redis_unavailable"|"redis_error", member?: string }>}
 */
export async function beginPendingOperation({ uid, reason, targetState, opId }, deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return { ok: false, reason: "redis_unavailable" };
    const member = buildReconcileMember({ uid, reason, targetState, opId });
    const now = deps.now ? deps.now() : Date.now();
    const res = await r.eval(
      "if redis.call('EXISTS', KEYS[1]) == 1 then return 'conflict' end " +
        "redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2]) " +
        "redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4]) " +
        "redis.call('EXPIRE', KEYS[2], ARGV[5]) " +
        "return 'ok'",
      2,
      `${PENDING_OP_PREFIX}${uid}`,
      QUEUE_KEY,
      String(opId),
      String(PENDING_OP_TTL_SEC),
      String(now),
      member,
      String(7 * 24 * 3600),
    );
    if (res === "conflict") return { ok: false, reason: "conflict" };
    return { ok: true, member };
  } catch {
    return { ok: false, reason: "redis_error" };
  }
}

/**
 * จบ operation แบบ atomic: guard==opId → ZREM member + DEL guard พร้อมกัน
 * guard หายไปแล้ว (TTL/complete ก่อนหน้า) → เก็บกวาด orphan member ได้
 * guard เป็นของ op อื่น → ไม่แตะอะไรเลย
 * @returns {Promise<{ ok: boolean, removed?: boolean, cleared?: boolean, reason?: string }>}
 */
export async function completePendingOperation({ uid, opId, member }, deps = {}) {
  try {
    const r = await redis(deps);
    if (!r) return { ok: false, reason: "redis_unavailable" };
    const res = await r.eval(
      "local g = redis.call('GET', KEYS[1]) " +
        "if g == ARGV[1] then " +
        "  local removed = redis.call('ZREM', KEYS[2], ARGV[2]) " +
        "  redis.call('DEL', KEYS[1]) " +
        "  return {1, removed} " +
        "end " +
        "if not g then " +
        "  local removed = redis.call('ZREM', KEYS[2], ARGV[2]) " +
        "  return {2, removed} " +
        "end " +
        "return {0, 0}",
      2,
      `${PENDING_OP_PREFIX}${uid}`,
      QUEUE_KEY,
      String(opId),
      String(member),
    );
    const mode = Number(res?.[0]);
    const removed = Number(res?.[1]) === 1;
    if (mode === 0) return { ok: false, reason: "op_mismatch" };
    return { ok: true, removed, cleared: mode === 1 };
  } catch {
    return { ok: false, reason: "redis_error" };
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
 * mismatch = ค้างไว้ + alert เสมอ ไม่ว่าอายุเท่าไร — client-side timeout
 * (Promise.race) ไม่ cancel DB request จริง late commit หลังครึ่งชั่วโมงยังเกิดได้
 * อายุ/TTL จึงไม่ใช่หลักฐานว่า operation ล้ม ห้าม abandon ตามอายุ: ปิดงานได้
 * เฉพาะเมื่อ DB ตรง intent หรือเจ้าของ operation ยืนยัน definitive failure เอง
 * (completePendingOperation หลัง settle) เท่านั้น
 * @param {{ reconcile: (uid: string) => Promise<{ ok: boolean, banned?: boolean }>,
 *   minSettleMs?: number, now?: () => number, getRedis?: Function, limit?: number, alert?: Function }} deps
 */
export async function sweepPendingBanReconciles(deps) {
  const stats = { scanned: 0, reconciled: 0, skipped: 0, mismatched: 0, failed: 0 };
  const entries = await listPendingReconciles(deps);
  const now = deps.now ? deps.now() : Date.now();
  const minSettle = Number(deps.minSettleMs) >= 0 ? Number(deps.minSettleMs) : MIN_SETTLE_MS;
  const limit = Number(deps.limit) > 0 ? Number(deps.limit) : 50;
  const complete =
    deps.complete || ((e) => completePendingOperation({ uid: e.uid, opId: e.opId, member: e.member }, deps));
  for (const e of entries.slice(0, limit)) {
    stats.scanned += 1;
    if (now - e.enqueuedAt < minSettle) { stats.skipped += 1; continue; }
    try {
      // 1) observe DB แบบ read-only ก่อน (Codex รอบ 10): ห้ามแตะ cache จนกว่า DB ตรง intent
      const obs = await deps.observe(e.uid);
      if (!obs?.ok) { stats.failed += 1; continue; }
      const matches = (obs.banned === true) === (e.targetState === "banned");
      if (!matches) {
        // อายุมาก = สัญญาณผิดปกติ (alert ดังต่อทุกชั่วโมง) แต่ไม่ใช่หลักฐานว่า op
        // ล้ม — late commit ยังเกิดได้ · guard+queue+fail-closed ต้องคงอยู่ทั้งหมด
        stats.mismatched += 1;
        console.log(
          JSON.stringify({
            event: "BAN_RECONCILE_SWEEP_MISMATCH",
            uidPrefix: String(e.uid).slice(0, 8),
            reason: e.reason,
            expected: e.targetState,
            dbBanned: obs.banned === true,
            ageMs: now - e.enqueuedAt,
          }),
        );
        fireMismatchAlert(e, obs.banned === true, deps);
        continue; // cache/fail-closed state ไม่ถูกแตะ · entry ค้างไว้ retry
      }
      // 2) DB ตรง intent เท่านั้น → apply cache
      const rec = await deps.reconcile(e.uid);
      const applied = rec?.ok === true && (rec.banned === true) === (obs.banned === true);
      if (!applied) { stats.failed += 1; continue; }
      // 3) จบงาน atomic: ZREM member + DEL guard พร้อมกัน — ล้ม = คงทั้งคู่ retry ห้าม log DONE
      const done = await complete(e);
      if (done?.ok !== true) {
        stats.failed += 1;
        console.log(JSON.stringify({ event: "BAN_RECONCILE_SWEEP_COMPLETE_FAILED", uidPrefix: String(e.uid).slice(0, 8), reason: done?.reason || "unknown" }));
        continue;
      }
      stats.reconciled += 1;
      console.log(
        JSON.stringify({
          event: "BAN_RECONCILE_SWEEP_DONE",
          uidPrefix: String(e.uid).slice(0, 8),
          reason: e.reason,
          banned: obs.banned === true,
        }),
      );
    } catch {
      stats.failed += 1;
    }
  }
  return stats;
}
