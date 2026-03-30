import {
  createPhase1MockReportPayload,
  PHASE1_DEMO_PUBLIC_TOKEN,
} from "./mockReportPayload.js";
import { getScanPublicReportByToken } from "../../stores/scanPublicReports.db.js";
import { getPublicationWithScanResultV2ByToken } from "../../stores/reportPublications.db.js";

/** @type {Map<string, import("./reportPayload.types.js").ReportPayload>} */
const memoryByPublicToken = new Map();

function seedPhase1Demo() {
  const payload = createPhase1MockReportPayload();
  memoryByPublicToken.set(PHASE1_DEMO_PUBLIC_TOKEN, payload);
}

seedPhase1Demo();

/**
 * @param {object} pub
 * @returns {boolean}
 */
function isPublicationExpired(pub) {
  if (pub?.status === "expired") return true;
  const ex = pub?.expires_at;
  if (ex == null || ex === "") return false;
  const t = Date.parse(String(ex));
  if (!Number.isFinite(t)) return false;
  return t < Date.now();
}

/**
 * Canonical resolution: memory demo → `report_publications` + `scan_results_v2` → legacy `scan_public_reports`.
 *
 * @param {string} publicToken
 * @returns {Promise<
 *   | {
 *       kind: "ok";
 *       payload: import("./reportPayload.types.js").ReportPayload;
 *       loadSource: "memory" | "publication" | "db";
 *       publicationId: string | null;
 *       scanResultIdForApi: string;
 *     }
 *   | {
 *       kind: "error";
 *       code: "REPORT_NOT_FOUND" | "REPORT_EXPIRED" | "REPORT_UNAVAILABLE";
 *       httpStatus: number;
 *     }
 * >}
 */
export async function resolvePublicReportPayload(publicToken) {
  const key = String(publicToken || "").trim();
  if (!key) {
    console.log(
      JSON.stringify({ event: "REPORT_LOOKUP", outcome: "empty_token" }),
    );
    return { kind: "error", code: "REPORT_NOT_FOUND", httpStatus: 404 };
  }

  const mem = memoryByPublicToken.get(key);
  if (mem) {
    console.log(
      JSON.stringify({
        event: "REPORT_LOOKUP",
        outcome: "memory_hit",
        tokenPrefix: `${key.slice(0, 12)}…`,
      }),
    );
    return {
      kind: "ok",
      payload: mem,
      loadSource: "memory",
      publicationId: null,
      scanResultIdForApi: String(mem.reportId || ""),
    };
  }

  const pubRow = await getPublicationWithScanResultV2ByToken(key);
  if (pubRow) {
    const { publication: pub, scanResultV2: v2 } = pubRow;

    if (isPublicationExpired(pub)) {
      console.log(
        JSON.stringify({
          event: "REPORT_LOOKUP",
          outcome: "publication_expired",
          tokenPrefix: `${key.slice(0, 12)}…`,
        }),
      );
      return { kind: "error", code: "REPORT_EXPIRED", httpStatus: 410 };
    }

    if (pub.status === "failed") {
      return { kind: "error", code: "REPORT_UNAVAILABLE", httpStatus: 503 };
    }

    if (pub.status !== "published") {
      return { kind: "error", code: "REPORT_UNAVAILABLE", httpStatus: 503 };
    }

    const raw = v2?.report_payload_json;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return { kind: "error", code: "REPORT_UNAVAILABLE", httpStatus: 503 };
    }

    const payload =
      /** @type {import("./reportPayload.types.js").ReportPayload} */ (raw);

    console.log(
      JSON.stringify({
        event: "REPORT_LOOKUP",
        outcome: "publication_hit",
        tokenPrefix: `${key.slice(0, 12)}…`,
        scanResultIdPrefix: String(pub.scan_result_id || "").slice(0, 8),
      }),
    );

    return {
      kind: "ok",
      payload,
      loadSource: "publication",
      publicationId: String(pub.id || ""),
      scanResultIdForApi: String(pub.scan_result_id || ""),
    };
  }

  try {
    const row = await getScanPublicReportByToken(key);
    if (!row) {
      console.log(
        JSON.stringify({
          event: "REPORT_LOOKUP",
          outcome: "db_no_row",
          tokenPrefix: `${key.slice(0, 12)}…`,
        }),
      );
      return { kind: "error", code: "REPORT_NOT_FOUND", httpStatus: 404 };
    }
    if (row && row.report_payload && typeof row.report_payload === "object") {
      const pl = /** @type {Record<string, unknown>} */ (row.report_payload);
      const hasSummary = pl.summary != null;
      const hasSections = pl.sections != null;
      const payload =
        /** @type {import("./reportPayload.types.js").ReportPayload} */ (
          row.report_payload
        );
      console.log(
        JSON.stringify({
          event: "REPORT_LOOKUP",
          outcome: "db_hit",
          tokenPrefix: `${key.slice(0, 12)}…`,
          hasSummary,
          hasSections,
          reportVersion: row.report_version || null,
        }),
      );
      return {
        kind: "ok",
        payload,
        loadSource: "db",
        publicationId: null,
        scanResultIdForApi: String(payload.reportId || ""),
      };
    }
    console.log(
      JSON.stringify({
        event: "REPORT_LOOKUP",
        outcome: "db_malformed_payload",
        tokenPrefix: `${key.slice(0, 12)}…`,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "REPORT_LOOKUP",
        outcome: "db_error",
        tokenPrefix: `${key.slice(0, 12)}…`,
        message: err?.message,
      }),
    );
  }

  return { kind: "error", code: "REPORT_NOT_FOUND", httpStatus: 404 };
}

/**
 * @param {string} publicToken
 * @returns {Promise<{
 *   payload: import("./reportPayload.types.js").ReportPayload | null;
 *   loadSource: "memory" | "publication" | "db" | null;
 *   accessError: { code: "REPORT_NOT_FOUND" | "REPORT_EXPIRED" | "REPORT_UNAVAILABLE"; httpStatus: number } | null;
 *   publicationId: string | null;
 *   scanResultIdForApi: string | null;
 * }>}
 */
export async function getReportByPublicToken(publicToken) {
  const r = await resolvePublicReportPayload(publicToken);
  if (r.kind === "error") {
    return {
      payload: null,
      loadSource: null,
      accessError: { code: r.code, httpStatus: r.httpStatus },
      publicationId: null,
      scanResultIdForApi: null,
    };
  }
  return {
    payload: r.payload,
    loadSource: r.loadSource,
    accessError: null,
    publicationId: r.publicationId,
    scanResultIdForApi: r.scanResultIdForApi,
  };
}

export { PHASE1_DEMO_PUBLIC_TOKEN };
