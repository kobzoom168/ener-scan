/**
 * Phase 2G: TRUE instance-level re-identification.
 *
 * Rides the proven Phase 2D reuse machinery (tryCrossAccountEmbeddingBaselineReuse)
 * via dependency injection, swapping in:
 *   recall   → DINOv2 image embedding (sidecar) + pgvector NN over visual_embedding
 *   verify   → SuperPoint/LightGlue RANSAC inliers (unique-imperfection geometry);
 *              borderline band falls back to the forensic LLM verifier
 *
 * Decision matrix (per expert consensus):
 *   inliers ≥ VISION_REID_INLIERS_ACCEPT           → same piece, reuse baseline
 *   VISION_REID_INLIERS_ARBITER_MIN ≤ inliers < …  → LLM forensic arbiter, conf ≥ 0.9
 *   below                                          → different piece
 */
import { env } from "../../config/env.js";
import { tryCrossAccountEmbeddingBaselineReuse } from "./tryCrossAccountEmbeddingBaselineReuse.service.js";
import { visionEmbedImage, visionMatchPair } from "./visionSidecar.client.js";
import { matchGlobalObjectBaselinesByVisualEmbedding, updateGlobalObjectBaselineVisualEmbedding } from "../../stores/scanV2/globalObjectBaselines.db.js";
import { verifySameObject } from "./objectSameIdentityVerifier.service.js";
import { enrollRecognizedAngle } from "./enrollObjectAngle.service.js";
import { readScanImageFromStorage } from "../../storage/scanUploadStorage.js";
import { scanV2TraceTs, idPrefix8, lineUserIdPrefix8 } from "../../utils/scanV2Trace.util.js";

/** Fetch a baseline thumbnail from object storage as base64 (null on failure). */
async function thumbnailToBase64(thumbnailPath) {
  const path = String(thumbnailPath || "").trim();
  if (!path) return null;
  try {
    const buf = await readScanImageFromStorage(env.SCAN_V2_UPLOAD_BUCKET, path);
    return Buffer.isBuffer(buf) && buf.length ? buf.toString("base64") : null;
  } catch {
    return null;
  }
}

/**
 * Same signature/return contract as Phase 2A/2C/2D try* functions.
 * @param {import("./tryCrossAccountEmbeddingBaselineReuse.service.js").TryCrossAccountEmbeddingCtx} ctx
 */
export async function tryVisionReidBaselineReuse(ctx) {
  if (!env.VISION_REID_ENABLED) return { ok: false };

  const log = console.log;
  const acceptInliers = env.VISION_REID_INLIERS_ACCEPT;
  const arbiterMin = env.VISION_REID_INLIERS_ARBITER_MIN;

  /** DINOv2 recall embedding via sidecar — mirrors computeObjectEmbedding's shape. */
  const computeObjectEmbedding = async ({ imageBase64 }) => {
    const emb = await visionEmbedImage(imageBase64);
    if (!emb) return { embedding: null, model: null, version: null, descriptor: null };
    return {
      embedding: emb.embedding,
      model: emb.model || "dinov2_vits14",
      version: "vr1",
      descriptor: null,
    };
  };

  /** pgvector NN over visual_embedding (384-d). */
  const matchByVisual = (embedding, opts = {}) =>
    matchGlobalObjectBaselinesByVisualEmbedding(embedding, {
      ...opts,
      minSimilarity: env.VISION_REID_RECALL_MIN_SIM,
      matchCount: env.VISION_REID_MAX_CANDIDATES,
    });

  /**
   * Geometric verify: LightGlue inliers decide; borderline band → forensic LLM.
   * Matches verifySameObject's contract ({same, confidence, reason}).
   */
  const verifyGeometric = async ({ newImageBase64, candidateImageUrl, objectFamily }) => {
    // candidateImageUrl here is actually the thumbnail PATH resolved to b64 below
    const candB64 = await thumbnailToBase64(candidateImageUrl);
    if (!candB64) return { same: false, confidence: 0, reason: "no_candidate_thumbnail", ok: false };

    const m = await visionMatchPair(candB64, newImageBase64);
    if (!m) return { same: false, confidence: 0, reason: "sidecar_match_failed", ok: false };

    log(
      JSON.stringify({
        event: "VISION_REID_LIGHTGLUE_RESULT",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(ctx.jobId),
        inliers: m.inliers,
        rawMatches: m.raw_matches,
        acceptInliers,
        arbiterMin,
        timestamp: scanV2TraceTs(),
      }),
    );

    if (m.inliers >= acceptInliers) {
      return {
        same: true,
        confidence: Math.min(1, m.inliers / 40),
        reason: `lightglue_inliers=${m.inliers}`,
        ok: true,
      };
    }
    if (m.inliers >= arbiterMin) {
      // borderline → forensic LLM arbiter on the ORIGINAL images (data URLs)
      const verdict = await verifySameObject({
        newImageBase64,
        newImageMimeType: "image/jpeg",
        candidateImageUrl: `data:image/jpeg;base64,${candB64}`,
        objectFamily,
      });
      if (verdict.same === true && Number(verdict.confidence) >= 0.9) {
        return {
          same: true,
          confidence: Number(verdict.confidence),
          reason: `arbiter_confirmed inliers=${m.inliers}; ${String(verdict.reason || "").slice(0, 80)}`,
          ok: true,
        };
      }
      return {
        same: false,
        confidence: Number(verdict.confidence) || 0,
        reason: `arbiter_rejected inliers=${m.inliers}`,
        ok: true,
      };
    }
    return { same: false, confidence: 0, reason: `inliers_too_low=${m.inliers}`, ok: true };
  };

  /**
   * Angle enrollment: reuse the Phase 2E enroll but never push the 384-d vector
   * into the legacy 1536-d embedding column (dim mismatch) — visual embedding
   * for the new angle is backfilled separately by maybePersist path.
   */
  const enrollWithoutLegacyEmbedding = (p) =>
    enrollRecognizedAngle({ ...p, embedding: null, embeddingModel: null, embeddingVersion: null, embeddingDescriptor: null });

  try {
    const res = await tryCrossAccountEmbeddingBaselineReuse(ctx, {
      computeObjectEmbedding,
      matchGlobalObjectBaselinesByEmbedding: matchByVisual,
      verifySameObject: verifyGeometric,
      // hand the raw thumbnail PATH through so verifyGeometric can read storage directly
      resolveCandidateImageUrl: (thumbnailPath) => String(thumbnailPath || ""),
      enrollRecognizedAngle: enrollWithoutLegacyEmbedding,
      log,
    });
    if (res.ok) {
      return { ...res, reuseMode: "vision_reid" };
    }
    return res;
  } catch (e) {
    log(
      JSON.stringify({
        event: "VISION_REID_REUSE_SKIPPED",
        path: "worker-scan",
        reason: "exception",
        message: String(e?.message || e).slice(0, 200),
        jobIdPrefix: idPrefix8(ctx.jobId),
        lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return { ok: false };
  }
}

/**
 * Backfill the DINOv2 visual embedding onto a freshly persisted baseline row
 * (fire-and-forget from maybePersistGlobalObjectBaseline). Uses the stored
 * thumbnail so the embedding matches what future candidates are compared to.
 * @param {string} baselineId
 * @param {string} thumbnailPath
 */
export async function backfillVisualEmbedding(baselineId, thumbnailPath) {
  if (!env.VISION_REID_ENABLED) return;
  try {
    const b64 = await thumbnailToBase64(thumbnailPath);
    if (!b64) return;
    const emb = await visionEmbedImage(b64);
    if (!emb) return;
    await updateGlobalObjectBaselineVisualEmbedding(baselineId, emb.embedding, emb.model);
    console.log(
      JSON.stringify({
        event: "VISION_REID_EMBEDDING_BACKFILLED",
        path: "worker-scan",
        baselineIdPrefix: String(baselineId).slice(0, 8),
        timestamp: scanV2TraceTs(),
      }),
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "VISION_REID_EMBEDDING_BACKFILL_FAIL",
        baselineIdPrefix: String(baselineId).slice(0, 8),
        message: String(e?.message || e).slice(0, 160),
        timestamp: scanV2TraceTs(),
      }),
    );
  }
}
