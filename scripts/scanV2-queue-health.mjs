/**
 * Scan V2 queue visibility: counts by status + Redis canary (429/hour).
 * Usage: node scripts/scanV2-queue-health.mjs
 */
import "../src/config/env.js";
import { env } from "../src/config/env.js";
import { supabase } from "../src/config/supabase.js";
import { getLine429CanaryCountHour } from "../src/redis/scanV2Redis.js";

async function countRows(table, match) {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(match)) {
    q = q.eq(k, v);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const [
    scanQueued,
    scanProcessing,
    scanFailed,
    outQueued,
    outRetry,
    outDead,
    outFailed,
    line429Hour,
  ] = await Promise.all([
    countRows("scan_jobs", { status: "queued" }),
    countRows("scan_jobs", { status: "processing" }),
    countRows("scan_jobs", { status: "failed" }),
    countRows("outbound_messages", { status: "queued" }),
    countRows("outbound_messages", { status: "retry_wait" }),
    countRows("outbound_messages", { status: "dead" }),
    countRows("outbound_messages", { status: "failed" }),
    getLine429CanaryCountHour(),
  ]);

  const report = {
    event: "SCAN_V2_QUEUE_HEALTH_CLI",
    scan_jobs: {
      queued: scanQueued,
      processing: scanProcessing,
      failed: scanFailed,
    },
    outbound_messages: {
      queued: outQueued,
      retry_wait: outRetry,
      dead: outDead,
      failed: outFailed,
    },
    redis_line_429_last_hour: line429Hour,
    canary_thresholds: {
      queue_backlog_max: env.CANARY_QUEUE_BACKLOG_MAX,
      line_429_per_hour_max: env.CANARY_LINE_429_RATE_MAX_PER_HOUR,
      delivery_success_rate_min: env.CANARY_DELIVERY_SUCCESS_RATE_MIN,
      report_publish_success_rate_min: env.CANARY_REPORT_PUBLISH_SUCCESS_RATE_MIN,
    },
    flags: {
      ENABLE_ASYNC_SCAN_V2: env.ENABLE_ASYNC_SCAN_V2,
      ENABLE_SYNC_SCAN_FALLBACK: env.ENABLE_SYNC_SCAN_FALLBACK,
      ENABLE_LEGACY_WEB_INLINE_SCAN: env.ENABLE_LEGACY_WEB_INLINE_SCAN,
    },
    alerts: {
      backlog_high:
        scanQueued + outQueued + outRetry > env.CANARY_QUEUE_BACKLOG_MAX,
      line429_high:
        line429Hour != null &&
        line429Hour > env.CANARY_LINE_429_RATE_MAX_PER_HOUR,
      dead_letter_visible: outDead > 0 || outFailed > 0,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
