/**
 * Policy for optional web enrichment (hint-only; never business truth).
 * @module
 */

import { env } from "../config/env.js";
import {
  extractCrystalSpiritualSignalTags,
  normalizeObjectFamilyForEnergyCopy,
} from "./energyCategoryResolve.util.js";

/** Pipeline / gate families where external naming + cultural context may help. */
const ENRICHABLE_RAW = new Set([
  "crystal",
  "thai_amulet",
  "thai_talisman",
  "takrud",
  "somdej",
  "generic",
]);

/**
 * @param {string | null | undefined} raw
 * @returns {boolean}
 */
export function isEnrichableObjectFamily(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  return ENRICHABLE_RAW.has(s);
}

/**
 * Non–time-based gates (eligible for enrichment if all pass).
 * @param {object} ctx
 * @returns {{ ok: boolean, reason: string }}
 */
export function getWebEnrichmentEligibility(ctx) {
  if (!env.WEB_ENRICHMENT_ENABLED) {
    return { ok: false, reason: "disabled" };
  }
  if (String(ctx.objectCheckResult || "").trim() !== "single_supported") {
    return { ok: false, reason: "object_gate_not_single_supported" };
  }
  if (!isEnrichableObjectFamily(ctx.objectFamily)) {
    return { ok: false, reason: "object_family_not_enrichable" };
  }
  if (env.WEB_ENRICHMENT_SKIP_WHEN_SCAN_FROM_CACHE && ctx.scanFromCache) {
    return { ok: false, reason: "scan_from_cache_skipped" };
  }
  if (shouldSkipEnrichmentDueToStrongSignals(ctx)) {
    return { ok: false, reason: "strong_internal_signals" };
  }
  return { ok: true, reason: "eligible" };
}

/**
 * Soft budget: estimated remaining time in the worker turn for optional enrichment fetch.
 * @param {number} workerElapsedMs
 * @returns {{ remainingMs: number, budgetMs: number, minRemainingMs: number, sufficient: boolean }}
 */
export function evaluateEnrichmentBudget(workerElapsedMs) {
  const elapsed = Number.isFinite(workerElapsedMs) ? Math.max(0, workerElapsedMs) : 0;
  const budgetMs = env.WEB_ENRICHMENT_ESTIMATED_JOB_BUDGET_MS;
  const minRemainingMs = env.WEB_ENRICHMENT_MIN_REMAINING_MS;
  const remainingMs = budgetMs - elapsed;
  return {
    remainingMs,
    budgetMs,
    minRemainingMs,
    sufficient: remainingMs >= minRemainingMs,
  };
}

/**
 * When true, enrichment is unlikely to add value — skip network/cache work.
 * Conservative: only skip when signals are already strong across gate + pipeline + scan text.
 *
 * @param {object} ctx
 * @param {string} [ctx.objectFamily] — pipeline family from mapObjectCategoryToPipelineSignals
 * @param {string|null} [ctx.supportedFamilyGuess] — object gate structured guess
 * @param {string|null} [ctx.pipelineObjectCategory] — Thai category string from deep scan
 * @param {string} [ctx.mainEnergyLine] — parsed main energy line
 * @param {string} [ctx.resultText] — full scan result text
 * @returns {boolean}
 */
export function shouldSkipEnrichmentDueToStrongSignals(ctx) {
  const guess = String(ctx.supportedFamilyGuess || "")
    .trim()
    .toLowerCase();
  const cat = String(ctx.pipelineObjectCategory || "").trim();
  const rt = String(ctx.resultText || "");
  const famRaw = String(ctx.objectFamily || "")
    .trim()
    .toLowerCase();

  const strongGuesses = new Set([
    "thai_amulet",
    "talisman",
    "crystal",
    "bracelet",
  ]);

  if (!strongGuesses.has(guess)) return false;
  if (cat.length < 8) return false;
  if (rt.length < 720) return false;

  if (famRaw === "generic") return false;

  const famNorm = normalizeObjectFamilyForEnergyCopy(ctx.objectFamily || "");
  if (famNorm === "crystal") {
    const tags = extractCrystalSpiritualSignalTags(ctx.mainEnergyLine || "");
    if (tags.length === 0) return false;
  }

  return true;
}

/**
 * Maps eligibility `reason` to a stable analytics key (not raw gate strings).
 * @param {string} r
 * @returns {string}
 */
export function mapEligibilityToDecisiveReason(r) {
  const x = String(r || "").trim();
  switch (x) {
    case "disabled":
      return "disabled_by_env";
    case "object_gate_not_single_supported":
      return "object_gate_blocked";
    case "object_family_not_enrichable":
      return "object_family_not_enrichable";
    case "scan_from_cache_skipped":
      return "disabled_by_policy_cache";
    case "strong_internal_signals":
      return "strong_internal_signals";
    default:
      return x || "unknown";
  }
}

/**
 * Two-layer budget: soft remaining (budgetMs − elapsed) vs hard elapsed cap.
 * When soft remaining is still large, the elapsed cap can be overridden so enrichment
 * is not skipped solely because deep scan consumed wall clock before this call.
 *
 * @param {object} ctx
 * @param {number} [ctx.workerElapsedMs]
 * @returns {{
 *   allowFetch: boolean,
 *   reason: string,
 *   decisiveReason: string,
 *   budget: ReturnType<typeof evaluateEnrichmentBudget>,
 *   elapsedCapOverridden?: boolean,
 * }}
 */
export function decideWebEnrichmentFetch(ctx) {
  const elig = getWebEnrichmentEligibility(ctx);
  const elapsed =
    ctx.workerElapsedMs != null && Number.isFinite(ctx.workerElapsedMs)
      ? Math.max(0, ctx.workerElapsedMs)
      : 0;
  const budget = evaluateEnrichmentBudget(elapsed);

  if (!elig.ok) {
    return {
      allowFetch: false,
      reason: elig.reason,
      decisiveReason: mapEligibilityToDecisiveReason(elig.reason),
      budget,
    };
  }

  const maxElapsed = env.WEB_ENRICHMENT_MAX_WORKER_ELAPSED_MS;
  const overrideMinRem = env.WEB_ENRICHMENT_ELAPSED_CAP_OVERRIDE_MIN_REMAINING_MS;

  if (!budget.sufficient) {
    return {
      allowFetch: false,
      reason: "no_worker_budget",
      decisiveReason: "no_remaining_budget",
      budget,
    };
  }

  if (elapsed > maxElapsed) {
    if (budget.remainingMs >= overrideMinRem) {
      return {
        allowFetch: true,
        reason: "policy_pass",
        decisiveReason: "elapsed_cap_soft_headroom_override",
        budget,
        elapsedCapOverridden: true,
      };
    }
    return {
      allowFetch: false,
      reason: "worker_near_timeout",
      decisiveReason: "elapsed_cap_exceeded",
      budget,
    };
  }

  return {
    allowFetch: true,
    reason: "policy_pass",
    decisiveReason: "allow_fetch",
    budget,
  };
}

/**
 * Full decision including time/budget gates.
 *
 * @param {object} ctx
 * @param {string} [ctx.objectCheckResult]
 * @param {string} [ctx.objectFamily]
 * @param {string|null} [ctx.supportedFamilyGuess]
 * @param {string|null} [ctx.pipelineObjectCategory]
 * @param {string} [ctx.mainEnergyLine]
 * @param {string} [ctx.resultText]
 * @param {boolean} [ctx.scanFromCache]
 * @param {number} [ctx.workerElapsedMs]
 * @returns {{
 *   ok: boolean,
 *   reason: string,
 *   decisiveReason: string,
 *   budget: ReturnType<typeof evaluateEnrichmentBudget>,
 *   elapsedCapOverridden?: boolean,
 * }}
 */
export function shouldRunWebEnrichment(ctx) {
  const d = decideWebEnrichmentFetch(ctx);
  if (!d.allowFetch) {
    return {
      ok: false,
      reason: d.reason,
      decisiveReason: d.decisiveReason,
      budget: d.budget,
    };
  }
  return {
    ok: true,
    reason: d.reason,
    decisiveReason: d.decisiveReason,
    budget: d.budget,
    elapsedCapOverridden: d.elapsedCapOverridden,
  };
}
