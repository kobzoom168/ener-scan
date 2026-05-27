import { PostgrestClient } from "@supabase/postgrest-js";
import { env } from "./env.js";

export const supabase = new PostgrestClient(env.LOCAL_POSTGREST_URL, {
  headers: {
    apikey: env.LOCAL_POSTGREST_ANON_KEY,
    Authorization: `Bearer ${env.LOCAL_POSTGREST_ANON_KEY}`,
  },
});