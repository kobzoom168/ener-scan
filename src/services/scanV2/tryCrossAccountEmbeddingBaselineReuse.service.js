/**
 * Phase 2D: semantic embedding nearest-neighbor baseline reuse (sacred_amulet only).
 *
 * The most angle-robust reuse path: recognizes the SAME physical object across different camera
 * angles/lighting via a cosine nearest-neighbor over object embeddings, then reuses the stored
 * baseline (axis scores) verbatim — so a different-angle rescan cannot drift the 6-axis graph.
 * Doubles as anti-gaming: re-shooting an object at a new angle snaps back to its registered baseline.
 */
import { env } from "../../config/env.js";
import {
  findGlobalObjectBaselineByIdWithGroup,
  matchGlobalObjectBaselinesByEmbedding,
  listRecentGlobalObjectBaselines,
  markGlobalObjectBaselineReused,
} from "../../stores/scanV2/globalObjectBaselines.db.js";
import { computeObjectEmbedding } from "../objectEmbedding.service.js";
import { verifySameObject } from "./objectSameIdentityVerifier.service.js";
import { mergeVerifierCandidates } from "./objectSameIdentityVerifier.util.js";
import { enrollRecognizedAngle } from "./enrollObjectAngle.service.js";
import { computeImageDHash } from "../imageDedup/imagePhash.util.js";
import { createScanUploadBucketSignedUrl } from "../../utils/storage/scanUploadStorageSignedUrl.util.js";
import { createScanRequest, updateScanRequestStatus } from "../../stores/scanRequests.db.js";
import { createScanResult } from "../../stores/scanResults.db.js";
import { parseScanResultForHistory } from "../history/history.parser.js";
import { mapObjectCategoryToPipelineSignals } from "../../utils/reports/scanPipelineReportSignals.util.js";
import { validateObjectBaselineJsonForReuse } from "./objectBaselineExtract.util.js";
import { scanV2TraceTs, idPrefix8, lineUserIdPrefix8 } from "../../utils/scanV2Trace.util.js";

const BASELINE_SCHEMA_REUSE_MAX = 1;

/**
 * @typedef {Object} TryCrossAccountEmbeddingCtx
 * @property {string} jobId
 * @property {string} lineUserId
 * @property {string} appUserId
 * @property {string} birthdate
 * @property {Buffer} imageBuffer
 * @property {string} objectCheck
 * @property {string} [reportObjectFamily]
 * @property {string} [scanResultIdPrefix]
 */

/**
 * @param {TryCrossAccountEmbeddingCtx} ctx
 * @param {object} [deps]
 * @returns {Promise<{ ok: true, [k: string]: unknown } | { ok: false }>}
 */
export async function tryCrossAccountEmbeddingBaselineReuse(ctx, deps = {}) {
  const computeEmbedding = deps.computeObjectEmbedding || computeObjectEmbedding;
  const matchByEmbedding = deps.matchGlobalObjectBaselinesByEmbedding || matchGlobalObjectBaselinesByEmbedding;
  const findById = deps.findGlobalObjectBaselineByIdWithGroup || findGlobalObjectBaselineByIdWithGroup;
  const verifySame = deps.verifySameObject || verifySameObject;
  const listRecent = deps.listRecentGlobalObjectBaselines || listRecentGlobalObjectBaselines;
  const resolveCandidateImageUrl =
    deps.resolveCandidateImageUrl || ((path) => createScanUploadBucketSignedUrl(path, 600));
  const enrollAngle = deps.enrollRecognizedAngle || enrollRecognizedAngle;
  const createRequest = deps.createScanRequest || createScanRequest;
  const createLegacyResult = deps.createScanResult || createScanResult;
  const updateRequestStatus = deps.updateScanRequestStatus || updateScanRequestStatus;
  const markReused = deps.markGlobalObjectBaselineReused || markGlobalObjectBaselineReused;
  const log = deps.log || console.log;

  try {
    if (!env.CROSS_ACCOUNT_BASELINE_EMBEDDING_REUSE_ENABLED) return { ok: false };
    if (String(ctx.objectCheck || "") !== "single_supported") return { ok: false };
    if (!Buffer.isBuffer(ctx.imageBuffer) || ctx.imageBuffer.length === 0) return { ok: false };

    const embResult = await computeEmbedding({
      imageBase64: ctx.imageBuffer.toString("base64"),
      mimeType: "image/jpeg",
      objectFamily: ctx.reportObjectFamily || "sacred_amulet",
      scanResultIdPrefix: ctx.scanResultIdPrefix || "",
    });
    const { embedding } = embResult;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      log(
        JSON.stringify({
          event: "CROSS_ACCOUNT_BASELINE_EMBEDDING_REUSE_SKIPPED",
          path: "worker-scan",
          reason: "no_embedding",
          jobIdPrefix: idPrefix8(ctx.jobId),
          lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
          timestamp: scanV2TraceTs(),
        }),
      );
      return { ok: false };
    }

    /**
     * When the verifier agent is on, embedding NN is only a coarse RECALL filter (loose threshold,
     * inspect up to N candidates) and the vision agent makes the final same-object call. Otherwise
     * fall back to similarity-only auto-accept at the strict threshold.
     */
    const verifierEnabled = env.OBJECT_SAME_IDENTITY_VERIFIER_ENABLED === true;
    const autoAcceptMin = env.CROSS_ACCOUNT_BASELINE_EMBEDDING_MIN_SIMILARITY;
    const recallMin = verifierEnabled
      ? Math.min(autoAcceptMin, env.CROSS_ACCOUNT_BASELINE_EMBEDDING_RECALL_MIN_SIMILARITY)
      : autoAcceptMin;
    const matchCount = verifierEnabled
      ? env.OBJECT_SAME_IDENTITY_VERIFIER_MAX_CANDIDATES
      : 5;

    const embeddingCandidates = await matchByEmbedding(embedding, {
      lane: "sacred_amulet",
      objectFamily: "sacred_amulet",
      minSimilarity: recallMin,
      matchCount,
    });

    /** @type {Record<string, unknown> & { id: string, similarity: number } | null} */
    let candidate = null;
    /** @type {{ same: boolean, confidence: number, reason: string } | null} */
    let verifierVerdict = null;

    if (!verifierEnabled) {
      if (!Array.isArray(embeddingCandidates) || !embeddingCandidates.length) {
        log(
          JSON.stringify({
            event: "CROSS_ACCOUNT_BASELINE_EMBEDDING_REUSE_SKIPPED",
            path: "worker-scan",
            reason: "no_candidates",
            jobIdPrefix: idPrefix8(ctx.jobId),
            lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
            minSimilarity: recallMin,
            verifierEnabled,
            timestamp: scanV2TraceTs(),
          }),
        );
        return { ok: false };
      }
      candidate = embeddingCandidates[0];
    } else {
      /**
       * Recency safety-net: the trait-descriptor embedding drifts under crop/zoom and can fail to
       * retrieve the true object, so also hand the agent the most recently registered baselines.
       */
      let recentCandidates = [];
      const recentLimit = env.OBJECT_SAME_IDENTITY_VERIFIER_RECENT_CANDIDATES;
      if (recentLimit > 0) {
        try {
          recentCandidates = await listRecent({
            lane: "sacred_amulet",
            objectFamily: "sacred_amulet",
            limit: recentLimit,
          });
        } catch {
          recentCandidates = [];
        }
      }

      const pool = mergeVerifierCandidates(
        Array.isArray(embeddingCandidates) ? embeddingCandidates : [],
        recentCandidates,
        env.OBJECT_SAME_IDENTITY_VERIFIER_MAX_CANDIDATES,
      );

      if (!pool.length) {
        log(
          JSON.stringify({
            event: "CROSS_ACCOUNT_BASELINE_EMBEDDING_REUSE_SKIPPED",
            path: "worker-scan",
            reason: "no_candidates",
            jobIdPrefix: idPrefix8(ctx.jobId),
            lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
            minSimilarity: recallMin,
            verifierEnabled,
            recentLimit,
            timestamp: scanV2TraceTs(),
          }),
        );
        return { ok: false };
      }

      const newImageBase64 = ctx.imageBuffer.toString("base64");
      const minConfidence = env.OBJECT_SAME_IDENTITY_VERIFIER_MIN_CONFIDENCE;
      for (const cand of pool) {
        let candUrl = "";
        try {
          candUrl = String((await resolveCandidateImageUrl(cand.thumbnailPath)) || "").trim();
        } catch {
          candUrl = "";
        }
        if (!candUrl) continue;

        const verdict = await verifySame({
          newImageBase64,
          newImageMimeType: "image/jpeg",
          candidateImageUrl: candUrl,
          objectFamily: "sacred_amulet",
        });

        log(
          JSON.stringify({
            event: "OBJECT_SAME_IDENTITY_VERIFIER_RESULT",
            path: "worker-scan",
            jobIdPrefix: idPrefix8(ctx.jobId),
            candidateIdPrefix: String(cand.id).slice(0, 8),
            recallSource: String(cand.recallSource || "embedding"),
            similarity: Number(cand.similarity).toFixed(4),
            same: verdict.same === true,
            confidence: Number(verdict.confidence).toFixed(3),
            reason: String(verdict.reason || "").slice(0, 120),
            timestamp: scanV2TraceTs(),
          }),
        );

        if (verdict.same === true && Number(verdict.confidence) >= minConfidence) {
          candidate = cand;
          verifierVerdict = { same: true, confidence: Number(verdict.confidence), reason: verdict.reason };
          break;
        }
      }

      if (!candidate) {
        log(
          JSON.stringify({
            event: "CROSS_ACCOUNT_BASELINE_EMBEDDING_REUSE_SKIPPED",
            path: "worker-scan",
            reason: "verifier_rejected_all",
            jobIdPrefix: idPrefix8(ctx.jobId),
            lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
            candidateCount: pool.length,
            minConfidence,
            timestamp: scanV2TraceTs(),
          }),
        );
        return { ok: false };
      }
    }

    const baselineRow = await findById(candidate.id);
    if (!baselineRow) return { ok: false };
    if (String(baselineRow.lane || "").trim().toLowerCase() !== "sacred_amulet") return { ok: false };
    if (String(baselineRow.objectFamily || "").trim().toLowerCase() !== "sacred_amulet") return { ok: false };
    if (
      !Number.isFinite(Number(baselineRow.baselineSchemaVersion)) ||
      baselineRow.baselineSchemaVersion < 1 ||
      baselineRow.baselineSchemaVersion > BASELINE_SCHEMA_REUSE_MAX
    ) {
      return { ok: false };
    }
    if (!validateObjectBaselineJsonForReuse(baselineRow.objectBaselineJson).ok) return { ok: false };

    log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_EMBEDDING_REUSE_HIT",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(ctx.jobId),
        lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
        similarity: Number(candidate.similarity).toFixed(4),
        verifierConfidence: verifierVerdict ? Number(verifierVerdict.confidence).toFixed(3) : null,
        baselineIdPrefix: String(baselineRow.id).slice(0, 8),
        peakPowerKey: baselineRow.peakPowerKey || null,
        timestamp: scanV2TraceTs(),
      }),
    );

    void markReused(baselineRow.id);

    /** Phase 2E: register this angle into the object's group + (re)lock consolidated scores. */
    let imagePhashForEnroll = null;
    try {
      imagePhashForEnroll = await computeImageDHash(ctx.imageBuffer);
    } catch {
      /* non-fatal */
    }
    void enrollAngle({
      jobId: ctx.jobId,
      matchedRow: baselineRow,
      imageBuffer: ctx.imageBuffer,
      imagePhash: imagePhashForEnroll,
      embedding,
      embeddingModel: embResult.model,
      embeddingVersion: embResult.version,
      embeddingDescriptor: embResult.descriptor,
      similarity: Number(candidate.similarity),
      sourceScanResultV2Id: null,
    });

    /** @type {string|null} */
    let scanRequestId = null;
    try {
      scanRequestId = await createRequest({
        appUserId: ctx.appUserId,
        flowVersion: null,
        scanJobId: String(ctx.jobId),
        birthdateUsed: ctx.birthdate,
        usedSavedBirthdate: true,
        requestSource: "scan_v2_worker_baseline_reuse",
      });
    } catch {
      return { ok: false };
    }

    const resultText = [
      "[GLOBAL_OBJECT_BASELINE_REUSE]",
      `baseline_id=${String(baselineRow.id)}`,
      `peak_power_key=${String(baselineRow.peakPowerKey || "").trim()}`,
      "",
      "พลังหลัก:",
      "พลังปกป้อง",
    ].join("\n");

    let parsed = parseScanResultForHistory(resultText) || {
      energyScore: null,
      mainEnergy: null,
      compatibility: null,
    };

    /** @type {string|null} */
    let legacyScanResultId = null;
    try {
      legacyScanResultId = await createLegacyResult({
        scanRequestId,
        appUserId: ctx.appUserId,
        resultText,
        resultSummary: null,
        energyScore: parsed.energyScore,
        mainEnergy: parsed.mainEnergy,
        compatibility: parsed.compatibility,
        modelName: "global_object_baseline_reuse",
        promptVersion: "baseline_reuse_v1",
        responseTimeMs: 0,
        fromCache: false,
        qualityAnalytics: null,
      });
    } catch {
      await updateRequestStatus(scanRequestId, "failed");
      return { ok: false };
    }

    const ob = baselineRow.objectBaselineJson;
    const objectCategory =
      ob && typeof ob === "object" && !Array.isArray(ob) && "objectCategory" in ob
        ? String(/** @type {{ objectCategory?: unknown }} */ (ob).objectCategory || "").trim() || null
        : null;
    const vis =
      ob && typeof ob === "object" && !Array.isArray(ob)
        ? /** @type {Record<string, unknown>} */ (ob).visual
        : null;
    const dominantColorSlug =
      vis && typeof vis === "object" && vis !== null && "dominantColor" in vis
        ? String(/** @type {{ dominantColor?: unknown }} */ (vis).dominantColor || "").trim() || null
        : null;

    const scanOut = {
      resultText,
      fromCache: false,
      objectCategory,
      dominantColorSlug,
      dominantColorSource: "vision_v1",
      objectCategorySource: "deep_scan",
      qualityAnalytics: null,
    };

    const catSig = mapObjectCategoryToPipelineSignals(objectCategory);

    parsed = parseScanResultForHistory(resultText) || parsed;

    return {
      ok: true,
      baselineRow,
      scanRequestId: String(scanRequestId),
      legacyScanResultId: String(legacyScanResultId),
      resultText,
      parsed,
      scanOut,
      catSig,
      strictSupportedLane: /** @type {const} */ ("sacred_amulet"),
      reportObjectFamily: "sacred_amulet",
      reportShapeFamily: catSig.shapeFamily,
      braceletEligibility: {
        eligible: false,
        status: "not_crystal",
        objectFamilyTruth: null,
        shapeFamilyTruth: null,
        familyCheck: null,
        formCheck: null,
        shapeFamilyForcedToBracelet: false,
        baseGateResult: ctx.objectCheck,
      },
      geminiCrystalSubtypeResult: null,
      gptSubtypeInferenceText: "",
      scanFromCache: false,
      stableFeatureSeed: baselineRow.stableFeatureSeed,
      baselineCrossAccountReuse: /** @type {const} */ (true),
      reuseMode: verifierVerdict ? /** @type {const} */ ("embedding_verified") : /** @type {const} */ ("embedding"),
      embeddingSimilarity: Number(candidate.similarity),
      verifierConfidence: verifierVerdict ? Number(verifierVerdict.confidence) : null,
    };
  } catch (e) {
    log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_EMBEDDING_REUSE_SKIPPED",
        path: "worker-scan",
        reason: "exception",
        message: String(e?.message || e).slice(0, 240),
        jobIdPrefix: idPrefix8(ctx.jobId),
        lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return { ok: false };
  }
}
