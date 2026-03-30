import { ensureUserByLineUserId } from "../../stores/users.db.js";
import { uploadScanImageToStorage } from "../../storage/scanUploadStorage.js";
import {
  getScanUploadByLineMessageId,
  insertScanUpload,
} from "../../stores/scanV2/scanUploads.db.js";
import { insertScanJob } from "../../stores/scanV2/scanJobs.db.js";
import { insertOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import {
  OUTBOUND_PRIORITY,
} from "../../stores/scanV2/outboundPriority.js";
import { mapAccessDecisionToSource } from "./mapAccessSource.js";
import { tryDedupeOnce } from "../../redis/scanV2Redis.js";

const PRE_SCAN_ACK_TEXT =
  "ได้รับรูปแล้วนะ\nรอแป๊บนึง เดี๋ยวอาจารย์กำลังอ่านให้";

/**
 * Webhook-side ingestion: storage + scan_uploads + scan_jobs + pre_scan_ack outbound.
 * @param {object} opts
 * @param {string} opts.userId LINE user id
 * @param {string} opts.lineMessageId
 * @param {Buffer} opts.imageBuffer
 * @param {string} opts.birthdateSnapshot
 * @param {object} opts.accessDecision result of checkScanAccess
 * @returns {Promise<{ ok: boolean, duplicate?: boolean, jobId?: string, uploadId?: string, error?: string }>}
 */
export async function ingestScanImageAsyncV2({
  userId,
  lineMessageId,
  imageBuffer,
  birthdateSnapshot,
  accessDecision,
}) {
  const lineUserId = String(userId || "").trim();
  const mid = String(lineMessageId || "").trim();
  if (!lineUserId || !mid || !imageBuffer?.length) {
    return { ok: false, error: "missing_fields" };
  }

  const accessSource = mapAccessDecisionToSource(accessDecision);
  if (!accessSource) {
    return { ok: false, error: "access_denied" };
  }

  const existing = await getScanUploadByLineMessageId(mid);
  if (existing?.id) {
    console.log(
      JSON.stringify({
        event: "SCAN_UPLOAD_DEDUPE",
        lineUserIdPrefix: lineUserId.slice(0, 8),
        lineMessageIdPrefix: mid.slice(0, 12),
      }),
    );
    return { ok: true, duplicate: true, uploadId: existing.id };
  }

  const dedupeFirst = await tryDedupeOnce(`ingest:line_msg:${mid}`, 90);
  if (!dedupeFirst) {
    const raced = await getScanUploadByLineMessageId(mid);
    if (raced?.id) {
      console.log(
        JSON.stringify({
          event: "SCAN_UPLOAD_DEDUPE_REDIS",
          lineUserIdPrefix: lineUserId.slice(0, 8),
          lineMessageIdPrefix: mid.slice(0, 12),
        }),
      );
      return { ok: true, duplicate: true, uploadId: raced.id };
    }
  }

  const appUser = await ensureUserByLineUserId(lineUserId);
  const appUserId = String(appUser.id);

  const stored = await uploadScanImageToStorage({
    lineUserId,
    lineMessageId: mid,
    buffer: imageBuffer,
    mimeType: "image/jpeg",
  });

  const uploadRow = await insertScanUpload({
    line_user_id: lineUserId,
    app_user_id: appUserId,
    line_message_id: mid,
    storage_bucket: stored.bucket,
    storage_path: stored.path,
    mime_type: stored.mimeType,
    size_bytes: stored.sizeBytes,
    sha256: stored.sha256,
  });

  if (!uploadRow?.id) {
    return { ok: false, error: "upload_insert_failed" };
  }

  console.log(
    JSON.stringify({
      event: "SCAN_UPLOAD_STORED",
      uploadIdPrefix: String(uploadRow.id).slice(0, 8),
      lineUserIdPrefix: lineUserId.slice(0, 8),
      sizeBytes: stored.sizeBytes,
    }),
  );

  const jobRow = await insertScanJob({
    line_user_id: lineUserId,
    app_user_id: appUserId,
    upload_id: uploadRow.id,
    birthdate_snapshot: String(birthdateSnapshot || "").trim() || null,
    access_source: accessSource,
    status: "queued",
    priority: 100,
  });

  if (!jobRow?.id) {
    return { ok: false, error: "job_insert_failed" };
  }

  console.log(
    JSON.stringify({
      event: "SCAN_JOB_QUEUED",
      jobIdPrefix: String(jobRow.id).slice(0, 8),
      lineUserIdPrefix: lineUserId.slice(0, 8),
      accessSource,
    }),
  );

  const ackRow = await insertOutboundMessage({
    line_user_id: lineUserId,
    kind: "pre_scan_ack",
    priority: OUTBOUND_PRIORITY.pre_scan_ack,
    related_job_id: jobRow.id,
    payload_json: { text: PRE_SCAN_ACK_TEXT },
    status: "queued",
  });

  console.log(
    JSON.stringify({
      event: "PRE_SCAN_ACK_ENQUEUED",
      outboundIdPrefix: ackRow?.id ? String(ackRow.id).slice(0, 8) : null,
      jobIdPrefix: String(jobRow.id).slice(0, 8),
    }),
  );

  return { ok: true, jobId: jobRow.id, uploadId: uploadRow.id };
}
