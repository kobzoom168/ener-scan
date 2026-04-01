import { idPrefix8, lineUserIdPrefix8 } from "../scanV2Trace.util.js";

/** Stable error codes for final delivery / publication triage (no PII). */
export const FinalDeliveryErrorCode = {
  PUBLICATION_BUILD_FAILED: "publication_build_failed",
  PUBLICATION_PAYLOAD_MISSING: "publication_payload_missing",
  PUBLICATION_UPSERT_FAILED: "publication_upsert_failed",
  REPORT_TOKEN_MISSING: "report_token_missing",
  DELIVERY_STRATEGY_MISSING: "delivery_strategy_missing",
  LINE_TRANSPORT_FAILED: "line_transport_failed",
  LINE_RATE_LIMITED: "line_rate_limited",
  PUBLIC_REPORT_NOT_FOUND: "public_report_not_found",
  PUBLIC_REPORT_EXPIRED: "public_report_expired",
  PUBLIC_REPORT_UNAVAILABLE: "public_report_unavailable",
  REPORT_RENDER_FAILED: "report_render_failed",
};

/**
 * @param {string | null | undefined} tok
 * @returns {string}
 */
export function publicTokenPrefix12(tok) {
  const s = String(tok ?? "").trim();
  if (!s) return "";
  return s.length <= 12 ? s : s.slice(0, 12);
}

/**
 * @param {string | null | undefined} id
 * @returns {string}
 */
export function messageIdPrefix12(id) {
  return String(id ?? "").trim().slice(0, 12);
}

/**
 * Shared correlation fields for worker-scan / worker-delivery / report routes.
 * Omit null/undefined/empty string values.
 *
 * @param {object} o
 * @param {string} [o.path]
 * @param {string} [o.worker]
 * @param {unknown} [o.jobId]
 * @param {unknown} [o.outboundId]
 * @param {unknown} [o.publicationId]
 * @param {string | null} [o.publicToken]
 * @param {unknown} [o.scanResultId]
 * @param {unknown} [o.lineUserId]
 * @param {string | null} [o.messageId]
 */
export function buildFinalDeliveryCorrelation(o) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (o.path) out.path = o.path;
  if (o.worker) out.worker = o.worker;
  const jp = idPrefix8(o.jobId);
  if (jp) out.jobIdPrefix = jp;
  const ob = idPrefix8(o.outboundId);
  if (ob) out.outboundIdPrefix = ob;
  const pub = idPrefix8(o.publicationId);
  if (pub) out.publicationIdPrefix = pub;
  const sr = idPrefix8(o.scanResultId);
  if (sr) out.scanResultIdPrefix = sr;
  const pt = publicTokenPrefix12(o.publicToken);
  if (pt) out.publicTokenPrefix = pt;
  const lu = lineUserIdPrefix8(o.lineUserId);
  if (lu) out.lineUserIdPrefix = lu;
  const mid = messageIdPrefix12(o.messageId);
  if (mid) out.messageIdPrefix = mid;
  return out;
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function classifyReportPublicationBuildError(err) {
  const msg = String(
    err && typeof err === "object" && "message" in err
      ? /** @type {{ message?: unknown }} */ (err).message
      : err,
  ).toLowerCase();
  if (msg.includes("token") && msg.includes("missing")) {
    return FinalDeliveryErrorCode.REPORT_TOKEN_MISSING;
  }
  if (msg.includes("payload") || msg.includes("report_payload")) {
    return FinalDeliveryErrorCode.PUBLICATION_PAYLOAD_MISSING;
  }
  return FinalDeliveryErrorCode.PUBLICATION_BUILD_FAILED;
}

/**
 * @param {unknown} msg
 * @param {unknown} payload
 */
export function buildScanResultOutboundTrace(msg, payload) {
  const p =
    payload && typeof payload === "object"
      ? /** @type {Record<string, unknown>} */ (payload)
      : {};
  const tok =
    typeof p.publicToken === "string"
      ? p.publicToken
      : typeof p.html_public_token === "string"
        ? p.html_public_token
        : null;
  return {
    ...buildFinalDeliveryCorrelation({
      path: undefined,
      jobId: msg.related_job_id,
      publicationId: p.reportPublicationId,
      publicToken: tok,
      scanResultId: p.scanResultV2Id,
    }),
    accessSource:
      typeof p.accessSource === "string" ? p.accessSource : null,
    deliveryStrategy:
      p.deliveryStrategy != null
        ? String(p.deliveryStrategy)
        : "legacy_full",
    summaryLinkMode:
      String(p.deliveryStrategy || "") === "summary_link",
    hasReportUrl: Boolean(String(p.reportUrl || "").trim()),
    hasLegacyReportPayload: Boolean(p.reportPayload),
    lineSummaryPresent: Boolean(p.lineSummary),
  };
}
