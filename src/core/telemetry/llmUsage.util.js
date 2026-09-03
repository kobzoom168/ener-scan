import { envRuntimeMeta } from "../../config/env.js";
import { getScanJobContext } from "./scanJobContext.js";

/** Helper กลาง LLM usage telemetry (Codex P0-1, 3 ก.ย. 2026) — instrumentation-only
 *  ใช้ร่วมทุก provider path (OpenAI wrapper / OpenRouter-compat fetch / Google-direct)
 *  กติกา: ทุก attempted call มี LLM_USAGE 1 record เป๊ะ · ห้าม log raw provider error body
 *  (เก็บแค่ status/code/failureType + ข้อความ sanitized จำกัด) · telemetry ห้ามทำ call ล้ม */

export const TELEMETRY_ENV_LABEL =
  String(process.env.ENER_ENV || "").trim() ||
  ({ production: "pro", staging: "staging" }[envRuntimeMeta.appEnv] || "local");

/** สร้าง usage context จาก telemetry ที่ call site ส่ง + ALS scan-job context
 *  call ที่ไม่มี job/accessSource ต้องมี contextReason เสมอ (pre_job / non_scan / unavailable) */
export function buildLlmUsageContext(telemetry = {}) {
  const t = telemetry && typeof telemetry === "object" ? telemetry : {};
  let scanCtx = null;
  try {
    scanCtx = getScanJobContext();
  } catch {
    scanCtx = null;
  }
  const jobIdPrefix = t.jobIdPrefix ?? scanCtx?.jobIdPrefix ?? null;
  const accessSource = t.accessSource ?? scanCtx?.accessSource ?? null;
  return {
    env: TELEMETRY_ENV_LABEL,
    jobIdPrefix,
    accessSource,
    attempt: t.attempt ?? scanCtx?.attempt ?? null,
    candidateCount: t.candidateCount ?? null,
    candidateRank: t.candidateRank ?? null,
    decisionPath: t.decisionPath ?? null,
    contextReason:
      jobIdPrefix && accessSource ? null : String(t.reason || (scanCtx ? "unavailable" : "non_scan")),
  };
}

const SECRET_RE = /sk-or-v1-[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._-]+|AIza[0-9A-Za-z_-]{10,}|[?&]key=[^&\s"]+/g;

/** ข้อความ error แบบปลอดภัย: ตัด body/secret ทิ้ง เหลือหัวเรื่องสั้น ๆ */
export function sanitizeErrorMessage(e) {
  const raw = String(e?.message || e || "");
  // compat_http_<status>:<body> — ทิ้ง body ทั้งก้อน (อาจมีเนื้อ request สะท้อนกลับ)
  const noBody = raw.replace(/^(compat_http_\d+):[\s\S]*$/, "$1");
  return noBody.replace(SECRET_RE, "[redacted]").slice(0, 120);
}

/** จำแนก failure แบบ typed — ห้ามพึ่งเนื้อ error ดิบ */
export function classifyLlmFailure(e) {
  const name = String(e?.name || "");
  const msg = String(e?.message || "");
  if (name === "AbortError" || /abort/i.test(name)) return "abort";
  if (/timeout/i.test(msg) || name === "TimeoutError") return "timeout";
  const http = msg.match(/compat_http_(\d+)/) || (Number.isInteger(e?.status) ? [null, String(e.status)] : null);
  if (http) return `http_${http[1]}`;
  if (/fetch failed|network|ENOTFOUND|ECONNRE/i.test(msg)) return "network";
  return "error";
}

/** log LLM_USAGE — try/catch เสมอ (instrumentation failure ห้ามทำ AI call ล้ม) */
export function logLlmUsage(fields) {
  try {
    console.log(JSON.stringify({ event: "LLM_USAGE", ...fields }));
  } catch {
    /* telemetry ห้ามขวาง */
  }
}
