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
import {
  scanV2TraceTs,
  lineUserIdPrefix8,
  idPrefix8,
} from "../../utils/scanV2Trace.util.js";

const PRE_SCAN_ACK_TEXT =
  "รับภาพแล้วครับ\nกำลังตรวจวัตถุให้ครับ\nกำลังวิเคราะห์และสร้างรายงาน";

/**
 * Webhook-side ingestion: storage + scan_uploads + scan_jobs + pre_scan_ack outbound.
 * @param {object} opts
 * @param {string} opts.userId LINE user id
 * @param {string} opts.lineMessageId
 * @param {Buffer} opts.imageBuffer
 * @param {string} opts.birthdateSnapshot
 * @param {object} opts.accessDecision result of checkScanAccess
 * @param {number|null|undefined} [opts.flowVersion]
 * @returns {Promise<{ ok: boolean, duplicate?: boolean, jobId?: string|null, uploadId?: string|null, outboundId?: string|null, error?: string, errorMessage?: string|null }>}
 */
export async function ingestScanImageAsyncV2({
  userId,
  lineMessageId,
  imageBuffer,
  birthdateSnapshot,
  accessDecision,
  flowVersion = null,
}) {
  const lineUserId = String(userId || "").trim();
  const mid = String(lineMessageId || "").trim();
  const base = () => ({
    path: "web",
    lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
    messageId: mid || null,
    flowVersion: flowVersion ?? null,
    timestamp: scanV2TraceTs(),
  });

  if (!lineUserId || !mid || !imageBuffer?.length) {
    console.error(
      JSON.stringify({
        event: "SCAN_V2_INGEST_FAIL",
        ...base(),
        reason: "missing_fields",
        errorMessage: null,
      }),
    );
    return { ok: false, error: "missing_fields", errorMessage: null };
  }

  const accessSource = mapAccessDecisionToSource(accessDecision);
  if (!accessSource) {
    console.error(
      JSON.stringify({
        event: "SCAN_V2_INGEST_FAIL",
        ...base(),
        reason: "access_denied",
        errorMessage: null,
      }),
    );
    return { ok: false, error: "access_denied", errorMessage: null };
  }

  const existing = await getScanUploadByLineMessageId(mid);
  if (existing?.id) {
    console.log(
      JSON.stringify({
        event: "SCAN_UPLOAD_DEDUPE",
        ...base(),
        uploadIdPrefix: idPrefix8(existing.id),
      }),
    );
    return {
      ok: true,
      duplicate: true,
      uploadId: existing.id,
      jobId: null,
      outboundId: null,
    };
  }

  // Redis dedupe is keyed strictly by LINE message id (one inbound image event).
  // Do not use user-only or coarse keys — that would collapse unrelated events.
  const dedupeRedisKey = `scan_v2:ingest:line_message_id:${mid}`;
  const dedupeFirst = await tryDedupeOnce(dedupeRedisKey, 90);
  if (!dedupeFirst) {
    const raced = await getScanUploadByLineMessageId(mid);
    if (raced?.id) {
      console.log(
        JSON.stringify({
          event: "SCAN_UPLOAD_DEDUPE_REDIS",
          dedupeKeySuffix: "line_message_id",
          ...base(),
          uploadIdPrefix: idPrefix8(raced.id),
        }),
      );
      return {
        ok: true,
        duplicate: true,
        uploadId: raced.id,
        jobId: null,
        outboundId: null,
      };
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
    console.error(
      JSON.stringify({
        event: "SCAN_V2_INGEST_FAIL",
        ...base(),
        reason: "upload_insert_failed",
        errorMessage: null,
      }),
    );
    return { ok: false, error: "upload_insert_failed", errorMessage: null };
  }

  console.log(
    JSON.stringify({
      event: "SCAN_UPLOAD_STORED",
      ...base(),
      uploadIdPrefix: idPrefix8(uploadRow.id),
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
    console.error(
      JSON.stringify({
        event: "SCAN_V2_INGEST_FAIL",
        ...base(),
        reason: "job_insert_failed",
        errorMessage: null,
        uploadIdPrefix: idPrefix8(uploadRow.id),
      }),
    );
    return { ok: false, error: "job_insert_failed", errorMessage: null };
  }

  console.log(
    JSON.stringify({
      event: "SCAN_JOB_QUEUED",
      ...base(),
      uploadIdPrefix: idPrefix8(uploadRow.id),
      jobIdPrefix: idPrefix8(jobRow.id),
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
      ...base(),
      jobIdPrefix: idPrefix8(jobRow.id),
      outboundIdPrefix: ackRow?.id ? idPrefix8(ackRow.id) : null,
    }),
  );

  return {
    ok: true,
    jobId: jobRow.id,
    uploadId: uploadRow.id,
    outboundId: ackRow?.id ?? null,
  };
}
