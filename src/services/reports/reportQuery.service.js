import {
  createPhase1MockReportPayload,
  PHASE1_DEMO_PUBLIC_TOKEN,
} from "./mockReportPayload.js";
import { getScanPublicReportByToken } from "../../stores/scanPublicReports.db.js";

/** @type {Map<string, import("./reportPayload.types.js").ReportPayload>} */
const memoryByPublicToken = new Map();

function seedPhase1Demo() {
  const payload = createPhase1MockReportPayload();
  memoryByPublicToken.set(PHASE1_DEMO_PUBLIC_TOKEN, payload);
}

seedPhase1Demo();

/**
 * @param {string} publicToken
 * @returns {Promise<{ payload: import("./reportPayload.types.js").ReportPayload | null, loadSource: "memory" | "db" | null }>}
 */
export async function getReportByPublicToken(publicToken) {
  const key = String(publicToken || "").trim();
  if (!key) {
    console.log(
      JSON.stringify({ event: "REPORT_LOOKUP", outcome: "empty_token" }),
    );
    return { payload: null, loadSource: null };
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
      payload: mem,
      loadSource: "memory",
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
      return { payload: null, loadSource: null };
    }
    if (row && row.report_payload && typeof row.report_payload === "object") {
      const pl = /** @type {Record<string, unknown>} */ (row.report_payload);
      const hasSummary = pl.summary != null;
      const hasSections = pl.sections != null;
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
        payload:
          /** @type {import("./reportPayload.types.js").ReportPayload} */ (
            row.report_payload
          ),
        loadSource: "db",
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

  return { payload: null, loadSource: null };
}

export { PHASE1_DEMO_PUBLIC_TOKEN };
