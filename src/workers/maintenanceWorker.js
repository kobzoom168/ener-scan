/**
 * ener-worker-maintenance: stale lock sweep (outbound stuck in `sending`).
 * Run: ENABLE_MAINTENANCE_WORKER=true node src/workers/maintenanceWorker.js
 */
import { env } from "../config/env.js";
import { supabase } from "../config/supabase.js";

const STALE_MS = 5 * 60 * 1000;

async function sweepStaleOutboundSending() {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
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

async function runOnce() {
  await sweepStaleOutboundSending();
}

async function main() {
  if (!env.ENABLE_MAINTENANCE_WORKER) {
    console.log(JSON.stringify({ event: "MAINTENANCE_WORKER_DISABLED" }));
    process.exit(0);
  }

  console.log(JSON.stringify({ event: "MAINTENANCE_WORKER_START" }));

  const intervalMs = Number(process.env.MAINTENANCE_INTERVAL_MS || 60_000) || 60_000;

  await runOnce();
  setInterval(() => {
    void runOnce();
  }, intervalMs);
}

void main();
