import {
  toBase64,
  getObjectGateReplyCandidatesForRouting,
  getUnsupportedObjectReplyCandidates,
} from "../../utils/webhookText.util.js";
import {
  checkCrystalBraceletEligibility,
  checkSingleObjectGated,
} from "../objectCheck.service.js";
import { resolveObjectGateReplyRouting } from "../../utils/objectGateReplyResolve.util.js";
import { runDeepScan } from "../scan.service.js";
import {
  buildScanResultFlexWithFallback,
  buildSummaryLinkFlexShell,
} from "../flex/scanFlexReply.builder.js";
import crypto from "crypto";
import { env } from "../../config/env.js";
import {
  getScanUploadById,
  findScanUploadBySha256AndUser,
} from "../../stores/scanV2/scanUploads.db.js";
import {
  getScanJobById,
  updateScanJob,
} from "../../stores/scanV2/scanJobs.db.js";
import { insertScanResultV2 } from "../../stores/scanV2/scanResultsV2.db.js";
import { insertOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import { notifyUserScanJobFailed } from "./scanJobFailureNotify.service.js";
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
import { extractStableVisualFeatures } from "../stableFeatureExtract.service.js";
import { maybeRunWebEnrichment } from "../webEnrichment/webEnrichment.service.js";
import { getWebEnrichmentEligibility } from "../webEnrichment/webEnrichment.service.js";
import { mergeExternalHintsIntoWordingContext } from "../../utils/webEnrichmentMerge.util.js";
import { mapObjectCategoryToPipelineSignals } from "../../utils/reports/scanPipelineReportSignals.util.js";
import { classifyCrystalSubtypeWithGemini } from "../../integrations/gemini/crystalSubtypeClassifier.service.js";
import { buildGptCrystalSubtypeInferenceText } from "../../moldavite/moldaviteDetect.util.js";
import { resolveSupportedLaneStrict } from "../../utils/reports/supportedLaneStrict.util.js";
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
import { resolveLineSummaryWording } from "../../utils/lineSummaryWording.util.js";
import { logUnsupportedObjectRejected } from "../lineWebhook/unsupportedObjectReply.service.js";
import {
  buildFinalDeliveryCorrelation,
  classifyReportPublicationBuildError,
  FinalDeliveryErrorCode,
  publicTokenPrefix12,
} from "../../utils/scanV2/finalDeliveryTelemetry.util.js";
import { computeImageDHash } from "../imageDedup/imagePhash.util.js";
import {
  findDuplicateScanByPhash,
  insertScanPhash,
} from "../../stores/scanV2/imageDedupCache.db.js";

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
  /** Async Scan V2 may default to summary handoff; see LINE_FINAL_DELIVERY_MODE_SCAN_V2. */
  const lineFinalMode =
    env.LINE_FINAL_DELIVERY_MODE_SCAN_V2 ?? env.LINE_FINAL_DELIVERY_MODE;

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

  // ── Perceptual image dedup ──────────────────────────────────────────────
  // If IMAGE_DEDUP_ENABLED, compute dHash of the image and check if the same
  // user has scanned a visually identical object before. On match, re-deliver
  // the cached report URL instead of running the full AI pipeline.
  /** @type {string | null} */
  let imageDHash = null;
  if (env.IMAGE_DEDUP_ENABLED) {
    try {
      const shaHex = crypto.createHash("sha256").update(imageBuffer).digest("hex");
      const shaDup = await findScanUploadBySha256AndUser(
        shaHex,
        lineUserId,
        upload.id,
      );
      if (shaDup) {
        console.log(
          JSON.stringify({
            event: "SCAN_SHA256_DEDUP_HIT",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(jobId),
            lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
            cachedScanResultIdPrefix: String(shaDup.scan_result_id || "").slice(0, 8),
            hasReportUrl: Boolean(shaDup.report_url),
            timestamp: scanV2TraceTs(),
          }),
        );
        await updateScanJob(jobId, {
          status: "completed",
          completed_at: new Date().toISOString(),
        });
        if (shaDup.report_url) {
          await insertOutboundMessage({
            line_user_id: lineUserId,
            kind: "scan_result",
            priority: OUTBOUND_PRIORITY.scan_result,
            related_job_id: jobId,
            payload_json: {
              type: "text",
              text: `ระบบตรวจพบว่าวัตถุนี้เคยสแกนไปแล้ว\nดูผลเดิมได้ที่: ${shaDup.report_url}`,
              appUserId,
            },
            status: "queued",
          });
        }
        return;
      }
    } catch (shaErr) {
      console.error(
        JSON.stringify({
          event: "SCAN_SHA256_DEDUP_ERROR",
          path: "worker-scan",
          jobIdPrefix: idPrefix8(jobId),
          message: shaErr?.message,
          timestamp: scanV2TraceTs(),
        }),
      );
    }

    try {
      imageDHash = await computeImageDHash(imageBuffer);
      const dupMatch = await findDuplicateScanByPhash(
        imageDHash,
        lineUserId,
        env.IMAGE_DEDUP_HAMMING_THRESHOLD,
      );
      if (dupMatch) {
        console.log(
          JSON.stringify({
            event: "SCAN_IMAGE_DEDUP_HIT",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(jobId),
            lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
            cachedScanResultIdPrefix: String(dupMatch.scan_result_id || "").slice(0, 8),
            hasReportUrl: Boolean(dupMatch.report_url),
            threshold: env.IMAGE_DEDUP_HAMMING_THRESHOLD,
            timestamp: scanV2TraceTs(),
          }),
        );
        // Mark job complete and re-deliver cached report URL as outbound message
        await updateScanJob(jobId, { status: "completed", completed_at: new Date().toISOString() });
        if (dupMatch.report_url) {
          await insertOutboundMessage({
            line_user_id: lineUserId,
            kind: "scan_result",
            priority: OUTBOUND_PRIORITY.scan_result,
            related_job_id: jobId,
            payload_json: {
              type: "text",
              text: `ระบบตรวจพบว่าวัตถุนี้เคยสแกนไปแล้ว\nดูผลเดิมได้ที่: ${dupMatch.report_url}`,
              appUserId,
            },
            status: "queued",
          });
        }
        return;
      }
    } catch (dedupErr) {
      // Non-fatal: if dedup check fails, proceed with normal scan
      console.error(
        JSON.stringify({
          event: "SCAN_IMAGE_DEDUP_ERROR",
          path: "worker-scan",
          jobIdPrefix: idPrefix8(jobId),
          message: dedupErr?.message,
          timestamp: scanV2TraceTs(),
        }),
      );
    }
  }
  // ────────────────────────────────────────────────────────────────────────

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

  const catSig = mapObjectCategoryToPipelineSignals(
    scanOut?.objectCategory ?? null,
  );
  const mainEnergyLine =
    parsed?.mainEnergy && parsed.mainEnergy !== "-"
      ? String(parsed.mainEnergy).trim()
      : "";
  const supportedFamilyGuess =
    gated?.gateMeta?.supportedFamilyGuess != null
      ? String(gated.gateMeta.supportedFamilyGuess)
      : null;

  /** @type {import("../webEnrichment/webEnrichment.types.js").ExternalObjectHints | null} */
  let externalObjectHints = null;
  /** @type {string | null} */
  let webEnrichmentSkipReason = null;
  /** @type {string | null} */
  let webEnrichmentDecisiveReason = null;
  try {
    const enrichRes = await maybeRunWebEnrichment({
      lineUserId,
      jobId,
      scanResultId: null,
      imageBuffer,
      objectFamily: catSig.objectFamily,
      objectCheckResult: objectCheck,
      supportedFamilyGuess,
      pipelineObjectCategory: scanOut?.objectCategory ?? null,
      mainEnergyLine,
      resultText,
      scanFromCache,
      workerElapsedMs: Date.now() - workerTurnStartMs,
    });
    externalObjectHints = enrichRes?.hints ?? null;
    webEnrichmentSkipReason = enrichRes?.skipReason ?? null;
    webEnrichmentDecisiveReason = enrichRes?.decisiveReason ?? null;
  } catch (enrichErr) {
    webEnrichmentSkipReason = String(enrichErr?.message || enrichErr).slice(0, 240);
    webEnrichmentDecisiveReason = "fetch_exception";
    console.log(
      JSON.stringify({
        event: "WEB_ENRICHMENT_FETCH_FAIL",
        path: "worker-scan",
        lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
        jobIdPrefix: idPrefix8(jobId),
        scanResultIdPrefix: "00000000",
        reason: webEnrichmentSkipReason,
        decisiveReason: webEnrichmentDecisiveReason,
        provider: env.WEB_ENRICHMENT_PROVIDER,
        cacheHit: false,
        durationMs: null,
        hintCount: 0,
        mergeMode: "n/a",
      }),
    );
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

  const scanResultIdPrefix = String(legacyScanResultId || "").slice(0, 8);
  const braceletEligibility = await checkCrystalBraceletEligibility(
    imageBase64,
    gated,
    {
      scanResultIdPrefix,
      jobIdPrefix: idPrefix8(jobId),
    },
  );

  const gptSubtypeInferenceText = buildGptCrystalSubtypeInferenceText({
    overview: "",
    mainEnergy:
      parsed?.mainEnergy && parsed.mainEnergy !== "-"
        ? String(parsed.mainEnergy).trim()
        : "",
    fitReason: "",
    pipelineObjectCategory: scanOut?.objectCategory ?? null,
  });

  /** @type {object|null} */
  let geminiCrystalSubtypeResult = null;
  const crystalContextForGemini =
    String(catSig.objectFamily || "").trim().toLowerCase() === "crystal" ||
    braceletEligibility.eligible;
  if (crystalContextForGemini) {
    geminiCrystalSubtypeResult = await classifyCrystalSubtypeWithGemini({
      imageBuffer,
      mimeType: "image/jpeg",
      scanResultIdPrefix,
    });
  }

  const strictLaneRes = resolveSupportedLaneStrict({
    baseGateResult: objectCheck,
    catSig,
    braceletEligibility,
    geminiCrystalSubtypeResult,
    resultText,
    dominantColorNormalized: scanOut?.dominantColorSlug ?? null,
    pipelineObjectCategory: scanOut?.objectCategory ?? null,
    pipelineObjectCategorySource: scanOut?.objectCategorySource ?? "unspecified",
    gptSubtypeInferenceText,
    scanResultIdPrefix,
  });

  if (strictLaneRes.lane === "unsupported") {
    logUnsupportedObjectRejected({
      path: "worker_scan",
      userId: lineUserId,
      flowVersion: null,
      messageId: null,
      objectCheckResult: `supported_lane_unresolved:${strictLaneRes.reason}`,
    });
    const c = getUnsupportedObjectReplyCandidates();
    await failJob(
      jobId,
      "supported_lane_unresolved",
      String(strictLaneRes.reason),
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
        rejectReason: "supported_lane_unresolved",
        objectCheckResult: `supported_lane_unresolved:${strictLaneRes.reason}`,
        text: c[0] || "ขออภัยครับ ไม่สามารถอ่านภาพนี้ได้",
        accessSource: job.access_source,
        appUserId,
      },
      status: "queued",
    });
    await updateScanRequestStatus(scanRequestId, "failed");
    return;
  }

  /** @type {"moldavite"|"sacred_amulet"|"crystal_bracelet"} */
  const strictSupportedLane = strictLaneRes.lane;

  let reportObjectFamily = catSig.objectFamily;
  let reportShapeFamily = catSig.shapeFamily;
  if (strictSupportedLane === "moldavite") {
    reportObjectFamily = "crystal";
    reportShapeFamily = undefined;
  } else if (strictSupportedLane === "sacred_amulet") {
    reportObjectFamily = "sacred_amulet";
  } else if (strictSupportedLane === "crystal_bracelet") {
    reportObjectFamily = "crystal";
    reportShapeFamily = "bracelet";
  }

  if (
    strictSupportedLane !== "crystal_bracelet" &&
    String(catSig.shapeFamily || "").trim().toLowerCase() === "bracelet"
  ) {
    reportShapeFamily = undefined;
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

    /** @type {string | null} */
    let stableFeatureSeed = null;
    if (env.STABLE_FEATURE_SEED_ENABLED && objectCheck === "single_supported") {
      try {
        const stableEx = await extractStableVisualFeatures({
          imageBase64,
          mimeType: "image/jpeg",
          objectFamily: reportObjectFamily,
          scanResultIdPrefix: String(legacyScanResultId || "").slice(0, 8),
        });
        stableFeatureSeed = stableEx.seed;
      } catch (stableErr) {
        console.log(
          JSON.stringify({
            event: "STABLE_FEATURE_EXTRACT_WORKER_EXCEPTION",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(jobId),
            scanResultIdPrefix: String(legacyScanResultId || "").slice(0, 8),
            message: String(stableErr?.message || stableErr).slice(0, 200),
          }),
        );
      }
    }

    const objectCheckConfidence =
      gated.gateMeta?.confidence != null &&
      Number.isFinite(Number(gated.gateMeta.confidence))
        ? Number(gated.gateMeta.confidence)
        : undefined;

    const reportPayloadBuilt = await buildReportPayloadFromScan({
      resultText,
      scanResultId: legacyScanResultId,
      scanRequestId,
      lineUserId,
      birthdateUsed: birthdate,
      publicToken: token,
      modelLabel: scanFromCache ? "persistent_cache" : "gpt-4.1-mini",
      objectImageUrl,
      scannedAt: new Date().toISOString(),
      objectFamily: reportObjectFamily,
      materialFamily: catSig.materialFamily,
      shapeFamily: reportShapeFamily,
      objectCheckResult: objectCheck,
      objectCheckConfidence,
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
      geminiCrystalSubtypeResult,
      strictSupportedLane,
      stableFeatureSeed,
    });

    let reportPayload = reportPayloadBuilt;
    try {
      const merged = mergeExternalHintsIntoWordingContext(
        reportPayloadBuilt,
        externalObjectHints,
      );
      reportPayload = merged.payload;
      if (externalObjectHints) {
        const hintCount =
          (merged.payload.enrichment?.hints?.sourceUrls?.length ? 1 : 0) +
          (merged.payload.enrichment?.hints?.spiritualContextHints?.length || 0) +
          (merged.payload.enrichment?.hints?.marketNames?.length || 0);
        if (merged.ignoredConflict) {
          console.log(
            JSON.stringify({
              event: "WEB_ENRICHMENT_IGNORED_CONFLICT",
              path: "worker-scan",
              lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
              jobIdPrefix: idPrefix8(jobId),
              scanResultIdPrefix: String(legacyScanResultId || "").slice(0, 8),
              objectFamily: reportObjectFamily,
              supportedFamilyGuess,
              reason: "hint_object_family_mismatch",
              provider:
                externalObjectHints.provider || env.WEB_ENRICHMENT_PROVIDER,
              cacheHit: false,
              durationMs: null,
              hintCount,
              mergeMode: merged.mergeMode,
            }),
          );
        }
        if (merged.appliedFields.length > 0) {
          console.log(
            JSON.stringify({
              event: "WEB_ENRICHMENT_MERGED",
              path: "worker-scan",
              lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
              jobIdPrefix: idPrefix8(jobId),
              scanResultIdPrefix: String(legacyScanResultId || "").slice(0, 8),
              objectFamily: reportObjectFamily,
              supportedFamilyGuess,
              reason: "wording_merge",
              provider:
                externalObjectHints.provider || env.WEB_ENRICHMENT_PROVIDER,
              cacheHit: false,
              durationMs: null,
              hintCount,
              mergeMode: merged.mergeMode,
            }),
          );
        }
      }
    } catch (mergeErr) {
      console.log(
        JSON.stringify({
          event: "WEB_ENRICHMENT_MERGE_EXCEPTION",
          path: "worker-scan",
          outcome: "ignored",
          message: String(mergeErr?.message || mergeErr),
        }),
      );
      reportPayload = reportPayloadBuilt;
    }

    const enrichElig = getWebEnrichmentEligibility({
      objectCheckResult: objectCheck,
      objectFamily: reportObjectFamily,
      supportedFamilyGuess,
      pipelineObjectCategory: scanOut?.objectCategory ?? null,
      mainEnergyLine,
      resultText,
      scanFromCache,
    });
    if (
      reportPayload.diagnostics &&
      typeof reportPayload.diagnostics === "object"
    ) {
      reportPayload.diagnostics.enrichmentEligible = enrichElig.ok;
      reportPayload.diagnostics.enrichmentUsed = Boolean(externalObjectHints);
      reportPayload.diagnostics.enrichmentProvider =
        externalObjectHints?.provider ?? null;
      reportPayload.diagnostics.enrichmentSkipReason = webEnrichmentSkipReason;
      reportPayload.diagnostics.enrichmentDecisiveReason =
        webEnrichmentDecisiveReason;
      reportPayload.diagnostics.truthCategoryCode =
        reportPayload.summary?.energyCategoryCode ?? null;
      reportPayload.diagnostics.deliveryStrategy = lineFinalMode;
    }

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

  /** @type {Record<string, unknown> | null} */
  let flex = null;
  let lineDeliveryText = resultText;
  /** @type {ReturnType<typeof extractLineSummaryFields> | null} */
  let lineSummaryForOutbound = null;
  /** @type {import("../../utils/lineSummaryWording.util.js").LineSummaryWordingResolved | null} */
  let lineSummaryWordingSnapshot = null;

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
    /** @type {string | null} */
    let flexFallbackReason = null;
    if (reportPayloadForReply) {
      /** @type {import("../../utils/lineSummaryWording.util.js").LineSummaryWordingResolved | null} */
      const lineWordingResolved = await resolveLineSummaryWording(
        reportPayloadForReply,
        lineUserId,
        jobId,
      );
      lineSummaryWordingSnapshot = lineWordingResolved;
      lineSummaryForOutbound = extractLineSummaryFields(
        reportPayloadForReply,
        parsed,
      );
      if (
        reportPayloadForReply.diagnostics &&
        typeof reportPayloadForReply.diagnostics === "object"
      ) {
        reportPayloadForReply.diagnostics.lineSummaryPresent = Boolean(
          lineSummaryForOutbound,
        );
      }
      lineDeliveryText = buildSummaryLinkLineText({
        ...lineSummaryForOutbound,
        reportUrl: reportUrl || "",
        lineWording: lineWordingResolved,
      });

      if (env.LINE_SUMMARY_LINK_USE_FLEX_SHELL) {
        try {
          const summaryShellOpts = {
            birthdate,
            reportUrl,
            reportPayload: reportPayloadForReply,
            appendReportBubble: false,
          };
          const built = await buildSummaryLinkFlexShell(
            resultText,
            summaryShellOpts,
            { path: "worker-scan", jobIdPrefix: idPrefix8(jobId) },
          );
          if (
            built &&
            typeof built === "object" &&
            /** @type {{ type?: string }} */ (built).type === "flex"
          ) {
            flex = built;
          } else {
            flexFallbackReason = "flex_shape_invalid";
          }
        } catch (flexErr) {
          flexFallbackReason = String(flexErr?.message || flexErr).slice(
            0,
            240,
          );
        }
      } else {
        flexFallbackReason = "disabled_by_env_LINE_SUMMARY_LINK_USE_FLEX_SHELL";
      }

      const flexOk = Boolean(flex && typeof flex === "object");
      console.log(
        JSON.stringify({
          event: "LINE_SUMMARY_SURFACE_DECIDED",
          path: "worker-scan",
          jobIdPrefix: idPrefix8(jobId),
          lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
          requestedSurface: env.LINE_SUMMARY_LINK_USE_FLEX_SHELL
            ? "flex"
            : "text",
          intendedSurface: flexOk ? "flex" : "text",
          actualSurfaceEnqueue: flexOk ? "flex" : "text",
          fallbackReason: flexOk ? null : flexFallbackReason,
          flexValidationPassed: flexOk,
          templateAvailable: flexOk,
          flexShellEnabled: env.LINE_SUMMARY_LINK_USE_FLEX_SHELL,
          summaryBankUsed: lineWordingResolved?.summaryBankUsed ?? null,
          summaryVariantId: lineWordingResolved?.summaryVariantId ?? null,
          summaryDiversified: lineWordingResolved?.summaryDiversified ?? false,
          summaryAvoidedRepeat: lineWordingResolved?.summaryAvoidedRepeat ?? false,
          summaryAvoidedAngleCluster:
            lineWordingResolved?.summaryAvoidedAngleCluster ?? false,
          rolloutFlagState: {
            LINE_SUMMARY_LINK_USE_FLEX_SHELL: env.LINE_SUMMARY_LINK_USE_FLEX_SHELL,
            FLEX_SCAN_SUMMARY_FIRST: env.FLEX_SCAN_SUMMARY_FIRST,
          },
        }),
      );
    } else {
      lineDeliveryText = buildSummaryLinkFallbackText(
        resultText,
        reportUrl || "",
      );
      flexFallbackReason = "no_report_payload";
      console.log(
        JSON.stringify({
          event: "LINE_SUMMARY_SURFACE_DECIDED",
          path: "worker-scan",
          jobIdPrefix: idPrefix8(jobId),
          lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
          requestedSurface: "text",
          intendedSurface: "text",
          actualSurfaceEnqueue: "text",
          fallbackReason: flexFallbackReason,
          flexValidationPassed: false,
          templateAvailable: false,
        }),
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
        hasFlex: Boolean(flex),
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
    if (reportPayloadForReply) {
      lineSummaryForOutbound = extractLineSummaryFields(
        reportPayloadForReply,
        parsed,
      );
      if (
        reportPayloadForReply.diagnostics &&
        typeof reportPayloadForReply.diagnostics === "object"
      ) {
        reportPayloadForReply.diagnostics.lineSummaryPresent = Boolean(
          lineSummaryForOutbound,
        );
      }
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
        lineSummaryPresent: Boolean(lineSummaryForOutbound),
        lineSummaryShell: true,
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

  // Store pHash for future dedup lookups (non-fatal)
  if (env.IMAGE_DEDUP_ENABLED && imageDHash && scanResultV2Id) {
    insertScanPhash({
      image_phash: imageDHash,
      scan_result_id: scanResultV2Id,
      report_url: reportUrl ?? null,
      line_user_id: lineUserId,
    }).catch((e) => {
      console.error(
        JSON.stringify({
          event: "SCAN_PHASH_INSERT_ERROR",
          path: "worker-scan",
          jobIdPrefix: idPrefix8(jobId),
          message: e?.message,
        }),
      );
    });
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

  const dx = reportPayloadForReply?.diagnostics;
  console.log(
    JSON.stringify({
      event: "SCAN_EXPLAIN_SUMMARY",
      path: "worker-scan",
      jobIdPrefix: idPrefix8(jobId),
      lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
      scanResultV2IdPrefix: String(scanResultV2Id || "").slice(0, 8),
      objectFamily: reportObjectFamily,
      pipelineObjectCategory: scanOut?.objectCategory ?? null,
      resolvedCategoryCode: dx?.resolvedCategoryCode ?? null,
      diversificationApplied: Boolean(dx?.diversificationApplied),
      wordingBankUsed: dx?.wordingBankUsed ?? null,
      wordingVariantId: dx?.wordingVariantId ?? null,
      crystalMode: reportPayloadForReply?.summary?.crystalMode ?? null,
      matchedSignalsCount:
        typeof dx?.matchedSignalsCount === "number"
          ? dx.matchedSignalsCount
          : null,
      enrichmentEligible: Boolean(dx?.enrichmentEligible),
      enrichmentUsed: Boolean(dx?.enrichmentUsed),
      enrichmentProvider: dx?.enrichmentProvider ?? null,
      enrichmentSkipReason: webEnrichmentSkipReason,
      enrichmentDecisiveReason: webEnrichmentDecisiveReason,
      truthCategoryCode: dx?.truthCategoryCode ?? null,
      lineSummaryBankUsed: lineSummaryWordingSnapshot?.summaryBankUsed ?? null,
      lineSummaryVariantId: lineSummaryWordingSnapshot?.summaryVariantId ?? null,
      presentationAngleId: lineSummaryWordingSnapshot?.presentationAngleId ?? null,
      avoidedRepeatLineSummary:
        lineSummaryWordingSnapshot?.summaryAvoidedRepeat ?? false,
      deliveryStrategy: lineFinalMode,
      lineSummaryPresent: Boolean(lineSummaryForOutbound),
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
  if (lineUserId) {
    await notifyUserScanJobFailed({ lineUserId, jobId, reason: code });
  }
}
