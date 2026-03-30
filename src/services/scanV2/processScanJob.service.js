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
import { parseScanResultForHistory } from "../history/history.parser.js";
import { createScanRequest, updateScanRequestStatus } from "../../stores/scanRequests.db.js";
import {
  createScanResult,
  deleteScanResultForAppUser,
} from "../../stores/scanResults.db.js";
import { buildReportPayloadFromScan } from "../reports/reportPayload.builder.js";
import { buildPublicReportUrl } from "../reports/reportLink.service.js";
import { generatePublicToken } from "../../utils/reports/reportToken.util.js";
import { insertScanPublicReport } from "../../stores/scanPublicReports.db.js";
import { uploadScanObjectImageForReport } from "../storage/scanObjectImage.storage.js";
import {
  REPORT_ROLLOUT_SCHEMA_VERSION,
  getRolloutExecutionContext,
  isSummaryFirstFlexSelectedForUser,
  safeLineUserIdPrefix,
  safeTokenPrefix,
} from "../../utils/reports/reportRolloutTelemetry.util.js";

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
  const scanFromCache = Boolean(scanOut?.fromCache);
  console.log(
    JSON.stringify({
      event: "SCAN_JOB_AI_COMPLETED",
      jobIdPrefix: String(jobId).slice(0, 8),
      resultLength: resultText.length,
      fromCache: scanFromCache,
    }),
  );

  let parsed;
  try {
    parsed = parseScanResultForHistory(resultText) || {
      energyScore: null,
      mainEnergy: null,
      compatibility: null,
    };
  } catch {
    parsed = {
      energyScore: null,
      mainEnergy: null,
      compatibility: null,
    };
  }

  /** @type {string | null} */
  let scanRequestId = null;
  try {
    scanRequestId = await createScanRequest({
      appUserId,
      flowVersion: null,
      scanJobId: String(jobId),
      birthdateUsed: birthdate,
      usedSavedBirthdate: true,
      requestSource: "scan_v2_worker",
    });
  } catch (reqErr) {
    console.error(
      JSON.stringify({
        event: "SCAN_JOB_FAILED",
        phase: "createScanRequest",
        jobIdPrefix: String(jobId).slice(0, 8),
        message: reqErr?.message,
      }),
    );
    await failJob(jobId, "scan_request_failed", String(reqErr?.message || reqErr));
    return;
  }

  /** @type {string | null} */
  let legacyScanResultId = null;
  try {
    legacyScanResultId = await createScanResult({
      scanRequestId,
      appUserId,
      resultText,
      resultSummary: null,
      energyScore: parsed.energyScore,
      mainEnergy: parsed.mainEnergy,
      compatibility: parsed.compatibility,
      modelName: scanFromCache ? "persistent_cache" : "gpt-4.1-mini",
      promptVersion: scanFromCache ? "cache_v1" : "v1",
      responseTimeMs: 0,
      fromCache: scanFromCache,
      qualityAnalytics: scanOut?.qualityAnalytics ?? null,
    });
  } catch (crErr) {
    await updateScanRequestStatus(scanRequestId, "failed");
    console.error(
      JSON.stringify({
        event: "SCAN_JOB_FAILED",
        phase: "createScanResult",
        jobIdPrefix: String(jobId).slice(0, 8),
        message: crErr?.message,
      }),
    );
    await failJob(jobId, "scan_result_legacy_failed", String(crErr?.message || crErr));
    return;
  }

  let reportUrl = null;
  /** @type {Record<string, unknown> | null} */
  let reportPayloadForReply = null;
  let publicToken = /** @type {string | null} */ (null);

  try {
    const token = generatePublicToken();
    let objectImageUrl = "";
    try {
      const uploaded = await uploadScanObjectImageForReport({
        buffer: imageBuffer,
        publicToken: token,
        lineUserId,
      });
      objectImageUrl = uploaded ? String(uploaded).trim() : "";
    } catch (imgErr) {
      console.error(
        JSON.stringify({
          event: "SCAN_OBJECT_IMAGE",
          outcome: "upload_exception_ignored",
          jobIdPrefix: String(jobId).slice(0, 8),
          message: imgErr?.message,
        }),
      );
    }

    const reportPayload = buildReportPayloadFromScan({
      resultText,
      scanResultId: legacyScanResultId,
      scanRequestId,
      lineUserId,
      birthdateUsed: birthdate,
      publicToken: token,
      modelLabel: scanFromCache ? "persistent_cache" : "gpt-4.1-mini",
      objectImageUrl,
    });

    await insertScanPublicReport({
      scanResultId: legacyScanResultId,
      publicToken: token,
      reportPayload,
      reportVersion: reportPayload.reportVersion,
    });
    reportPayloadForReply = reportPayload;
    publicToken = token;
    reportUrl = buildPublicReportUrl(token);

    console.log(
      JSON.stringify({
        event: "SCAN_V2_REPORT_PUBLIC_OK",
        schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
        ...getRolloutExecutionContext(),
        lineUserIdPrefix: safeLineUserIdPrefix(lineUserId),
        scanResultIdPrefix: String(legacyScanResultId || "").slice(0, 8),
        tokenPrefix: String(token || "").slice(0, 12),
        publicTokenPrefix8: safeTokenPrefix(token, 8),
        jobIdPrefix: String(jobId).slice(0, 8),
        hasReportLink: Boolean(String(reportUrl || "").trim()),
      }),
    );
  } catch (reportErr) {
    console.error(
      JSON.stringify({
        event: "SCAN_V2_REPORT_PUBLIC_FAIL",
        schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
        outcome: "persist_ignored",
        ...getRolloutExecutionContext(),
        lineUserIdPrefix: safeLineUserIdPrefix(lineUserId),
        jobIdPrefix: String(jobId).slice(0, 8),
        message: reportErr?.message,
        code: reportErr?.code,
      }),
    );
  }

  const summaryFirstSelected = isSummaryFirstFlexSelectedForUser(
    lineUserId,
    env.FLEX_SCAN_SUMMARY_FIRST,
    env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT,
  );

  let flex = null;
  try {
    const built = buildScanResultFlexWithFallback({
      summaryFirstEnabled: summaryFirstSelected,
      resultText,
      birthdate,
      reportUrl,
      reportPayload: reportPayloadForReply,
      appendReportBubble: env.FLEX_SUMMARY_APPEND_REPORT_BUBBLE,
    });
    flex = built.flex;
  } catch (e) {
    console.error("[SCAN_V2] flex build failed", e?.message);
  }

  /** @type {string | null} */
  let scanResultV2Id = null;
  try {
    const insertRes = await insertScanResultV2({
      scan_job_id: jobId,
      line_user_id: lineUserId,
      app_user_id: appUserId,
      raw_text: resultText,
      formatted_text: resultText,
      flex_payload_json: flex,
      report_payload_json: reportPayloadForReply,
      report_url: reportUrl,
      html_public_token: publicToken,
      quality_tier: null,
      validation_reason: null,
      from_cache: scanFromCache,
      model_name: scanFromCache ? "persistent_cache" : "gpt-4.1-mini",
    });
    scanResultV2Id = insertRes?.id ?? null;
  } catch (v2Err) {
    if (legacyScanResultId) {
      await deleteScanResultForAppUser(legacyScanResultId, appUserId);
    }
    await updateScanRequestStatus(scanRequestId, "failed");
    console.error(
      JSON.stringify({
        event: "SCAN_JOB_FAILED",
        phase: "insertScanResultV2",
        jobIdPrefix: String(jobId).slice(0, 8),
        message: v2Err?.message,
      }),
    );
    await failJob(jobId, "scan_results_v2_insert_failed", String(v2Err?.message || v2Err));
    return;
  }

  if (!scanResultV2Id) {
    await updateScanRequestStatus(scanRequestId, "failed");
    await failJob(jobId, "result_insert_failed", "scan_results_v2 insert empty");
    return;
  }

  await updateScanJob(jobId, {
    result_id: scanResultV2Id,
    status: "delivery_queued",
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await updateScanRequestStatus(scanRequestId, "completed");

  console.log(
    JSON.stringify({
      event: "SCAN_JOB_RESULT_STORED",
      jobIdPrefix: String(jobId).slice(0, 8),
      resultIdPrefix: String(scanResultV2Id).slice(0, 8),
      hasReportLink: Boolean(String(reportUrl || "").trim()),
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
      reportUrl,
      reportPayload: reportPayloadForReply,
      accessSource: job.access_source,
      appUserId,
      scanResultV2Id,
      legacyScanResultId,
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
