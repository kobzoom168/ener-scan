import express from "express";
import session from "express-session";
import line from "@line/bot-sdk";
import path from "path";

import { env } from "./config/env.js";
import { getGeminiFrontMode } from "./core/conversation/geminiFront/geminiFront.featureFlags.js";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import createAdminAuthRouter from "./routes/adminAuth.routes.js";
import createAdminPaymentsDashboardRouter from "./routes/adminPaymentsDashboard.routes.js";
import { saveBirthdate } from "./stores/userProfile.db.js";
import { checkScanAccess } from "./services/paymentAccess.service.js";
import { schedulePersonaAbRecompute } from "./services/personaAbSchedule.service.js";
import reportRoutes from "./routes/report.routes.js";

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
    model: env.GEMINI_FRONT_MODEL,
    timeoutMs: env.GEMINI_FRONT_TIMEOUT_MS,
    apiKeyConfigured: Boolean(
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

app.use(reportRoutes);

// Serve static PromptPay QR for manual payments.
// URL: /payment/promptpay-qr.jpg
app.use(
  "/payment",
  express.static(path.join(process.cwd(), "src", "payment"))
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

app.use(createAdminAuthRouter());
app.use(createAdminPaymentsDashboardRouter(lineClient));

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