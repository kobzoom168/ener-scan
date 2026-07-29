import express from "express";
import session from "express-session";
import line from "@line/bot-sdk";
import path from "path";

import { env } from "./config/env.js";
import { getGeminiFrontMode } from "./core/conversation/geminiFront/geminiFront.featureFlags.js";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import createAdminAuthRouter from "./routes/adminAuth.routes.js";
import createChatQualityReportRouter from "./routes/chatQualityReport.routes.js";
import createAdminPaymentsDashboardRouter from "./routes/adminPaymentsDashboard.routes.js";
import createAdminKbRouter from "./routes/adminKb.routes.js";
import createAdminTypesRouter from "./routes/adminTypes.routes.js";
import createAdminVoiceRouter from "./routes/adminVoice.routes.js";
import createAdminHomeRouter from "./routes/adminHome.routes.js";
import createAdminPromoRouter from "./routes/adminPromo.routes.js";
import { saveBirthdate } from "./stores/userProfile.db.js";
import { checkScanAccess } from "./services/paymentAccess.service.js";
import { schedulePersonaAbRecompute } from "./services/personaAbSchedule.service.js";
import reportRoutes from "./routes/report.routes.js";
import { liffRouter, setLiffLineClient } from "./routes/liff.routes.js";
import { lineWebhookErrorHandler } from "./middleware/lineWebhookError.middleware.js";

process.on("uncaughtException", (error) => {
  console.error("[FATAL] uncaughtException", {
    message: error?.message,
    stack: error?.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] unhandledRejection", {
    reason,
  });
});

const app = express();

app.set("trust proxy", 1);

let activeRequests = 0;
app.use((req, res, next) => {
  activeRequests++;
  let done = false;
  const dec = () => {
    if (!done) {
      done = true;
      activeRequests--;
    }
  };
  res.on("finish", dec);
  res.on("close", dec);
  next();
});

// Needed for admin approve/reject POST from basic HTML forms.
app.use(express.urlencoded({ extended: false }));

const sessionSecret =
  String(env.SESSION_SECRET || "").trim() ||
  (process.env.NODE_ENV !== "production"
    ? "ener-scan-dev-session-insecure"
    : null);

if (!sessionSecret) {
  throw new Error(
    "SESSION_SECRET is required in production for admin sessions (set env SESSION_SECRET)"
  );
}

app.use(
  session({
    name: "ener_admin_sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

const lineConfig = {
  channelAccessToken: env.CHANNEL_ACCESS_TOKEN,
  channelSecret: env.CHANNEL_SECRET,
};

const lineClient = new line.Client(lineConfig);

console.log("[BUILD_INFO]", {
  version: "payment-slip-fix-v2",
  startedAt: new Date().toISOString(),
});
console.log(
  JSON.stringify({
    event: "GEMINI_FRONT_STARTUP",
    effectiveMode: getGeminiFrontMode(),
    orchestratorEnabled: env.GEMINI_FRONT_ORCHESTRATOR_ENABLED,
    rawMode: env.GEMINI_FRONT_ORCHESTRATOR_MODE,
    phase1Only: env.GEMINI_FRONT_PHASE1_ONLY,
    provider: env.LLM_FRONT_PROVIDER,
    model:
      env.LLM_FRONT_PROVIDER === "openrouter"
        ? env.OPENROUTER_FRONT_MODEL
        : env.LLM_FRONT_PROVIDER === "featherless"
          ? env.FEATHERLESS_FRONT_MODEL
          : env.GEMINI_FRONT_MODEL,
    timeoutMs: env.GEMINI_FRONT_TIMEOUT_MS,
    apiKeyConfigured:
      env.LLM_FRONT_PROVIDER === "openrouter"
        ? Boolean(String(env.OPENROUTER_API_KEY || "").trim())
        : env.LLM_FRONT_PROVIDER === "featherless"
          ? Boolean(String(env.FEATHERLESS_API_KEY || "").trim())
          : Boolean(
              String(env.GEMINI_API_KEY || "").trim() ||
                String(env.GOOGLE_API_KEY || "").trim(),
            ),
  }),
);
console.log(
  JSON.stringify({
    event: "FLEX_STARTUP_FLAGS",
    flexScanSummaryFirst: env.FLEX_SCAN_SUMMARY_FIRST,
    flexScanSummaryFirstRolloutPct: env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT,
    flexSummaryAppendReportBubble: env.FLEX_SUMMARY_APPEND_REPORT_BUBBLE,
  }),
);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/scan-v2", async (_req, res) => {
  try {
    const { pingScanV2Redis } = await import("./redis/scanV2Redis.js");
    const redis = await pingScanV2Redis();
    res.json({
      status: "ok",
      redis: redis.ok
        ? { ok: true, latencyMs: redis.latencyMs }
        : { ok: false, error: redis.error || "ping_failed" },
      flags: {
        ENABLE_ASYNC_SCAN_V2: env.ENABLE_ASYNC_SCAN_V2,
      },
    });
  } catch (e) {
    res.status(500).json({
      status: "error",
      message: e?.message || String(e),
    });
  }
});

app.get("/", (req, res) => {
  res.send("Ener Scan API running");
});

app.get("/version", (req, res) => {
  res.status(200).json({ ok: true, version: "payment-slip-fix-v2" });
});

// นโยบายความเป็นส่วนตัว — Meta บังคับต้องมี URL นี้ก่อนสลับ app เป็น Live (กบ 29 ก.ค.)
app.get("/privacy", (req, res) => {
  res.status(200).type("html").send(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>นโยบายความเป็นส่วนตัว - Ener Scan</title>
<style>body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.8;color:#333}h1{color:#8f6710}h2{color:#555;font-size:1.1em;margin-top:1.6em}</style>
</head><body>
<h1>นโยบายความเป็นส่วนตัว (Privacy Policy)</h1>
<p>บริการ Ener Scan ("บริการ") ให้บริการอ่านพลังงานวัตถุมงคลผ่าน LINE Official Account และเผยแพร่คอนเทนต์ผ่านเพจ Facebook ของเรา</p>
<h2>ข้อมูลที่เราเก็บ</h2>
<p>ชื่อที่แสดงและรหัสผู้ใช้จากแพลตฟอร์มแชท รูปภาพวัตถุที่ผู้ใช้ส่งเข้ามาเพื่อรับผลการอ่าน วันเกิดที่ผู้ใช้ให้ไว้เพื่อประกอบการอ่าน และประวัติการสนทนากับบริการ</p>
<h2>การใช้ข้อมูล</h2>
<p>ใช้เพื่อให้บริการอ่านพลังงาน จัดทำรายงานผล ปรับปรุงคุณภาพบริการ และจัดทำคอนเทนต์เผยแพร่ (ไม่เปิดเผยข้อมูลติดต่อส่วนตัวของผู้ใช้) เราไม่ขายหรือส่งต่อข้อมูลส่วนบุคคลให้บุคคลที่สามเพื่อการตลาด</p>
<h2>Facebook / Meta</h2>
<p>แอปของเราใช้สิทธิ์จัดการเพจของเราเองเพื่อโพสต์คอนเทนต์อัตโนมัติเท่านั้น ไม่เข้าถึงข้อมูลผู้ใช้ Facebook รายอื่น</p>
<h2>การลบข้อมูล</h2>
<p>ผู้ใช้ขอให้ลบข้อมูลของตนได้โดยแจ้งผ่านแชท LINE Official Account ของบริการ เราจะดำเนินการลบภายใน 30 วัน</p>
<h2>ติดต่อ</h2>
<p>ติดต่อผู้ให้บริการได้ทางแชท LINE Official Account: Ener Scan</p>
<p><em>This service reads user-submitted images and birthdates to generate energy reports, and auto-posts content to our own Facebook Page only. We do not access other Facebook users' data, and we do not sell personal data. Data deletion requests are accepted via our LINE Official Account chat and processed within 30 days.</em></p>
<p>ปรับปรุงล่าสุด: 29 กรกฎาคม 2026</p>
</body></html>`);
});

// Ener สายมู LIFF app (SPA + profile/daily/pay APIs) — see routes/liff.routes.js
setLiffLineClient(lineClient);
app.use(liffRouter);

app.use(reportRoutes);

// Serve static PromptPay QR for manual payments.
// URL: /payment/promptpay-qr.jpg
app.use(
  "/payment",
  express.static(path.join(process.cwd(), "src", "payment"))
);

// Brand assets (โลโก้บนการ์ด Flex ลงทะเบียน ฯลฯ)
// URL: /brand/ener-reg-logo.png
app.use(
  "/brand",
  express.static(path.join(process.cwd(), "src", "brand"), { maxAge: "1d" })
);

app.get("/debug/payment-access/:lineUserId", async (req, res) => {
  const lineUserId = String(req.params?.lineUserId || "").trim();
  console.log("[DEBUG] /debug/payment-access", { lineUserId });

  try {
    const access = await checkScanAccess({ userId: lineUserId });
    res.json({ ok: true, access });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
  }
});

app.use(createChatQualityReportRouter());
app.use(createAdminAuthRouter());
app.use(createAdminPaymentsDashboardRouter(lineClient));
app.use(createAdminKbRouter());
app.use(createAdminTypesRouter());
app.use(createAdminVoiceRouter());
app.use(createAdminHomeRouter());
app.use(createAdminPromoRouter());

app.post(
  "/webhook/line",
  line.middleware(lineConfig),
  lineWebhookRouter(lineConfig)
);

function paymentGatewayDisabled(_req, res) {
  res.status(410).json({
    ok: false,
    message: "manual_payment_only_gateway_disabled",
  });
}

app.post("/webhook/payment", express.json(), paymentGatewayDisabled);
app.post("/payments/webhook", express.json(), paymentGatewayDisabled);
app.post("/payments/create", express.json(), paymentGatewayDisabled);
app.get("/payments/mock/:paymentId", paymentGatewayDisabled);

app.use(lineWebhookErrorHandler);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_server_error" });
});

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`Ener Scan API listening on port ${port}`);
  schedulePersonaAbRecompute();
});

const WEB_GRACEFUL_TIMEOUT_MS =
  Number(process.env.WEB_GRACEFUL_TIMEOUT_MS) > 0
    ? Number(process.env.WEB_GRACEFUL_TIMEOUT_MS)
    : 15_000;

async function onWebStop(signal) {
  console.log(
    JSON.stringify({
      event: "WEB_SERVER_SHUTTING_DOWN",
      signal,
      activeRequests,
      timeoutMs: WEB_GRACEFUL_TIMEOUT_MS,
    }),
  );

  server.close();

  const { waitForGracefulDrain } = await import(
    "./workers/workerGracefulShutdown.util.js",
  );
  const outcome = await waitForGracefulDrain({
    getActiveCount: () => activeRequests,
    timeoutMs: WEB_GRACEFUL_TIMEOUT_MS,
    pollMs: 200,
  });

  if (outcome === "clean") {
    console.log(JSON.stringify({ event: "WEB_SERVER_SHUTDOWN_CLEAN" }));
  } else {
    console.log(
      JSON.stringify({
        event: "WEB_SERVER_SHUTDOWN_TIMEOUT",
        activeRequests,
      }),
    );
  }
  process.exit(0);
}

process.on("SIGTERM", () => {
  onWebStop("SIGTERM").catch(() => process.exit(1));
});
process.on("SIGINT", () => {
  onWebStop("SIGINT").catch(() => process.exit(1));
});