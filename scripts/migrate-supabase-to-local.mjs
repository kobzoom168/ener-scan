/**
 * migrate-supabase-to-local.mjs
 *
 * Exports ALL rows from Supabase cloud tables via REST API,
 * then upserts into local PostgreSQL via PostgREST.
 *
 * Run inside ener-scan container:
 *   docker compose exec ener-scan node /app/scripts/migrate-supabase-to-local.mjs
 *
 * Pre-requisite: TRUNCATE all tables via psql before running this script.
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

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (!LOCAL_URL || !LOCAL_KEY) { console.error("Missing LOCAL_POSTGREST_URL or LOCAL_POSTGREST_ANON_KEY"); process.exit(1); }

const localHeaders = { apikey: LOCAL_KEY, Authorization: `Bearer ${LOCAL_KEY}`, "Content-Type": "application/json" };
const supaHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: "application/json" };

// ---------------------------------------------------------------------------
// Tables in FK-safe INSERT order (parent before child)
// ---------------------------------------------------------------------------
const IMPORT_ORDER = [
  "users",
  "app_users",
  "user_entitlements",
  "conversation_state",
  "payments",
  "payment_slips",
  "scan_requests",
  "scan_uploads",
  "scan_jobs",
  "scan_result_cache",
  "scan_results",
  "scan_results_v2",
  "global_object_baselines",
  "scan_public_reports",
  "report_publications",
  "outbound_messages",
  "payment_notifications",
  "line_conversation_messages",
  "persona_ab_assignments",
  "persona_ab_funnel_daily",
  "persona_ab_stats",
  "persona_ab_weights",
  "energy_categories",
  "energy_copy_templates",
];

// ---------------------------------------------------------------------------
// Discover local column names per table via PostgREST swagger
// ---------------------------------------------------------------------------
console.log("Fetching local DB schema from PostgREST swagger...");
const swaggerRes = await fetch(`${LOCAL_URL}/`, { headers: localHeaders });
const swagger = await swaggerRes.json();

/** @type {Map<string, Set<string>>} */
const localColumns = new Map();
for (const [pathKey, methods] of Object.entries(swagger.paths || {})) {
  const table = pathKey.replace(/^\//, "");
  if (!table || table.startsWith("rpc/")) continue;
  const bodySchema = methods?.post?.parameters?.find((p) => p.in === "body")?.schema;
  if (!bodySchema) continue;
  const cols = new Set([...(bodySchema.required || []), ...Object.keys(bodySchema.properties || {})]);
  if (cols.size) localColumns.set(table, cols);
}
console.log(`Schema loaded for ${localColumns.size} tables.\n`);

function filterRow(table, row) {
  const cols = localColumns.get(table);
  if (!cols) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (cols.has(k)) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fetch from Supabase (auto-detect sort column)
// ---------------------------------------------------------------------------
async function fetchFromSupabase(table) {
  const sortCandidates = ["created_at", "id", "updated_at"];
  let sortCol = null;
  for (const col of sortCandidates) {
    const testRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${col}&limit=1`, { headers: supaHeaders });
    if (testRes.ok) { sortCol = col; break; }
  }

  const rows = [];
  let offset = 0;
  while (true) {
    const orderParam = sortCol ? `&order=${sortCol}.asc` : "";
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${PAGE_SIZE}&offset=${offset}${orderParam}`;
    const res = await fetch(url, { headers: supaHeaders });
    if (res.status === 404) return null;
    if (!res.ok) { const body = await res.text(); throw new Error(`${res.status} ${body.slice(0, 200)}`); }
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    process.stdout.write(`  fetched ${rows.length}...\r`);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Upsert into local PostgREST (batched, column-filtered)
// ---------------------------------------------------------------------------
async function upsertLocal(table, rows) {
  if (!rows.length) return { inserted: 0, errors: 0 };
  const BATCH = 200;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => filterRow(table, r));
    const res = await fetch(`${LOCAL_URL}/${table}`, {
      method: "POST",
      headers: { ...localHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
    if (res.ok || res.status === 201) {
      inserted += batch.length;
    } else {
      const body = await res.text();
      console.error(`\n  [ERROR] batch ${i}-${i + batch.length - 1}: ${res.status} ${body.slice(0, 200)}`);
      errors += batch.length;
    }
    process.stdout.write(`  upserted ${inserted}/${rows.length}\r`);
  }
  return { inserted, errors };
}

// ---------------------------------------------------------------------------
// Main import loop
// ---------------------------------------------------------------------------
const results = [];

for (const table of IMPORT_ORDER) {
  process.stdout.write(`\n[${table}] fetching from Supabase...`);

  let rows;
  try {
    rows = await fetchFromSupabase(table);
  } catch (e) {
    console.error(`\n  [ERROR] fetch: ${e.message.slice(0, 150)}`);
    results.push({ table, status: "fetch_error", error: e.message.slice(0, 80) });
    continue;
  }

  if (rows === null) { console.log(`\n  [SKIP] not in Supabase`); results.push({ table, status: "not_in_supabase" }); continue; }
  if (rows.length === 0) { console.log(`\n  [SKIP] 0 rows`); results.push({ table, status: "empty" }); continue; }

  console.log(`\n  found ${rows.length} rows — upserting...`);

  let r;
  try {
    r = await upsertLocal(table, rows);
  } catch (e) {
    console.error(`\n  [ERROR] upsert: ${e.message.slice(0, 150)}`);
    results.push({ table, status: "upsert_error", rows: rows.length, error: e.message.slice(0, 80) });
    continue;
  }

  console.log(`\n  [${r.errors === 0 ? "OK" : "PARTIAL"}] inserted=${r.inserted} errors=${r.errors}`);
  results.push({ table, status: r.errors === 0 ? "ok" : "partial", ...r });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n\n========== MIGRATION SUMMARY ==========");
for (const r of results) {
  const icon = r.status === "ok" ? "✅" : (r.status === "empty" || r.status === "not_in_supabase") ? "⚪" : "❌";
  const detail = r.inserted != null ? `${r.inserted} rows` : r.status === "not_in_supabase" ? "not in Supabase" : r.status === "empty" ? "0 rows" : (r.error || "").slice(0, 60);
  console.log(`${icon} ${r.table.padEnd(30)} ${detail}`);
}
console.log("========================================\n");
