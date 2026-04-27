/**
 * Phase 2A: exact SHA256 match against `global_object_baselines` (sacred_amulet only).
 */

import crypto from "crypto";
import { env } from "../../config/env.js";
import {
  findGlobalObjectBaselineBySha256,
  markGlobalObjectBaselineReused,
} from "../../stores/scanV2/globalObjectBaselines.db.js";
import { createScanRequest, updateScanRequestStatus } from "../../stores/scanRequests.db.js";
import { createScanResult } from "../../stores/scanResults.db.js";
import { parseScanResultForHistory } from "../history/history.parser.js";
import { mapObjectCategoryToPipelineSignals } from "../../utils/reports/scanPipelineReportSignals.util.js";
import { validateObjectBaselineJsonForReuse } from "./objectBaselineExtract.util.js";
import { scanV2TraceTs, idPrefix8, lineUserIdPrefix8 } from "../../utils/scanV2Trace.util.js";

/** Supported baseline schema for reuse (Phase 2A). */
const BASELINE_SCHEMA_REUSE_MAX = 1;

/**
 * @typedef {Object} TryCrossAccountCtx
 * @property {string} jobId
 * @property {string} lineUserId
 * @property {string} appUserId
 * @property {string} birthdate
 * @property {Buffer} imageBuffer
 * @property {string} objectCheck
 */

/**
 * @param {TryCrossAccountCtx} ctx
 * @returns {Promise<
 *   | { ok: true, baselineRow: import("../../stores/scanV2/globalObjectBaselines.db.js").GlobalObjectBaselineRow, scanRequestId: string, legacyScanResultId: string, resultText: string, parsed: object, scanOut: object, catSig: ReturnType<typeof mapObjectCategoryToPipelineSignals>, strictSupportedLane: "sacred_amulet", reportObjectFamily: string, reportShapeFamily: string|undefined, braceletEligibility: object, geminiCrystalSubtypeResult: null, gptSubtypeInferenceText: string, scanFromCache: false, stableFeatureSeed: string|null, baselineCrossAccountReuse: true }
 *   | { ok: false }
 * >}
 */
export async function tryCrossAccountExactBaselineReusePhase2A(ctx) {
  if (
    !env.ENABLE_CROSS_ACCOUNT_BASELINE_REUSE ||
    !env.CROSS_ACCOUNT_BASELINE_REUSE_EXACT_SHA ||
    env.CROSS_ACCOUNT_BASELINE_REUSE_PHASH
  ) {
    return { ok: false };
  }

  if (String(ctx.objectCheck || "") !== "single_supported") {
    return { ok: false };
  }

  const shaHex = crypto.createHash("sha256").update(ctx.imageBuffer).digest("hex");

  console.log(
    JSON.stringify({
      event: "CROSS_ACCOUNT_BASELINE_EXACT_LOOKUP_START",
      path: "worker-scan",
      jobIdPrefix: idPrefix8(ctx.jobId),
      lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
      imageSha256Prefix: shaHex.slice(0, 12),
      timestamp: scanV2TraceTs(),
    }),
  );

  let baselineRow;
  try {
    baselineRow = await findGlobalObjectBaselineBySha256(shaHex);
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_FALLBACK_FULL_SCAN",
        path: "worker-scan",
        reason: "find_baseline_error",
        jobIdPrefix: idPrefix8(ctx.jobId),
        message: String(e?.message || e).slice(0, 200),
        timestamp: scanV2TraceTs(),
      }),
    );
    return { ok: false };
  }

  if (!baselineRow) {
    console.log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_EXACT_MISS",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(ctx.jobId),
        lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
        imageSha256Prefix: shaHex.slice(0, 12),
        timestamp: scanV2TraceTs(),
      }),
    );
    return { ok: false };
  }

  if (String(baselineRow.lane || "").trim().toLowerCase() !== "sacred_amulet") {
    console.log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_EXACT_REJECTED",
        path: "worker-scan",
        reason: "lane_not_sacred_amulet",
        lane: baselineRow.lane,
        jobIdPrefix: idPrefix8(ctx.jobId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return { ok: false };
  }

  if (
    !Number.isFinite(Number(baselineRow.baselineSchemaVersion)) ||
    baselineRow.baselineSchemaVersion < 1 ||
    baselineRow.baselineSchemaVersion > BASELINE_SCHEMA_REUSE_MAX
  ) {
    console.log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_EXACT_REJECTED",
        path: "worker-scan",
        reason: "baseline_schema_unsupported",
        baselineSchemaVersion: baselineRow.baselineSchemaVersion,
        jobIdPrefix: idPrefix8(ctx.jobId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return { ok: false };
  }

  const forbidden = validateObjectBaselineJsonForReuse(baselineRow.objectBaselineJson);
  if (!forbidden.ok) {
    console.log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_EXACT_REJECTED",
        path: "worker-scan",
        reason: "forbidden_keys_in_baseline_json",
        detail: forbidden.reason,
        jobIdPrefix: idPrefix8(ctx.jobId),
        timestamp: scanV2TraceTs(),
      }),
    );
    return { ok: false };
  }

  console.log(
    JSON.stringify({
      event: "CROSS_ACCOUNT_BASELINE_EXACT_HIT",
      path: "worker-scan",
      jobIdPrefix: idPrefix8(ctx.jobId),
      lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
      baselineIdPrefix: String(baselineRow.id).slice(0, 8),
      imageSha256Prefix: shaHex.slice(0, 12),
      timestamp: scanV2TraceTs(),
    }),
  );

  void markGlobalObjectBaselineReused(baselineRow.id);

  /** @type {string|null} */
  let scanRequestId = null;
  try {
    scanRequestId = await createScanRequest({
      appUserId: ctx.appUserId,
      flowVersion: null,
      scanJobId: String(ctx.jobId),
      birthdateUsed: ctx.birthdate,
      usedSavedBirthdate: true,
      requestSource: "scan_v2_worker_baseline_reuse",
    });
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_FALLBACK_FULL_SCAN",
        path: "worker-scan",
        reason: "scan_request_failed",
        jobIdPrefix: idPrefix8(ctx.jobId),
        message: String(e?.message || e).slice(0, 200),
        timestamp: scanV2TraceTs(),
      }),
    );
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
    legacyScanResultId = await createScanResult({
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
  } catch (e) {
    await updateScanRequestStatus(scanRequestId, "failed");
    console.log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_FALLBACK_FULL_SCAN",
        path: "worker-scan",
        reason: "legacy_scan_result_failed",
        jobIdPrefix: idPrefix8(ctx.jobId),
        message: String(e?.message || e).slice(0, 200),
        timestamp: scanV2TraceTs(),
      }),
    );
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
  const reportObjectFamily = "sacred_amulet";
  const reportShapeFamily = catSig.shapeFamily;

  const braceletEligibility = {
    eligible: false,
    status: "not_crystal",
    objectFamilyTruth: null,
    shapeFamilyTruth: null,
    familyCheck: null,
    formCheck: null,
    shapeFamilyForcedToBracelet: false,
    baseGateResult: ctx.objectCheck,
  };

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
    reportObjectFamily,
    reportShapeFamily,
    braceletEligibility,
    geminiCrystalSubtypeResult: null,
    gptSubtypeInferenceText: "",
    scanFromCache: false,
    stableFeatureSeed: baselineRow.stableFeatureSeed,
    baselineCrossAccountReuse: /** @type {const} */ (true),
  };
}
