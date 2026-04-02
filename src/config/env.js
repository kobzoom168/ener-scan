import dotenv from "dotenv";
import { scanV2TraceTs } from "../utils/scanV2Trace.util.js";

dotenv.config();

const requiredEnv = [
  "OPENAI_API_KEY",
  "CHANNEL_ACCESS_TOKEN",
  "CHANNEL_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`${key} missing`);
  }
}

/**
 * Public URL for LINE-accessible assets (QR image). Must be HTTPS in production.
 * Order: APP_BASE_URL / PUBLIC_APP_URL → Railway / Vercel → localhost (dev only).
 */
function resolvePublicAppBaseUrl() {
  const explicit = process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL;
  if (explicit) {
    return String(explicit).trim().replace(/\/+$/, "");
  }
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) {
    const host = railway.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (host) return `https://${host}`;
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (host) return `https://${host}`;
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

export const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CHANNEL_ACCESS_TOKEN: process.env.CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET: process.env.CHANNEL_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  PORT: process.env.PORT || 3000,
  /** Admin secret token for /admin endpoints (optional, but required for production use). */
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || "",
  /** Session signing for admin cookie (required in production). */
  SESSION_SECRET:
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === "production"
      ? ""
      : "ener-scan-dev-session-insecure"),
  /** Admin dashboard login (username/password). Optional when using only ADMIN_TOKEN. */
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  /** bcrypt hash for ADMIN_PASSWORD; if set, used instead of plain ADMIN_PASSWORD. */
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || "",
  /** Public base URL for PromptPay QR and LINE image URLs (set APP_BASE_URL on deploy). */
  APP_BASE_URL: resolvePublicAppBaseUrl(),
  /** Amount in THB for 24h unlock (manual PromptPay). Optional; 0 = "ตามที่แอดมินแจ้ง" */
  PAYMENT_UNLOCK_AMOUNT_THB: Number(process.env.PAYMENT_UNLOCK_AMOUNT_THB) || 0,
  PAYMENT_UNLOCK_CURRENCY: process.env.PAYMENT_UNLOCK_CURRENCY || "THB",
  /**
   * Second LLM pass (gpt-4.1-mini) to polish draft from primary gpt-4.1-mini scan. Set "false" to save cost/latency.
   * @type {boolean}
   */
  ENABLE_DEEP_SCAN_REWRITE: process.env.ENABLE_DEEP_SCAN_REWRITE === "true",
  /** gpt-4.1-mini quality score after draft/rewrite. */
  ENABLE_DEEP_SCAN_SCORING: process.env.ENABLE_DEEP_SCAN_SCORING === "true",
  /** Min total_score (0–50) before optional auto-improve. */
  DEEP_SCAN_MIN_QUALITY_SCORE: (() => {
    const raw = process.env.DEEP_SCAN_MIN_QUALITY_SCORE;
    const n = raw === undefined || raw === "" ? 35 : Number(raw);
    return Number.isFinite(n) ? n : 35;
  })(),
  /**
   * If total_score >= this, skip improve (preserve already-strong output; save cost).
   * 0–50; default 44.
   */
  DEEP_SCAN_HIGH_QUALITY_SCORE: (() => {
    const raw = process.env.DEEP_SCAN_HIGH_QUALITY_SCORE;
    const n = raw === undefined || raw === "" ? 44 : Number(raw);
    return Number.isFinite(n) ? n : 44;
  })(),
  /**
   * If total_score <= this, skip improve (likely prompt/image failure; fixing rarely helps).
   * Default 15.
   */
  DEEP_SCAN_IMPROVE_FLOOR_SCORE: (() => {
    const raw = process.env.DEEP_SCAN_IMPROVE_FLOOR_SCORE;
    const n = raw === undefined || raw === "" ? 15 : Number(raw);
    return Number.isFinite(n) ? n : 15;
  })(),
  /** One gpt-4.1-mini pass when score below threshold (requires scoring on). */
  ENABLE_DEEP_SCAN_AUTO_IMPROVE: process.env.ENABLE_DEEP_SCAN_AUTO_IMPROVE === "true",
  /**
   * Append compact guidance from `data/style-reference-pack.json` (or DEEP_SCAN_STYLE_REFERENCE_PATH) to rewrite system prompt only.
   * If `DEEP_SCAN_STYLE_REFERENCE_MODE` is unset, this flag maps to mode `on` (legacy).
   * @type {boolean}
   */
  ENABLE_DEEP_SCAN_STYLE_REFERENCES:
    process.env.ENABLE_DEEP_SCAN_STYLE_REFERENCES === "true",
  /**
   * Style pack A/B: `off` | `on` | `sample`. When unset, falls back to ENABLE_DEEP_SCAN_STYLE_REFERENCES → `on`, else `off`.
   */
  DEEP_SCAN_STYLE_REFERENCE_MODE: (process.env.DEEP_SCAN_STYLE_REFERENCE_MODE || "")
    .trim()
    .toLowerCase(),
  /**
   * When MODE=sample, fraction of rewrites that attempt style (0–100). Default 10.
   */
  DEEP_SCAN_STYLE_REFERENCE_SAMPLE_PCT: (() => {
    const raw = process.env.DEEP_SCAN_STYLE_REFERENCE_SAMPLE_PCT;
    const n = raw === undefined || raw === "" ? 10 : Number(raw);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 10;
  })(),
  /**
   * Chat persona A/B: number of variants (1–26). When optimization is off,
   * `hashAssignPersonaVariant` / `getAssignedPersonaVariant` → A…Z via stable hash % N.
   */
  PERSONA_AB_VARIANT_COUNT: (() => {
    const raw = process.env.PERSONA_AB_VARIANT_COUNT;
    const n = raw === undefined || raw === "" ? 3 : Number(raw);
    return Number.isFinite(n) ? Math.min(26, Math.max(1, Math.floor(n))) : 3;
  })(),
  /**
   * When true: sticky weighted persona variants (Supabase tables + daily recompute).
   * When false: deterministic hash-only assignment (no DB reads for variant).
   */
  PERSONA_AB_OPTIMIZE_ENABLED:
    String(process.env.PERSONA_AB_OPTIMIZE_ENABLED || "").trim().toLowerCase() ===
    "true",
  /** Minimum traffic share per variant after recompute (0–0.49). */
  PERSONA_AB_MIN_WEIGHT: (() => {
    const raw = process.env.PERSONA_AB_MIN_WEIGHT;
    const n = raw === undefined || raw === "" ? 0.15 : Number(raw);
    return Number.isFinite(n) ? Math.min(0.49, Math.max(0, n)) : 0.15;
  })(),
  /** Do not optimize weights until this many paywall_shown events (all variants combined). */
  PERSONA_AB_MIN_SAMPLE_PAYWALL: (() => {
    const raw = process.env.PERSONA_AB_MIN_SAMPLE_PAYWALL;
    const n = raw === undefined || raw === "" ? 100 : Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 100;
  })(),
  /** How often to run recomputeWeights (ms). Default: 24h. */
  PERSONA_AB_RECOMPUTE_INTERVAL_MS: (() => {
    const raw = process.env.PERSONA_AB_RECOMPUTE_INTERVAL_MS;
    const n = raw === undefined || raw === "" ? 86400000 : Number(raw);
    return Number.isFinite(n) ? Math.max(60000, Math.floor(n)) : 86400000;
  })(),
  /**
   * Future: score = (1-b)*success_rate + b*intent_rate. Default false = success_rate only.
   * @type {boolean}
   */
  PERSONA_AB_USE_BLENDED_SCORE:
    String(process.env.PERSONA_AB_USE_BLENDED_SCORE || "")
      .trim()
      .toLowerCase() === "true",
  /** When blended score is on: weight of intent_rate (0–1). Default 0.3. */
  PERSONA_AB_BLENDED_INTENT_WEIGHT: (() => {
    const raw = process.env.PERSONA_AB_BLENDED_INTENT_WEIGHT;
    const n = raw === undefined || raw === "" ? 0.3 : Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.3;
  })(),
  /**
   * Rolling window (ms) for funnel dedupe when `paymentId` is absent (paywall / intent without row).
   * Default 10 minutes.
   */
  PERSONA_FUNNEL_DEDUPE_WINDOW_MS: (() => {
    const raw = process.env.PERSONA_FUNNEL_DEDUPE_WINDOW_MS;
    const n = raw === undefined || raw === "" ? 600000 : Number(raw);
    return Number.isFinite(n) ? Math.max(60_000, Math.floor(n)) : 600000;
  })(),
  /**
   * TTL (ms) for in-memory dedupe keys scoped with `paymentId` (payment session).
   * Default 48 hours.
   */
  PERSONA_FUNNEL_DEDUPE_PAYMENT_TTL_MS: (() => {
    const raw = process.env.PERSONA_FUNNEL_DEDUPE_PAYMENT_TTL_MS;
    const n = raw === undefined || raw === "" ? 172800000 : Number(raw);
    return Number.isFinite(n) ? Math.max(60_000, Math.floor(n)) : 172800000;
  })(),
  /** Rolling calendar days for funnel stats used in recompute (server local date). */
  PERSONA_AB_STATS_WINDOW_DAYS: (() => {
    const raw = process.env.PERSONA_AB_STATS_WINDOW_DAYS;
    const n = raw === undefined || raw === "" ? 14 : Number(raw);
    return Number.isFinite(n) ? Math.min(365, Math.max(1, Math.floor(n))) : 14;
  })(),
  /**
   * How daily buckets are weighted: `uniform` | `linear` | `exp` (recent days heavier).
   */
  PERSONA_AB_STATS_WEIGHT_MODE: (process.env.PERSONA_AB_STATS_WEIGHT_MODE || "uniform")
    .trim()
    .toLowerCase(),
  /** When WEIGHT_MODE=exp: growth per day step (oldest→newest). */
  PERSONA_AB_STATS_EXP_LAMBDA: (() => {
    const raw = process.env.PERSONA_AB_STATS_EXP_LAMBDA;
    const n = raw === undefined || raw === "" ? 0.35 : Number(raw);
    return Number.isFinite(n) ? Math.min(3, Math.max(0.01, n)) : 0.35;
  })(),
  /** Bayesian smoothing for success (and intent when blended): (success + α) / (paywall + β). */
  PERSONA_AB_BAYES_ALPHA: (() => {
    const raw = process.env.PERSONA_AB_BAYES_ALPHA;
    const n = raw === undefined || raw === "" ? 1 : Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 1;
  })(),
  PERSONA_AB_BAYES_BETA: (() => {
    const raw = process.env.PERSONA_AB_BAYES_BETA;
    const n = raw === undefined || raw === "" ? 1 : Number(raw);
    return Number.isFinite(n) ? Math.max(1e-9, n) : 1;
  })(),
  /** Hybrid AI rephrasing for non-scan persona copy only (routing/state/payment remain deterministic). */
  HYBRID_PERSONA_ENABLED:
    String(process.env.HYBRID_PERSONA_ENABLED || "").trim().toLowerCase() ===
    "true",
  /** Comma-separated reply types allowed for hybrid AI rollout. */
  HYBRID_PERSONA_ALLOWED_TYPES:
    process.env.HYBRID_PERSONA_ALLOWED_TYPES ||
    "waiting_birthdate_guidance,pending_verify,paywall",
  /** Small/fast model for short Thai chat rephrase JSON output. */
  HYBRID_PERSONA_MODEL:
    String(process.env.HYBRID_PERSONA_MODEL || "").trim() || "gpt-4.1-mini",
  /** Timeout for hybrid AI call (ms). */
  HYBRID_PERSONA_TIMEOUT_MS: (() => {
    const raw = process.env.HYBRID_PERSONA_TIMEOUT_MS;
    const n = raw === undefined || raw === "" ? 2500 : Number(raw);
    return Number.isFinite(n) ? Math.max(300, Math.floor(n)) : 2500;
  })(),
  /**
   * Supabase Storage bucket for scan object images (public read; used in HTML report hero).
   * Set to empty string to skip uploads — report still works with placeholder.
   */
  SCAN_OBJECT_IMAGE_BUCKET: String(
    process.env.SCAN_OBJECT_IMAGE_BUCKET ?? "scan-object-images",
  ).trim(),
  /**
   * Phase 2.3: use summary-first Flex (1–2 bubbles) instead of legacy 3-carousel + optional report.
   * @type {boolean}
   */
  FLEX_SCAN_SUMMARY_FIRST:
    String(process.env.FLEX_SCAN_SUMMARY_FIRST ?? "true")
      .trim()
      .toLowerCase() ===
    "true",
  /**
   * When {@link FLEX_SCAN_SUMMARY_FIRST} is true: fraction of LINE users (0–100) who receive
   * summary-first UI (stable bucket from `userId`). Default 100 = all traffic.
   * Set to 10–20 for soft rollout; set 0 to disable summary-first for everyone without toggling master.
   * @type {number}
   */
  FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT: (() => {
    const raw = process.env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT;
    if (raw === undefined || raw === "") return 100;
    const n = Number(raw);
    return Number.isFinite(n)
      ? Math.min(100, Math.max(0, Math.floor(n)))
      : 100;
  })(),
  /**
   * When FLEX_SCAN_SUMMARY_FIRST: add a separate carousel bubble for the HTML report link
   * (instead of embedding the URI button in the summary bubble footer).
   * @type {boolean}
   */
  FLEX_SUMMARY_APPEND_REPORT_BUBBLE:
    String(process.env.FLEX_SUMMARY_APPEND_REPORT_BUBBLE || "")
      .trim()
      .toLowerCase() === "true",
  /**
   * Final scan result on LINE: `summary_link` = short summary + report URL only (no Flex, no full model text).
   * `legacy_full` = previous behavior (Flex + full `resultText` as text fallback).
   * Default `legacy_full` for safe rollout; set `LINE_FINAL_DELIVERY_MODE=summary_link` to enable Batch 3 behavior.
   * @type {"summary_link" | "legacy_full"}
   */
  LINE_FINAL_DELIVERY_MODE: (() => {
    const raw = String(
      process.env.LINE_FINAL_DELIVERY_MODE || "legacy_full",
    )
      .trim()
      .toLowerCase();
    if (raw === "summary_link") return "summary_link";
    return "legacy_full";
  })(),
  /**
   * Layer 0: drop duplicate LINE `message.id` redeliveries + suppress identical text bursts (no LLM).
   * @type {boolean}
   */
  EDGE_GATE_ENABLED:
    String(process.env.EDGE_GATE_ENABLED ?? "true")
      .trim()
      .toLowerCase() !== "false",
  /** TTL for seen LINE message ids (ms). Default 10 minutes. */
  EDGE_GATE_MESSAGE_DEDUP_TTL_MS: (() => {
    const raw = process.env.EDGE_GATE_MESSAGE_DEDUP_TTL_MS;
    const n = raw === undefined || raw === "" ? 600_000 : Number(raw);
    return Number.isFinite(n) ? Math.max(60_000, Math.floor(n)) : 600_000;
  })(),
  /**
   * If the user sends the same normalized text again within this window (ms), suppress (no reply).
   * Default 7.5s. Set 0 to disable identical-text suppression (dedup only).
   */
  EDGE_GATE_IDENTICAL_TEXT_WINDOW_MS: (() => {
    const raw = process.env.EDGE_GATE_IDENTICAL_TEXT_WINDOW_MS;
    const n = raw === undefined || raw === "" ? 7500 : Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 7500;
  })(),
  /**
   * Risk-based: after N edge suppressions in a 10-minute window, require unlock phrase (rare).
   * @type {boolean}
   */
  EDGE_GATE_SOFT_VERIFY_ENABLED:
    String(process.env.EDGE_GATE_SOFT_VERIFY_ENABLED || "")
      .trim()
      .toLowerCase() === "true",
  EDGE_GATE_SOFT_VERIFY_SUPPRESSION_THRESHOLD: (() => {
    const raw = process.env.EDGE_GATE_SOFT_VERIFY_SUPPRESSION_THRESHOLD;
    const n = raw === undefined || raw === "" ? 4 : Number(raw);
    return Number.isFinite(n) ? Math.max(2, Math.floor(n)) : 4;
  })(),
  /**
   * Phase A: LLM may rephrase non-scan copy only; routing and truth remain deterministic (fail closed).
   */
  CONV_AI_ENABLED:
    String(process.env.CONV_AI_ENABLED || "").trim().toLowerCase() === "true",
  CONV_AI_MODEL:
    String(process.env.CONV_AI_MODEL || "").trim() || "gpt-4.1-mini",
  CONV_AI_TIMEOUT_MS: (() => {
    const raw = process.env.CONV_AI_TIMEOUT_MS;
    const n = raw === undefined || raw === "" ? 3200 : Number(raw);
    return Number.isFinite(n) ? Math.max(400, Math.floor(n)) : 3200;
  })(),
  /** Optional: Google AI Gemini API key (also accepts GOOGLE_API_KEY). */
  GEMINI_API_KEY: String(process.env.GEMINI_API_KEY || "").trim(),
  GOOGLE_API_KEY: String(process.env.GOOGLE_API_KEY || "").trim(),
  /**
   * Front conversation: Gemini Flash-Lite planner + phrasing (non-scan only).
   * When false, orchestrator is off regardless of GEMINI_FRONT_ORCHESTRATOR_MODE.
   */
  GEMINI_FRONT_ORCHESTRATOR_ENABLED:
    String(process.env.GEMINI_FRONT_ORCHESTRATOR_ENABLED || "")
      .trim()
      .toLowerCase() === "true",
  /** `off` | `shadow` | `active` */
  GEMINI_FRONT_ORCHESTRATOR_MODE: (() => {
    const m = String(process.env.GEMINI_FRONT_ORCHESTRATOR_MODE || "off")
      .trim()
      .toLowerCase();
    if (m === "shadow" || m === "active" || m === "off") return m;
    return "off";
  })(),
  /** When true, Gemini routing applies only to Phase-1 funnel states. */
  GEMINI_FRONT_PHASE1_ONLY:
    String(process.env.GEMINI_FRONT_PHASE1_ONLY || "true").trim().toLowerCase() !==
    "false",
  GEMINI_FRONT_MODEL:
    String(process.env.GEMINI_FRONT_MODEL || "").trim() || "gemini-2.5-flash-lite",
  GEMINI_FRONT_TIMEOUT_MS: (() => {
    const raw = process.env.GEMINI_FRONT_TIMEOUT_MS;
    const n = raw === undefined || raw === "" ? 3200 : Number(raw);
    return Number.isFinite(n) ? Math.max(400, Math.floor(n)) : 3200;
  })(),
  /**
   * When `true`: `runScanFlow` sends a short pre-scan push ack and lineWebhook skips
   * `before_scan_sequence` on birthdate→scan. Default on (legacy UX). Set
   * `SEND_PRE_SCAN_ACK_PUSH_ONLY=false` to disable push-only ack and show `before_scan_sequence` again.
   */
  SEND_PRE_SCAN_ACK_PUSH_ONLY:
    String(process.env.SEND_PRE_SCAN_ACK_PUSH_ONLY ?? "true").trim().toLowerCase() !==
    "false",
  /**
   * When `warn`: log NONSCAN_REPLY_BYPASS_SUSPECT if replyText/pushText is used outside
   * scan path and outside non-scan gateway (rollout / dev visibility).
   */
  NONSCAN_REPLY_AUDIT:
    String(process.env.NONSCAN_REPLY_AUDIT || "").trim().toLowerCase() || "off",
  /** When `true`: unregistered `auditExemptEnter` reasons throw (CI / strict rollouts). */
  NONSCAN_AUDIT_EXEMPT_STRICT:
    String(process.env.NONSCAN_AUDIT_EXEMPT_STRICT || "").trim() === "1",
  /**
   * Payment slip gate: optional vision classifier. Default on. Set `false` to skip API calls;
   * non-fast-reject images become unclear (fail closed).
   */
  SLIP_GATE_VISION_ENABLED: process.env.SLIP_GATE_VISION_ENABLED !== "false",
  SLIP_GATE_VISION_MODEL:
    String(process.env.SLIP_GATE_VISION_MODEL || "").trim() || "gpt-4.1-mini",
  SLIP_ACCEPT_MIN_SCORE: (() => {
    const raw = process.env.SLIP_ACCEPT_MIN_SCORE;
    const n = raw === undefined || raw === "" ? 0.78 : Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.78;
  })(),
  SLIP_EVIDENCE_MIN_SIGNALS: (() => {
    const raw = process.env.SLIP_EVIDENCE_MIN_SIGNALS;
    const n = raw === undefined || raw === "" ? 3 : Number(raw);
    return Number.isFinite(n) ? Math.min(4, Math.max(1, Math.floor(n))) : 3;
  })(),

  /**
   * Ener Scan V2: async webhook → storage → DB queue → workers (see docs/ENER_SCAN_V2_ROLLOUT.md).
   * When `true`, web attempts `ingestScanImageAsyncV2` for scan image flows (requires literal trimmed `true`).
   */
  ENABLE_ASYNC_SCAN_V2:
    String(process.env.ENABLE_ASYNC_SCAN_V2 || "").trim() === "true",
  /**
   * When `true` and async ingest fails, allow synchronous `runScanFlow` only if
   * `ENABLE_LEGACY_WEB_INLINE_SCAN` is also `true`. Alone it does not enable inline scan.
   */
  ENABLE_SYNC_SCAN_FALLBACK:
    String(process.env.ENABLE_SYNC_SCAN_FALLBACK || "").trim() === "true",
  /**
   * Emergency only: allows `runScanFlow` (inline deep scan) from LINE webhook image flows.
   * Must stay `false` in normal production.
   */
  ENABLE_LEGACY_WEB_INLINE_SCAN:
    String(process.env.ENABLE_LEGACY_WEB_INLINE_SCAN || "").trim() === "true",
  /**
   * When `true`, legacy synchronous scan (`runScanFlow` / `replyScanResult` direct LINE send)
   * may run. Default **false** — webhook no longer calls `runScanFlow`; handlers fail closed unless
   * explicitly enabled (e.g. local debugging).
   * @type {boolean}
   */
  ALLOW_LEGACY_SCAN_PATHS:
    String(process.env.ALLOW_LEGACY_SCAN_PATHS || "").trim() === "true",
  /** Supabase Storage bucket for scan_uploads (create bucket + policies in dashboard). */
  SCAN_V2_UPLOAD_BUCKET:
    String(process.env.SCAN_V2_UPLOAD_BUCKET || "").trim() || "scan-uploads",
  /** Optional Redis for rate-limit keys / dedupe (workers use DB locks if unset). */
  REDIS_URL: String(process.env.REDIS_URL || "").trim() || null,
  /** Key prefix for Scan V2 Redis keys (locks, dedupe, heartbeats). */
  SCAN_V2_REDIS_PREFIX:
    String(process.env.SCAN_V2_REDIS_PREFIX || "ener-scan:v2:").trim() ||
    "ener-scan:v2:",
  /** Stale `scan_jobs.processing` requeue threshold (ms). Default 15 minutes. */
  SCAN_V2_STALE_PROCESSING_MS: Math.max(
    60_000,
    Number(process.env.SCAN_V2_STALE_PROCESSING_MS || 900_000) || 900_000,
  ),
  /**
   * Canary / monitoring thresholds (documented; app logs compare in maintenance / ops).
   * Tune via env without code deploy.
   */
  CANARY_QUEUE_BACKLOG_MAX: Math.max(
    0,
    Number(process.env.CANARY_QUEUE_BACKLOG_MAX || 500) || 500,
  ),
  CANARY_LINE_429_RATE_MAX_PER_HOUR: Math.max(
    0,
    Number(process.env.CANARY_LINE_429_RATE_MAX_PER_HOUR || 120) || 120,
  ),
  CANARY_DELIVERY_SUCCESS_RATE_MIN: (() => {
    const n = Number(process.env.CANARY_DELIVERY_SUCCESS_RATE_MIN || 0.95);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.95;
  })(),
  CANARY_REPORT_PUBLISH_SUCCESS_RATE_MIN: (() => {
    const n = Number(process.env.CANARY_REPORT_PUBLISH_SUCCESS_RATE_MIN || 0.98);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.98;
  })(),
  ENABLE_SCAN_WORKER: process.env.ENABLE_SCAN_WORKER === "true",
  ENABLE_DELIVERY_WORKER: process.env.ENABLE_DELIVERY_WORKER === "true",
  ENABLE_MAINTENANCE_WORKER: process.env.ENABLE_MAINTENANCE_WORKER === "true",
  SCAN_WORKER_CONCURRENCY: Math.max(
    1,
    Number(process.env.SCAN_WORKER_CONCURRENCY || 2) || 2,
  ),
  DELIVERY_WORKER_CONCURRENCY: Math.max(
    1,
    Number(process.env.DELIVERY_WORKER_CONCURRENCY || 1) || 1,
  ),
};

console.log("[ENV_CHECK]", {
  GEMINI_FRONT_ORCHESTRATOR_ENABLED: env.GEMINI_FRONT_ORCHESTRATOR_ENABLED,
  GEMINI_FRONT_ORCHESTRATOR_MODE: env.GEMINI_FRONT_ORCHESTRATOR_MODE,
  GEMINI_FRONT_PHASE1_ONLY: env.GEMINI_FRONT_PHASE1_ONLY,
});
console.log(
  JSON.stringify({
    event: "ENV_SCAN_V2_FLAGS",
    path: "web",
    timestamp: scanV2TraceTs(),
    ENABLE_ASYNC_SCAN_V2: env.ENABLE_ASYNC_SCAN_V2,
    ENABLE_SYNC_SCAN_FALLBACK: env.ENABLE_SYNC_SCAN_FALLBACK,
    ENABLE_LEGACY_WEB_INLINE_SCAN: env.ENABLE_LEGACY_WEB_INLINE_SCAN,
    ALLOW_LEGACY_SCAN_PATHS: env.ALLOW_LEGACY_SCAN_PATHS,
  }),
);
