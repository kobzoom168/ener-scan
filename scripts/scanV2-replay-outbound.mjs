/**
 * Replay a dead outbound_messages row (manual recovery).
 * Resets status to queued + clears retry fields. Use only after fixing root cause.
 *
 * Usage: node scripts/scanV2-replay-outbound.mjs <outbound_message_uuid>
 */
import "../src/config/env.js";
import { supabase } from "../src/config/supabase.js";

const id = String(process.argv[2] || "").trim();
if (!id) {
  console.error(
    "Usage: node scripts/scanV2-replay-outbound.mjs <outbound_message_uuid>",
  );
  process.exit(1);
}

async function main() {
  const { data: row, error: fetchErr } = await supabase
    .from("outbound_messages")
    .select("id,status,kind")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!row) {
    console.error("Row not found:", id);
    process.exit(1);
  }

  if (row.status !== "dead" && row.status !== "failed") {
    console.error(
      `Refusing: status is ${row.status} (only dead or failed allowed)`,
    );
    process.exit(1);
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("outbound_messages")
    .update({
      status: "queued",
      attempt_count: 0,
      next_retry_at: null,
      last_error_code: "manual_replay",
      last_error_message: `replayed_at_${now}`,
      updated_at: now,
    })
    .eq("id", id);

  if (updErr) throw updErr;

  console.log(
    JSON.stringify({
      ok: true,
      id,
      kind: row.kind,
      previousStatus: row.status,
    }),
  );
}

void main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
