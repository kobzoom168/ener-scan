import crypto from "crypto";
import { env } from "../../config/env.js";
import { getScanUploadById } from "../../stores/scanV2/scanUploads.db.js";
import { upsertGlobalObjectBaselineFromScanResult } from "../../stores/scanV2/globalObjectBaselines.db.js";
import { SCAN_CACHE_PROMPT_VERSION } from "../../stores/scanResultCache.db.js";
import { AMULET_SCORING_MODE } from "../../amulet/amuletScores.util.js";
import { scanV2TraceTs, idPrefix8, lineUserIdPrefix8 } from "../../utils/scanV2Trace.util.js";
import { extractObjectBaselineFromReportPayload } from "./objectBaselineExtract.util.js";

/**
 * Phase 1A: persist global object baseline after `scan_results_v2` insert (no reuse).
 *
 * @param {object} p
 * @param {string} p.jobId
 * @param {string} p.lineUserId
 * @param {Buffer} p.imageBuffer
 * @param {string|null} p.imageDHash
 * @param {string} p.uploadId
 * @param {"moldavite"|"sacred_amulet"|"crystal_bracelet"} p.strictSupportedLane
 * @param {unknown} p.reportPayload
 * @param {string} p.scanResultV2Id
 * @param {string|null} [p.stableFeatureSeed]
 * @param {{ objectCategory?: string|null, dominantColorSlug?: string|null }|null} [p.scanOut]
 * @param {{ materialFamily?: string, shapeFamily?: string }|null} [p.catSig]
 * @param {string} p.reportObjectFamily
 * @returns {Promise<void>}
 */
export async function maybePersistGlobalObjectBaselineAfterScanV2(p) {
  try {
  if (!env.ENABLE_GLOBAL_OBJECT_BASELINE_PERSIST) {
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_SKIP",
        reason: "flag_off",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return;
  }

  if (p.strictSupportedLane !== "sacred_amulet") {
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_SKIP",
        reason: "lane_not_sacred_amulet",
        lane: p.strictSupportedLane,
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return;
  }

  if (!String(p.uploadId || "").trim()) {
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_SKIP",
        reason: "no_upload_id",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return;
  }

  if (!p.imageBuffer || !Buffer.isBuffer(p.imageBuffer) || p.imageBuffer.length === 0) {
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_SKIP",
        reason: "no_image_buffer",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return;
  }

  const imageSha256 = crypto.createHash("sha256").update(p.imageBuffer).digest("hex");
  if (!/^[0-9a-f]{64}$/.test(imageSha256)) {
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_SKIP",
        reason: "sha_invalid",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return;
  }

  let thumbnailPath = null;
  try {
    const up = await getScanUploadById(p.uploadId);
    thumbnailPath = up?.thumbnail_path != null ? String(up.thumbnail_path).trim() || null : null;
  } catch {
    /* non-fatal */
  }

  let extracted;
  try {
    extracted = extractObjectBaselineFromReportPayload(p.reportPayload, {
      imageSha256,
      imagePhash: p.imageDHash,
      thumbnailPath,
      stableFeatureSeed: p.stableFeatureSeed ?? null,
      objectCategory: p.scanOut?.objectCategory != null ? String(p.scanOut.objectCategory).trim() : null,
      dominantColorSlug:
        p.scanOut?.dominantColorSlug != null ? String(p.scanOut.dominantColorSlug).trim() : null,
      materialFamily:
        p.catSig?.materialFamily != null ? String(p.catSig.materialFamily).trim() : null,
      shapeFamily:
        p.catSig?.shapeFamily != null
          ? String(p.catSig.shapeFamily).trim()
          : String(p.reportObjectFamily || "").trim() || null,
    });
  } catch (exErr) {
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_SKIP",
        reason: "extract_failed",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId),
        lineUserIdPrefix: lineUserIdPrefix8(p.lineUserId),
        message: String(exErr?.message || exErr).slice(0, 220),
        timestamp: scanV2TraceTs(),
      }),
    );
    return;
  }

  if (!extracted) {
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_SKIP",
        reason: "extract_null",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return;
  }

  try {
    const row = await upsertGlobalObjectBaselineFromScanResult({
      imageSha256,
      imagePhash: p.imageDHash,
      stableFeatureSeed: p.stableFeatureSeed ?? null,
      lane: "sacred_amulet",
      objectFamily: String(p.reportObjectFamily || "sacred_amulet").trim() || "sacred_amulet",
      baselineSchemaVersion: 1,
      promptVersion: SCAN_CACHE_PROMPT_VERSION,
      scoringVersion: AMULET_SCORING_MODE,
      objectBaselineJson: extracted.baseline,
      axisScoresJson: extracted.axisScores,
      peakPowerKey: extracted.peakPowerKey,
      thumbnailPath,
      sourceScanResultV2Id: p.scanResultV2Id,
      sourceUploadId: p.uploadId,
      confidence: 1,
    });
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_PERSISTED",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId),
        lineUserIdPrefix: lineUserIdPrefix8(p.lineUserId),
        scanResultIdPrefix: String(p.scanResultV2Id || "").slice(0, 8),
        baselineRowIdPrefix: row?.id ? String(row.id).slice(0, 8) : null,
        imageSha256Prefix: imageSha256.slice(0, 12),
        peakPowerKey: extracted.peakPowerKey,
        timestamp: scanV2TraceTs(),
      }),
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_PERSIST_ERROR",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(p.jobId),
        lineUserIdPrefix: lineUserIdPrefix8(p.lineUserId),
        message: String(err?.message || err).slice(0, 240),
        timestamp: scanV2TraceTs(),
      }),
    );
  }
  } catch (outerErr) {
    let jobIdPrefix = "";
    let lineUserIdPrefix = "";
    try {
      jobIdPrefix = idPrefix8(String(p?.jobId ?? ""));
    } catch {
      /* */
    }
    try {
      lineUserIdPrefix = lineUserIdPrefix8(String(p?.lineUserId ?? ""));
    } catch {
      /* */
    }
    console.log(
      JSON.stringify({
        event: "GLOBAL_OBJECT_BASELINE_PERSIST_ERROR",
        path: "worker-scan",
        scope: "maybe_persist_outer",
        jobIdPrefix,
        lineUserIdPrefix,
        message: String(outerErr?.message || outerErr).slice(0, 240),
        timestamp: scanV2TraceTs(),
      }),
    );
  }
}
