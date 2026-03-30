/**
 * Public report HTTP contract (Batch 1 — types only; route implementation in Batch 2+).
 *
 * Planned: GET /api/public-report/:publicToken
 *
 * Existing related storage:
 * - `scan_public_reports` (legacy FK → scan_results) — current token + JSON for HTML
 * - `report_publications` (FK → scan_results_v2) — publication lifecycle (migration 024)
 *
 * @module publicReportApi.contract
 */

/** @typedef {"REPORT_NOT_FOUND"|"REPORT_EXPIRED"|"REPORT_UNAVAILABLE"} PublicReportErrorCode */

/**
 * @typedef {Object} PublicReportSuccessBody
 * @property {true} ok
 * @property {Object} report
 * @property {string} report.publicationId
 * @property {string} report.scanResultId
 * @property {string} report.generatedAt
 * @property {import("../services/reports/reportPayloadV1.types.js").ReportPayloadV1Summary} report.summary
 * @property {import("../services/reports/reportPayloadV1.types.js").ReportPayloadV1Sections} report.sections
 * @property {string} [report.objectImageUrl]
 */

/**
 * @typedef {Object} PublicReportErrorBody
 * @property {false} ok
 * @property {PublicReportErrorCode} code
 * @property {string} [message]
 */

/**
 * Example success JSON shape (for OpenAPI / tests later):
 * @example
 * {
 *   "ok": true,
 *   "report": {
 *     "publicationId": "…",
 *     "scanResultId": "…",
 *     "generatedAt": "2026-03-30T12:00:00.000Z",
 *     "summary": { },
 *     "sections": { },
 *     "objectImageUrl": "https://…"
 *   }
 * }
 */

export {};
