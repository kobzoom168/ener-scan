import { normalizeReportPayloadForRender } from "../../utils/reports/reportPayloadNormalize.util.js";
import { computeAmuletOrdAndAlignFromPayload } from "../../amulet/amuletOrdAlign.util.js";
import { POWER_ORDER } from "../../amulet/amuletScores.util.js";

/** Keys that must never appear in baseline JSON (any nesting level we control). */
const FORBIDDEN_BASELINE_KEYS = new Set([
  "lineUserId",
  "line_user_id",
  "userId",
  "birthdate",
  "birthdateUsed",
  "compatibilityPercent",
  "ownerProfile",
  "energyTiming",
  "timingV1",
  "publicToken",
  "reportUrl",
  "payment",
  "entitlement",
  "conversationState",
  "compatibility",
  "actions",
  "trust",
]);

/**
 * @typedef {Object} ObjectBaselineExtractContext
 * @property {string} imageSha256 — lowercase 64-char hex (bytes digest)
 * @property {string|null} [imagePhash]
 * @property {string|null} [thumbnailPath]
 * @property {string|null} [stableFeatureSeed]
 * @property {string|null} [objectCategory] — pipeline category slug
 * @property {string|null} [dominantColorSlug]
 * @property {string|null} [materialFamily]
 * @property {string|null} [shapeFamily]
 */

/**
 * Build allowlisted object baseline JSON v1 from a normalized sacred-amulet report payload.
 * Does not copy full payload; returns `null` if lane/amulet slice is unusable.
 *
 * @param {unknown} payloadRaw
 * @param {ObjectBaselineExtractContext} context
 * @returns {{ baseline: Record<string, unknown>, peakPowerKey: import("../../amulet/amuletScores.util.js").AmuletPowerKey, axisScores: Record<string, number> } | null}
 */
export function extractObjectBaselineFromReportPayload(payloadRaw, context) {
  const sha = String(context?.imageSha256 || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;

  const { payload: norm, warnings } = normalizeReportPayloadForRender(
    /** @type {import("../reports/reportPayload.types.js").ReportPayload} */ (payloadRaw),
  );
  if (warnings?.length) {
    /* non-fatal */
  }
  const am = norm.amuletV1;
  if (!am || typeof am !== "object" || Array.isArray(am)) return null;

  /** @type {Record<string, { score: number }>} */
  const powerCategories = {};
  /** @type {Record<string, number>} */
  const axisScores = {};
  for (const k of POWER_ORDER) {
    const sc = Number(am.powerCategories?.[k]?.score);
    const n = Number.isFinite(sc) ? Math.round(Math.min(100, Math.max(0, sc))) : 0;
    powerCategories[k] = { score: n };
    axisScores[k] = n;
  }

  /** @type {import("../../amulet/amuletScores.util.js").AmuletPowerKey} */
  let peakPowerKey = "protection";
  try {
    const m = computeAmuletOrdAndAlignFromPayload(norm);
    const first = m?.ord?.[0];
    if (first && POWER_ORDER.includes(first)) {
      peakPowerKey = /** @type {import("../../amulet/amuletScores.util.js").AmuletPowerKey} */ (first);
    }
  } catch {
    const primary = String(am.primaryPower || "").trim();
    if (primary && POWER_ORDER.includes(primary)) {
      peakPowerKey = /** @type {import("../../amulet/amuletScores.util.js").AmuletPowerKey} */ (primary);
    }
  }

  const objectFamily =
    String(norm.summary?.energyCopyObjectFamily || "").trim() ||
    String(context?.shapeFamily || "sacred_amulet").trim() ||
    "sacred_amulet";

  const objectCategory = String(context?.objectCategory || "").trim() || null;

  const dom = String(context?.dominantColorSlug || "").trim().toLowerCase() || null;
  const mat = String(context?.materialFamily || "").trim() || null;
  const form = String(context?.shapeFamily || "").trim() || null;

  const phash = context?.imagePhash != null ? String(context.imagePhash).trim().toLowerCase() || null : null;
  /** Phase 1A: keep storage path out of JSON (often `{lineUserId}/…`); `global_object_baselines.thumbnail_path` stores DB copy. */
  const thumbInJson = null;

  /** @type {Record<string, unknown>} */
  const baseline = {
    baselineSchemaVersion: 1,
    lane: "sacred_amulet",
    objectFamily,
    objectCategory,
    peakPowerKey,
    powerCategories,
    visual: {
      dominantColor: dom,
      materialType: mat,
      formFactor: form,
    },
    image: {
      imageSha256: sha,
      imagePhash: phash,
      thumbnailPath: thumbInJson,
    },
  };

  assertBaselineHasNoForbiddenKeys(baseline);
  return { baseline, peakPowerKey, axisScores };
}

/**
 * @param {unknown} obj
 */
function assertBaselineHasNoForbiddenKeys(obj) {
  const walk = (v, path) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const k of Object.keys(v)) {
        if (FORBIDDEN_BASELINE_KEYS.has(k)) {
          throw new Error(`object_baseline_json_forbidden_key:${k}@${path}`);
        }
        walk(v[k], `${path}.${k}`);
      }
    }
  };
  walk(obj, "root");
}

/**
 * @param {unknown} objectBaselineJson
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateObjectBaselineJsonForReuse(objectBaselineJson) {
  try {
    assertBaselineHasNoForbiddenKeys(objectBaselineJson);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: String(e?.message || e).slice(0, 120),
    };
  }
}
