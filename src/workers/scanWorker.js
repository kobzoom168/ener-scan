/**
 * ener-worker-scan: claims scan_jobs, runs AI pipeline, enqueues outbound scan_result.
 * Run: ENABLE_SCAN_WORKER=true node src/workers/scanWorker.js
 */
import { env } from "../config/env.js";
import { claimNextScanJob } from "../stores/scanV2/scanJobs.db.js";
import { processScanJob } from "../services/scanV2/processScanJob.service.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const workerId = `scan-${process.pid}-${Date.now().toString(36)}`;

async function loop() {
  while (true) {
    try {
      const job = await claimNextScanJob(workerId);
      if (!job) {
        await sleep(1000);
        continue;
      }
      await processScanJob(workerId, job);
    } catch (e) {
      console.error("[SCAN_WORKER] loop error:", e?.message || e);
      await sleep(2000);
    }
  }
}

async function main() {
  if (!env.ENABLE_SCAN_WORKER) {
    console.log(JSON.stringify({ event: "SCAN_WORKER_DISABLED" }));
    process.exit(0);
  }

  console.log(
    JSON.stringify({
      event: "SCAN_WORKER_START",
      workerId,
      concurrency: env.SCAN_WORKER_CONCURRENCY,
    }),
  );

  const n = Math.max(1, env.SCAN_WORKER_CONCURRENCY || 1);
  await Promise.all(Array.from({ length: n }, () => loop()));
}

void main();
