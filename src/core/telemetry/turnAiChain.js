/**
 * CHAT_TURN_AI_CHAIN (Codex 18 ส.ค. — ก่อน optimize ต้องวัดได้): นับ AI calls
 * ต่อหนึ่งเทิร์นข้อความ ผ่าน AsyncLocalStorage — LLM client บันทึก callSite เข้า
 * context ของเทิร์นเอง แล้ว webhook สรุปหนึ่งบรรทัดตอนจบเทิร์น
 * ใช้พิสูจน์ acceptance: deterministic = 0 call · idle consult = 1 call (planner 0)
 */
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage();

/**
 * @param {{ messageId?: string | null, kind?: string, state?: string | null }} meta
 * @param {() => Promise<any>} fn
 */
export async function runWithTurnContext(meta, fn) {
  const store = {
    messageId: String(meta?.messageId || ""),
    kind: String(meta?.kind || "text"),
    state: meta?.state ?? null,
    startedAt: Date.now(),
    callSites: [],
  };
  return als.run(store, fn);
}

/**
 * เรียกจาก LLM client ทุกครั้งที่ "พยายาม" ยิง (error/timeout ก็นับ) — นอก context = no-op
 * คืน handle สำหรับจับคู่ตอน settle (Codex รอบ 4 P1: FIFO รายงานผิดเมื่อ call
 * หลังเสร็จก่อน call แรก) — caller ส่ง handle กลับมาที่ recordTurnAiLatency
 * @returns {{ id: number } | null}
 */
export function recordTurnAiCall(callSite) {
  const s = als.getStore();
  if (!s) return null;
  s.callSites.push(String(callSite || "untagged"));
  const call = { id: (s.calls || []).length, startedAt: Date.now(), settled: false };
  (s.calls ||= []).push(call);
  return { id: call.id };
}

/** settle call ตาม handle (fallback: ตัวค้างที่เก่าสุด เมื่อ caller เก่าไม่ส่ง handle) */
export function recordTurnAiLatency(ms, handle = null) {
  const s = als.getStore();
  if (!s) return;
  const calls = Array.isArray(s.calls) ? s.calls : [];
  const target =
    handle && Number.isInteger(handle.id) && calls[handle.id] && !calls[handle.id].settled
      ? calls[handle.id]
      : calls.find((c) => !c.settled);
  // นับ settle เฉพาะเมื่อจับคู่ call ที่ยังไม่ settle ได้จริง (Codex รอบ 5:
  // เรียกซ้ำด้วย handle เดิม/เกินจำนวน call ห้ามทำ settledCount โป่ง)
  if (!target) return;
  target.settled = true;
  s.aiMs = (s.aiMs || 0) + Math.max(0, Number(ms) || 0);
  s.settledCount = (s.settledCount || 0) + 1;
}

/**
 * งบ AI ต่อเทิร์นข้อความลูกค้า (flow-role P0-3, Codex 27 ส.ค.): ทุก surface (semanticCatcher/clarifier/planner/
 * consult+regenerate/phrasing) รวมกันห้ามเกินค่านี้ — วัดจาก callSites จริงใน ALS ไม่ใช่ตัวนับของ chain
 * Codex verdict rollout นี้ = 3 (รักษาเทิร์น 3-call จริงบน Pro ไว้ 6/333, หยุด chain 4–5) — ค่อยลดเป็น 2 หลังยุบ call ซ้ำด้วย telemetry
 */
export const TURN_AI_CALL_BUDGET = 3;

/** จำนวน AI calls ที่ "พยายามยิง" แล้วในเทิร์นนี้ · นอก context = 0 (วัดไม่ได้) */
export function getTurnAiCallCount() {
  const s = als.getStore();
  return s ? s.callSites.length : 0;
}

/** true = อยู่ใน turn context (งบวัดได้จริง) */
export function hasTurnContext() {
  return Boolean(als.getStore());
}

/** งบที่เหลือของเทิร์น (นอก context = เต็มงบ — caller ที่ต้องการเข้มกว่านั้นเช็ค hasTurnContext เอง) */
export function turnAiBudgetRemaining(budget = TURN_AI_CALL_BUDGET) {
  return Math.max(0, Number(budget) - getTurnAiCallCount());
}

/** typed error เมื่อ LLM boundary ปฏิเสธยิงเพราะงบเทิร์นหมด (code = "budget_exhausted") */
export class TurnAiBudgetExhaustedError extends Error {
  constructor(callSite) {
    super(`turn_ai_budget_exhausted:${String(callSite || "untagged")}`);
    this.name = "TurnAiBudgetExhaustedError";
    this.code = "budget_exhausted";
    this.callSite = String(callSite || "untagged");
  }
}

/** true = เทิร์นนี้บังคับงบ (เฉพาะ customer text turn — image/อื่น ๆ และนอก context พฤติกรรมเดิม) */
export function isTurnAiBudgetEnforced() {
  const s = als.getStore();
  return Boolean(s && s.kind === "text");
}

/**
 * enforcement กลางที่ LLM boundary (P0-3 Codex 27 ส.ค.): จอง slot ก่อนยิง transport
 * - นอก context / ไม่ใช่ text turn → ok เสมอ (นับ telemetry ตามเดิม)
 * - text turn และ callSites.length ≥ budget → ok:false + บันทึก blocked (ไม่แตะ transport)
 * @returns {{ ok: true, handle: {id:number}|null, enforced: boolean } | { ok: false, reason: "budget_exhausted", handle: null, enforced: true }}
 */
export function tryReserveTurnAiCall(callSite, budget = TURN_AI_CALL_BUDGET) {
  const s = als.getStore();
  if (!s) return { ok: true, handle: null, enforced: false };
  const enforced = s.kind === "text";
  if (enforced && s.callSites.length >= Number(budget)) {
    (s.blockedCallSites ||= []).push(String(callSite || "untagged"));
    return { ok: false, reason: "budget_exhausted", handle: null, enforced: true };
  }
  return { ok: true, handle: recordTurnAiCall(callSite), enforced };
}

/** เติมข้อมูล state/route ระหว่างทาง (เช่น phase1 ที่รู้ทีหลัง) */
export function annotateTurn(patch) {
  const s = als.getStore();
  if (s && patch && typeof patch === "object") Object.assign(s, patch);
}

/** สรุปหนึ่งบรรทัดต่อเทิร์น — เรียกใน finally ของ webhook */
export function emitTurnAiChain() {
  const s = als.getStore();
  if (!s) return;
  console.log(
    JSON.stringify({
      event: "CHAT_TURN_AI_CHAIN",
      messageId: s.messageId || null,
      kind: s.kind,
      state: s.state ?? null,
      aiCallCount: s.callSites.length,
      callSites: s.callSites,
      // P0-3: call ที่ boundary ปฏิเสธเพราะงบเทิร์นหมด (ไม่ได้ยิง transport)
      blockedAiCallCount: (s.blockedCallSites || []).length,
      blockedCallSites: s.blockedCallSites || [],
      aiBudget: TURN_AI_CALL_BUDGET,
      // ชื่อซื่อสัตย์ (Codex รอบ 3): นี่คือ latency ของ call ที่ settle แล้วเท่านั้น —
      // outer timeout ระหว่าง request ค้างจะเห็น pendingAiCount>0 + elapsed แทนศูนย์เงียบ ๆ
      settledAiCallCount: s.settledCount || 0,
      settledAiLatencyMs: Math.round(s.aiMs || 0),
      pendingAiCount: Math.max(0, s.callSites.length - (s.settledCount || 0)),
      pendingElapsedMs: (() => {
        const open = (Array.isArray(s.calls) ? s.calls : []).filter((c) => !c.settled);
        return open.length ? Date.now() - Math.min(...open.map((c) => c.startedAt)) : 0;
      })(),
      turnLatencyMs: Date.now() - s.startedAt,
    }),
  );
}
