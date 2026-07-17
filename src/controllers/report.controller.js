import {
  getReportByPublicToken,
  PHASE1_DEMO_PUBLIC_TOKEN,
} from "../services/reports/reportQuery.service.js";
import { renderReportHtmlPage } from "../services/reports/reportHtmlRenderer.service.js";
import { normalizeReportPayloadForRender } from "../utils/reports/reportPayloadNormalize.util.js";
import { renderAmuletEnergyMeaningHtml } from "../templates/reports/amuletEnergyMeaning.template.js";
import { renderCrystalBraceletEnergyMeaningHtml } from "../templates/reports/crystalBraceletEnergyMeaning.template.js";
import { renderCrystalBraceletEnergyTimingHtml } from "../templates/reports/crystalBraceletEnergyTiming.template.js";
import { renderAmuletEnergyTimingHtml } from "../templates/reports/amuletEnergyTiming.template.js";
import { renderAmuletLibraryRankingHtml } from "../templates/reports/amuletLibraryRanking.template.js";
import {
  buildSacredAmuletLibraryForLineUser,
  buildSacredAmuletLibraryViewFromPayloadOnly,
} from "../services/reports/sacredAmuletLibrary.service.js";
import {
  buildCrystalBraceletLibraryForLineUser,
  buildCrystalBraceletLibraryViewFromPayloadOnly,
} from "../services/reports/crystalBraceletLibrary.service.js";
import { env } from "../config/env.js";
import { supabase } from "../config/supabase.js";
import { computePaidActive } from "../services/scanOfferAccess.resolver.js";
import {
  countPinnedScanUploadsByLineUser,
  getScanUploadById,
  setScanUploadPinnedForUser,
} from "../stores/scanV2/scanUploads.db.js";
import { getUploadIdForScanResultV2AndLineUser } from "../stores/scanV2/scanResultsV2.db.js";
import { renderShareCardPng } from "../services/reports/shareCard.service.js";
import { resolveEnergyLevelDisplayGrade } from "../utils/reports/energyLevelGrade.util.js";
import { POWER_LABEL_THAI, AMULET_PEAK_SHORT_THAI } from "../amulet/amuletScores.util.js";
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
  let sacredAmuletLibrary = null;
  const { payload: normPre } = normalizeReportPayloadForRender(payload);
  if (
    normPre.amuletV1 &&
    typeof normPre.amuletV1 === "object" &&
    !Array.isArray(normPre.amuletV1)
  ) {
    const uid = String(normPre.userId || "").trim();
    if (uid) {
      try {
        // full: คลังย้ายมาโชว์ทั้งแท่นรางวัล + อันดับบนหน้ารายงานแล้ว (กบ 15 ก.ค.)
        sacredAmuletLibrary = await buildSacredAmuletLibraryForLineUser(uid, {
          libraryThumbScope: "full",
        });
      } catch (libErr) {
        console.warn(
          JSON.stringify({
            event: "REPORT_LIBRARY_LOOKUP_SKIP",
            path: "getReportByToken",
            reason: String(
              libErr && typeof libErr === "object" && "message" in libErr
                ? /** @type {{ message?: unknown }} */ (libErr).message
                : libErr,
            ).slice(0, 200),
          }),
        );
      }
    }
    if (!sacredAmuletLibrary) {
      sacredAmuletLibrary = buildSacredAmuletLibraryViewFromPayloadOnly(normPre);
    }
  }

  // "คลังกำไลของคุณ" — bracelet counterpart of the amulet library (per กบ).
  let crystalBraceletLibrary = null;
  if (
    normPre.crystalBraceletV1 &&
    typeof normPre.crystalBraceletV1 === "object" &&
    !Array.isArray(normPre.crystalBraceletV1)
  ) {
    const uid = String(normPre.userId || "").trim();
    if (uid) {
      try {
        crystalBraceletLibrary = await buildCrystalBraceletLibraryForLineUser(uid);
      } catch (libErr) {
        console.warn(
          JSON.stringify({
            event: "REPORT_LIBRARY_LOOKUP_SKIP",
            path: "getReportByToken",
            lane: "crystal_bracelet",
            reason: String(
              libErr && typeof libErr === "object" && "message" in libErr
                ? /** @type {{ message?: unknown }} */ (libErr).message
                : libErr,
            ).slice(0, 200),
          }),
        );
      }
    }
    if (!crystalBraceletLibrary) {
      crystalBraceletLibrary =
        buildCrystalBraceletLibraryViewFromPayloadOnly(normPre);
    }
  }

  // teaser ขาย 299 บนหน้ารายงาน: อันดับ 1 ของคลังวันนี้ (เบลอ) — เฉพาะเจ้าของที่ยังไม่เป็นสมาชิก
  // (ทุกเลน: พระ กำไล มอลดาไวท์ — คลัง Daily Pick รวมทุกเลนอยู่แล้ว)
  let dailyPickTeaser = null;
  // อันดับ 1-2 ของคลังเซ็นเซอร์ไว้ให้สมาชิกรายเดือนเท่านั้น อันดับ 3 เปิดทุกคน (กบ 15 ก.ค.)
  // accessFull = แพ็กแอคทีฟ (คุมลิสต์เต็ม 10 แถว) / memberAccess = รายเดือน (คุมเบลอ 1-2) — เช็คพลาด = เปิดหมด (fail-open)
  let accessFull = true;
  let memberAccess = true;
  if (normPre.amuletV1 || normPre.crystalBraceletV1 || normPre.moldaviteV1) {
    const uid = String(normPre.userId || "").trim();
    if (uid) {
      try {
        const { buildDailyPickTeaserForLineUser } = await import("../routes/liff.routes.js");
        dailyPickTeaser = await buildDailyPickTeaserForLineUser(uid);
      } catch {
        dailyPickTeaser = null;
      }
      try {
        const { data: u } = await supabase
          .from("app_users")
          .select("paid_until,paid_remaining_scans")
          .eq("line_user_id", uid)
          .maybeSingle();
        const remaining = Number(u?.paid_remaining_scans) || 0;
        accessFull = computePaidActive(u?.paid_until, remaining, new Date());
        memberAccess = accessFull && remaining >= 900000;
      } catch {
        accessFull = true;
        memberAccess = true;
      }
    }
  }
  const liffPayUrl = process.env.LIFF_ID
    ? `https://liff.line.me/${String(process.env.LIFF_ID).trim()}?view=pay`
    : "https://lin.ee/6YZeFZ1";

  try {
    html = renderReportHtmlPage(payload, {
      sacredAmuletLibrary,
      crystalBraceletLibrary,
      dailyPickTeaser,
      liffPayUrl,
      accessFull,
      memberAccess,
    });
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
 * GET /r/:publicToken/energy-meaning — ความหมายพลังทั้ง 6 ด้าน (amulet HTML lane เท่านั้น)
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
  const hasBracelet =
    normalized.crystalBraceletV1 &&
    typeof normalized.crystalBraceletV1 === "object" &&
    !Array.isArray(normalized.crystalBraceletV1);

  if (!hasAmulet && !hasBracelet) {
    console.log(
      JSON.stringify({
        event: "REPORT_HTTP",
        path: "getEnergyMeaningByToken",
        status: 302,
        reason: "unsupported_lane",
        publicTokenPrefix: publicTokenPrefix12(publicToken),
      }),
    );
    return res.redirect(302, `/r/${encodeURIComponent(publicToken)}`);
  }

  let html;
  try {
    html = hasAmulet
      ? renderAmuletEnergyMeaningHtml(normalized)
      : renderCrystalBraceletEnergyMeaningHtml(normalized);
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

/**
 * GET /r/:publicToken/energy-timing — อธิบายจังหวะเสริมพลัง (amulet HTML lane เท่านั้น)
 */
export async function getEnergyTimingByToken(req, res) {
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
        path: "getEnergyTimingByToken",
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
        path: "getEnergyTimingByToken",
        warningsCount: warnings.length,
      }),
    );
  }

  const hasAmulet =
    normalized.amuletV1 &&
    typeof normalized.amuletV1 === "object" &&
    !Array.isArray(normalized.amuletV1);
  const hasBracelet =
    normalized.crystalBraceletV1 &&
    typeof normalized.crystalBraceletV1 === "object" &&
    !Array.isArray(normalized.crystalBraceletV1);

  if (!hasAmulet && !hasBracelet) {
    console.log(
      JSON.stringify({
        event: "REPORT_HTTP",
        path: "getEnergyTimingByToken",
        status: 302,
        reason: "unsupported_lane",
        publicTokenPrefix: publicTokenPrefix12(publicToken),
      }),
    );
    return res.redirect(302, `/r/${encodeURIComponent(publicToken)}`);
  }

  let html;
  try {
    html = hasAmulet
      ? renderAmuletEnergyTimingHtml(normalized)
      : renderCrystalBraceletEnergyTimingHtml(normalized);
  } catch (renderErr) {
    console.error(
      JSON.stringify({
        event: "REPORT_PUBLIC_RENDER_FAIL",
        path: "getEnergyTimingByToken",
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
      path: "getEnergyTimingByToken",
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

/**
 * GET /r/:publicToken/library — อันดับวัตถุในคลังพลัง (amulet lane เท่านั้น)
 */
export async function getLibraryRankingByToken(req, res) {
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
        path: "getLibraryRankingByToken",
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
        path: "getLibraryRankingByToken",
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
        path: "getLibraryRankingByToken",
        status: 302,
        reason: "not_amulet_lane",
        publicTokenPrefix: publicTokenPrefix12(publicToken),
      }),
    );
    return res.redirect(302, `/r/${encodeURIComponent(publicToken)}`);
  }

  let library = null;
  const uid = String(normalized.userId || "").trim();
  if (uid) {
    try {
      library = await buildSacredAmuletLibraryForLineUser(uid, {
        libraryThumbScope: "full",
      });
    } catch (e) {
      console.warn(
        JSON.stringify({
          event: "REPORT_LIBRARY_PAGE_BUILD_FAIL",
          path: "getLibraryRankingByToken",
          publicTokenPrefix: publicTokenPrefix12(publicToken),
          reason: String(
            e && typeof e === "object" && "message" in e
              ? /** @type {{ message?: unknown }} */ (e).message
              : e,
          ).slice(0, 200),
        }),
      );
    }
  }
  if (!library) {
    library = buildSacredAmuletLibraryViewFromPayloadOnly(normalized);
  }
  if (!library) {
    return res.redirect(302, `/r/${encodeURIComponent(publicToken)}`);
  }

  let pinnedOriginalCount = null;
  if (uid) {
    try {
      pinnedOriginalCount = await countPinnedScanUploadsByLineUser(uid);
    } catch {
      pinnedOriginalCount = null;
    }
  }
  const pinFlash = String(req.query?.pin || "").trim() || null;

  // สเต็ป 2 (กบเคาะแบบ A, 15 ก.ค.): แพ็กแอคทีฟเห็นทั้งคลัง / ไม่มีแพ็กเห็น 7 รายการล่าสุด
  // + แถวล็อกเบลอ; แท็บ "หนุนดวงวันนี้" เฉพาะแพ็กแอคทีฟ — เช็คพลาด = เปิดหมด (fail-open)
  // อันดับ 1-2 เซ็นเซอร์ไว้ให้สมาชิกรายเดือนเท่านั้น (memberAccess) อันดับ 3 เปิดทุกคน (กบ 15 ก.ค.)
  let accessFull = true;
  let memberAccess = true;
  let dailyPick = null;
  if (uid) {
    try {
      const { data: u } = await supabase
        .from("app_users")
        .select("paid_until,paid_remaining_scans")
        .eq("line_user_id", uid)
        .maybeSingle();
      const remaining = Number(u?.paid_remaining_scans) || 0;
      accessFull = computePaidActive(u?.paid_until, remaining, new Date());
      memberAccess = accessFull && remaining >= 900000;
    } catch {
      accessFull = true;
      memberAccess = true;
    }
    try {
      const { listDailyPickRankedForLineUser } = await import("../routes/liff.routes.js");
      dailyPick = await listDailyPickRankedForLineUser(uid);
    } catch {
      dailyPick = null;
    }
  }
  const libLiffPayUrl = process.env.LIFF_ID
    ? `https://liff.line.me/${String(process.env.LIFF_ID).trim()}?view=pay`
    : "https://lin.ee/6YZeFZ1";

  let html;
  try {
    html = renderAmuletLibraryRankingHtml({
      pagePublicToken: publicToken,
      library,
      pinnedOriginalCount,
      pinFlash,
      freeTierPinLimit: env.FREE_TIER_PINNED_ORIGINAL_LIMIT,
      accessFull,
      memberAccess,
      freeVisibleCount: 7,
      dailyPick,
      liffPayUrl: libLiffPayUrl,
    });
  } catch (renderErr) {
    console.error(
      JSON.stringify({
        event: "REPORT_PUBLIC_RENDER_FAIL",
        path: "getLibraryRankingByToken",
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
      path: "getLibraryRankingByToken",
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

/**
 * POST /r/:publicToken/library/pin — pin scan_upload original (free tier quota).
 */
export async function postLibraryPinUpload(req, res) {
  const publicToken = String(req.params?.publicToken || "").trim();
  const scanResultV2Id = String(req.body?.scanResultV2Id || "").trim();
  const baseLib = publicToken
    ? `/r/${encodeURIComponent(publicToken)}/library`
    : "/";

  if (!publicToken || !scanResultV2Id) {
    return res.redirect(302, baseLib);
  }

  const { payload, accessError } = await getReportByPublicToken(publicToken);
  if (!payload || accessError) {
    const status = accessError?.httpStatus ?? 404;
    const html =
      accessError?.code === "REPORT_EXPIRED"
        ? EXPIRED_HTML
        : accessError?.code === "REPORT_UNAVAILABLE"
          ? UNAVAILABLE_HTML
          : NOT_FOUND_HTML;
    return res.status(status).type("html").set("Cache-Control", "no-store").send(html);
  }

  const { payload: normalized } = normalizeReportPayloadForRender(payload);
  const uid = String(normalized.userId || "").trim();
  if (!uid) {
    return res.redirect(303, `${baseLib}?pin=denied`);
  }

  const uploadId = await getUploadIdForScanResultV2AndLineUser(
    scanResultV2Id,
    uid,
  );
  if (!uploadId) {
    return res.redirect(303, `${baseLib}?pin=denied`);
  }

  const uploadRow = await getScanUploadById(uploadId).catch(() => null);
  if (!uploadRow || String(uploadRow.line_user_id || "").trim() !== uid) {
    return res.redirect(303, `${baseLib}?pin=denied`);
  }

  if (uploadRow.is_pinned === true) {
    return res.redirect(303, `${baseLib}?pin=ok`);
  }

  const pinned = await countPinnedScanUploadsByLineUser(uid);
  const limit = env.FREE_TIER_PINNED_ORIGINAL_LIMIT;
  if (limit > 0 && pinned >= limit) {
    return res.redirect(303, `${baseLib}?pin=quota`);
  }

  try {
    await setScanUploadPinnedForUser(uploadId, uid, true);
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "LIBRARY_PIN_UPLOAD_FAIL",
        publicTokenPrefix: publicTokenPrefix12(publicToken),
        reason: String(
          e && typeof e === "object" && "message" in e
            ? /** @type {{ message?: unknown }} */ (e).message
            : e,
        ).slice(0, 200),
      }),
    );
    return res.redirect(303, `${baseLib}?pin=err`);
  }

  return res.redirect(303, `${baseLib}?pin=ok`);
}

/**
 * GET /r/:publicToken/card.png — การ์ดผลแชร์ได้ ธีมทองเข้ม (กบ 16 ก.ค.)
 * ข้อมูลวัตถุล้วน ไม่มีข้อมูลส่วนตัวลูกค้า — เฟสแรกเลนพระเท่านั้น
 */
export async function getShareCardByToken(req, res) {
  const publicToken = String(req.params?.publicToken || "").trim();
  try {
    const { payload } = await getReportByPublicToken(publicToken);
    if (!payload) {
      return res.status(404).type("text").send("not found");
    }
    const { payload: norm } = normalizeReportPayloadForRender(payload);
    const a = norm.amuletV1;
    if (!a || typeof a !== "object" || Array.isArray(a)) {
      return res.status(404).type("text").send("card not available for this lane");
    }
    const energyScore10 = Number(norm.summary?.energyScore);
    if (!Number.isFinite(energyScore10)) {
      return res.status(404).type("text").send("no score");
    }
    const objectImageUrl = String(
      norm.objectImageUrl || norm.object?.objectImageUrl || "",
    ).trim();
    if (!objectImageUrl) {
      return res.status(404).type("text").send("no object image");
    }
    // การ์ดไว้อวด: โชว์เกรดเฉพาะ S/A/B — เกรด D ไม่ขึ้นบนการ์ด (รายงานเต็มยังเห็นจริงครบ)
    const rawGrade =
      resolveEnergyLevelDisplayGrade(norm.summary?.energyLevelLabel, energyScore10) || "";
    const gradeLabel = ["S", "A", "B"].includes(rawGrade) ? rawGrade : null;
    const peakLabel =
      POWER_LABEL_THAI[String(a.primaryPower || "").trim()] ||
      String(a.flexSurface?.mainEnergyShort || "").trim() ||
      "พลังเด่นเฉพาะองค์";
    const typeLabel =
      String(a.flexSurface?.headline || "").trim() || "พระ/เทวรูป/เครื่องราง";

    // ป้ายพลังชี้รอบรูป: ท็อป 3 แกนตามคะแนนจริง + เรดาร์ใช้ครบ 6 แกน (ชื่อย่อ → คะแนน)
    const allAxes = Object.entries(a.powerCategories || {})
      .map(([key, v]) => ({
        label: AMULET_PEAK_SHORT_THAI[key] || String(v?.labelThai || "").trim(),
        score: Number(v?.score),
      }))
      .filter((x) => x.label && Number.isFinite(x.score));
    const topAxes = [...allAxes].sort((x, y) => y.score - x.score).slice(0, 3);
    const axisScores = Object.fromEntries(allAxes.map((x) => [x.label, x.score]));
    // เข้ากับดวงเจ้าของ (มีเฉพาะเจ้าของที่มีวันเกิดในระบบ) — จุดขายจริงบนการ์ด
    const compatPercent = Number(norm.summary?.compatibilityPercent);

    const buf = await renderShareCardPng({
      publicToken,
      objectImageUrl,
      typeLabel,
      energyScore10,
      gradeLabel,
      peakLabel,
      topAxes,
      axisScores,
      compatPercent: Number.isFinite(compatPercent) ? compatPercent : null,
    });
    res
      .type("png")
      .set("Cache-Control", "public, max-age=86400")
      .send(buf);
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "SHARE_CARD_RENDER_FAIL",
        publicTokenPrefix: publicTokenPrefix12(publicToken),
        reason: String(e?.message || e).slice(0, 200),
      }),
    );
    res.status(503).type("text").send("card render failed");
  }
}
