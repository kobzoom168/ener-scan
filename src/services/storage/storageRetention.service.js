/**
 * Storage retention: free-tier scan originals + payment slip images.
 * Never deletes scan_results_v2 payloads or thumbnails (thumbnail_path).
 */
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_ENABLED } from "../../config/s3Storage.js";
import { supabase } from "../../config/supabaseStorage.js";
import { env } from "../../config/env.js";
import {
  listScanUploadsOriginalDeletionCandidates,
  markScanUploadOriginalDeleted,
} from "../../stores/scanV2/scanUploads.db.js";
import {
  listPaymentSlipsExpiredBefore,
  markPaymentSlipDeleted,
} from "../../stores/paymentSlips.db.js";
import { getPaymentById, clearPaymentSlipUrlAfterRetention } from "../../stores/payments.db.js";
import { parseSupabasePublicObjectUrl } from "../../utils/storage/supabasePublicStorageUrl.util.js";
import { isSupabaseStorageObjectAlreadyRemovedError } from "../../utils/storage/supabaseStorageRemove.util.js";

/**
 * Parse Supabase or R2 public object URL into bucket + object path.
 * @param {string|null|undefined} url
 * @returns {{ bucket: string, path: string } | null}
 */
function parseStorageObjectUrl(url) {
  const parsed = parseSupabasePublicObjectUrl(url);
  if (parsed) return parsed;

  const s = String(url || "").trim();
  if (!s) return null;

  const candidates = [
    { base: env.S3_SLIP_PUBLIC_BASE_URL, bucket: env.PAYMENT_SLIP_BUCKET },
    { base: env.S3_PUBLIC_BASE_URL, bucket: env.SCAN_V2_UPLOAD_BUCKET },
  ];
  for (const { base, bucket } of candidates) {
    const b = String(base || "").replace(/\/$/, "");
    if (!b || !bucket || !s.startsWith(`${b}/`)) continue;
    const path = decodeURIComponent(s.slice(b.length + 1).split("?")[0] || "");
    if (path) return { bucket, path };
  }
  return null;
}

/**
 * @param {string} bucket
 * @param {string[]} paths
 * @returns {Promise<{ ok: boolean, removed: number, error?: string, alreadyGone?: boolean }>}
 */
async function removeStorageObjects(bucket, paths) {
  const b = String(bucket || "").trim();
  const ps = (Array.isArray(paths) ? paths : [])
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  if (!b || !ps.length) return { ok: true, removed: 0 };

  if (S3_ENABLED) {
    let removed = 0;
    for (const key of ps) {
      try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: b, Key: key }));
        removed += 1;
      } catch (e) {
        const msg = String(e?.message || e);
        if (/not found|no such key|404/i.test(msg)) {
          console.log(
            JSON.stringify({
              event: "STORAGE_RETENTION_REMOVE_ALREADY_GONE",
              bucket: b,
              keyPrefix: key.slice(0, 80),
            }),
          );
          continue;
        }
        console.error(
          JSON.stringify({
            event: "STORAGE_RETENTION_REMOVE_FAILED",
            bucket: b,
            keyPrefix: key.slice(0, 80),
            message: msg,
          }),
        );
        return { ok: false, removed, error: msg };
      }
    }
    return { ok: true, removed };
  }

  const { error } = await supabase.storage.from(b).remove(ps);
  if (error) {
    if (isSupabaseStorageObjectAlreadyRemovedError(error)) {
      console.log(
        JSON.stringify({
          event: "STORAGE_RETENTION_REMOVE_ALREADY_GONE",
          bucket: b,
          count: ps.length,
        }),
      );
      return { ok: true, removed: 0, alreadyGone: true };
    }
    console.error(
      JSON.stringify({
        event: "STORAGE_RETENTION_REMOVE_FAILED",
        bucket: b,
        count: ps.length,
        message: error.message,
      }),
    );
    return { ok: false, removed: 0, error: error.message };
  }
  return { ok: true, removed: ps.length };
}

/**
 * @returns {Promise<{ originalsPurged: number, slipsPurged: number, errors: string[] }>}
 */
export async function runStorageRetentionSweepOnce() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const errors = [];
  let originalsPurged = 0;
  let slipsPurged = 0;

  const uploads = await listScanUploadsOriginalDeletionCandidates(nowIso, 80).catch(
    (e) => {
      errors.push(`list_uploads:${String(e?.message || e)}`);
      return [];
    },
  );

  for (const u of uploads) {
    const bucket = String(u.storage_bucket || env.SCAN_V2_UPLOAD_BUCKET || "").trim();
    const path = String(u.storage_path || "").trim();
    const id = String(u.id || "").trim();
    if (!bucket || !path || !id) continue;

    const rm = await removeStorageObjects(bucket, [path]);
    if (!rm.ok) {
      errors.push(`upload_${id.slice(0, 8)}:${rm.error || "remove_failed"}`);
      continue;
    }
    try {
      await markScanUploadOriginalDeleted(id);
      originalsPurged += 1;
    } catch (e) {
      errors.push(`mark_upload_${id.slice(0, 8)}:${String(e?.message || e)}`);
    }
  }

  const slipRows = await listPaymentSlipsExpiredBefore(nowIso, 80).catch((e) => {
    errors.push(`list_slips:${String(e?.message || e)}`);
    return [];
  });

  for (const row of slipRows) {
    const paymentId = String(row.payment_id || "").trim();
    if (!paymentId) continue;

    const pay = await getPaymentById(paymentId).catch(() => null);
    if (!pay) {
      try {
        await markPaymentSlipDeleted(paymentId);
        slipsPurged += 1;
      } catch (e) {
        errors.push(`slip_orphan_${paymentId.slice(0, 8)}:${String(e?.message || e)}`);
      }
      continue;
    }

    const slipUrl = typeof pay.slip_url === "string" ? pay.slip_url.trim() : "";
    let storageHandled = false;

    if (slipUrl) {
      const parsed = parseStorageObjectUrl(slipUrl);
      if (parsed?.bucket && parsed?.path) {
        const rm = await removeStorageObjects(parsed.bucket, [parsed.path]);
        if (!rm.ok) {
          errors.push(`slip_${paymentId.slice(0, 8)}:${rm.error || "remove_failed"}`);
          continue;
        }
        storageHandled = true;
      } else {
        const fallbackBucket = env.PAYMENT_SLIP_BUCKET;
        const lineUid = String(pay?.line_user_id || "").trim();
        const slipMid = String(pay?.slip_message_id || "").trim();
        if (lineUid && slipMid) {
          const objectPath = `${lineUid}/${paymentId}/${slipMid}.jpg`;
          const rm = await removeStorageObjects(fallbackBucket, [objectPath]);
          if (!rm.ok) {
            errors.push(`slip_path_${paymentId.slice(0, 8)}:${rm.error || "remove_failed"}`);
            continue;
          }
          storageHandled = true;
        }
      }
    } else if (pay) {
      const fallbackBucket = env.PAYMENT_SLIP_BUCKET;
      const lineUid = String(pay.line_user_id || "").trim();
      const slipMid = String(pay.slip_message_id || "").trim();
      if (lineUid && slipMid) {
        const objectPath = `${lineUid}/${paymentId}/${slipMid}.jpg`;
        const rm = await removeStorageObjects(fallbackBucket, [objectPath]);
        if (!rm.ok) {
          errors.push(`slip_path_${paymentId.slice(0, 8)}:${rm.error || "remove_failed"}`);
          continue;
        }
        storageHandled = true;
      }
    }

    if (!storageHandled && slipUrl) {
      errors.push(`slip_parse_${paymentId.slice(0, 8)}:no_url_or_path`);
      continue;
    }

    try {
      await markPaymentSlipDeleted(paymentId);
      await clearPaymentSlipUrlAfterRetention(paymentId);
      slipsPurged += 1;
    } catch (e) {
      errors.push(`slip_db_${paymentId.slice(0, 8)}:${String(e?.message || e)}`);
    }
  }

  console.log(
    JSON.stringify({
      event: "STORAGE_RETENTION_SWEEP",
      originalsPurged,
      slipsPurged,
      errorCount: errors.length,
      atIso: nowIso,
    }),
  );

  return { originalsPurged, slipsPurged, errors };
}
