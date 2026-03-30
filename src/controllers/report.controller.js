import {
  getReportByPublicToken,
  PHASE1_DEMO_PUBLIC_TOKEN,
} from "../services/reports/reportQuery.service.js";
import { renderReportHtmlPage } from "../services/reports/reportHtmlRenderer.service.js";
import {
  logReportPageOpen,
  safeTokenPrefix,
} from "../utils/reports/reportRolloutTelemetry.util.js";

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
  const html = renderReportHtmlPage(payload);
  const hasObjectImage = Boolean(
    String(payload?.object?.objectImageUrl || "").trim(),
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
