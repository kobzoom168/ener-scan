/**
 * Phase 2E: register a freshly recognized angle into its object group, then (re)lock the group's
 * consolidated six-axis scores. Best-effort and side-effect only — never throws into the scan path.
 */
import crypto from "crypto";
import { env } from "../../config/env.js";
import {
  appendObjectGroupAngleView,
  listObjectGroupViewAxisScores,
  lockObjectGroupEnrollment,
} from "../../stores/scanV2/globalObjectBaselines.db.js";
import { planEnrollmentUpdate } from "../../amulet/objectEnrollment.util.js";
import { scanV2TraceTs, idPrefix8 } from "../../utils/scanV2Trace.util.js";

/** Skip appending when the new angle is nearly identical to the matched one (avoids row bloat). */
const ENROLLMENT_DISTINCT_MAX_SIMILARITY = 0.985;

/**
 * @param {object} p
 * @param {string} p.jobId
 * @param {import("../../stores/scanV2/globalObjectBaselines.db.js").GlobalObjectBaselineRow} p.matchedRow
 * @param {Buffer} p.imageBuffer
 * @param {string|null} [p.imagePhash]
 * @param {number[]|null} [p.embedding]
 * @param {string|null} [p.embeddingModel]
 * @param {string|null} [p.embeddingVersion]
 * @param {string|null} [p.embeddingDescriptor]
 * @param {number} p.similarity
 * @param {string|null} [p.sourceScanResultV2Id]
 * @returns {Promise<{ enrolled: boolean, viewCount?: number }>}
 */
export async function enrollRecognizedAngle(p) {
  try {
    if (!env.OBJECT_ENROLLMENT_ENABLED) return { enrolled: false };
    const groupId = String(p.matchedRow?.objectGroupId || p.matchedRow?.id || "").trim();
    if (!groupId) return { enrolled: false };
    if (!Buffer.isBuffer(p.imageBuffer) || p.imageBuffer.length === 0) return { enrolled: false };

    // Near-identical re-upload: nothing new to enroll, just keep the existing lock.
    if (Number(p.similarity) >= ENROLLMENT_DISTINCT_MAX_SIMILARITY) {
      return { enrolled: Boolean(p.matchedRow?.isEnrolled) };
    }

    const sha = crypto.createHash("sha256").update(p.imageBuffer).digest("hex");

    const existingViews = await listObjectGroupViewAxisScores(groupId);

    /** New angle reuses the group's existing axis scores (recognition adds coverage, not new scoring). */
    const matchedAxis =
      p.matchedRow?.axisScoresJson && typeof p.matchedRow.axisScoresJson === "object"
        ? /** @type {Record<string, number>} */ (p.matchedRow.axisScoresJson)
        : {};

    await appendObjectGroupAngleView({
      objectGroupId: groupId,
      imageSha256: sha,
      imagePhash: p.imagePhash ?? null,
      imageEmbedding: p.embedding ?? null,
      embeddingModel: p.embeddingModel ?? null,
      embeddingVersion: p.embeddingVersion ?? null,
      embeddingDescriptor: p.embeddingDescriptor ?? null,
      lane: "sacred_amulet",
      objectFamily: "sacred_amulet",
      objectBaselineJson:
        p.matchedRow?.objectBaselineJson && typeof p.matchedRow.objectBaselineJson === "object"
          ? /** @type {Record<string, unknown>} */ (p.matchedRow.objectBaselineJson)
          : {},
      axisScoresJson: matchedAxis,
      peakPowerKey: p.matchedRow?.peakPowerKey ?? null,
      sourceScanResultV2Id: p.sourceScanResultV2Id ?? null,
    });

    const plan = planEnrollmentUpdate({
      priorViewCount: Number(p.matchedRow?.viewCount || existingViews.length || 1),
      existingViews,
      newView: matchedAxis,
    });

    await lockObjectGroupEnrollment({
      objectGroupId: groupId,
      lockedAxisScores: plan.lockedAxisScores,
      peakPowerKey: plan.peakPowerKey,
      viewCount: plan.viewCount,
    });

    console.log(
      JSON.stringify({
        event: "OBJECT_ENROLLMENT_VIEW_ADDED",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId),
        objectGroupIdPrefix: groupId.slice(0, 8),
        viewCount: plan.viewCount,
        isEnrolled: plan.isEnrolled,
        similarity: Number(p.similarity).toFixed(4),
        timestamp: scanV2TraceTs(),
      }),
    );

    return { enrolled: plan.isEnrolled, viewCount: plan.viewCount };
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "OBJECT_ENROLLMENT_SKIP",
        path: "worker-scan",
        reason: "exception",
        message: String(e?.message || e).slice(0, 200),
        timestamp: scanV2TraceTs(),
      }),
    );
    return { enrolled: false };
  }
}
