import crypto from "node:crypto";
import { env } from "../config/env.js";

/**
 * Sanitized Supabase connection facts for worker startup logs (no secrets).
 * Use to verify worker-delivery points at the same project as SQL editor / dashboard.
 *
 * @param {{ path?: string, supabaseUrl?: string, serviceRoleKey?: string }} [opts]
 * @returns {Record<string, unknown>}
 */
export function buildSupabaseWorkerStartupDiagnostics(opts = {}) {
  const path = opts.path ?? "worker";
  const urlStr = String(
    opts.supabaseUrl ?? env.SUPABASE_URL ?? "",
  ).trim();
  let supabaseUrlHost = null;
  /** Subdomain before `.supabase.co` — matches dashboard "Project URL" host in most projects */
  let supabaseProjectRef = null;
  try {
    const u = new URL(urlStr);
    supabaseUrlHost = u.hostname;
    const m = u.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    supabaseProjectRef = m ? m[1] : u.hostname;
  } catch {
    supabaseUrlHost = "invalid_or_missing_url";
  }

  const key = String(
    opts.serviceRoleKey ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );
  const serviceRoleKeySha256Prefix16 =
    key.length > 0
      ? crypto.createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16)
      : null;

  return {
    event: "SUPABASE_WORKER_CONNECTION_DIAGNOSTICS",
    path,
    supabaseUrlHost,
    supabaseProjectRef,
    supabaseUrlConfigured: Boolean(urlStr),
    serviceRoleKeyLength: key.length,
    serviceRoleKeySha256Prefix16,
    note:
      "Temporary: compare supabaseProjectRef + serviceRoleKeySha256Prefix16 with Dashboard → Settings → API (same project as SQL editor). Redeploy worker after env changes.",
  };
}
