import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

console.log("[SUPABASE_DEBUG] client configured", {
  supabaseUrl: env.SUPABASE_URL,
});