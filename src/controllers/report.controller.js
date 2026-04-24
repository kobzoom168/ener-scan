import {
  getReportByPublicToken,
  PHASE1_DEMO_PUBLIC_TOKEN,
} from "../services/reports/reportQuery.service.js";
import { renderReportHtmlPage } from "../services/reports/reportHtmlRenderer.service.js";
import { normalizeReportPayloadForRender } from "../utils/reports/reportPayloadNormalize.util.js";
import { renderAmuletEnergyMeaningHtml } from "../templates/reports/amuletEnergyMeaning.template.js";
import {
  logReportPageOpen,
  safeTokenPrefix,
} from "../utils/reports/reportRolloutTelemetry.util.js";
import {
  FinalDeliveryErrorCode,
  publicTokenPrefix12,
} from "../utils/scanV2/finalDeliveryTelemetry.util.js";

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>ไม่พบรายงาน</title>
<style>body{font-family:Sarabun,system-ui,sans-serif;background:#0c0e12;color:#e8e6e3;text-align:center;padding:2rem;}</style>
</head><body><p>ไม่พบรายงานนี้</p></body></html>`;

const EXPIRED_HTML = `<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>ลิงก์หมดอายุ</title>
<style>body{font-family:Sarabun,system-ui,sans-serif;background:#0c0e12;color:#e8e6e3;text-align:center;padding:2rem;}</style>
</head><body><p>ลิงก์รายงานนี้หมดอายุแล้ว</p></body></html>`;

const UNAVAILABLE_HTML = `<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>ไม่พร้อมแสดงผล</title>
<style>body{font-family:Sarabun,system-ui,sans-serif;background:#0c0e12;color:#e8e6e3;text-align:center;padding:2rem;}</style>
</head><body><p>รายงานชั่วคราวไม่พร้อมให้เปิด กรุณาลองใหม่ภายหลัง</p></body></html>`;

/**
 * GET /r/demo — redirect to fixed Phase 1 token.
 */
export function getReportDemo(req, res) {
  res.redirect(302, `/r/${PHASE1_DEMO_PUBLIC_TOKEN}`);
}

/**
 * GET /r/:publicToken
 */
export async function getReportByToken(req, res) {
  const publicToken = String(req.params?.publicToken || "").trim();
  const { payload, loadSource, accessError } =
    await getReportByPublicToken(publicToken);
  const tokenPrefix = safeTokenPrefix(publicToken, 8);
  if (!payload) {
    const status = accessError?.httpStatus ?? 404;
    const html =
      accessError?.code === "REPORT_EXPIRED"
        ? EXPIRED_HTML
        : accessError?.code === "REPORT_UNAVAILABLE"
          ? UNAVAILABLE_HTML
          : NOT_FOUND_HTML;
    const outcome =
      status === 410 ? "expired" : status === 503 ? "unavailable" : "not_found";
    console.log(
      JSON.stringify({
        event: "REPORT_HTTP",
        path: "getReportByToken",
        status,
        tokenPrefix: publicToken ? `${publicToken.slice(0, 12)}…` : "",
        publicTokenPrefix: publicTokenPrefix12(publicToken),
        loadSource: loadSource ?? null,
        payloadPresent: false,
      }),
    );
    logReportPageOpen({
      tokenPrefix,
      outcome,
      httpStatus: status,
      loadSource,
      hasObjectImage: false,
      reportVersion: null,
      isDemoToken: publicToken === PHASE1_DEMO_PUBLIC_TOKEN,
    });
    res
      .status(status)
      .type("html")
      .set("Cache-Control", "no-store")
      .send(html);
    return;
  }
  /** @type {string} */
  let html;
  try {
    html = renderReportHtmlPage(payload);
  } catch (renderErr) {
    console.error(
      JSON.stringify({
        event: "REPORT_PUBLIC_RENDER_FAIL",
        path: "getReportByToken",
        publicTokenPrefix: publicTokenPrefix12(publicToken),
        loadSource,
        httpStatus: 503,
        payloadPresent: true,
        errorCode: FinalDeliveryErrorCode.REPORT_RENDER_FAILED,
        reason: String(
          renderErr && typeof renderErr === "object" && "message" in renderErr
            ? /** @type {{ message?: unknown }} */ (renderErr).message
            : renderErr,
        ).slice(0, 240),
      }),
    );
    console.log(
      JSON.stringify({
        event: "REPORT_HTTP",
        path: "getReportByToken",
        status: 503,
        tokenPrefix: publicToken ? `${publicToken.slice(0, 12)}…` : "",
      }),
    );
    logReportPageOpen({
      tokenPrefix,
      outcome: "unavailable",
      httpStatus: 503,
      loadSource,
      hasObjectImage: false,
      reportVersion: null,
      isDemoToken: publicToken === PHASE1_DEMO_PUBLIC_TOKEN,
    });
    return res
      .status(503)
      .type("html")
      .set("Cache-Control", "no-store")
      .send(UNAVAILABLE_HTML);
  }
  const hasObjectImage = Boolean(
    String(payload?.object?.objectImageUrl || "").trim(),
  );
  console.log(
    JSON.stringify({
      event: "REPORT_PUBLIC_RENDER_OK",
      path: "getReportByToken",
      publicTokenPrefix: publicTokenPrefix12(publicToken),
      loadSource,
      httpStatus: 200,
      payloadPresent: true,
      reportUrlPresent: false,
    }),
  );
  console.log(
    JSON.stringify({
      event: "REPORT_HTTP",
      path: "getReportByToken",
      status: 200,
      tokenPrefix: publicToken ? `${publicToken.slice(0, 12)}…` : "",
    }),
  );
  logReportPageOpen({
    tokenPrefix,
    outcome: "ok",
    httpStatus: 200,
    loadSource,
    hasObjectImage,
    reportVersion: payload?.reportVersion ?? null,
    isDemoToken: publicToken === PHASE1_DEMO_PUBLIC_TOKEN,
  });
  res
    .status(200)
    .type("html")
    .set("Cache-Control", "private, no-store")
    .send(html);
}

/**
 * GET /r/:publicToken/energy-meaning — long-form copy for “พลังทั้ง 6 ด้าน” (sacred amulet HTML report only).
 */
export async function getEnergyMeaningByToken(req, res) {
  const publicToken = String(req.params?.publicToken || "").trim();
  const { payload, loadSource, accessError } =
    await getReportByPublicToken(publicToken);
  const tokenPrefix = safeTokenPrefix(publicToken, 8);

  if (!payload) {
    const status = accessError?.httpStatus ?? 404;
    const html =
      accessError?.code === "REPORT_EXPIRED"
        ? EXPIRED_HTML
        : accessError?.code === "REPORT_UNAVAILABLE"
          ? UNAVAILABLE_HTML
          : NOT_FOUND_HTML;
    console.log(
      JSON.stringify({
        event: "REPORT_HTTP",
        path: "getEnergyMeaningByToken",
        status,
        tokenPrefix: publicToken ? `${publicToken.slice(0, 12)}…` : "",
        publicTokenPrefix: publicTokenPrefix12(publicToken),
        loadSource: loadSource ?? null,
        payloadPresent: false,
      }),
    );
    return res
      .status(status)
      .type("html")
      .set("Cache-Control", "no-store")
      .send(html);
  }

  const { payload: normalized, warnings } =
    normalizeReportPayloadForRender(payload);
  if (warnings.length) {
    console.warn(
      JSON.stringify({
        event: "REPORT_RENDER_NORMALIZE",
        path: "getEnergyMeaningByToken",
        warningsCount: warnings.length,
      }),
    );
  }

  const hasAmulet =
    normalized.amuletV1 &&
    typeof normalized.amuletV1 === "object" &&
    !Array.isArray(normalized.amuletV1);

  if (!hasAmulet) {
    console.log(
      JSON.stringify({
        event: "REPORT_HTTP",
        path: "getEnergyMeaningByToken",
        status: 302,
        reason: "not_amulet_lane",
        publicTokenPrefix: publicTokenPrefix12(publicToken),
      }),
    );
    return res.redirect(302, `/r/${encodeURIComponent(publicToken)}`);
  }

  let html;
  try {
    html = renderAmuletEnergyMeaningHtml(normalized);
  } catch (renderErr) {
    console.error(
      JSON.stringify({
        event: "REPORT_PUBLIC_RENDER_FAIL",
        path: "getEnergyMeaningByToken",
        publicTokenPrefix: publicTokenPrefix12(publicToken),
        httpStatus: 503,
        reason: String(
          renderErr && typeof renderErr === "object" && "message" in renderErr
            ? /** @type {{ message?: unknown }} */ (renderErr).message
            : renderErr,
        ).slice(0, 240),
      }),
    );
    return res
      .status(503)
      .type("html")
      .set("Cache-Control", "no-store")
      .send(UNAVAILABLE_HTML);
  }

  console.log(
    JSON.stringify({
      event: "REPORT_HTTP",
      path: "getEnergyMeaningByToken",
      status: 200,
      tokenPrefix: tokenPrefix || "",
      publicTokenPrefix: publicTokenPrefix12(publicToken),
      loadSource: loadSource ?? null,
    }),
  );

  return res
    .status(200)
    .type("html")
    .set("Cache-Control", "private, no-store")
    .send(html);
}
