/**
 * Backfill scan_image_phashes for older completed scans (bytes in storage, phash missing in DB).
 *
 * Usage:
 *   node scripts/backfillScanPhashes.js
 *
 * Env:
 *   BACKFILL_LIMIT — max jobs to scan (default 500)
 *   Same Supabase/storage env as the app (load via config/env).
 */
import "../src/config/env.js";
import { supabase } from "../src/config/supabase.js";
import { computeImageDHash } from "../src/services/imageDedup/imagePhash.util.js";
import { insertScanPhash } from "../src/stores/scanV2/imageDedupCache.db.js";
import { readScanImageFromStorage } from "../src/storage/scanUploadStorage.js";

const limit = Math.max(
  1,
  Math.min(
    5000,
    Number.parseInt(String(process.env.BACKFILL_LIMIT || "500"), 10) || 500,
  ),
);

let inserted = 0;
let skipped = 0;
let errors = 0;

async function main() {
  const { data: jobs, error: jobErr } = await supabase
    .from("scan_jobs")
    .select("id, upload_id, line_user_id, result_id, status")
    .in("status", ["completed", "delivery_queued", "delivered"])
    .not("result_id", "is", null)
    .not("upload_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobErr) throw jobErr;
  if (!jobs?.length) {
    console.log(JSON.stringify({ event: "BACKFILL_SCAN_PHASHES_EMPTY", limit }));
    return;
  }

  for (const job of jobs) {
    const scanResultId = job.result_id;
    const uploadId = job.upload_id;
    const lineUserId = job.line_user_id;

    try {
      const { data: existing, error: exErr } = await supabase
        .from("scan_image_phashes")
        .select("id")
        .eq("scan_result_id", scanResultId)
        .maybeSingle();

      if (exErr) throw exErr;
      if (existing?.id) {
        skipped += 1;
        continue;
      }

      const { data: upload, error: upErr } = await supabase
        .from("scan_uploads")
        .select("id, storage_bucket, storage_path, line_user_id")
        .eq("id", uploadId)
        .maybeSingle();

      if (upErr) throw upErr;
      if (!upload?.storage_bucket || !upload?.storage_path) {
        skipped += 1;
        console.warn(
          JSON.stringify({
            event: "BACKFILL_SKIP_NO_STORAGE",
            jobId: job.id,
            uploadId,
          }),
        );
        continue;
      }

      const buf = await readScanImageFromStorage(
        upload.storage_bucket,
        upload.storage_path,
      );
      const imageDHash = await computeImageDHash(buf);

      const { data: resRow, error: rErr } = await supabase
        .from("scan_results_v2")
        .select("report_url")
        .eq("id", scanResultId)
        .maybeSingle();

      if (rErr) throw rErr;

      await insertScanPhash({
        image_phash: imageDHash,
        scan_result_id: scanResultId,
        report_url: resRow?.report_url ?? null,
        line_user_id: String(lineUserId || upload.line_user_id || ""),
      });
      inserted += 1;
      console.log(
        JSON.stringify({
          event: "BACKFILL_SCAN_PHASH_INSERTED",
          scanResultIdPrefix: String(scanResultId).slice(0, 8),
          jobIdPrefix: String(job.id).slice(0, 8),
        }),
      );
    } catch (e) {
      errors += 1;
      console.error(
        JSON.stringify({
          event: "BACKFILL_SCAN_PHASH_ERROR",
          jobId: job.id,
          message: String(e?.message || e).slice(0, 500),
        }),
      );
    }
  }

  console.log(
    JSON.stringify({
      event: "BACKFILL_SCAN_PHASHES_DONE",
      limit,
      jobsSeen: jobs.length,
      inserted,
      skipped,
      errors,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
