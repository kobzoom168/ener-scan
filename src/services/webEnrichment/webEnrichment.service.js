/**
 * Optional in-process web enrichment for worker-scan (hint-only).
 * Fail-soft: never throws to caller; timeouts and empty results are skipped.
 * @module
 */

import { createHash } from "crypto";
import { env } from "../../config/env.js";
import {
  getWebEnrichmentEligibility,
  decideWebEnrichmentFetch,
  mapEligibilityToDecisiveReason,
} from "../../utils/webEnrichmentPolicy.util.js";

/**
 * @typedef {import("./webEnrichment.types.js").ExternalObjectHints} ExternalObjectHints
 */

/**
 * @typedef {{
 *   hints: ExternalObjectHints | null,
 *   skipReason: string | null,
 *   decisiveReason: string | null,
 * }} WebEnrichmentMaybeResult
 */

/** @type {Map<string, { hints: ExternalObjectHints, expiresAt: number }>} */
const memoryCache = new Map();

function cacheKeyParts(imageBuffer, objectFamily, supportedFamilyGuess) {
  const hash = createHash("sha256")
    .update(imageBuffer)
    .digest("hex")
    .slice(0, 32);
  const fam = String(objectFamily || "").trim().toLowerCase();
  const g = String(supportedFamilyGuess || "").trim().toLowerCase();
  return `${hash}|${fam}|${g}`;
}

function cacheGet(key) {
  const row = memoryCache.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return row.hints;
}

function cacheSet(key, hints, ttlMs) {
  if (memoryCache.size > 400) memoryCache.clear();
  memoryCache.set(key, {
    hints,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Build Thai Wikipedia search query from scan context (no business truth).
 * @param {object} p
 * @param {string} [p.pipelineObjectCategory]
 * @param {string} [p.mainEnergyLine]
 * @returns {string}
 */
export function buildWikipediaSearchQuery(p) {
  const cat = String(p.pipelineObjectCategory || "").trim();
  if (cat.length >= 4) return cat.slice(0, 80);
  const me = String(p.mainEnergyLine || "")
    .replace(/\s+/g, " ")
    .trim();
  if (me.length >= 6) return `${me.slice(0, 60)} พระเครื่อง`;
  return "เครื่องรางไทย";
}

/**
 * @param {string} query
 * @param {number} timeoutMs
 * @returns {Promise<ExternalObjectHints|null>}
 */
async function fetchWikipediaThHints(query, timeoutMs) {
  const q = String(query || "").trim();
  if (!q) return null;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const searchUrl =
      `https://th.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=` +
      encodeURIComponent(q) +
      `&srlimit=2&origin=*`;
    const r1 = await fetch(searchUrl, {
      signal: ac.signal,
      headers: {
        accept: "application/json",
        "user-agent": "EnerScanWebEnrichment/1.0 (contact: ops; policy: https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy)",
      },
    });
    if (!r1.ok) return null;
    const j1 = await r1.json();
    const hit = j1?.query?.search?.[0];
    const title = hit?.title ? String(hit.title) : "";
    if (!title) return null;

    const extractUrl =
      `https://th.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=&explaintext=&titles=` +
      encodeURIComponent(title) +
      `&origin=*`;
    const r2 = await fetch(extractUrl, {
      signal: ac.signal,
      headers: {
        accept: "application/json",
        "user-agent": "EnerScanWebEnrichment/1.0 (contact: ops; policy: https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy)",
      },
    });
    if (!r2.ok) return null;
    const j2 = await r2.json();
    const pages = j2?.query?.pages;
    const page = pages && typeof pages === "object" ? Object.values(pages)[0] : null;
    const extract = page?.extract ? String(page.extract) : "";
    if (!extract.trim()) return null;

    const firstLine = extract.trim().split(/\n/)[0]?.trim() || extract.trim();
    const snippet =
      firstLine.length > 420 ? `${firstLine.slice(0, 417)}…` : firstLine;

    const pageUrl = `https://th.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

    return {
      probableObjectLabel: title.slice(0, 120),
      marketNames: [title.slice(0, 80)],
      culturalDescriptors: [],
      spiritualContextHints: [snippet],
      sourceUrls: [pageUrl],
      confidenceBand: "medium",
      provider: "wikipedia_th",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {object} ctx
 * @param {string} [ctx.lineUserId]
 * @param {string} [ctx.jobId]
 * @param {string} [ctx.scanResultId]
 * @param {Buffer} ctx.imageBuffer
 * @param {string} [ctx.objectFamily]
 * @param {string} [ctx.objectCheckResult]
 * @param {string|null} [ctx.supportedFamilyGuess]
 * @param {string|null} [ctx.pipelineObjectCategory]
 * @param {string} [ctx.mainEnergyLine]
 * @param {string} [ctx.resultText]
 * @param {boolean} [ctx.scanFromCache]
 * @param {number} [ctx.workerElapsedMs]
 * @returns {Promise<WebEnrichmentMaybeResult>}
 */
export async function maybeRunWebEnrichment(ctx) {
  const started = Date.now();
  const lineUserIdPrefix = String(ctx.lineUserId || "").slice(0, 8);
  const jobIdPrefix = String(ctx.jobId || "").slice(0, 8);
  const scanResultIdPrefix = String(ctx.scanResultId || "").slice(0, 8);

  const baseLog = {
    lineUserIdPrefix,
    jobIdPrefix,
    scanResultIdPrefix,
    objectFamily: ctx.objectFamily ?? null,
    supportedFamilyGuess: ctx.supportedFamilyGuess ?? null,
    provider: env.WEB_ENRICHMENT_PROVIDER,
  };

  const elig = getWebEnrichmentEligibility(ctx);
  if (!elig.ok) {
    const decisiveReason = mapEligibilityToDecisiveReason(elig.reason);
    console.log(
      JSON.stringify({
        event: "WEB_ENRICHMENT_SKIPPED",
        reason: elig.reason,
        decisiveReason,
        ...baseLog,
        cacheHit: false,
        durationMs: Date.now() - started,
        hintCount: 0,
        mergeMode: "n/a",
      }),
    );
    return {
      hints: null,
      skipReason: elig.reason,
      decisiveReason,
    };
  }

  console.log(
    JSON.stringify({
      event: "WEB_ENRICHMENT_ELIGIBLE",
      ...baseLog,
      reason: elig.reason,
    }),
  );

  const decision = decideWebEnrichmentFetch(ctx);
  const budget = decision.budget;
  const elapsed =
    ctx.workerElapsedMs != null && Number.isFinite(ctx.workerElapsedMs)
      ? ctx.workerElapsedMs
      : 0;
  const maxElapsed = env.WEB_ENRICHMENT_MAX_WORKER_ELAPSED_MS;
  const overrideMinRem = env.WEB_ENRICHMENT_ELAPSED_CAP_OVERRIDE_MIN_REMAINING_MS;

  console.log(
    JSON.stringify({
      event: "WEB_ENRICHMENT_BUDGET_DECISION",
      ...baseLog,
      elapsedMs: elapsed,
      budgetMs: budget.budgetMs,
      remainingMs: budget.remainingMs,
      minRemainingMs: budget.minRemainingMs,
      maxWorkerElapsedMs: maxElapsed,
      elapsedCapOverrideMinRemainingMs: overrideMinRem,
      allowFetch: decision.allowFetch,
      decisiveReason: decision.decisiveReason,
      elapsedCapOverridden: Boolean(decision.elapsedCapOverridden),
    }),
  );

  if (!decision.allowFetch) {
    console.log(
      JSON.stringify({
        event: "WEB_ENRICHMENT_SKIPPED",
        reason: decision.reason,
        decisiveReason: decision.decisiveReason,
        ...baseLog,
        cacheHit: false,
        durationMs: Date.now() - started,
        hintCount: 0,
        mergeMode: "n/a",
        budgetRemainingMs: budget.remainingMs,
      }),
    );
    return {
      hints: null,
      skipReason: decision.reason,
      decisiveReason: decision.decisiveReason,
    };
  }

  console.log(
    JSON.stringify({
      event: "WEB_ENRICHMENT_REQUESTED",
      ...baseLog,
      reason: decision.reason,
      decisiveReason: decision.decisiveReason,
    }),
  );

  const imageBuffer = ctx.imageBuffer;
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    console.log(
      JSON.stringify({
        event: "WEB_ENRICHMENT_SKIPPED",
        reason: "missing_image_buffer",
        decisiveReason: "missing_image_buffer",
        ...baseLog,
        cacheHit: false,
        durationMs: Date.now() - started,
        hintCount: 0,
        mergeMode: "n/a",
      }),
    );
    return {
      hints: null,
      skipReason: "missing_image_buffer",
      decisiveReason: "missing_image_buffer",
    };
  }

  const key = cacheKeyParts(
    imageBuffer,
    ctx.objectFamily,
    ctx.supportedFamilyGuess,
  );
  const cached = cacheGet(key);
  if (cached) {
    const hintCount = countHints(cached);
    console.log(
      JSON.stringify({
        event: "WEB_ENRICHMENT_CACHE_HIT",
        ...baseLog,
        cacheHit: true,
        durationMs: Date.now() - started,
        hintCount,
        mergeMode: "pending_merge",
      }),
    );
    return {
      hints: cached,
      skipReason: null,
      decisiveReason: "cache_hit",
    };
  }

  const timeoutMs = env.WEB_ENRICHMENT_TIMEOUT_MS;
  const q = buildWikipediaSearchQuery({
    pipelineObjectCategory: ctx.pipelineObjectCategory,
    mainEnergyLine: ctx.mainEnergyLine,
  });

  console.log(
    JSON.stringify({
      event: "WEB_ENRICHMENT_FETCH_START",
      ...baseLog,
      queryLen: q.length,
    }),
  );

  let hints = null;
  try {
    if (env.WEB_ENRICHMENT_PROVIDER === "wikipedia_th") {
      hints = await fetchWikipediaThHints(q, timeoutMs);
    }
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "WEB_ENRICHMENT_FETCH_FAIL",
        ...baseLog,
        reason: String(err?.message || err),
        decisiveReason: "fetch_exception",
        cacheHit: false,
        durationMs: Date.now() - started,
        hintCount: 0,
        mergeMode: "n/a",
      }),
    );
    return {
      hints: null,
      skipReason: "fetch_exception",
      decisiveReason: "fetch_exception",
    };
  }

  const durationMs = Date.now() - started;
  if (!hints) {
    console.log(
      JSON.stringify({
        event: "WEB_ENRICHMENT_FETCH_FAIL",
        ...baseLog,
        reason: "empty_or_abort",
        decisiveReason: "fetch_empty",
        cacheHit: false,
        durationMs,
        hintCount: 0,
        mergeMode: "n/a",
      }),
    );
    return {
      hints: null,
      skipReason: "empty_or_abort",
      decisiveReason: "fetch_empty",
    };
  }

  const hintCount = countHints(hints);
  cacheSet(key, hints, env.WEB_ENRICHMENT_CACHE_TTL_MS);

  console.log(
    JSON.stringify({
      event: "WEB_ENRICHMENT_FETCH_OK",
      ...baseLog,
      provider: hints.provider || env.WEB_ENRICHMENT_PROVIDER,
      cacheHit: false,
      durationMs,
      hintCount,
      mergeMode: "pending_merge",
    }),
  );

  return {
    hints,
    skipReason: null,
    decisiveReason: "fetch_ok",
  };
}

export { shouldRunWebEnrichment, decideWebEnrichmentFetch } from "../../utils/webEnrichmentPolicy.util.js";
export {
  evaluateEnrichmentBudget,
  getWebEnrichmentEligibility,
} from "../../utils/webEnrichmentPolicy.util.js";

/**
 * @param {ExternalObjectHints} h
 * @returns {number}
 */
function countHints(h) {
  let n = 0;
  if (h.probableObjectLabel) n += 1;
  n += (h.marketNames || []).length;
  n += (h.culturalDescriptors || []).length;
  n += (h.spiritualContextHints || []).length;
  n += (h.sourceUrls || []).length;
  return n;
}
