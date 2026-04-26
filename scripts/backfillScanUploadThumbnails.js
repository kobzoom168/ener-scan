/**
 * Backfill `scan_uploads.thumbnail_path` for rows that still have the LINE original in storage.
 *
 * Usage:
 *   node scripts/backfillScanUploadThumbnails.js
 *   node scripts/backfillScanUploadThumbnails.js --limit=20
 *   node scripts/backfillScanUploadThumbnails.js --limit=20 --dry-run=true
 *
 * Env: same Supabase + SCAN_V2_UPLOAD_BUCKET as the app (see src/config/env.js).
 */
import {
  assertDangerousScriptEnvGuard,
  env,
  envRuntimeMeta,
} from "../src/config/env.js";
import { supabase } from "../src/config/supabase.js";
import { ensureScanUploadThumbnail } from "../src/services/scanV2/scanUploadThumbnail.service.js";
import { readScanImageFromStorage } from "../src/storage/scanUploadStorage.js";

/**
 * @param {string[]} argv
 * @returns {{ limit: number, dryRun: boolean }}
 */
function parseCli(argv) {
  let limit = 20;
  let dryRun = false;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(String(arg.split("=")[1] || "").trim(), 10);
      limit = Number.isFinite(n) ? Math.min(5000, Math.max(1, n)) : 20;
    } else if (arg === "--dry-run" || arg === "--dry-run=true") {
      dryRun = true;
    } else if (arg === "--dry-run=false") {
      dryRun = false;
    }
  }
  return { limit, dryRun };
}

async function countMissingThumb() {
  const { count, error } = await supabase
    .from("scan_uploads")
    .select("id", { count: "exact", head: true })
    .is("thumbnail_path", null)
    .is("original_deleted_at", null)
    .not("storage_path", "is", null)
    .neq("storage_path", "");
  if (error) throw error;
  return typeof count === "number" ? count : 0;
}

function maskHost(host) {
  const s = String(host || "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s.length <= 6) return "***";
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

function getSupabaseHostMasked() {
  try {
    const u = new URL(String(env.SUPABASE_URL || ""));
    return maskHost(u.host || "");
  } catch {
    return maskHost(String(env.SUPABASE_URL || ""));
  }
}

async function main() {
  assertDangerousScriptEnvGuard({ scriptName: "backfillScanUploadThumbnails" });
  const { limit, dryRun } = parseCli(process.argv);

  console.log(
    JSON.stringify({
      event: "BACKFILL_SCAN_THUMBNAILS_START",
      appEnv: envRuntimeMeta.appEnv,
      runningEnvSource: envRuntimeMeta.runningEnvSource,
      envFileUsed: envRuntimeMeta.envFileUsed,
      supabaseHostMasked: getSupabaseHostMasked(),
      limit,
      dryRun,
    }),
  );

  const missingBefore = await countMissingThumb();

  const { data: rows, error: qErr } = await supabase
    .from("scan_uploads")
    .select("id, line_user_id, storage_bucket, storage_path, thumbnail_path")
    .is("thumbnail_path", null)
    .is("original_deleted_at", null)
    .not("storage_path", "is", null)
    .neq("storage_path", "")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (qErr) throw qErr;

  const candidates = Array.isArray(rows) ? rows : [];
  const totalCandidates = candidates.length;

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    const uploadId = String(row?.id || "").trim();
    const lineUserId = String(row?.line_user_id || "").trim();
    const storagePath = String(row?.storage_path || "").trim();
    const bucket = String(row?.storage_bucket || env.SCAN_V2_UPLOAD_BUCKET || "").trim();

    if (!uploadId || !lineUserId || !storagePath) {
      skipped += 1;
      console.log(
        JSON.stringify({
          event: "BACKFILL_THUMB_SKIP_INVALID_ROW",
          uploadId: uploadId || null,
          reason: "missing_id_line_user_or_storage_path",
        }),
      );
      continue;
    }

    if (dryRun) {
      skipped += 1;
      console.log(
        JSON.stringify({
          event: "BACKFILL_THUMB_DRY_RUN",
          uploadId,
          storage_path: storagePath.slice(0, 120),
        }),
      );
      continue;
    }

    let imageBuffer;
    try {
      imageBuffer = await readScanImageFromStorage(bucket, storagePath);
    } catch (e) {
      failed += 1;
      console.error(
        JSON.stringify({
          event: "BACKFILL_THUMB_DOWNLOAD_FAIL",
          uploadId,
          storage_path: storagePath.slice(0, 200),
          message: String(e?.message || e).slice(0, 500),
        }),
      );
      continue;
    }

    const upload = {
      id: uploadId,
      thumbnail_path: row.thumbnail_path,
      storage_path: storagePath,
    };

    const path = await ensureScanUploadThumbnail({
      upload,
      lineUserId,
      imageBuffer,
    });

    if (path) {
      success += 1;
      console.log(
        JSON.stringify({
          event: "BACKFILL_THUMB_OK",
          uploadId,
          thumbnail_path: path.slice(0, 120),
        }),
      );
    } else {
      failed += 1;
      console.warn(
        JSON.stringify({
          event: "BACKFILL_THUMB_GEN_OR_PERSIST_FAIL",
          uploadId,
          message: "ensureScanUploadThumbnail returned null",
        }),
      );
    }
  }

  const missingAfter = await countMissingThumb();

  console.log("");
  console.log("=== backfillScanUploadThumbnails summary ===");
  console.log(`total candidates (this batch): ${totalCandidates}`);
  console.log(`success:                   ${success}`);
  console.log(`skipped:                   ${skipped}`);
  console.log(`failed:                    ${failed}`);
  console.log(`remaining missing_thumb:   ${missingAfter}`);
  console.log(`(missing_thumb before run: ${missingBefore})`);
  console.log("============================================");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
