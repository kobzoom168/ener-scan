/**
 * @fileoverview Canonical **ReportPayloadV1** for Ener Scan Hybrid (LINE + Web).
 *
 * ## Role
 *
 * This module is the **single source of truth** JSDoc contract for the scan result
 * payload that will feed:
 * - **Public HTML report** (primary artifact — full payload or renderable projection)
 * - **LINE** pushes (must use **only a summary subset**: e.g. `summary` + `meta` slices,
 *   plus link to web; do not depend on full `sections` in chat)
 * - **Future Flex shell** (may bind to `summary` + short fields; same rule: thin surface)
 *
 * ## Relationship to legacy `ReportPayload` (`reportPayload.types.js`)
 *
 * Today, `ReportPayload` in `reportPayload.types.js` / `buildReportPayloadFromScan`
 * remains the **live producer** for DB + Flex (REPORT_PAYLOAD_VERSION 1.1.x). Fields differ
 * (`reportId` vs `scanResultId`, nested `object` vs flat `objectImageUrl`, section keys like
 * `whatItGives` vs `energyProfile`). **Do not** mass-refactor producers in this batch;
 * Batch 2 should add an explicit mapper `ReportPayload → ReportPayloadV1` (or build V1
 * from the same parsed scan text) when wiring HTML/API.
 *
 * @module reportPayloadV1.types
 */

/** @type {"1.0.0"} */
export const REPORT_PAYLOAD_V1_VERSION = "1.0.0";

/**
 * Summary slice safe to reuse on LINE (headline, bullets, teaser, scores).
 * Full narrative lives in `ReportPayloadV1Sections`.
 *
 * @typedef {Object} ReportPayloadV1Summary
 * @property {number|null} [energyScore] — typically 0–10 scale when present
 * @property {string|null} [mainEnergy] — primary energy label (Thai prose ok)
 * @property {number|null} [compatibility] — 0–100 when present (maps from legacy `compatibilityPercent`)
 * @property {string} [headline] — short title for web hero / Flex
 * @property {string[]} [bulletPoints] — short lines; LINE should cap count/length in transport layer
 * @property {string} [teaserText] — one short paragraph for LINE / link preview
 */

/**
 * Long-form section bodies for **web HTML** (markdown or plain text per renderer).
 * LINE must not require these fields to be fully rendered in chat.
 *
 * @typedef {Object} ReportPayloadV1Sections
 * @property {string} [energyProfile]
 * @property {string} [ownerFit]
 * @property {string} [strengths]
 * @property {string} [cautions]
 * @property {string} [suitableUseCases]
 * @property {string} [hiddenEnergy]
 * @property {string} [interpretationNotes]
 */

/**
 * @typedef {Object} ReportPayloadV1Meta
 * @property {string} [modelName]
 * @property {string} [promptVersion]
 * @property {string} [qualityTier]
 * @property {boolean} [fromCache]
 */

/**
 * Canonical scan result payload for hybrid delivery surfaces.
 *
 * @typedef {Object} ReportPayloadV1
 * @property {typeof REPORT_PAYLOAD_V1_VERSION} version — bump when breaking field meaning
 * @property {string} scanResultId — prefer `scan_results_v2.id` for V2 async; legacy HTML may still reference `scan_results.id` until migrated
 * @property {string} scanJobId — `scan_jobs.id` when available (V2 pipeline)
 * @property {string} appUserId — `app_users.id`
 * @property {string} lineUserId — LINE user id (U…)
 * @property {string} [objectType] — free text or normalized label from object check
 * @property {string} [objectImageUrl] — HTTPS URL to hero image when stored
 * @property {string} generatedAt — ISO 8601
 * @property {ReportPayloadV1Summary} summary
 * @property {ReportPayloadV1Sections} sections
 * @property {ReportPayloadV1Meta} meta
 */

export {};
