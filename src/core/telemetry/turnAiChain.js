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

/** เรียกจาก LLM client ทุกครั้งที่ยิงจริง — นอก turn context = no-op */
export function recordTurnAiCall(callSite) {
  const s = als.getStore();
  if (s) s.callSites.push(String(callSite || "untagged"));
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
      latencyMs: Date.now() - s.startedAt,
    }),
  );
}
