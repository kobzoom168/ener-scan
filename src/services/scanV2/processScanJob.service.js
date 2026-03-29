import {
  toBase64,
  getUnsupportedObjectReplyCandidates,
} from "../../utils/webhookText.util.js";
import { checkSingleObject } from "../objectCheck.service.js";
import { runDeepScan } from "../scan.service.js";
import { buildScanResultFlexWithFallback } from "../flex/scanFlexReply.builder.js";
import { env } from "../../config/env.js";
import { getScanUploadById } from "../../stores/scanV2/scanUploads.db.js";
import {
  getScanJobById,
  updateScanJob,
} from "../../stores/scanV2/scanJobs.db.js";
import { insertScanResultV2 } from "../../stores/scanV2/scanResultsV2.db.js";
import { insertOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import {
  OUTBOUND_PRIORITY,
} from "../../stores/scanV2/outboundPriority.js";
import { readScanImageFromStorage } from "../../storage/scanUploadStorage.js";

/**
 * @param {string} workerId
 * @param {object} jobRow from claim_next_scan_job
 * @returns {Promise<void>}
 */
export async function processScanJob(workerId, jobRow) {
  const jobId = jobRow.id;
  const lineUserId = jobRow.line_user_id;
  const appUserId = jobRow.app_user_id;

  console.log(
    JSON.stringify({
      event: "SCAN_JOB_CLAIMED",
      jobIdPrefix: String(jobId).slice(0, 8),
      workerId: String(workerId).slice(0, 32),
      lineUserIdPrefix: String(lineUserId).slice(0, 8),
    }),
  );

  const job = await getScanJobById(jobId);
  if (!job || job.status !== "processing") return;

  const upload = await getScanUploadById(job.upload_id);
  if (!upload) {
    await failJob(jobId, "upload_missing", "scan_upload not found");
    return;
  }

  let imageBuffer;
  try {
    imageBuffer = await readScanImageFromStorage(
      upload.storage_bucket,
      upload.storage_path,
    );
  } catch (e) {
    await failJob(jobId, "storage_read_failed", String(e?.message || e));
    return;
  }

  const imageBase64 = toBase64(imageBuffer);
  const objectCheck = await checkSingleObject(imageBase64);
  console.log(
    JSON.stringify({
      event: "SCAN_JOB_OBJECT_VALIDATED",
      jobIdPrefix: String(jobId).slice(0, 8),
      objectCheck,
    }),
  );

  if (objectCheck !== "single_supported") {
    const c = getUnsupportedObjectReplyCandidates();
    await failJob(jobId, "object_validation_failed", String(objectCheck));
    await insertOutboundMessage({
      line_user_id: lineUserId,
      kind: "scan_result",
      priority: OUTBOUND_PRIORITY.scan_result,
      related_job_id: jobId,
      payload_json: {
        error: true,
        text: c[0] || "ขออภัยครับ ไม่สามารถอ่านภาพนี้ได้",
        accessSource: job.access_source,
        appUserId,
      },
      status: "queued",
    });
    return;
  }

  const birthdate = String(job.birthdate_snapshot || "").trim();
  if (!birthdate) {
    await failJob(jobId, "birthdate_missing", "no birthdate on job");
    return;
  }

  let scanOut;
  try {
    scanOut = await runDeepScan({
      imageBuffer,
      birthdate,
      userId: lineUserId,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "SCAN_JOB_FAILED",
        phase: "runDeepScan",
        jobIdPrefix: String(jobId).slice(0, 8),
        message: err?.message,
      }),
    );
    await failJob(jobId, "deep_scan_failed", String(err?.message || err));
    return;
  }

  const resultText = String(scanOut?.resultText || "").trim();
  console.log(
    JSON.stringify({
      event: "SCAN_JOB_AI_COMPLETED",
      jobIdPrefix: String(jobId).slice(0, 8),
      resultLength: resultText.length,
      fromCache: Boolean(scanOut?.fromCache),
    }),
  );

  let flex = null;
  try {
    const built = buildScanResultFlexWithFallback({
      summaryFirstEnabled: false,
      resultText,
      birthdate,
      reportUrl: null,
      reportPayload: null,
      appendReportBubble: env.FLEX_SUMMARY_APPEND_REPORT_BUBBLE,
    });
    flex = built.flex;
  } catch (e) {
    console.error("[SCAN_V2] flex build failed", e?.message);
  }

  const insertRes = await insertScanResultV2({
    scan_job_id: jobId,
    line_user_id: lineUserId,
    app_user_id: appUserId,
    raw_text: resultText,
    formatted_text: resultText,
    flex_payload_json: flex,
    report_payload_json: null,
    report_url: null,
    html_public_token: null,
    quality_tier: null,
    validation_reason: null,
    from_cache: Boolean(scanOut?.fromCache),
    model_name: null,
  });

  if (!insertRes?.id) {
    await failJob(jobId, "result_insert_failed", "scan_results_v2 insert");
    return;
  }

  await updateScanJob(jobId, {
    result_id: insertRes.id,
    status: "delivery_queued",
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log(
    JSON.stringify({
      event: "SCAN_JOB_RESULT_STORED",
      jobIdPrefix: String(jobId).slice(0, 8),
      resultIdPrefix: String(insertRes.id).slice(0, 8),
    }),
  );

  await insertOutboundMessage({
    line_user_id: lineUserId,
    kind: "scan_result",
    priority: OUTBOUND_PRIORITY.scan_result,
    related_job_id: jobId,
    payload_json: {
      flex,
      text: resultText,
      accessSource: job.access_source,
      appUserId,
      scanResultV2Id: insertRes.id,
    },
    status: "queued",
  });

  console.log(
    JSON.stringify({
      event: "SCAN_JOB_DELIVERY_ENQUEUED",
      jobIdPrefix: String(jobId).slice(0, 8),
    }),
  );
}

/**
 * @param {string} jobId
 * @param {string} code
 * @param {string} message
 */
async function failJob(jobId, code, message) {
  await updateScanJob(jobId, {
    status: "failed",
    error_code: code,
    error_message: String(message).slice(0, 2000),
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  console.error(
    JSON.stringify({
      event: "SCAN_JOB_FAILED",
      jobIdPrefix: String(jobId).slice(0, 8),
      error_code: code,
      error_message: String(message).slice(0, 500),
    }),
  );
}
