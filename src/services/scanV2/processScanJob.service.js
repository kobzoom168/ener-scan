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
import { mapObjectCategoryToPipelineSignals } from "../../utils/reports/scanPipelineReportSignals.util.js";
import { buildPublicReportUrl } from "../reports/reportLink.service.js";
import { generatePublicToken } from "../../utils/reports/reportToken.util.js";
import { insertScanPublicReport } from "../../stores/scanPublicReports.db.js";
import { upsertReportPublicationForScanResult } from "../../stores/reportPublications.db.js";
import { uploadScanObjectImageForReport } from "../storage/scanObjectImage.storage.js";
import {
  REPORT_ROLLOUT_SCHEMA_VERSION,
  getRolloutExecutionContext,
  isSummaryFirstFlexSelectedForUser,
  safeLineUserIdPrefix,
  safeTokenPrefix,
} from "../../utils/reports/reportRolloutTelemetry.util.js";
import {
  scanV2TraceTs,
  lineUserIdPrefix8,
  idPrefix8,
  workerIdPrefix16,
} from "../../utils/scanV2Trace.util.js";
import { logScanPipelinePerf } from "../../utils/webhookTurnPerf.util.js";
import {
  extractLineSummaryFields,
  buildSummaryLinkLineText,
  buildSummaryLinkFallbackText,
} from "./lineFinalScanDelivery.builder.js";
import { logUnsupportedObjectRejected } from "../lineWebhook/unsupportedObjectReply.service.js";

/**
 * @param {string} workerId
 * @param {object} jobRow from claim_next_scan_job
 * @returns {Promise<void>}
 */
export async function processScanJob(workerId, jobRow) {
  const workerTurnStartMs = Date.now();
  if (
    !jobRow?.id ||
    (typeof jobRow.id === "string" && jobRow.id.trim().toLowerCase() === "null")
  ) {
    console.log(
      JSON.stringify({
        event: "SCAN_JOB_EMPTY_CLAIM",
        path: "worker-scan",
        workerIdPrefix: workerIdPrefix16(workerId),
        jobRowId: jobRow?.id ?? null,
        timestamp: scanV2TraceTs(),
      }),
    );
    return;
  }

  const jobId = jobRow.id;
  const lineUserId = jobRow.line_user_id;
  const appUserId = jobRow.app_user_id;

  console.log(
    JSON.stringify({
      event: "SCAN_JOB_CLAIMED",
      path: "worker-scan",
      workerIdPrefix: workerIdPrefix16(workerId),
      jobIdPrefix: idPrefix8(jobId),
      lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
      timestamp: scanV2TraceTs(),
    }),
  );

  const job = await getScanJobById(jobId);
  if (!job || job.status !== "processing") return;

  const upload = await getScanUploadById(job.upload_id);
  if (!upload) {
    await failJob(
      jobId,
      "upload_missing",
      "scan_upload not found",
      lineUserId,
      workerId,
    );
    return;
  }

  let imageBuffer;
  try {
    imageBuffer = await readScanImageFromStorage(
      upload.storage_bucket,
      upload.storage_path,
    );
  } catch (e) {
    await failJob(
      jobId,
      "storage_read_failed",
      String(e?.message || e),
      lineUserId,
      workerId,
    );
    return;
  }

  const imageBase64 = toBase64(imageBuffer);
  const objectCheck = await checkSingleObject(imageBase64);
  console.log(
    JSON.stringify({
      event: "SCAN_JOB_OBJECT_VALIDATED",
      path: "worker-scan",
      workerIdPrefix: workerIdPrefix16(workerId),
      jobIdPrefix: idPrefix8(jobId),
      lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
      objectCheckResult: objectCheck,
      timestamp: scanV2TraceTs(),
    }),
  );

  if (objectCheck !== "single_supported") {
    logUnsupportedObjectRejected({
      path: "worker_scan",
      userId: lineUserId,
      flowVersion: null,
      messageId: null,
      objectCheckResult: String(objectCheck),
    });
    const c = getUnsupportedObjectReplyCandidates();
    await failJob(
      jobId,
      "object_validation_failed",
      String(objectCheck),
      lineUserId,
      workerId,
    );
    await insertOutboundMessage({
      line_user_id: lineUserId,
      kind: "scan_result",
      priority: OUTBOUND_PRIORITY.scan_result,
      related_job_id: jobId,
      payload_json: {
        error: true,
        rejectReason: "object_validation_failed",
        objectCheckResult: String(objectCheck),
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
    await failJob(
      jobId,
      "birthdate_missing",
      "no birthdate on job",
      lineUserId,
      workerId,
    );
    return;
  }

  let scanOut;
  const aiStartedAt = Date.now();
  logScanPipelinePerf("SCAN_AI_STARTED", {
    path: "worker-scan",
    workerIdPrefix: workerIdPrefix16(workerId),
    jobIdPrefix: idPrefix8(jobId),
    lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
    messageId: upload.line_message_id ?? null,
    elapsedMs: Date.now() - workerTurnStartMs,
  });
  try {
    scanOut = await runDeepScan({
      imageBuffer,
      birthdate,
      userId: lineUserId,
    });
  } catch (err) {
    await failJob(
      jobId,
      "deep_scan_failed",
      String(err?.message || err),
      lineUserId,
      workerId,
    );
    return;
  }

  const resultText = String(scanOut?.resultText || "").trim();
  const scanFromCache = Boolean(scanOut?.fromCache);
  console.log(
    JSON.stringify({
      event: "SCAN_JOB_AI_COMPLETED",
      path: "worker-scan",
      workerIdPrefix: workerIdPrefix16(workerId),
      jobIdPrefix: idPrefix8(jobId),
      lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
      elapsedMs: Date.now() - aiStartedAt,
      resultLength: resultText.length,
      fromCache: scanFromCache,
      timestamp: scanV2TraceTs(),
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
    await failJob(
      jobId,
      "scan_request_failed",
      String(reqErr?.message || reqErr),
      lineUserId,
      workerId,
    );
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
    await failJob(
      jobId,
      "scan_result_legacy_failed",
      String(crErr?.message || crErr),
      lineUserId,
      workerId,
    );
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

    const catSig = mapObjectCategoryToPipelineSignals(
      scanOut?.objectCategory ?? null,
    );
    /** Future: set `dominantColor` / `conditionClass` from non-LLM analysis of `imageBuffer` (not from `resultText`). */
    const reportPayload = buildReportPayloadFromScan({
      resultText,
      scanResultId: legacyScanResultId,
      scanRequestId,
      lineUserId,
      birthdateUsed: birthdate,
      publicToken: token,
      modelLabel: scanFromCache ? "persistent_cache" : "gpt-4.1-mini",
      objectImageUrl,
      scannedAt: new Date().toISOString(),
      objectFamily: catSig.objectFamily,
      materialFamily: catSig.materialFamily,
      shapeFamily: catSig.shapeFamily,
      objectCheckResult: objectCheck,
      pipelineObjectCategory: scanOut?.objectCategory ?? null,
      pipelineObjectCategorySource:
        scanOut?.objectCategorySource ?? "unspecified",
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

  const lineFinalMode = env.LINE_FINAL_DELIVERY_MODE;
  /** @type {Record<string, unknown> | null} */
  let flex = null;
  let lineDeliveryText = resultText;
  /** @type {ReturnType<typeof extractLineSummaryFields> | null} */
  let lineSummaryForOutbound = null;

  if (lineFinalMode === "summary_link") {
    if (reportPayloadForReply) {
      lineSummaryForOutbound = extractLineSummaryFields(
        reportPayloadForReply,
        parsed,
      );
      lineDeliveryText = buildSummaryLinkLineText({
        ...lineSummaryForOutbound,
        reportUrl: reportUrl || "",
      });
    } else {
      lineDeliveryText = buildSummaryLinkFallbackText(
        resultText,
        reportUrl || "",
      );
    }
    console.log(
      JSON.stringify({
        event: "SCAN_JOB_LINE_DELIVERY_BUILT",
        path: "worker-scan",
        deliveryStrategy: "summary_link",
        jobIdPrefix: String(jobId).slice(0, 8),
        lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
        textChars: lineDeliveryText.length,
        hasReportUrl: Boolean(String(reportUrl || "").trim()),
        hasReportPayload: Boolean(reportPayloadForReply),
      }),
    );
  } else {
    const summaryFirstSelected = isSummaryFirstFlexSelectedForUser(
      lineUserId,
      env.FLEX_SCAN_SUMMARY_FIRST,
      env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT,
    );
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
    console.log(
      JSON.stringify({
        event: "SCAN_JOB_LINE_DELIVERY_BUILT",
        path: "worker-scan",
        deliveryStrategy: "legacy_full",
        jobIdPrefix: String(jobId).slice(0, 8),
        lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
        hasFlex: Boolean(flex),
      }),
    );
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
    await failJob(
      jobId,
      "scan_results_v2_insert_failed",
      String(v2Err?.message || v2Err),
      lineUserId,
      workerId,
    );
    return;
  }

  if (!scanResultV2Id) {
    await updateScanRequestStatus(scanRequestId, "failed");
    await failJob(
      jobId,
      "result_insert_failed",
      "scan_results_v2 insert empty",
      lineUserId,
      workerId,
    );
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

  if (publicToken && reportUrl && scanResultV2Id) {
    try {
      await upsertReportPublicationForScanResult({
        scanResultV2Id: scanResultV2Id,
        publicToken,
        reportUrl,
      });
    } catch (pubErr) {
      console.error(
        JSON.stringify({
          event: "SCAN_V2_REPORT_PUBLICATION_UPSERT_FAIL",
          jobIdPrefix: String(jobId).slice(0, 8),
          message: pubErr?.message,
          code: pubErr?.code,
        }),
      );
    }
  }

  const reportOutboundRow = await insertOutboundMessage({
    line_user_id: lineUserId,
    kind: "scan_result",
    priority: OUTBOUND_PRIORITY.scan_result,
    related_job_id: jobId,
    payload_json: {
      deliveryStrategy: lineFinalMode,
      flex,
      text: lineDeliveryText,
      reportUrl,
      lineSummary: lineSummaryForOutbound,
      reportPayload:
        lineFinalMode === "legacy_full" ? reportPayloadForReply : null,
      accessSource: job.access_source,
      appUserId,
      scanResultV2Id,
      legacyScanResultId,
    },
    status: "queued",
  });

  console.log(
    JSON.stringify({
      event: "SCAN_JOB_REPORT_ENQUEUED",
      path: "worker-scan",
      workerIdPrefix: workerIdPrefix16(workerId),
      jobIdPrefix: idPrefix8(jobId),
      lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
      outboundIdPrefix: idPrefix8(reportOutboundRow?.id ?? null),
      deliveryStrategy: lineFinalMode,
      timestamp: scanV2TraceTs(),
    }),
  );
}

/**
 * @param {string} jobId
 * @param {string} code
 * @param {string} message
 */
async function failJob(jobId, code, message, lineUserId, workerId) {
  await updateScanJob(jobId, {
    status: "failed",
    error_code: code,
    error_message: String(message).slice(0, 2000),
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const em = String(message).slice(0, 500);
  console.error(
    JSON.stringify({
      event: "SCAN_JOB_FAILED",
      path: "worker-scan",
      workerIdPrefix: workerIdPrefix16(workerId),
      jobIdPrefix: idPrefix8(jobId),
      lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
      reason: code,
      errorMessage: em,
      timestamp: scanV2TraceTs(),
    }),
  );
}
