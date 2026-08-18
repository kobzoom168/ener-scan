/**
 * Durable inbound message idempotency (Codex P0-7): owner-token lease 5 นาที +
 * completed marker 48 ชม. — ครอบทุก message type ก่อน AI/parser/side effect ·
 * duplicate ข้าม container โดนกันด้วย SET NX · handler ล้ม = compare-and-delete
 * lease ของตัวเองเท่านั้น (owner เก่าลบ lease ใหม่ไม่ได้) · crash = lease หมดเอง
 * redis ไม่มี = fail-open (LINE dedupe ชั้น edge ยังช่วยชั้นหนึ่ง)
 */
import crypto from "node:crypto";

export const INBOUND_LEASE_PX_MS = 300000;
export const INBOUND_DONE_TTL_SEC = 48 * 3600;

/**
 * @param {string} messageId
 * @param {{ getRedis?: () => Promise<any> }} [deps]
 * @returns {Promise<{ proceed: boolean, reason?: string, release: (success?: boolean) => Promise<void> }>}
 */
export async function claimInboundMessage(messageId, deps = {}) {
  const id = String(messageId || "").trim();
  const noop = { proceed: true, release: async () => {} };
  if (!id) return noop;
  try {
    const getRedis =
      deps.getRedis || (await import("../../redis/scanV2Redis.js")).getScanV2Redis;
    const r = await getRedis();
    if (!r) return noop;
    const doneKey = `msg:done:${id}`;
    const leaseKey = `msg:lease:${id}`;
    if (await r.get(doneKey).catch(() => null)) {
      return { proceed: false, reason: "completed", release: async () => {} };
    }
    const token = crypto.randomBytes(8).toString("hex");
    const ok = await r.set(leaseKey, token, "PX", INBOUND_LEASE_PX_MS, "NX");
    if (ok !== "OK") return { proceed: false, reason: "in_progress", release: async () => {} };
    return {
      proceed: true,
      release: async (success) => {
        try {
          if (success) await r.set(doneKey, "1", "EX", INBOUND_DONE_TTL_SEC);
          await r.eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
            1, leaseKey, token,
          );
        } catch { /* lease TTL เป็น safety net */ }
      },
    };
  } catch {
    return noop;
  }
}
