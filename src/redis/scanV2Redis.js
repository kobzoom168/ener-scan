/**
 * Optional Redis for scan V2 (rate keys, dedupe, heartbeat).
 * When REDIS_URL is unset, all operations are no-ops — DB remains source of truth.
 */
import { env } from "../config/env.js";

/** @type {import("ioredis").default | null} */
let client = null;

/**
 * @returns {Promise<import("ioredis").default | null>}
 */
export async function getScanV2Redis() {
  if (!env.REDIS_URL) return null;
  if (client) return client;
  try {
    const { default: IORedis } = await import("ioredis");
    client = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
    return client;
  } catch {
    console.warn(
      JSON.stringify({
        event: "SCAN_V2_REDIS_OPTIONAL_MISSING",
        hint: "Install ioredis or leave REDIS_URL unset",
      }),
    );
    return null;
  }
}
