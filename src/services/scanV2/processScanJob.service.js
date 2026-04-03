import {
  toBase64,
  getObjectGateReplyCandidatesForRouting,
} from "../../utils/webhookText.util.js";
import { checkSingleObjectGated } from "../objectCheck.service.js";
import { resolveObjectGateReplyRouting } from "../../utils/objectGateReplyResolve.util.js";
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
import {
  buildFinalDeliveryCorrelation,
  classifyReportPublicationBuildError,
  FinalDeliveryErrorCode,
  publicTokenPrefix12,
} from "../../utils/scanV2/finalDeliveryTelemetry.util.js";

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

  /** Set after `upsertReportPublicationForScanResult` (must exist for whole job to avoid ReferenceError). */
  /** @type {string | null} */
  let reportPublicationId = null;

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
  const gated = await checkSingleObjectGated(imageBase64, {
    messageId: null,
    path: "worker_scan_job",
  });
  const objectCheck = gated.result;
  const objectGateRouting = resolveObjectGateReplyRouting(gated);
  console.log(
    JSON.stringify({
      event: "OBJECT_REPLY_TYPE_SELECTED",
      kind: objectGateRouting.kind,
      replyType: objectGateRouting.replyType,
      reason: objectGateRouting.reason,
      path: "worker_scan_job",
    }),
  );
  console.log(
    JSON.stringify({
      event: "SCAN_JOB_OBJECT_VALIDATED",
      path: "worker-scan",
      workerIdPrefix: workerIdPrefix16(workerId),
      jobIdPrefix: idPrefix8(jobId),
      lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
      objectCheckResult: objectCheck,
      objectGateKind: objectGateRouting.kind,
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
    const c = getObjectGateReplyCandidatesForRouting(objectGateRouting);
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
        objectGateKind: objectGateRouting.kind,
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
    console.log(
      JSON.stringify({
        event: "REPORT_PUBLICATION_BUILD_START",
        path: "worker-scan",
        worker: "processScanJob",
        ...buildFinalDeliveryCorrelation({
          jobId,
          scanResultId: legacyScanResultId,
          lineUserId,
        }),
      }),
    );
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
      dominantColor: scanOut?.dominantColorSlug,
      pipelineDominantColorSource:
        scanOut?.dominantColorSource === "vision_v1"
          ? "vision_v1"
          : scanOut?.dominantColorSource === "cache_persisted"
            ? "cache_persisted"
            : undefined,
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

    const reportPayloadVersion =
      reportPayload &&
      typeof reportPayload === "object" &&
      "reportVersion" in reportPayload
        ? /** @type {{ reportVersion?: unknown }} */ (reportPayload).reportVersion
        : null;

    console.log(
      JSON.stringify({
        event: "REPORT_PUBLICATION_BUILD_OK",
        path: "worker-scan",
        worker: "processScanJob",
        ...buildFinalDeliveryCorrelation({
          jobId,
          scanResultId: legacyScanResultId,
          publicToken: token,
          lineUserId,
        }),
        reportPayloadVersion: reportPayloadVersion ?? null,
        reportUrlPresent: Boolean(String(reportUrl || "").trim()),
        payloadPresent: true,
      }),
    );
    console.log(
      JSON.stringify({
        event: "REPORT_PUBLICATION_TOKEN_READY",
        path: "worker-scan",
        ...buildFinalDeliveryCorrelation({
          jobId,
          scanResultId: legacyScanResultId,
          publicToken: token,
        }),
      }),
    );
    console.log(
      JSON.stringify({
        event: "REPORT_PUBLICATION_URL_READY",
        path: "worker-scan",
        ...buildFinalDeliveryCorrelation({
          jobId,
          publicToken: token,
        }),
        reportUrlPresent: Boolean(String(reportUrl || "").trim()),
      }),
    );

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
    const errorCode = classifyReportPublicationBuildError(reportErr);
    console.error(
      JSON.stringify({
        event: "REPORT_PUBLICATION_BUILD_FAIL",
        path: "worker-scan",
        worker: "processScanJob",
        ...buildFinalDeliveryCorrelation({
          jobId,
          scanResultId: legacyScanResultId,
          lineUserId,
        }),
        errorCode,
        reason: String(
          reportErr && typeof reportErr === "object" && "message" in reportErr
            ? /** @type {{ message?: unknown }} */ (reportErr).message
            : reportErr,
        ).slice(0, 240),
      }),
    );
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
        errorCode,
      }),
    );
  }

  const lineFinalMode = env.LINE_FINAL_DELIVERY_MODE;
  /** @type {Record<string, unknown> | null} */
  let flex = null;
  let lineDeliveryText = resultText;
  /** @type {ReturnType<typeof extractLineSummaryFields> | null} */
  let lineSummaryForOutbound = null;

  console.log(
    JSON.stringify({
      event: "SCAN_RESULT_DELIVERY_STRATEGY_SELECTED",
      path: "worker-scan",
      worker: "processScanJob",
      ...buildFinalDeliveryCorrelation({
        jobId,
        scanResultId: legacyScanResultId,
        publicToken,
        lineUserId,
      }),
      deliveryStrategy: lineFinalMode,
      summaryLinkMode: lineFinalMode === "summary_link",
      reportUrlPresent: Boolean(String(reportUrl || "").trim()),
      hasReportPayload: Boolean(reportPayloadForReply),
      publicTokenPrefix: publicTokenPrefix12(publicToken),
    }),
  );

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
        ...buildFinalDeliveryCorrelation({
          jobId,
          publicToken,
          lineUserId,
        }),
        textChars: lineDeliveryText.length,
        hasReportUrl: Boolean(String(reportUrl || "").trim()),
        hasReportPayload: Boolean(reportPayloadForReply),
        lineSummaryPresent: Boolean(lineSummaryForOutbound),
        hasFlex: false,
        hasLegacyReportPayload: false,
      }),
    );
  } else {
    const summaryFirstSelected = isSummaryFirstFlexSelectedForUser(
      lineUserId,
      env.FLEX_SCAN_SUMMARY_FIRST,
      env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT,
    );
    try {
      const built = await buildScanResultFlexWithFallback({
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
        ...buildFinalDeliveryCorrelation({
          jobId,
          publicToken,
          lineUserId,
        }),
        hasFlex: Boolean(flex),
        hasReportUrl: Boolean(String(reportUrl || "").trim()),
        hasLegacyReportPayload: Boolean(reportPayloadForReply),
        lineSummaryPresent: false,
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

  if (publicToken && reportUrl && scanResultV2Id) {
    try {
      const pubRow = await upsertReportPublicationForScanResult({
        scanResultV2Id: scanResultV2Id,
        publicToken,
        reportUrl,
      });
      reportPublicationId = pubRow?.id ? String(pubRow.id) : null;
      if (!reportPublicationId) {
        console.error(
          JSON.stringify({
            event: "SCAN_V2_REPORT_PUBLICATION_ID_MISSING",
            path: "worker-scan",
            jobIdPrefix: String(jobId).slice(0, 8),
            scanResultIdPrefix: String(scanResultV2Id).slice(0, 8),
            publicTokenPrefix: publicTokenPrefix12(publicToken),
            reportUrlPresent: Boolean(String(reportUrl || "").trim()),
            reason: "upsert_returned_no_id",
            timestamp: scanV2TraceTs(),
          }),
        );
        await updateScanRequestStatus(scanRequestId, "failed");
        await failJob(
          jobId,
          "publication_id_missing_after_upsert",
          "report_publications upsert ok but id missing",
          lineUserId,
          workerId,
        );
        return;
      }
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

  console.log(
    JSON.stringify({
      event: "SCAN_RESULT_OUTBOUND_ENQUEUE_START",
      path: "worker-scan",
      workerIdPrefix: workerIdPrefix16(workerId),
      jobIdPrefix: idPrefix8(jobId),
      lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
      scanResultIdPrefix: String(scanResultV2Id).slice(0, 8),
      deliveryStrategy: lineFinalMode,
      hasReportUrl: Boolean(String(reportUrl || "").trim()),
      reportUrlPresent: Boolean(String(reportUrl || "").trim()),
      publicationIdPrefix: idPrefix8(reportPublicationId),
      publicTokenPrefix: publicTokenPrefix12(publicToken),
      timestamp: scanV2TraceTs(),
    }),
  );

  /** @type {{ id?: string } | null} */
  let reportOutboundRow = null;
  try {
    reportOutboundRow = await insertOutboundMessage({
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
        publicToken,
        reportPublicationId,
      },
      status: "queued",
    });
  } catch (enqueueErr) {
    console.error(
      JSON.stringify({
        event: "SCAN_RESULT_OUTBOUND_ENQUEUE_FAIL",
        path: "worker-scan",
        workerIdPrefix: workerIdPrefix16(workerId),
        jobIdPrefix: idPrefix8(jobId),
        lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
        scanResultIdPrefix: String(scanResultV2Id).slice(0, 8),
        publicationIdPrefix: idPrefix8(reportPublicationId),
        publicTokenPrefix: publicTokenPrefix12(publicToken),
        reportUrlPresent: Boolean(String(reportUrl || "").trim()),
        errorCode: enqueueErr?.code ?? null,
        reason: String(enqueueErr?.message || enqueueErr).slice(0, 500),
        timestamp: scanV2TraceTs(),
      }),
    );
    await updateScanRequestStatus(scanRequestId, "failed");
    await failJob(
      jobId,
      "outbound_enqueue_failed",
      String(enqueueErr?.message || enqueueErr),
      lineUserId,
      workerId,
    );
    return;
  }

  console.log(
    JSON.stringify({
      event: "SCAN_RESULT_OUTBOUND_ENQUEUE_OK",
      path: "worker-scan",
      workerIdPrefix: workerIdPrefix16(workerId),
      jobIdPrefix: idPrefix8(jobId),
      outboundIdPrefix: idPrefix8(reportOutboundRow?.id ?? null),
      scanResultIdPrefix: String(scanResultV2Id).slice(0, 8),
      publicationIdPrefix: idPrefix8(reportPublicationId),
      publicTokenPrefix: publicTokenPrefix12(publicToken),
      reportUrlPresent: Boolean(String(reportUrl || "").trim()),
      timestamp: scanV2TraceTs(),
    }),
  );

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

  console.log(
    JSON.stringify({
      event: "SCAN_JOB_REPORT_ENQUEUED",
      path: "worker-scan",
      workerIdPrefix: workerIdPrefix16(workerId),
      jobIdPrefix: idPrefix8(jobId),
      lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
      outboundIdPrefix: idPrefix8(reportOutboundRow?.id ?? null),
      publicationIdPrefix: idPrefix8(reportPublicationId),
      publicTokenPrefix: publicTokenPrefix12(publicToken),
      deliveryStrategy: lineFinalMode,
      summaryLinkMode: lineFinalMode === "summary_link",
      reportUrlPresent: Boolean(String(reportUrl || "").trim()),
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
