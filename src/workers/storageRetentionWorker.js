/**
 * Purge expired scan_upload originals (free, unpinned) and payment slip images.
 * Run: ENABLE_STORAGE_RETENTION_WORKER=true node src/workers/storageRetentionWorker.js
 *
 * Default interval: 24h (set STORAGE_RETENTION_INTERVAL_MS).
 */
import { env } from "../config/env.js";
import { startWorkerHeartbeatLoop } from "../redis/scanV2Redis.js";
import { runStorageRetentionSweepOnce } from "../services/storage/storageRetention.service.js";

const workerId = `retention-${process.pid}-${Date.now().toString(36)}`;

function isWorkerEntrypoint() {
  const argv1 = String(process.argv[1] || "").replace(/\\/g, "/");
  return argv1.endsWith("/storageRetentionWorker.js");
}

async function main() {
  if (!env.ENABLE_STORAGE_RETENTION_WORKER) {
    console.log(JSON.stringify({ event: "STORAGE_RETENTION_WORKER_DISABLED" }));
    process.exit(0);
  }

  console.log(
    JSON.stringify({ event: "STORAGE_RETENTION_WORKER_START", workerId }),
  );

  const stopHb = startWorkerHeartbeatLoop("storage_retention", workerId, 60, 25_000);
  const onStop = () => {
    stopHb();
    process.exit(0);
  };
  process.on("SIGTERM", onStop);
  process.on("SIGINT", onStop);

  const intervalMs = env.STORAGE_RETENTION_INTERVAL_MS;

  await runStorageRetentionSweepOnce();
  setInterval(() => {
    void runStorageRetentionSweepOnce();
  }, intervalMs);
}

if (isWorkerEntrypoint()) {
  void main();
}
