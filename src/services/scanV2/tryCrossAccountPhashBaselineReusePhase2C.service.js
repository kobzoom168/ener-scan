import { env } from "../../config/env.js";
import {
  findGlobalObjectBaselineById,
  listGlobalObjectBaselinePhashCandidates,
  markGlobalObjectBaselineReused,
} from "../../stores/scanV2/globalObjectBaselines.db.js";
import { computeImageDHash } from "../imageDedup/imagePhash.util.js";
import { createScanRequest, updateScanRequestStatus } from "../../stores/scanRequests.db.js";
import { createScanResult } from "../../stores/scanResults.db.js";
import { parseScanResultForHistory } from "../history/history.parser.js";
import { mapObjectCategoryToPipelineSignals } from "../../utils/reports/scanPipelineReportSignals.util.js";
import { validateObjectBaselineJsonForReuse } from "./objectBaselineExtract.util.js";
import { scanV2TraceTs, idPrefix8, lineUserIdPrefix8 } from "../../utils/scanV2Trace.util.js";

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
 * @param {object} [deps]
 * @returns {Promise<
 *   | { ok: true, baselineRow: import("../../stores/scanV2/globalObjectBaselines.db.js").GlobalObjectBaselineRow, scanRequestId: string, legacyScanResultId: string, resultText: string, parsed: object, scanOut: object, catSig: ReturnType<typeof mapObjectCategoryToPipelineSignals>, strictSupportedLane: "sacred_amulet", reportObjectFamily: string, reportShapeFamily: string|undefined, braceletEligibility: object, geminiCrystalSubtypeResult: null, gptSubtypeInferenceText: string, scanFromCache: false, stableFeatureSeed: string|null, baselineCrossAccountReuse: true, reuseMode: "phash", phashDistance: number }
 *   | { ok: false }
 * >}
 */
export async function tryCrossAccountPhashBaselineReusePhase2C(ctx, deps = {}) {
  const computeDHash = deps.computeImageDHash || computeImageDHash;
  const listCandidates = deps.listGlobalObjectBaselinePhashCandidates || listGlobalObjectBaselinePhashCandidates;
  const findById = deps.findGlobalObjectBaselineById || findGlobalObjectBaselineById;
  const createRequest = deps.createScanRequest || createScanRequest;
  const createLegacyResult = deps.createScanResult || createScanResult;
  const updateRequestStatus = deps.updateScanRequestStatus || updateScanRequestStatus;
  const markReused = deps.markGlobalObjectBaselineReused || markGlobalObjectBaselineReused;
  const log = deps.log || console.log;

  try {
    if (!env.CROSS_ACCOUNT_BASELINE_PHASH_REUSE_ENABLED) return { ok: false };
    if (String(ctx.objectCheck || "") !== "single_supported") return { ok: false };

    const currentPhash = await computeDHash(ctx.imageBuffer);
    if (!/^[0-9a-f]{16}$/.test(String(currentPhash || "").trim().toLowerCase())) {
      log(
        JSON.stringify({
          event: "CROSS_ACCOUNT_BASELINE_PHASH_REUSE_SKIPPED",
          path: "worker-scan",
          reason: "no_current_phash",
          jobIdPrefix: idPrefix8(ctx.jobId),
          lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
          timestamp: scanV2TraceTs(),
        }),
      );
      return { ok: false };
    }

    const candidates = await listCandidates(
      currentPhash,
      env.CROSS_ACCOUNT_BASELINE_PHASH_REUSE_MAX_DISTANCE,
      {
        lane: "sacred_amulet",
        objectFamily: "sacred_amulet",
        limit: 20,
      },
    );
    if (!Array.isArray(candidates) || !candidates.length) {
      log(
        JSON.stringify({
          event: "CROSS_ACCOUNT_BASELINE_PHASH_REUSE_SKIPPED",
          path: "worker-scan",
          reason: "no_candidates",
          jobIdPrefix: idPrefix8(ctx.jobId),
          lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
          timestamp: scanV2TraceTs(),
        }),
      );
      return { ok: false };
    }

    const ranked = [...candidates].sort((a, b) => {
      const da = Number(a?.phashDistance);
      const db = Number(b?.phashDistance);
      if (da !== db) return da - db;
      const ta = Date.parse(String(a?.createdAt || ""));
      const tb = Date.parse(String(b?.createdAt || ""));
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
    const candidate = ranked[0];
    const baselineRow = await findById(candidate.baselineId);
    if (!baselineRow) {
      log(
        JSON.stringify({
          event: "CROSS_ACCOUNT_BASELINE_PHASH_REUSE_SKIPPED",
          path: "worker-scan",
          reason: "full_row_missing",
          jobIdPrefix: idPrefix8(ctx.jobId),
          lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
          baselineIdPrefix: String(candidate.baselineId || "").slice(0, 8) || null,
          timestamp: scanV2TraceTs(),
        }),
      );
      return { ok: false };
    }

    if (String(baselineRow.lane || "").trim().toLowerCase() !== "sacred_amulet") return { ok: false };
    if (String(baselineRow.objectFamily || "").trim().toLowerCase() !== "sacred_amulet") return { ok: false };
    if (
      !Number.isFinite(Number(baselineRow.baselineSchemaVersion)) ||
      baselineRow.baselineSchemaVersion < 1 ||
      baselineRow.baselineSchemaVersion > BASELINE_SCHEMA_REUSE_MAX
    ) {
      return { ok: false };
    }
    const forbidden = validateObjectBaselineJsonForReuse(baselineRow.objectBaselineJson);
    if (!forbidden.ok) return { ok: false };

    log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_PHASH_REUSE_HIT",
        path: "worker-scan",
        jobIdPrefix: idPrefix8(ctx.jobId),
        lineUserIdPrefix: lineUserIdPrefix8(ctx.lineUserId),
        phashDistance: candidate.phashDistance,
        baselineIdPrefix: String(baselineRow.id).slice(0, 8),
        peakPowerKey: baselineRow.peakPowerKey || null,
        timestamp: scanV2TraceTs(),
      }),
    );

    void markReused(baselineRow.id);

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
      reuseMode: /** @type {const} */ ("phash"),
      phashDistance: Number(candidate.phashDistance),
    };
  } catch (e) {
    log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_PHASH_REUSE_SKIPPED",
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
