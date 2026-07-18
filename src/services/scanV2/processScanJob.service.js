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
import { ensureScanUploadThumbnail } from "./scanUploadThumbnail.service.js";
import { parseScanResultForHistory } from "../history/history.parser.js";
import { createScanRequest, updateScanRequestStatus } from "../../stores/scanRequests.db.js";
import {
  createScanResult,
  deleteScanResultForAppUser,
} from "../../stores/scanResults.db.js";
import { buildReportPayloadFromScan } from "../reports/reportPayload.builder.js";
import { maybeBuildScanVoiceNote } from "../voiceNote/scanVoiceNote.service.js";
import {
  runImageForensicCheck,
  evaluateForensicDecision,
  isChallengeWorthy,
  FORENSIC_RETRY_TEXTS,
  CHALLENGE_REQUEST_TEXTS,
  CHALLENGE_FAILED_TEXTS,
  CHALLENGE_NO_THUMB_TEXTS,
  verifyChallengeThumbTouch,
} from "../imageForensic.service.js";
import { getUserPaidUntil } from "../../stores/paymentAccess.db.js";
import {
  bumpRejectionCount,
  clearRejectionCount,
  generateSmartRejectionText,
  ESCALATION_TEXT,
} from "./smartRejection.service.js";
import {
  getValue as getRedisValue,
  setValueWithTtl,
  clearDedupeKey,
} from "../../redis/scanV2Redis.js";
import { visionMatchPair } from "./visionSidecar.client.js";
import { buildReportPayloadFromGlobalBaseline } from "./buildReportPayloadFromGlobalBaseline.service.js";
import { tryCrossAccountExactBaselineReusePhase2A } from "./tryCrossAccountExactBaselineReuse.service.js";
import { tryCrossAccountPhashBaselineReusePhase2C } from "./tryCrossAccountPhashBaselineReusePhase2C.service.js";
import { tryCrossAccountEmbeddingBaselineReuse } from "./tryCrossAccountEmbeddingBaselineReuse.service.js";
import { tryVisionReidBaselineReuse } from "./tryVisionReidBaselineReuse.service.js";
import { classifyAmuletType } from "../../amulet/amuletTypeClassify.service.js";
import { matchAmuletTypeByExamples } from "./amuletTypeExampleMatch.service.js";
import { extractStableVisualFeatures } from "../stableFeatureExtract.service.js";
import { evaluateRitualScanGate } from "../objectTaxonomy/objectTaxonomy.js";
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
import { maybePersistGlobalObjectBaselineAfterScanV2 } from "./maybePersistGlobalObjectBaseline.service.js";
import {
  emitScanCompletedEvent,
  emitScanLifecycleEvents,
} from "../enerAiLifecycleEvents.service.js";

const NEAR_EXACT_DEDUP_THRESHOLD = 4;

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

  /** Hoisted for {@link buildReportPayloadFromScan} + baseline persist (must survive `try/catch` that ends before v2 insert). */
  /** @type {string | null} */
  let stableFeatureSeed = null;
  /** Raw vision slugs (color/material/form/texture) for angle-robust amulet scoring (feature_blend_v3). */
  /** @type {{ primaryColor?: string, materialType?: string, formFactor?: string, textureHint?: string } | null} */
  let stableFeatureFields = null;
  /** objectUnderstanding ดิบจาก extractor (เคสธูปหวย) — แสดงผล/consult เท่านั้น ไม่แตะคะแนน */
  /** @type {object | null} */
  let objectUnderstandingRaw = null;

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

  await ensureScanUploadThumbnail({
    upload,
    lineUserId,
    imageBuffer,
  });

  // ── Perceptual image dedup ──────────────────────────────────────────────
  // If IMAGE_DEDUP_ENABLED, compute dHash of the image and check if the same
  // user has scanned a visually identical object before. On match, re-deliver
  // the cached report URL instead of running the full AI pipeline.
  /** @type {string | null} */
  let imageDHash = null;
  let wasExactDup = false;
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
        wasExactDup = true;
        if (shaDup.report_url) {
          await updateScanJob(jobId, { status: "completed", completed_at: new Date().toISOString() });
          await insertOutboundMessage({
            line_user_id: lineUserId,
            kind: "scan_result",
            priority: OUTBOUND_PRIORITY.scan_result,
            related_job_id: jobId,
            payload_json: {
              type: "text",
              text: `ชิ้นนี้เคยสแกนไปแล้วครับ\nดูผลเดิมได้ที่: ${shaDup.report_url}`,
              appUserId,
              skipQuotaDecrement: true,
              dedupHit: true,
              dedupType: "sha256",
            },
            status: "queued",
          });
          emitScanCompletedEvent({
            lineUserId,
            appUserId,
            scanId: jobId,
            reportId: shaDup.scan_result_id || null,
            reportUrl: shaDup.report_url,
            dedupHit: true,
            dedupType: "sha256",
          });
          return;
        }
        // no cached report_url yet: continue pipeline and keep quota-skip hint
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
        Math.min(env.IMAGE_DEDUP_HAMMING_THRESHOLD, NEAR_EXACT_DEDUP_THRESHOLD),
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
              text: `ชิ้นนี้เคยสแกนไปแล้วครับ\nดูผลเดิมได้ที่: ${dupMatch.report_url}`,
              appUserId,
              skipQuotaDecrement: true,
              dedupHit: true,
              dedupType: "phash",
            },
            status: "queued",
          });
          emitScanCompletedEvent({
            lineUserId,
            appUserId,
            scanId: jobId,
            reportId: dupMatch.scan_result_id || null,
            reportUrl: dupMatch.report_url,
            dedupHit: true,
            dedupType: "phash",
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

  /** ท้าถ่ายสดค้างอยู่ไหม — รูปนี้คือ "มุมที่สอง" ที่อาจารย์ขอ → LightGlue ตัดสิน */
  let challengeProven = false;
  if (env.AUTH_CHALLENGE_ENABLED) {
    try {
      const chalRaw = await getRedisValue(`scan_v2:authchal:${lineUserId}`);
      if (chalRaw) {
        const chal = JSON.parse(chalRaw);
        const firstBuf = await readScanImageFromStorage(chal.b, chal.p);
        const pair = await visionMatchPair(toBase64(firstBuf), imageBase64);
        const inliers = pair?.inliers ?? -1;
        const passed = inliers >= env.AUTH_CHALLENGE_MIN_INLIERS;
        console.log(
          JSON.stringify({
            event: passed ? "AUTH_CHALLENGE_PASSED" : "AUTH_CHALLENGE_FAILED",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(jobId),
            lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
            inliers,
            minInliers: env.AUTH_CHALLENGE_MIN_INLIERS,
          }),
        );
        if (passed) {
          // v2: ชิ้นเดียวกันจริง + ต้องเห็นนิ้วแตะชิ้นงาน (หลักฐานว่าของอยู่ในมือ)
          const thumbOk = await verifyChallengeThumbTouch(imageBase64);
          if (thumbOk) {
            await clearDedupeKey(`scan_v2:authchal:${lineUserId}`);
            challengeProven = true; // ของจริงพิสูจน์แล้ว — ข้าม forensic รอบนี้
          } else {
            // ชิ้นถูกแต่ลืมนิ้ว — คีย์ยังอยู่ ให้ถ่ายซ้ำได้จน TTL หมด ไม่กินสิทธิ์
            console.log(
              JSON.stringify({
                event: "AUTH_CHALLENGE_NO_THUMB",
                path: "worker-scan",
                jobIdPrefix: idPrefix8(jobId),
                lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
              }),
            );
            await failJob(jobId, "auth_challenge_no_thumb", "thumb_missing", lineUserId, workerId);
            await insertOutboundMessage({
              line_user_id: lineUserId,
              kind: "scan_result",
              priority: OUTBOUND_PRIORITY.scan_result,
              related_job_id: jobId,
              payload_json: {
                error: true,
                rejectReason: "auth_challenge_no_thumb",
                text: CHALLENGE_NO_THUMB_TEXTS[0],
                accessSource: job.access_source,
                appUserId,
              },
              status: "queued",
            });
            await updateScanRequestStatus(scanRequestId, "failed");
            return;
          }
        } else if (inliers >= 0) {
          // matcher บอกคนละชิ้น — แต่ถ้ารูปนี้มีนิ้วโป้งแตะชิ้นงานจริง = ของอยู่ในมือจริง
          // ระบบสแกน "รูปปัจจุบัน" อยู่แล้ว ผลที่ออกคือชิ้นที่ถืออยู่ → ปล่อยผ่านแบบ soft
          // (เคส GopGap 15 ก.ค.: หินกลมผิวเรียบจุดจับคู่น้อย + รูปแรกซูมจัดฉาก
          //  matcher ไม่มีวันแมตช์ ลูกค้าถือของจริงแท้ ๆ แต่ติดลูปตลอด)
          const thumbOkSoft = await verifyChallengeThumbTouch(imageBase64).catch(() => false);
          if (thumbOkSoft) {
            await clearDedupeKey(`scan_v2:authchal:${lineUserId}`);
            challengeProven = true;
            console.log(
              JSON.stringify({
                event: "AUTH_CHALLENGE_SOFT_PASS",
                path: "worker-scan",
                jobIdPrefix: idPrefix8(jobId),
                lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
                reason: "thumb_in_hand_match_low",
                inliers,
                minInliers: env.AUTH_CHALLENGE_MIN_INLIERS,
              }),
            );
          } else {
            await clearDedupeKey(`scan_v2:authchal:${lineUserId}`);
            // ไม่ใช่ชิ้นเดียวกัน + ไม่เห็นนิ้วแตะของจริง → จับโป๊ะแบบมีบารมี ไม่กินสิทธิ์
            await failJob(jobId, "auth_challenge_failed", `inliers=${inliers}`, lineUserId, workerId);
            await insertOutboundMessage({
              line_user_id: lineUserId,
              kind: "scan_result",
              priority: OUTBOUND_PRIORITY.scan_result,
              related_job_id: jobId,
              payload_json: {
                error: true,
                rejectReason: "auth_challenge_failed",
                text: CHALLENGE_FAILED_TEXTS[0],
                accessSource: job.access_source,
                appUserId,
              },
              status: "queued",
            });
            await updateScanRequestStatus(scanRequestId, "failed");
            return;
          }
        } else {
          // inliers = -1 (sidecar ล่ม/ตอบไม่ได้) → ทิ้ง challenge ปล่อยผ่านตามหลัก false-positive-first
          await clearDedupeKey(`scan_v2:authchal:${lineUserId}`);
        }
      }
    } catch (chalErr) {
      console.warn(
        JSON.stringify({
          event: "AUTH_CHALLENGE_CHECK_ERROR",
          jobIdPrefix: idPrefix8(jobId),
          message: String(chalErr?.message || chalErr).slice(0, 160),
        }),
      );
    }
  }

  // Phase 1 forensics (screen/AI/edited) วิ่งขนานกับ gate — ตัดสินทีหลังตรงก่อน fresh scan
  const forensicPromise = challengeProven
    ? Promise.resolve(null)
    : runImageForensicCheck(imageBase64).catch(() => null);
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

  if (objectCheck === "inconclusive") {
    // ระบบเองไม่แน่ใจ (timeout/rate-limit/สัญญาณอ่อน) ≠ รูปลูกค้าผิด — เดินหน้าสแกนต่อ
    // (บทเรียนพายุ rate-limit 12 ก.ค.: ปัดลูกค้าจริง 62% ทั้งวันเพราะ gate ตอบไม่ทัน)
    console.log(
      JSON.stringify({
        event: "WORKER_GATE_INCONCLUSIVE_PASS_THROUGH",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(jobId),
        lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
      }),
    );
  } else if (objectCheck !== "single_supported") {
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
    // ข้อความปัดผ่านสมอง AI (รู้ว่าโดนมากี่ครั้ง) + ครั้งที่ 5 อาจารย์รับไปดูเอง+เตือนกบ
    const rejReason = objectCheck === "multiple" ? "multiple" : objectCheck === "unclear" ? "unclear" : "unsupported";
    const rejAttempt = await bumpRejectionCount(lineUserId);
    setValueWithTtl(`scan_v2:reject_last:${lineUserId}`, rejReason, 7200);
    let rejText = null;
    if (rejAttempt >= 5) {
      rejText = ESCALATION_TEXT;
      const adminId = String(process.env.ADMIN_LINE_USER_ID || "").trim();
      if (adminId) {
        await insertOutboundMessage({
          line_user_id: adminId,
          kind: "pre_scan_ack",
          priority: OUTBOUND_PRIORITY.pre_scan_ack,
          payload_json: {
            text: `⚠️ ลูกค้า ${String(lineUserId).slice(0, 10)}… รูปโดนปัด ${rejAttempt} ครั้งติด (${rejReason})
อาจารย์บอกเขาว่าจะรับไปดูเอง — เข้าไปช่วยเช็คใน OA หน่อย`,
          },
          status: "queued",
        }).catch(() => {});
      }
    } else {
      rejText = await generateSmartRejectionText({
        reasonKind: rejReason,
        attempt: rejAttempt,
        gateMeta: gated?.gateMeta || null,
      });
    }
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
        text: rejText || c[0] || "ภาพนี้อาจารย์อ่านไม่ถนัดครับ ถ่ายใหม่ชัด ๆ ส่งมาอีกทีนะ",
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
  /** Phase 2A: cross-account baseline exact SHA reuse (sacred_amulet only). */
  let baselineCrossAccountReuse = false;
  /** @type {import("../../stores/scanV2/globalObjectBaselines.db.js").GlobalObjectBaselineRow | null} */
  let baselineRowForPayload = null;
  /** Successful cross-account baseline reuse payload (see tryCrossAccountExactBaselineReusePhase2A). */
  let reuseHit = null;

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
    const reuseTry = await tryCrossAccountExactBaselineReusePhase2A({
      jobId,
      lineUserId,
      appUserId: String(appUserId),
      birthdate,
      imageBuffer,
      objectCheck,
    });
    if (reuseTry.ok) {
      reuseHit = reuseTry;
      baselineCrossAccountReuse = true;
      baselineRowForPayload = reuseTry.baselineRow;
      scanOut = reuseTry.scanOut;
      stableFeatureSeed = reuseTry.stableFeatureSeed ?? null;
    }
  } catch (reuseErr) {
    console.log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_FALLBACK_FULL_SCAN",
        path: "worker-scan",
        reason: "reuse_attempt_exception",
        jobIdPrefix: idPrefix8(jobId),
        lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
        message: String(reuseErr?.message || reuseErr).slice(0, 240),
        timestamp: scanV2TraceTs(),
      }),
    );
  }

  if (!baselineCrossAccountReuse) {
    try {
      const reuse2C = await tryCrossAccountPhashBaselineReusePhase2C({
        jobId,
        lineUserId,
        appUserId: String(appUserId),
        birthdate,
        imageBuffer,
        objectCheck,
      });
      if (reuse2C.ok) {
        reuseHit = reuse2C;
        baselineCrossAccountReuse = true;
        baselineRowForPayload = reuse2C.baselineRow;
        scanOut = reuse2C.scanOut;
        stableFeatureSeed = reuse2C.stableFeatureSeed ?? null;
      }
    } catch (reuse2CErr) {
      console.log(
        JSON.stringify({
          event: "CROSS_ACCOUNT_BASELINE_FALLBACK_FULL_SCAN",
          path: "worker-scan",
          reason: "phase2c_exception",
          jobIdPrefix: idPrefix8(jobId),
          lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
          message: String(reuse2CErr?.message || reuse2CErr).slice(0, 240),
          timestamp: scanV2TraceTs(),
        }),
      );
    }
  }

  /** Phase 2G: TRUE instance re-id (DINOv2 + LightGlue) — strongest path, before 2D. */
  if (!baselineCrossAccountReuse && env.VISION_REID_ENABLED) {
    try {
      const reuse2G = await tryVisionReidBaselineReuse({
        jobId,
        lineUserId,
        appUserId: String(appUserId),
        birthdate,
        imageBuffer,
        objectCheck,
        reportObjectFamily: "sacred_amulet",
        scanResultIdPrefix: idPrefix8(jobId),
      });
      if (reuse2G.ok) {
        reuseHit = reuse2G;
        baselineCrossAccountReuse = true;
        baselineRowForPayload = reuse2G.baselineRow;
        scanOut = reuse2G.scanOut;
        stableFeatureSeed = reuse2G.stableFeatureSeed ?? null;
      }
    } catch (reuse2GErr) {
      console.log(
        JSON.stringify({
          event: "CROSS_ACCOUNT_BASELINE_FALLBACK_FULL_SCAN",
          path: "worker-scan",
          reason: "phase2g_exception",
          jobIdPrefix: idPrefix8(jobId),
          lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
          message: String(reuse2GErr?.message || reuse2GErr).slice(0, 240),
          timestamp: scanV2TraceTs(),
        }),
      );
    }
  }

  if (!baselineCrossAccountReuse) {
    try {
      const reuse2D = await tryCrossAccountEmbeddingBaselineReuse({
        jobId,
        lineUserId,
        appUserId: String(appUserId),
        birthdate,
        imageBuffer,
        objectCheck,
        reportObjectFamily: "sacred_amulet",
        scanResultIdPrefix: idPrefix8(jobId),
      });
      if (reuse2D.ok) {
        reuseHit = reuse2D;
        baselineCrossAccountReuse = true;
        baselineRowForPayload = reuse2D.baselineRow;
        scanOut = reuse2D.scanOut;
        stableFeatureSeed = reuse2D.stableFeatureSeed ?? null;
      }
    } catch (reuse2DErr) {
      console.log(
        JSON.stringify({
          event: "CROSS_ACCOUNT_BASELINE_FALLBACK_FULL_SCAN",
          path: "worker-scan",
          reason: "phase2d_exception",
          jobIdPrefix: idPrefix8(jobId),
          lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
          message: String(reuse2DErr?.message || reuse2DErr).slice(0, 240),
          timestamp: scanV2TraceTs(),
        }),
      );
    }
  }

  /** Phase 1 forensics ตัดสินเฉพาะตอนกำลังจะสแกนสด — ชิ้นที่ match baseline จริงเดิม
      (2A/2C/2G) คือของจริงพิสูจน์แล้ว ไม่มีวันโดนปัด (LightGlue override) */
  if (!baselineCrossAccountReuse) {
    const forensic = await forensicPromise;
    const forensicDecision = evaluateForensicDecision(forensic);
    if (forensicDecision !== "pass") {
      let paidActive = false;
      let paidEver = false; // เคยจ่ายสักครั้ง (แม้สิทธิ์หมดอายุ) = ลูกค้าเชื่อถือได้ ไม่โดนท้า
      try {
        const paidUntil = await getUserPaidUntil(lineUserId);
        paidEver = Boolean(paidUntil);
        paidActive = Boolean(paidUntil && new Date(paidUntil).getTime() > Date.now());
      } catch {}
      console.log(
        JSON.stringify({
          event: "IMAGE_FORENSIC_DECISION",
          path: "worker-scan",
          jobIdPrefix: idPrefix8(jobId),
          lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
          decision: forensicDecision,
          paidActive,
          paidEver,
          action:
            forensicDecision === "suspect" && !paidActive ? "soft_retry" : "silent_flag",
        }),
      );
      const actOnFlagged = env.AUTH_CHALLENGE_INCLUDE_PAID || !paidActive;
      /* ท้าถ่ายสด: เฉพาะคนไม่เคยจ่ายเงินเลย (กบ 12 ก.ค. — ลูกค้าเก่าทุกคนผ่านฟรี) */
      const challengeEligible = env.AUTH_CHALLENGE_INCLUDE_PAID || !paidEver;
      let fh = 0;
      const fs = String(jobId || lineUserId);
      for (let i = 0; i < fs.length; i++) fh = (fh * 31 + fs.charCodeAt(i)) >>> 0;
      // หลักฐานแข็ง (เช่น ข้อความ/ป้ายฝังในรูป, คอลลาจกราฟิก, ขอบจอชัด) → บอกถ่ายใหม่ตรง ๆ
      if (forensicDecision === "suspect" && actOnFlagged) {
        await failJob(
          jobId,
          "image_authenticity_suspect",
          "forensic_suspect",
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
            rejectReason: "image_authenticity_suspect",
            text: FORENSIC_RETRY_TEXTS[fh % FORENSIC_RETRY_TEXTS.length],
            accessSource: job.access_source,
            appUserId,
          },
          status: "queued",
        });
        await updateScanRequestStatus(scanRequestId, "failed");
        return;
      }
      const challengeReady =
        env.AUTH_CHALLENGE_ENABLED && isChallengeWorthy(forensic) && challengeEligible;
      if (challengeReady) {
        // ท้าถ่ายสด: จำรูปนี้ไว้ รอมุมที่สองมาให้ LightGlue พิสูจน์ — ไม่กินสิทธิ์
        try {
          await setValueWithTtl(
            `scan_v2:authchal:${lineUserId}`,
            JSON.stringify({ b: upload.storage_bucket, p: upload.storage_path }),
            env.AUTH_CHALLENGE_TTL_SEC,
          );
        } catch {}
        console.log(
          JSON.stringify({
            event: "AUTH_CHALLENGE_ISSUED",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(jobId),
            lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
            forensicDecision,
          }),
        );
        await failJob(jobId, "auth_challenge_issued", "forensic_flagged", lineUserId, workerId);
        await insertOutboundMessage({
          line_user_id: lineUserId,
          kind: "scan_result",
          priority: OUTBOUND_PRIORITY.scan_result,
          related_job_id: jobId,
          payload_json: {
            error: true,
            rejectReason: "auth_challenge_issued",
            text: CHALLENGE_REQUEST_TEXTS[fh % CHALLENGE_REQUEST_TEXTS.length],
            accessSource: job.access_source,
            appUserId,
          },
          status: "queued",
        });
        await updateScanRequestStatus(scanRequestId, "failed");
        return;
      }
    }
  } else {
    // baseline matched — log override for tuning (รูปที่เคยสงสัยแต่คือชิ้นจริงเดิม)
    void forensicPromise.then((f) => {
      if (f && evaluateForensicDecision(f) !== "pass") {
        console.log(
          JSON.stringify({
            event: "IMAGE_FORENSIC_OVERRIDDEN_BY_BASELINE",
            jobIdPrefix: idPrefix8(jobId),
            lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
          }),
        );
      }
    });
  }

  /** ระบุประเภทพิมพ์ (พระสมเด็จ/พระกริ่ง/เหรียญ…): runs in parallel with the deep
      scan so it adds no latency; null = keep generic headline. */
  let amuletTypeLabelThai = "";
  if (!baselineCrossAccountReuse) {
    // คลังพิมพ์พระ (ตัวอย่างที่กบรับรอง) ชนะ LLM เสมอ — ทั้งคู่วิ่งขนานกับ deep scan
    const typeRefPromise = matchAmuletTypeByExamples({ imageBase64, jobId }).catch(() => null);
    const typeClassifyPromise = classifyAmuletType({ imageBase64 }).catch(() => null);
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
    try {
      // เจ้าของพระบอกพิมพ์เอง (จำใน redis 24 ชม.) = ความจริงสูงสุด ห้ามเถียง
      let ownerStated = null;
      try {
        const { getValue } = await import("../../redis/scanV2Redis.js");
        ownerStated = await getValue(`scan_v2:owner_type:${lineUserId}`);
      } catch {}
      const [refMatch, typed] = await Promise.all([typeRefPromise, typeClassifyPromise]);
      if (ownerStated && String(ownerStated).trim().length >= 4) {
        amuletTypeLabelThai = String(ownerStated).trim().slice(0, 30);
        // one-shot: ใช้กับสแกนถัดไปครั้งเดียว กันไปติดชิ้นอื่นของลูกค้าคนเดิม
        try {
          const { clearDedupeKey } = await import("../../redis/scanV2Redis.js");
          void clearDedupeKey(`scan_v2:owner_type:${lineUserId}`);
        } catch {}
        console.log(
          JSON.stringify({
            event: "AMULET_TYPE_FROM_OWNER",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(jobId),
            labelThai: amuletTypeLabelThai,
            timestamp: scanV2TraceTs(),
          }),
        );
      } else if (refMatch?.labelThai) {
        amuletTypeLabelThai = refMatch.labelThai;
        console.log(
          JSON.stringify({
            event: "AMULET_TYPE_FROM_REF_LIBRARY",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(jobId),
            typeKey: refMatch.typeKey,
            labelThai: refMatch.labelThai,
            similarity: Number(refMatch.similarity).toFixed(3),
            timestamp: scanV2TraceTs(),
          }),
        );
      } else if (typed?.labelThai) {
        amuletTypeLabelThai = typed.labelThai;
        console.log(
          JSON.stringify({
            event: "AMULET_TYPE_CLASSIFIED",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(jobId),
            typeKey: typed.typeKey,
            labelThai: typed.labelThai,
            confidence: Number(typed.confidence).toFixed(2),
            timestamp: scanV2TraceTs(),
          }),
        );
      }
    } catch {
      /* keep generic headline */
    }
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
      crossAccountBaselineReuse: baselineCrossAccountReuse,
      timestamp: scanV2TraceTs(),
    }),
  );

  let parsed;
  if (reuseHit) {
    parsed = reuseHit.parsed;
  } else {
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
  if (!baselineCrossAccountReuse) {
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
  } else {
    webEnrichmentSkipReason = "cross_account_baseline_reuse";
    webEnrichmentDecisiveReason = null;
  }

  /** @type {string | null} */
  let scanRequestId = null;
  /** @type {string | null} */
  let legacyScanResultId = null;

  if (reuseHit) {
    scanRequestId = reuseHit.scanRequestId;
    legacyScanResultId = reuseHit.legacyScanResultId;
  } else {
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
  }

  const scanResultIdPrefix = String(legacyScanResultId || "").slice(0, 8);

  let braceletEligibility;
  let gptSubtypeInferenceText;
  /** @type {object|null} */
  let geminiCrystalSubtypeResult = null;
  /** @type {{ lane: string, reason?: string }} */
  let strictLaneRes;

  if (reuseHit) {
    braceletEligibility = reuseHit.braceletEligibility;
    gptSubtypeInferenceText = reuseHit.gptSubtypeInferenceText;
    geminiCrystalSubtypeResult = reuseHit.geminiCrystalSubtypeResult;
    strictLaneRes = { lane: "sacred_amulet", reason: "global_baseline_reuse" };
  } else {
    braceletEligibility = await checkCrystalBraceletEligibility(
      imageBase64,
      gated,
      {
        scanResultIdPrefix,
        jobIdPrefix: idPrefix8(jobId),
      },
    );

    gptSubtypeInferenceText = buildGptCrystalSubtypeInferenceText({
      overview: "",
      mainEnergy:
        parsed?.mainEnergy && parsed.mainEnergy !== "-"
          ? String(parsed.mainEnergy).trim()
          : "",
      fitReason: "",
      pipelineObjectCategory: scanOut?.objectCategory ?? null,
    });

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

    strictLaneRes = resolveSupportedLaneStrict({
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
  }

  if (strictLaneRes.lane === "unsupported") {
    logUnsupportedObjectRejected({
      path: "worker_scan",
      userId: lineUserId,
      flowVersion: null,
      messageId: null,
      objectCheckResult: `supported_lane_unresolved:${strictLaneRes.reason}`,
    });
    // คืนสิทธิ์: แถว scan_results ถูกสร้างก่อนถึงด่าน lane — ถ้าจบที่ปัดตรงนี้ต้องลบทิ้ง
    // ไม่งั้นลูกค้าโดนหักฟรีทั้งที่ไม่ได้รายงาน (เคส Nart 15 ก.ค.: โดนหัก 1 สิทธิ์
    // จากรูปที่ถูกปัด แล้ว AI อธิบายไม่ถูกเพราะไม่มีรายงานวันนี้ให้ชี้)
    if (legacyScanResultId) {
      const refunded = await deleteScanResultForAppUser(
        legacyScanResultId,
        String(appUserId),
      ).catch(() => false);
      console.log(
        JSON.stringify({
          event: "SCAN_QUOTA_REFUND_ON_LANE_REJECT",
          path: "worker-scan",
          jobIdPrefix: idPrefix8(jobId),
          lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
          scanResultIdPrefix: String(legacyScanResultId).slice(0, 8),
          refunded,
        }),
      );
    }
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
        text: c[0] || "ภาพนี้อาจารย์อ่านไม่ถนัดครับ ถ่ายใหม่ชัด ๆ ส่งมาอีกทีนะ",
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
  /** Set when `insertScanPublicReport` runs — compare payload at `scan_results_v2` insert (same scan). */
  let generatedAtPersistedWithScanPublicReports = "";

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

    // TODO(sacred_amulet rollout): keep STABLE_FEATURE_SEED_ENABLED off-by-default; validate seed stability
    // before enabling globally — do not remove the fallback path when seed is null.
    if (
      env.STABLE_FEATURE_SEED_ENABLED &&
      objectCheck === "single_supported" &&
      !baselineRowForPayload
    ) {
      try {
        const stableEx = await extractStableVisualFeatures({
          imageBase64,
          mimeType: "image/jpeg",
          objectFamily: reportObjectFamily,
          scanResultIdPrefix: String(legacyScanResultId || "").slice(0, 8),
        });
        stableFeatureSeed = stableEx.seed;
        stableFeatureFields = stableEx.features;
        objectUnderstandingRaw = stableEx.understanding ?? null;
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

    // เกตของใช้พิธี (กบ 18 ก.ค. — ธูปหวยไม่ควรได้คะแนน): มั่นใจสูงว่าธูป/เทียน → ไม่อ่านพลัง+คืนสิทธิ์
    // ก้ำกึ่ง → ขอรูปมุมใหม่ 1 รอบ (redis กันถามวน ครั้งถัดไปใน 2 ชม ปล่อยผ่าน) — พระ/เครื่องรางผ่านปกติ
    // ข้อความหาลูกค้าไม่ฟันธงว่าเป็นอะไร (กบสั่ง) · baseline reuse เช็คจาก objectUnderstanding ใน baseline JSON
    try {
      const ritualGateSource =
        objectUnderstandingRaw ??
        (baselineRowForPayload?.objectBaselineJson &&
        typeof baselineRowForPayload.objectBaselineJson === "object" &&
        !Array.isArray(baselineRowForPayload.objectBaselineJson)
          ? /** @type {Record<string, unknown>} */ (baselineRowForPayload.objectBaselineJson)
              .objectUnderstanding ?? null
          : null);
      const ritualGate = evaluateRitualScanGate(ritualGateSource);
      let ritualAction = ritualGate.action;
      if (ritualAction === "ask_angle") {
        const askedKey = `scan_v2:ritual_angle_asked:${lineUserId}`;
        const asked = await getRedisValue(askedKey).catch(() => null);
        if (asked) {
          ritualAction = "pass"; // เคยขอมุมแล้วยังก้ำกึ่ง → ปล่อยอ่านปกติ กันถามวน
        } else {
          await setValueWithTtl(askedKey, "1", 7200).catch(() => {});
        }
      }
      if (ritualAction === "reject" || ritualAction === "ask_angle") {
        console.log(
          JSON.stringify({
            event: "RITUAL_OBJECT_SCAN_GATE",
            path: "worker-scan",
            action: ritualAction,
            reason: ritualGate.reason,
            source: objectUnderstandingRaw ? "fresh_extract" : "baseline_reuse",
            jobIdPrefix: idPrefix8(jobId),
            lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
            scanResultIdPrefix: String(legacyScanResultId || "").slice(0, 8),
          }),
        );
        if (legacyScanResultId) {
          const refunded = await deleteScanResultForAppUser(
            legacyScanResultId,
            String(appUserId),
          ).catch(() => false);
          console.log(
            JSON.stringify({
              event: "SCAN_QUOTA_REFUND_ON_RITUAL_GATE",
              path: "worker-scan",
              jobIdPrefix: idPrefix8(jobId),
              refunded,
            }),
          );
        }
        await failJob(
          jobId,
          "ritual_object_not_readable",
          ritualGate.reason,
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
            rejectReason: "ritual_object_not_readable",
            objectCheckResult: `ritual_gate:${ritualAction}`,
            text:
              ritualAction === "reject"
                ? "ชิ้นนี้อาจารย์อ่านพลังให้ไม่ได้ครับ ไม่ตัดสิทธิ์นะครับ — เปลี่ยนชิ้นอื่นส่งมาได้เลย"
                : "ชิ้นนี้ยังอ่านไม่ชัดครับ ขอรูปมุมตรง ๆ เห็นเต็มชิ้นอีกทีนะครับ หรือเปลี่ยนชิ้นอื่นก็ได้ ไม่ตัดสิทธิ์ครับ",
            accessSource: job.access_source,
            appUserId,
          },
          status: "queued",
        });
        await updateScanRequestStatus(scanRequestId, "failed");
        return;
      }
    } catch (ritualErr) {
      console.log(
        JSON.stringify({
          event: "RITUAL_OBJECT_SCAN_GATE_ERROR_IGNORED",
          path: "worker-scan",
          jobIdPrefix: idPrefix8(jobId),
          message: String(ritualErr?.message || ritualErr).slice(0, 200),
        }),
      );
    }

    const objectCheckConfidence =
      gated.gateMeta?.confidence != null &&
      Number.isFinite(Number(gated.gateMeta.confidence))
        ? Number(gated.gateMeta.confidence)
        : undefined;

    let reportPayloadBuilt;
    if (baselineRowForPayload) {
      try {
        reportPayloadBuilt = await buildReportPayloadFromGlobalBaseline({
          baselineRow: baselineRowForPayload,
          lineUserId,
          birthdate,
          publicToken: token,
          objectImageUrl,
          scannedAtIso: new Date().toISOString(),
          scanRequestId: String(scanRequestId || ""),
          legacyScanResultId: String(legacyScanResultId || ""),
        });
        console.log(
          JSON.stringify({
            event: "CROSS_ACCOUNT_BASELINE_REPORT_BUILD_OK",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(jobId),
            lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
            baselineIdPrefix: String(baselineRowForPayload.id).slice(0, 8),
            scanResultIdPrefix: String(legacyScanResultId || "").slice(0, 8),
            timestamp: scanV2TraceTs(),
          }),
        );
      } catch (blBuildErr) {
        console.log(
          JSON.stringify({
            event: "CROSS_ACCOUNT_BASELINE_REPORT_BUILD_ERROR",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(jobId),
            lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
            message: String(blBuildErr?.message || blBuildErr).slice(0, 240),
            timestamp: scanV2TraceTs(),
          }),
        );
        console.log(
          JSON.stringify({
            event: "CROSS_ACCOUNT_BASELINE_FALLBACK_FULL_SCAN",
            path: "worker-scan",
            reason: "report_build_from_baseline_failed",
            jobIdPrefix: idPrefix8(jobId),
            timestamp: scanV2TraceTs(),
          }),
        );
        reportPayloadBuilt = await buildReportPayloadFromScan({
          resultText,
          scanResultId: legacyScanResultId,
          scanRequestId,
          lineUserId,
          birthdateUsed: birthdate,
          publicToken: token,
          modelLabel: baselineCrossAccountReuse
            ? "global_object_baseline_reuse"
            : scanFromCache
              ? "persistent_cache"
              : "gpt-4.1-mini",
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
          scoreImageDHash: imageDHash,
          stableFeatureFields,
          objectUnderstandingRaw,
          amuletTypeLabelThai,
        });
      }
    } else {
      reportPayloadBuilt = await buildReportPayloadFromScan({
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
      scoreImageDHash: imageDHash,
      stableFeatureFields,
      objectUnderstandingRaw,
      amuletTypeLabelThai,
    });
    }

    const builtGenAt = String(
      reportPayloadBuilt &&
        typeof reportPayloadBuilt === "object" &&
        "generatedAt" in reportPayloadBuilt
        ? /** @type {{ generatedAt?: unknown }} */ (reportPayloadBuilt).generatedAt ??
            ""
        : "",
    ).trim();
    const builtGenMs = Date.parse(builtGenAt);
    console.log(
      JSON.stringify({
        event: "REPORT_PAYLOAD_BUILT_META_TIME",
        path: "worker-scan",
        worker: "processScanJob",
        strictSupportedLane,
        generatedAt: builtGenAt || null,
        generatedAtFreshMs:
          Number.isFinite(builtGenMs) && builtGenMs <= Date.now()
            ? Math.max(0, Date.now() - builtGenMs)
            : null,
        scanResultIdPrefix: String(legacyScanResultId || "").slice(0, 8),
        publicTokenPrefix: `${String(token || "").slice(0, 12)}…`,
      }),
    );

    let reportPayload = reportPayloadBuilt;
    try {
      const merged = mergeExternalHintsIntoWordingContext(
        reportPayloadBuilt,
        externalObjectHints,
      );
      reportPayload = merged.payload;
      const postMergeGen = String(
        reportPayload &&
          typeof reportPayload === "object" &&
          "generatedAt" in reportPayload
          ? /** @type {{ generatedAt?: unknown }} */ (reportPayload).generatedAt ??
              ""
          : "",
      ).trim();
      if (postMergeGen && postMergeGen !== builtGenAt) {
        console.warn(
          JSON.stringify({
            event: "REPORT_PAYLOAD_GENERATED_AT_CHANGED_BY_MERGE",
            path: "worker-scan",
            mergeMode: merged.mergeMode,
            before: builtGenAt,
            after: postMergeGen,
          }),
        );
      }
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

    generatedAtPersistedWithScanPublicReports = String(
      reportPayload &&
        typeof reportPayload === "object" &&
        "generatedAt" in reportPayload
        ? /** @type {{ generatedAt?: unknown }} */ (reportPayload).generatedAt ?? ""
        : "",
    ).trim();
    console.log(
      JSON.stringify({
        event: "REPORT_PAYLOAD_PRE_INSERT_SCAN_PUBLIC_REPORTS",
        path: "worker-scan",
        generatedAt: generatedAtPersistedWithScanPublicReports || null,
        sameObjectAsBuilt: reportPayload === reportPayloadBuilt,
        generatedAtSameAsBuild:
          Boolean(builtGenAt) &&
          Boolean(generatedAtPersistedWithScanPublicReports) &&
          generatedAtPersistedWithScanPublicReports === builtGenAt,
        scanResultIdPrefix: String(legacyScanResultId || "").slice(0, 8),
      }),
    );

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
    const v2PayloadGenAt = String(
      reportPayloadForReply &&
        typeof reportPayloadForReply === "object" &&
        "generatedAt" in reportPayloadForReply
        ? /** @type {{ generatedAt?: unknown }} */ (reportPayloadForReply)
            .generatedAt ?? ""
        : "",
    ).trim();
    console.log(
      JSON.stringify({
        event: "REPORT_PAYLOAD_PRE_INSERT_SCAN_RESULTS_V2",
        path: "worker-scan",
        generatedAt: v2PayloadGenAt || null,
        sameGeneratedAtAsPublicReportsInsert:
          Boolean(generatedAtPersistedWithScanPublicReports) &&
          Boolean(v2PayloadGenAt) &&
          v2PayloadGenAt === generatedAtPersistedWithScanPublicReports,
        jobIdPrefix: idPrefix8(jobId),
      }),
    );

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
      from_cache: baselineCrossAccountReuse ? false : scanFromCache,
      model_name: baselineCrossAccountReuse
        ? "global_object_baseline_reuse"
        : scanFromCache
          ? "persistent_cache"
          : "gpt-4.1-mini",
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

  void maybePersistGlobalObjectBaselineAfterScanV2({
    jobId,
    lineUserId,
    imageBuffer,
    imageDHash: imageDHash || null,
    uploadId: String(upload?.id || "").trim(),
    strictSupportedLane,
    reportPayload: reportPayloadForReply,
    scanResultV2Id: String(scanResultV2Id),
    stableFeatureSeed,
    scanOut: scanOut
      ? {
          objectCategory: scanOut.objectCategory ?? null,
          dominantColorSlug: scanOut.dominantColorSlug ?? null,
        }
      : null,
    catSig,
    reportObjectFamily,
  }).catch((baselinePersistErr) => {
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_PERSIST_ERROR",
        path: "worker-scan",
        scope: "process_scan_job_unhandled_reject",
        jobIdPrefix: idPrefix8(jobId),
        lineUserIdPrefix: lineUserIdPrefix8(lineUserId),
        message: String(baselinePersistErr?.message || baselinePersistErr).slice(0, 240),
        timestamp: scanV2TraceTs(),
      }),
    );
  });

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

  clearRejectionCount(lineUserId); // สแกนสำเร็จ = ล้างสตรีคโดนปัด

  // เสียงอาจารย์แนบท้าย report (best-effort, timeout ในตัว — null = ส่งแบบเดิม)
  const voiceNote = await maybeBuildScanVoiceNote({
    lineUserId,
    scanResultV2Id: String(scanResultV2Id),
    lane: strictSupportedLane,
    dedupHit: wasExactDup,
    lineSummary: lineSummaryForOutbound,
    reportPayload: reportPayloadForReply,
  });

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
        skipQuotaDecrement: wasExactDup,
        flex,
        text: lineDeliveryText,
        reportUrl,
        voice: voiceNote,
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

  const durationMs = Math.max(0, Date.now() - workerTurnStartMs);
  const safeScore =
    typeof reportPayloadForReply?.summary?.score === "number"
      ? reportPayloadForReply.summary.score
      : null;
  emitScanLifecycleEvents({
    lineUserId,
    appUserId,
    scanId: jobId,
    reportId: scanResultV2Id,
    publicToken,
    reportUrl,
    objectType: reportObjectFamily || scanOut?.objectCategory || null,
    score: safeScore,
    scoreSummary: safeScore,
    scanMode: lineFinalMode,
    durationMs,
    createdAt: new Date().toISOString(),
  });

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
