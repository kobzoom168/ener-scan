/**
 * ener-worker-delivery: claims outbound_messages, sends LINE push, retries on 429.
 * Run: ENABLE_DELIVERY_WORKER=true node src/workers/deliveryWorker.js
 */
import fs from "node:fs";
import line from "@line/bot-sdk";
import { env } from "../config/env.js";
import { claimNextOutboundMessage } from "../stores/scanV2/outboundMessages.db.js";
import {
  deliverOutboundMessage,
  finalizeOutboundAttempt,
} from "../services/scanV2/deliverOutbound.service.js";
import { startWorkerHeartbeatLoop } from "../redis/scanV2Redis.js";
import {
  scanV2TraceTs,
  lineUserIdPrefix8,
  idPrefix8,
  workerIdPrefix16,
} from "../utils/scanV2Trace.util.js";
import { buildSupabaseWorkerStartupDiagnostics } from "../utils/supabaseStartupDiagnostics.util.js";

/** Sync write so log shippers see project ref even if process crashes right after startup. */
function logDeliverySupabaseDiagnosticsLine(emitReason) {
  const payload = {
    ...buildSupabaseWorkerStartupDiagnostics({ path: "worker-delivery" }),
    emitReason,
  };
  const line = `${JSON.stringify(payload)}\n`;
  try {
    fs.writeSync(1, line);
    fs.writeSync(2, line);
  } catch {
    console.log(JSON.stringify(payload));
    console.error(JSON.stringify(payload));
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const workerId = `delivery-${process.pid}-${Date.now().toString(36)}`;

const lineClient = new line.Client({
  channelAccessToken: env.CHANNEL_ACCESS_TOKEN,
  channelSecret: env.CHANNEL_SECRET,
});

let loggedDiagnosticsBeforeFirstClaim = false;

async function loop() {
  while (true) {
    try {
      if (!loggedDiagnosticsBeforeFirstClaim) {
        loggedDiagnosticsBeforeFirstClaim = true;
        logDeliverySupabaseDiagnosticsLine("before_first_claim_rpc");
      }
      const msg = await claimNextOutboundMessage(workerId);
      if (!msg) {
        await sleep(500);
        continue;
      }

      if (
        !msg?.id ||
        (typeof msg.id === "string" && msg.id.trim().toLowerCase() === "null")
      ) {
        console.log(
          JSON.stringify({
            event: "DELIVERY_EMPTY_CLAIM",
            path: "worker-delivery",
            workerIdPrefix: workerIdPrefix16(workerId),
            msgId: msg?.id ?? null,
            timestamp: scanV2TraceTs(),
          }),
        );
        continue;
      }

      const attempt = Number(msg.attempt_count) || 0;
      const traceCtx = { workerId, attempt };

      console.log(
        JSON.stringify({
          event: "OUTBOUND_DELIVERY_PROCESS_START",
          path: "worker-delivery",
          workerIdPrefix: workerIdPrefix16(workerId),
          outboundIdPrefix: idPrefix8(msg.id),
          lineUserIdPrefix: lineUserIdPrefix8(msg.line_user_id),
          kind: msg.kind ?? null,
          attempt,
          timestamp: scanV2TraceTs(),
        }),
      );

      const result = await deliverOutboundMessage(lineClient, msg, traceCtx);
      if (!result.sent) {
        await finalizeOutboundAttempt(msg.id, msg, result, traceCtx);
      }
    } catch (e) {
      console.error("[DELIVERY_WORKER] loop error:", e?.message || e);
      await sleep(1500);
    }
  }
}

async function main() {
  logDeliverySupabaseDiagnosticsLine("process_startup");

  if (!env.ENABLE_DELIVERY_WORKER) {
    console.log(JSON.stringify({ event: "DELIVERY_WORKER_DISABLED" }));
    process.exit(0);
  }

  console.log(
    JSON.stringify({
      event: "ENV_SCAN_V2_FLAGS",
      path: "worker-delivery",
      timestamp: scanV2TraceTs(),
      ENABLE_DELIVERY_WORKER: env.ENABLE_DELIVERY_WORKER,
      ENABLE_ASYNC_SCAN_V2: env.ENABLE_ASYNC_SCAN_V2,
      ENABLE_SYNC_SCAN_FALLBACK: env.ENABLE_SYNC_SCAN_FALLBACK,
      ENABLE_LEGACY_WEB_INLINE_SCAN: env.ENABLE_LEGACY_WEB_INLINE_SCAN,
      ALLOW_LEGACY_SCAN_PATHS: env.ALLOW_LEGACY_SCAN_PATHS,
    }),
  );

  console.log(
    JSON.stringify({
      event: "DELIVERY_WORKER_START",
      workerId,
      concurrency: env.DELIVERY_WORKER_CONCURRENCY,
    }),
  );

  const stopHb = startWorkerHeartbeatLoop("delivery", workerId, 45, 15_000);
  const onStop = () => {
    stopHb();
    process.exit(0);
  };
  process.on("SIGTERM", onStop);
  process.on("SIGINT", onStop);

  const n = Math.max(1, env.DELIVERY_WORKER_CONCURRENCY || 1);
  await Promise.all(Array.from({ length: n }, () => loop()));
}

void main();
