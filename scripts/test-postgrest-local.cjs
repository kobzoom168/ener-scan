const { PostgrestClient } = require("@supabase/postgrest-js");

const key = process.env.LOCAL_POSTGREST_ANON_KEY;
if (!key) {
  console.error("LOCAL_POSTGREST_ANON_KEY missing");
  process.exit(1);
}

const c = new PostgrestClient("http://postgrest:3001", {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});

async function main() {
  const app = await c.from("app_users").select("id").limit(1);
  console.log("app_users:", app.error || `OK, rows: ${app.data?.length ?? 0}`);

  const pay = await c.from("payments").select("id").limit(1);
  console.log("payments:", pay.error || `OK, rows: ${pay.data?.length ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
