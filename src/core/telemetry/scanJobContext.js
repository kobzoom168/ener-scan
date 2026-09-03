import { AsyncLocalStorage } from "node:async_hooks";

/** Scan-job context สำหรับ LLM telemetry (Cost Discovery, Codex 3 ก.ย. 2026)
 *  processScanJob ครอบงานทั้ง job → ทุก LLM call ใต้สายนี้อ่าน jobIdPrefix/accessSource/attempt
 *  ได้จาก ALS โดยไม่ต้องร้อยพารามิเตอร์ผ่านทุกชั้น · instrumentation-only ห้ามมีผลต่อ decision */
const als = new AsyncLocalStorage();

export function runWithScanJobContext(ctx, fn) {
  if (!ctx) return fn();
  return als.run(Object.freeze({ ...ctx }), fn);
}

export function getScanJobContext() {
  return als.getStore() || null;
}
