/**
 * migrate-via-psql.mjs
 * Runs on the HOST (not inside container).
 * Downloads all Supabase Production data, inserts via psql with FK checks disabled.
 *
 * Usage: node /root/ener-scan-pro/migrate-via-psql.mjs
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

// Load env from /root/ener-scan-pro/.env
for (const line of fs.readFileSync("/root/ener-scan-pro/.env", "utf8").split("\n")) {
  const eq = line.indexOf("=");
  if (eq < 1 || line.startsWith("#")) continue;
  const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const SUPA_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL_DB = process.env.LOCAL_PG_DB || "ener_scan_pro";
const PAGE = 1000;

if (!SUPA_URL || !SUPA_KEY) { console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
console.log(`Source: ${SUPA_URL}`);
console.log(`Target DB: ${LOCAL_DB}\n`);

const supaH = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

// ── Get local schema via psql ──────────────────────────────────────────────────
console.log("Loading local DB schema...");
const colsJson = execSync(
  `sudo -u postgres psql -d ${LOCAL_DB} -t -A -c "SELECT json_object_agg(table_name, cols) FROM (SELECT table_name, json_agg(column_name ORDER BY ordinal_position) AS cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) t"`,
  { encoding: "utf8" }
).trim();
const LOCAL_COLS = JSON.parse(colsJson);
console.log(`Schema loaded: ${Object.keys(LOCAL_COLS).length} tables\n`);

function filterRow(table, row) {
  const cols = LOCAL_COLS[table];
  if (!cols) return row;
  const out = {};
  for (const c of cols) if (c in row) out[c] = row[c];
  return out;
}

// ── Fetch from Supabase (paginated) ───────────────────────────────────────────
async function fetchAll(table) {
  // Auto-detect a valid sort column
  let sortCol = "id";
  for (const col of ["created_at", "id", "updated_at"]) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${col}&limit=1`, { headers: supaH });
    if (r.ok) { sortCol = col; break; }
  }

  const rows = [];
  let offset = 0;
  while (true) {
    const url = `${SUPA_URL}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${offset}&order=${sortCol}.asc`;
    const r = await fetch(url, { headers: supaH });
    if (r.status === 404) return null;
    if (!r.ok) { const t = await r.text(); throw new Error(`${r.status} ${t.slice(0, 150)}`); }
    const page = await r.json();
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
    process.stdout.write(`  fetched ${rows.length}...\r`);
  }
  return rows;
}

// ── Insert via psql stdin (dollar-quoting avoids single-quote escaping) ────────
function psqlUpsert(table, rows) {
  if (!rows.length) return 0;
  const filtered = rows.map(r => filterRow(table, r));
  const cols = LOCAL_COLS[table];
  if (!cols || !cols.length) { console.warn(`  [WARN] No columns known for ${table}`); return 0; }

  const colList = cols.map(c => `"${c}"`).join(", ");
  const jsonData = JSON.stringify(filtered);

  // Dollar-quoting ($migdata$...$migdata$) safely embeds JSON with single quotes
  const sql = [
    "SET session_replication_role = replica;",
    `INSERT INTO public."${table}" (${colList})`,
    `SELECT ${colList} FROM json_populate_recordset(null::public."${table}", $migdata$${jsonData}$migdata$::json)`,
    "ON CONFLICT DO NOTHING;",
    "SET session_replication_role = origin;",
  ].join("\n");

  execSync(`sudo -u postgres psql -d ${LOCAL_DB}`, {
    input: sql,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return filtered.length;
}

// ── TRUNCATE all tables (leaf → parent) ───────────────────────────────────────
console.log("Truncating all tables (cascade)...");
const TRUNCATE_ORDER = [
  "line_conversation_messages", "outbound_messages", "payment_notifications",
  "persona_ab_assignments", "persona_ab_funnel_daily", "persona_ab_stats", "persona_ab_weights",
  "report_publications", "scan_public_reports", "global_object_baselines",
  "scan_results_v2", "scan_results", "scan_result_cache",
  "scan_jobs", "scan_uploads", "scan_requests",
  "payment_slips", "payments", "conversation_state", "user_entitlements",
  "app_users", "users",
  "energy_copy_templates", "object_family_category_map", "energy_categories",
  "scan_image_phashes",
];
for (const t of TRUNCATE_ORDER) {
  try {
    execSync(`sudo -u postgres psql -d ${LOCAL_DB} -c "TRUNCATE ${t} CASCADE;"`, { encoding: "utf8" });
    process.stdout.write(`  truncated ${t}\n`);
  } catch (e) {
    process.stdout.write(`  skip ${t} (not found)\n`);
  }
}

// ── Import in FK-safe order (parent → child) ──────────────────────────────────
const IMPORT_ORDER = [
  "users", "app_users", "user_entitlements", "conversation_state",
  "payments", "payment_slips",
  "scan_requests", "scan_uploads", "scan_jobs", "scan_result_cache",
  "scan_results", "scan_results_v2", "global_object_baselines",
  "scan_public_reports", "report_publications", "outbound_messages",
  "payment_notifications", "line_conversation_messages",
  "persona_ab_assignments", "persona_ab_funnel_daily", "persona_ab_stats", "persona_ab_weights",
  "energy_categories", "energy_copy_templates",
];

const results = [];
for (const table of IMPORT_ORDER) {
  process.stdout.write(`\n[${table}] fetching from Supabase...`);
  let rows;
  try {
    rows = await fetchAll(table);
  } catch (e) {
    console.error(`\n  [ERR] fetch: ${e.message}`);
    results.push({ table, s: "err", detail: e.message.slice(0, 120) });
    continue;
  }
  if (rows === null) {
    console.log(`\n  [SKIP] not in Supabase (404)`);
    results.push({ table, s: "skip_404" });
    continue;
  }
  if (rows.length === 0) {
    console.log(`\n  [SKIP] 0 rows`);
    results.push({ table, s: "skip_empty" });
    continue;
  }
  console.log(`\n  ${rows.length} rows → inserting via psql...`);
  try {
    const n = psqlUpsert(table, rows);
    console.log(`  [OK] ${n} rows`);
    results.push({ table, s: "ok", n });
  } catch (e) {
    console.error(`  [ERR] psql: ${e.message.slice(0, 250)}`);
    results.push({ table, s: "err", detail: e.message.slice(0, 120) });
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n\n========== MIGRATION SUMMARY ==========");
for (const r of results) {
  const icon = r.s === "ok" ? "OK" : r.s.startsWith("skip") ? "--" : "ERR";
  const detail = r.n != null ? `${r.n} rows` : r.s + (r.detail ? ": " + r.detail.slice(0, 80) : "");
  console.log(`[${icon}] ${r.table.padEnd(32)} ${detail}`);
}
console.log("========================================\n");
