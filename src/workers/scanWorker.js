/**
 * ener-worker-scan: claims scan_jobs, runs AI pipeline, enqueues outbound scan_result.
 * Run: ENABLE_SCAN_WORKER=true node src/workers/scanWorker.js
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { claimNextScanJob } from "../stores/scanV2/scanJobs.db.js";
import { processScanJob } from "../services/scanV2/processScanJob.service.js";
import { startWorkerHeartbeatLoop } from "../redis/scanV2Redis.js";
import { scanV2TraceTs } from "../utils/scanV2Trace.util.js";
import { waitForGracefulDrain } from "./workerGracefulShutdown.util.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const workerId = `scan-${process.pid}-${Date.now().toString(36)}`;

let isShuttingDown = false;
let activeJobs = 0;

async function loop() {
  while (true) {
    if (isShuttingDown) break;
    try {
      const job = await claimNextScanJob(workerId);
      if (!job) {
        if (isShuttingDown) break;
        await sleep(1000);
        continue;
      }
      activeJobs++;
      try {
        await processScanJob(workerId, job);
      } finally {
        activeJobs--;
      }
    } catch (e) {
      console.error("[SCAN_WORKER] loop error:", e?.message || e);
      await sleep(2000);
    }
  }
}

function isWorkerEntrypoint() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

async function main() {
  if (!env.ENABLE_SCAN_WORKER) {
    console.log(JSON.stringify({ event: "SCAN_WORKER_DISABLED" }));
    process.exit(0);
  }

  console.log(
    JSON.stringify({
      event: "ENV_SCAN_V2_FLAGS",
      path: "worker-scan",
      timestamp: scanV2TraceTs(),
      ENABLE_SCAN_WORKER: env.ENABLE_SCAN_WORKER,
      ENABLE_ASYNC_SCAN_V2: env.ENABLE_ASYNC_SCAN_V2,
    }),
  );

  console.log(
    JSON.stringify({
      event: "SCAN_WORKER_START",
      workerId,
      concurrency: env.SCAN_WORKER_CONCURRENCY,
    }),
  );

  const stopHb = startWorkerHeartbeatLoop("scan", workerId, 45, 15_000);

  const onStop = async () => {
    isShuttingDown = true;
    stopHb();
    console.log(
      JSON.stringify({
        event: "SCAN_WORKER_SHUTTING_DOWN",
        workerId,
        activeJobs,
      }),
    );
    const outcome = await waitForGracefulDrain({
      getActiveCount: () => activeJobs,
      timeoutMs: env.SCAN_WORKER_GRACEFUL_TIMEOUT_MS,
      pollMs: 500,
    });
    if (outcome === "clean") {
      console.log(
        JSON.stringify({
          event: "SCAN_WORKER_SHUTDOWN_CLEAN",
          workerId,
        }),
      );
    } else {
      console.log(
        JSON.stringify({
          event: "SCAN_WORKER_SHUTDOWN_TIMEOUT",
          workerId,
          activeJobs,
        }),
      );
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    onStop().catch(() => process.exit(1));
  });
  process.on("SIGINT", () => {
    onStop().catch(() => process.exit(1));
  });

  const n = Math.max(1, env.SCAN_WORKER_CONCURRENCY || 1);
  await Promise.all(Array.from({ length: n }, () => loop()));
}

if (isWorkerEntrypoint()) {
  void main();
}

/** @internal tests — snapshot of graceful-shutdown counters */
export function getScanWorkerShutdownSnapshot() {
  return { isShuttingDown, activeJobs };
}

/** @internal tests — reset module state (do not use in production) */
export function resetScanWorkerShutdownStateForTests() {
  isShuttingDown = false;
  activeJobs = 0;
}

/** @internal tests — mirror shutdown flag (do not use in production) */
export function setScanWorkerShuttingDownForTests(v) {
  isShuttingDown = Boolean(v);
}

/** @internal tests — adjust in-flight counter (do not use in production) */
export function adjustScanWorkerActiveJobsForTests(delta) {
  activeJobs += Number(delta) || 0;
}
