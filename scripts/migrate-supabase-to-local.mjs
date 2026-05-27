/**
 * migrate-supabase-to-local.mjs
 *
 * Exports ALL rows from Supabase cloud tables via REST API,
 * then upserts into local PostgreSQL via PostgREST.
 *
 * Run on server: node scripts/migrate-supabase-to-local.mjs
 * Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOCAL_POSTGREST_URL,
 *       LOCAL_POSTGREST_ANON_KEY from process.env / .env file.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Load .env
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 1 || line.startsWith("#")) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL_URL = process.env.LOCAL_POSTGREST_URL?.replace(/\/$/, "");
const LOCAL_KEY = process.env.LOCAL_POSTGREST_ANON_KEY;
const PAGE_SIZE = 1000;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!LOCAL_URL || !LOCAL_KEY) {
  console.error("Missing LOCAL_POSTGREST_URL or LOCAL_POSTGREST_ANON_KEY");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tables to migrate in FK-safe order
// ---------------------------------------------------------------------------
const TABLES = [
  "users",
  "app_users",
  "user_entitlements",
  "scan_requests",
  "scan_uploads",
  "scan_jobs",
  "scan_result_cache",
  "scan_results",
  "scan_results_v2",
  "scan_public_reports",
  "report_publications",
  "outbound_messages",
  "payments",
  "payment_slips",
  "payment_notifications",
  "conversation_state",
  "line_conversation_messages",
  "persona_ab_assignments",
  "persona_ab_funnel_daily",
  "persona_ab_stats",
  "persona_ab_weights",
  "energy_categories",
  "energy_copy_templates",
  "global_object_baselines",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchPage(table, offset) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${PAGE_SIZE}&offset=${offset}&order=created_at.asc`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: "application/json",
    },
  });
  if (res.status === 404) return null; // table doesn't exist in Supabase
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase fetch ${table} offset=${offset}: ${res.status} ${body}`);
  }
  return res.json();
}

async function fetchAll(table) {
  const rows = [];
  let offset = 0;
  while (true) {
    const page = await fetchPage(table, offset);
    if (page === null) return null; // table not in Supabase
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    process.stdout.write(`  fetched ${rows.length} rows...\r`);
  }
  return rows;
}

async function upsertLocal(table, rows) {
  if (!rows.length) return { inserted: 0, errors: 0 };

  const BATCH = 200;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(`${LOCAL_URL}/${table}`, {
      method: "POST",
      headers: {
        apikey: LOCAL_KEY,
        Authorization: `Bearer ${LOCAL_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (res.ok || res.status === 201) {
      inserted += batch.length;
    } else {
      const body = await res.text();
      console.error(`  [ERROR] upsert ${table} batch ${i}: ${res.status} ${body.slice(0, 200)}`);
      errors += batch.length;
    }
    process.stdout.write(`  upserted ${inserted}/${rows.length}\r`);
  }
  return { inserted, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const results = [];

for (const table of TABLES) {
  process.stdout.write(`\n[${table}] fetching from Supabase...`);

  let rows;
  try {
    rows = await fetchAll(table);
  } catch (e) {
    console.error(`\n  [ERROR] fetch failed: ${e.message}`);
    results.push({ table, status: "fetch_error", error: e.message });
    continue;
  }

  if (rows === null) {
    console.log(`\n  [SKIP] table not found in Supabase`);
    results.push({ table, status: "not_in_supabase" });
    continue;
  }

  if (rows.length === 0) {
    console.log(`\n  [SKIP] 0 rows in Supabase`);
    results.push({ table, status: "empty", rows: 0 });
    continue;
  }

  console.log(`\n  found ${rows.length} rows — upserting to local PG...`);

  let upsertResult;
  try {
    upsertResult = await upsertLocal(table, rows);
  } catch (e) {
    console.error(`\n  [ERROR] upsert failed: ${e.message}`);
    results.push({ table, status: "upsert_error", rows: rows.length, error: e.message });
    continue;
  }

  const status = upsertResult.errors === 0 ? "ok" : "partial";
  console.log(
    `\n  [${status.toUpperCase()}] inserted=${upsertResult.inserted} errors=${upsertResult.errors}`,
  );
  results.push({ table, status, ...upsertResult });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n\n========== MIGRATION SUMMARY ==========");
for (const r of results) {
  const icon =
    r.status === "ok" ? "✅" : r.status === "empty" || r.status === "not_in_supabase" ? "⚪" : "❌";
  const detail =
    r.inserted != null
      ? `${r.inserted} rows`
      : r.status === "not_in_supabase"
        ? "not in Supabase"
        : r.status === "empty"
          ? "0 rows"
          : r.error?.slice(0, 60) || "";
  console.log(`${icon} ${r.table.padEnd(30)} ${detail}`);
}
console.log("========================================\n");
