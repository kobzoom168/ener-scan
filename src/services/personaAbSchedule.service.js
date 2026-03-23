/**
 * Periodic recompute of persona traffic weights (production-safe: timer + delayed first run).
 */

import { env } from "../config/env.js";
import { runPersonaAbRecomputeJob } from "../stores/personaAb.db.js";

const FIRST_RUN_DELAY_MS = 120_000;

export function schedulePersonaAbRecompute() {
  if (!env.PERSONA_AB_OPTIMIZE_ENABLED) {
    console.log("[PERSONA_AB] schedule skipped (PERSONA_AB_OPTIMIZE_ENABLED=false)");
    return;
  }

  const intervalMs = env.PERSONA_AB_RECOMPUTE_INTERVAL_MS;

  setTimeout(() => {
    void runPersonaAbRecomputeJob().catch((err) => {
      console.error("[PERSONA_AB] initial recompute failed:", {
        message: err?.message,
        code: err?.code,
      });
    });
  }, FIRST_RUN_DELAY_MS);

  setInterval(() => {
    void runPersonaAbRecomputeJob().catch((err) => {
      console.error("[PERSONA_AB] scheduled recompute failed:", {
        message: err?.message,
        code: err?.code,
      });
    });
  }, intervalMs);

  console.log("[PERSONA_AB] recompute scheduled", {
    firstRunDelayMs: FIRST_RUN_DELAY_MS,
    intervalMs,
  });
}
