import { PostgrestClient } from "@supabase/postgrest-js";
import { env } from "./env.js";

// Local PostgREST (Hetzner) is the ONLY database path — Supabase cloud retired Jul 2026.
if (!env.LOCAL_POSTGREST_URL || !env.LOCAL_POSTGREST_ANON_KEY) {
  throw new Error("LOCAL_POSTGREST_URL / LOCAL_POSTGREST_ANON_KEY missing (Supabase cloud fallback removed)");
}

export const supabase = new PostgrestClient(env.LOCAL_POSTGREST_URL, {
  headers: {
    apikey: env.LOCAL_POSTGREST_ANON_KEY,
    Authorization: `Bearer ${env.LOCAL_POSTGREST_ANON_KEY}`,
  },
});
