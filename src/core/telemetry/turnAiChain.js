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

/**
 * งบเรียกโมเดล "ที่ลูกค้าเห็นข้อความ" ต่อหนึ่งเทิร์น (Codex P0-6)
 * ผูกกับ ALS store เดียวกับ CHAT_TURN_AI_CHAIN → guard ที่อยู่คนละไฟล์
 * ก็เห็นยอดเดียวกัน โดยไม่ต้องส่ง object ต่อกันทุกชั้น
 * นอก turn context = คืน null (caller ใช้ budget ท้องถิ่นแทน)
 */
export function getCustomerAiBudget(max = 2) {
  const s = als.getStore();
  if (!s) return null;
  if (typeof s.customerAiAttempted !== "number") s.customerAiAttempted = 0;
  return {
    // smoke 24 ส.ค. (Codex): ต้องนับ "ทุก" call ในเทิร์น รวม planner — ใช้ยอดจริงที่ LLM client
    // บันทึกผ่าน recordTurnAiCall เป็นฐาน แล้วบวกที่ guard ประกาศเอง (กรณี client ไม่ได้ผ่าน wrapper)
    get attempted() {
      return Math.max(s.customerAiAttempted, (s.callSites || []).length);
    },
    set attempted(v) {
      s.customerAiAttempted = Number(v) || 0;
    },
    max,
  };
}
