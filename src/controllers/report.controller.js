import {
  getReportByPublicToken,
  PHASE1_DEMO_PUBLIC_TOKEN,
} from "../services/reports/reportQuery.service.js";
import { renderReportHtmlPage } from "../services/reports/reportHtmlRenderer.service.js";
import { normalizeReportPayloadForRender } from "../utils/reports/reportPayloadNormalize.util.js";
import { renderAmuletOgRadarPngBuffer } from "../utils/reports/amuletOgRadarImage.util.js";
import { env } from "../config/env.js";
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
 * GET /r/:publicToken/og.png — Open Graph radar preview (sacred amulet only). Gated by env.
 */
export async function getReportOgPngByToken(req, res) {
  if (!env.PUBLIC_REPORT_OG_CHART_ENABLED) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  const publicToken = String(req.params?.publicToken || "").trim();
  const { payload, accessError } = await getReportByPublicToken(publicToken);
  if (!payload || accessError) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  if (!payload.amuletV1 || typeof payload.amuletV1 !== "object") {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  let normalized;
  try {
    normalized = normalizeReportPayloadForRender(payload).payload;
  } catch {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  try {
    const buf = await renderAmuletOgRadarPngBuffer(normalized);
    res
      .status(200)
      .type("png")
      .set("Cache-Control", "public, max-age=86400")
      .send(buf);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "REPORT_OG_RADAR_PNG_FAIL",
        path: "getReportOgPngByToken",
        publicTokenPrefix: publicToken ? `${publicToken.slice(0, 12)}…` : "",
        message: String(err?.message || err).slice(0, 200),
      }),
    );
    res.status(500).type("text/plain").send("Unavailable");
  }
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
