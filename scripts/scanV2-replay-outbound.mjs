/**
 * Replay an outbound_messages row (manual recovery) — **only** `dead` or `failed`.
 * Uses a conditional update so `sent` / `queued` / in-flight rows cannot be overwritten.
 *
 * Usage: node scripts/scanV2-replay-outbound.mjs <outbound_message_uuid>
 */
import "../src/config/env.js";
import { supabase } from "../src/config/supabase.js";

const TERMINAL_OK = new Set(["sent"]);
const REPLAYABLE = new Set(["dead", "failed"]);

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

  if (TERMINAL_OK.has(row.status)) {
    console.error(
      JSON.stringify({
        ok: false,
        refused: "already_sent",
        id,
        status: row.status,
        hint: "Will not replay a message that already delivered successfully.",
      }),
    );
    process.exit(1);
  }

  if (!REPLAYABLE.has(row.status)) {
    console.error(
      JSON.stringify({
        ok: false,
        refused: "status_not_replayable",
        id,
        status: row.status,
        allowedOnly: ["dead", "failed"],
        hint: "Refusing queued/sending/retry_wait to avoid duplicate LINE sends.",
      }),
    );
    process.exit(1);
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("outbound_messages")
    .update({
      status: "queued",
      attempt_count: 0,
      next_retry_at: null,
      last_error_code: "manual_replay",
      last_error_message: `replayed_at_${now}`,
      updated_at: now,
    })
    .eq("id", id)
    .in("status", ["dead", "failed"])
    .select("id,status");

  if (updErr) throw updErr;

  if (!updated?.length) {
    const { data: again } = await supabase
      .from("outbound_messages")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    console.error(
      JSON.stringify({
        ok: false,
        refused: "concurrent_status_change",
        id,
        currentStatus: again?.status ?? null,
        hint: "Row changed between read and update; not replayed.",
      }),
    );
    process.exit(1);
  }

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
