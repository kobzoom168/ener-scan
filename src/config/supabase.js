import { PostgrestClient } from "@supabase/postgrest-js";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// If LOCAL_POSTGREST_URL is set → Hetzner local PG via PostgREST
// If not set → Supabase cloud (Railway / any env without local PG)
export const supabase = env.LOCAL_POSTGREST_URL
  ? new PostgrestClient(env.LOCAL_POSTGREST_URL, {
      headers: {
        apikey: env.LOCAL_POSTGREST_ANON_KEY,
        Authorization: `Bearer ${env.LOCAL_POSTGREST_ANON_KEY}`,
      },
    })
  : createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
