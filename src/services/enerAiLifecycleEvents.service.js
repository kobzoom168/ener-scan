import { sendEnerAiEvent } from "./enerAiEvent.service.js";
import { sanitizeEventPayload } from "./enerAiEventPayload.util.js";

export { sanitizeEventPayload };

/**
 * @param {object} [ctx]
 */
export function buildScanLifecyclePayload(ctx = {}) {
  const lineUserId = String(ctx.lineUserId || ctx.userId || "").trim() || null;
  const score =
    typeof ctx.score === "number"
      ? ctx.score
      : typeof ctx.scoreSummary === "number"
        ? ctx.scoreSummary
        : null;
  return sanitizeEventPayload({
    lineUserId,
    userId: lineUserId || String(ctx.appUserId || "").trim() || null,
    scanId: String(ctx.scanId || "").trim() || null,
    reportId: String(ctx.reportId || "").trim() || null,
    publicToken: String(ctx.publicToken || "").trim() || null,
    reportUrl: String(ctx.reportUrl || "").trim() || null,
    objectType: String(ctx.objectType || ctx.category || "").trim() || null,
    category: String(ctx.category || ctx.objectType || "").trim() || null,
    score,
    scoreSummary: score,
    scanMode: String(ctx.scanMode || ctx.mode || "").trim() || null,
    durationMs:
      typeof ctx.durationMs === "number" && Number.isFinite(ctx.durationMs)
        ? Math.max(0, Math.floor(ctx.durationMs))
        : null,
    createdAt: String(ctx.createdAt || new Date().toISOString()),
    dedupHit: ctx.dedupHit === true ? true : undefined,
    dedupType: ctx.dedupType ? String(ctx.dedupType).slice(0, 32) : undefined,
  });
}

/**
 * Emit scan_completed only (dedup re-delivery — no new report).
 * Never throws to caller.
 * @param {object} ctx
 */
export function emitScanCompletedEvent(ctx = {}) {
  const payload = buildScanLifecyclePayload(ctx);
  const externalUserId = String(ctx.lineUserId || ctx.appUserId || "").trim();
  const externalObjectId = String(
    ctx.reportId || ctx.publicToken || ctx.scanId || "",
  ).trim();
  const label = String(ctx.objectType || ctx.category || "unknown").trim() || "unknown";
  const summary = ctx.dedupHit
    ? `Scan completed (dedup ${ctx.dedupType || "cache"})`
    : `Scan completed (${label})`;

  void sendEnerAiEvent({
    eventType: "scan_completed",
    summary,
    externalUserId,
    externalObjectId,
    payload,
  });
}

/**
 * Emit scan_completed + report_created for a successful new report.
 * Never throws to caller.
 * @param {object} ctx
 */
export function emitScanLifecycleEvents(ctx = {}) {
  const payload = buildScanLifecyclePayload(ctx);
  const externalUserId = String(ctx.lineUserId || ctx.appUserId || "").trim();
  const externalObjectId = String(
    ctx.reportId || ctx.publicToken || ctx.scanId || "",
  ).trim();
  const label = String(ctx.objectType || ctx.category || "unknown").trim() || "unknown";

  void sendEnerAiEvent({
    eventType: "scan_completed",
    summary: `Scan completed (${label})`,
    externalUserId,
    externalObjectId,
    payload,
  });
  void sendEnerAiEvent({
    eventType: "report_created",
    summary: `Report created ${externalObjectId.slice(0, 8) || "unknown"}`,
    externalUserId,
    externalObjectId,
    payload,
  });
}
