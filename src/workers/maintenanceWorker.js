/**
 * ener-worker-maintenance: stale outbound `sending`, stale scan `processing`,
 * queue health / dead-letter visibility (logs).
 * Run: ENABLE_MAINTENANCE_WORKER=true node src/workers/maintenanceWorker.js
 */
import { env } from "../config/env.js";
import { supabase } from "../config/supabase.js";
import { maybeSendDlqAlert } from "../services/maintenanceDlqAlert.service.js";
import {
  getLine429CanaryCountHour,
  startWorkerHeartbeatLoop,
} from "../redis/scanV2Redis.js";

const STALE_OUTBOUND_MS = 5 * 60 * 1000;

const workerId = `maint-${process.pid}-${Date.now().toString(36)}`;

async function sweepStaleOutboundSending() {
  const cutoff = new Date(Date.now() - STALE_OUTBOUND_MS).toISOString();
  const { data, error } = await supabase
    .from("outbound_messages")
    .update({
      status: "retry_wait",
      next_retry_at: new Date().toISOString(),
      last_error_code: "stale_sending",
      last_error_message: "requeued_by_maintenance",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "sending")
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    console.error("[MAINTENANCE] stale outbound sweep failed:", error.message);
    return;
  }

  const n = data?.length ?? 0;
  if (n > 0) {
    console.log(
      JSON.stringify({
        event: "OUTBOUND_REQUEUED",
        count: n,
        reason: "stale_sending",
      }),
    );
  }
}

async function sweepStaleScanProcessing() {
  const ms = env.SCAN_V2_STALE_PROCESSING_MS;
  const cutoff = new Date(Date.now() - ms).toISOString();
  const { data, error } = await supabase
    .from("scan_jobs")
    .update({
      status: "queued",
      worker_id: null,
      locked_at: null,
      error_message: "requeued_stale_processing",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("locked_at", cutoff)
    .select("id,locked_at,started_at");

  if (error) {
    console.error("[MAINTENANCE] stale scan processing sweep failed:", error.message);
    return;
  }

  const rows = data ?? [];
  for (const row of rows) {
    console.log(
      JSON.stringify({
        event: "SCAN_JOB_STALE_REQUEUED",
        jobIdPrefix: String(row.id || "").slice(0, 8),
        reason: "locked_at_older_than_cutoff",
        staleMs: ms,
        cutoffIso: cutoff,
        previousLockedAt: row.locked_at ?? null,
        previousStartedAt: row.started_at ?? null,
        note:
          "Canary: if this appears often for long-running scans, raise SCAN_V2_STALE_PROCESSING_MS or investigate slow workers.",
      }),
    );
  }

  if (rows.length > 0) {
    console.log(
      JSON.stringify({
        event: "SCAN_JOB_REQUEUED_BATCH",
        count: rows.length,
        reason: "stale_processing",
        staleMs: ms,
        cutoffIso: cutoff,
      }),
    );
  }
}

async function countEq(table, status) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  if (error) return null;
  return count ?? 0;
}

async function logQueueHealthAndDlq() {
  const [
    scanQueued,
    scanProcessing,
    outQueued,
    outRetry,
    outDead,
    outFailed,
    line429Hour,
  ] = await Promise.all([
    countEq("scan_jobs", "queued"),
    countEq("scan_jobs", "processing"),
    countEq("outbound_messages", "queued"),
    countEq("outbound_messages", "retry_wait"),
    countEq("outbound_messages", "dead"),
    countEq("outbound_messages", "failed"),
    getLine429CanaryCountHour(),
  ]);

  const backlog =
    (scanQueued ?? 0) + (outQueued ?? 0) + (outRetry ?? 0);

  console.log(
    JSON.stringify({
      event: "SCAN_V2_QUEUE_HEALTH",
      workerId,
      scan_jobs: {
        queued: scanQueued,
        processing: scanProcessing,
      },
      outbound_messages: {
        queued: outQueued,
        retry_wait: outRetry,
        dead: outDead,
        failed: outFailed,
      },
      backlog_combined: backlog,
      redis_line_429_last_hour: line429Hour,
      canary_thresholds: {
        queue_backlog_max: env.CANARY_QUEUE_BACKLOG_MAX,
        line_429_per_hour_max: env.CANARY_LINE_429_RATE_MAX_PER_HOUR,
      },
      alerts: {
        backlog_high: backlog > env.CANARY_QUEUE_BACKLOG_MAX,
        line429_high:
          line429Hour != null &&
          line429Hour > env.CANARY_LINE_429_RATE_MAX_PER_HOUR,
        dead_letter_visible: (outDead ?? 0) > 0 || (outFailed ?? 0) > 0,
      },
      deadLetterInspectHint:
        (outDead ?? 0) > 0
          ? "sql/outbound_dead_letter_inspect.template.sql"
          : null,
    }),
  );
  await maybeSendDlqAlert({ outDead, outFailed });
}

async function runOnce() {
  await sweepStaleOutboundSending();
  await sweepStaleScanProcessing();
  await logQueueHealthAndDlq();
}

async function main() {
  if (!env.ENABLE_MAINTENANCE_WORKER) {
    console.log(JSON.stringify({ event: "MAINTENANCE_WORKER_DISABLED" }));
    process.exit(0);
  }

  console.log(JSON.stringify({ event: "MAINTENANCE_WORKER_START", workerId }));

  const stopHb = startWorkerHeartbeatLoop("maintenance", workerId, 60, 20_000);
  const onStop = () => {
    stopHb();
    process.exit(0);
  };
  process.on("SIGTERM", onStop);
  process.on("SIGINT", onStop);

  const intervalMs = Number(process.env.MAINTENANCE_INTERVAL_MS || 60_000) || 60_000;

  await runOnce();
  setInterval(() => {
    void runOnce();
  }, intervalMs);
}

void main();
