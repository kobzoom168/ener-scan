import { PostgrestClient } from "@supabase/postgrest-js";
import { env } from "./env.js";

// Local PostgREST (Hetzner) is the ONLY database path — Supabase cloud retired Jul 2026.
if (!env.LOCAL_POSTGREST_URL || !env.LOCAL_POSTGREST_ANON_KEY) {
  throw new Error("LOCAL_POSTGREST_URL / LOCAL_POSTGREST_ANON_KEY missing (Supabase cloud fallback removed)");
}

/**
 * DB client ของเราเอง (PostgREST + Postgres บน VPS) — ไม่ใช่บริการ Supabase cloud
 * (กบ 18 ส.ค.: ชื่อ supabase ทำให้เข้าใจผิด) — ชื่อใหม่คือ `db` · `supabase` คงไว้
 * เป็น alias ให้โค้ดเดิม 54 ไฟล์ทำงานต่อได้ ค่อยทยอยย้ายเป็น db แล้วถอด alias
 */
export const db = new PostgrestClient(env.LOCAL_POSTGREST_URL, {
  headers: {
    apikey: env.LOCAL_POSTGREST_ANON_KEY,
    Authorization: `Bearer ${env.LOCAL_POSTGREST_ANON_KEY}`,
  },
});

/** @deprecated ใช้ `db` — ตัวนี้คือ alias ชื่อเก่า (ไม่ใช่ Supabase cloud) */
export const supabase = db;
