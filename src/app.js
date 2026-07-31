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

// ลิงก์วัด conversion จาก YouTube → LINE (ลิงก์แรกหน้าช่อง — กบ 30 ก.ค.)
// มือถือ: redirect ตรงเข้า LINE · เดสก์ท็อป: หน้า landing ของเราเอง (audit 31 ก.ค. —
// ปลายทาง lin.ee บนคอมคือหน้า QR โล่งไม่มีชื่อ คนไม่รู้กำลังแอดใคร)
let ytQrDataUrl = null;
app.get("/yt", async (req, res) => {
  const ua = String(req.headers["user-agent"] || "");
  const oaLink = String(process.env.YT_SHORT_OA_LINK || "https://lin.ee/p2sxdYFJ").trim();
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  console.log(JSON.stringify({ event: "YT_REDIRECT_CLICK", mobile: isMobile, ua: ua.slice(0, 80) }));
  if (isMobile) return res.redirect(302, oaLink);
  try {
    if (!ytQrDataUrl) {
      const QRCode = (await import("qrcode")).default;
      ytQrDataUrl = await QRCode.toDataURL(oaLink, {
        width: 360,
        margin: 2,
        color: { dark: "#0d0b08", light: "#f5edd8" },
      });
    }
  } catch {
    ytQrDataUrl = null;
  }
  if (!ytQrDataUrl) return res.redirect(302, oaLink);
  res.status(200).type("html").send(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>แอดไลน์ Ener Scan - อาจารย์อ่านพลังวัตถุมงคล</title>
<meta name="description" content="ส่งรูปพระ เครื่องราง หิน หรือกำไล ให้อาจารย์อ่านพลังครบ 6 ด้าน ฟรีวันละ 1 ครั้ง ผ่าน LINE">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%230d0b08'/%3E%3Ctext x='50' y='68' font-size='52' text-anchor='middle' fill='%23e8c547'%3E✦%3C/text%3E%3C/svg%3E">
<style>body{font-family:system-ui,'Segoe UI',sans-serif;background:#0d0b08;color:#f5edd8;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{max-width:420px;text-align:center;padding:36px 28px;border:1px solid #8f6710;border-radius:18px;background:linear-gradient(160deg,#1a1610,#0d0b08)}
h1{color:#e8c547;font-size:22px;letter-spacing:2px;margin:0 0 4px}
.sub{color:#cbb98a;font-size:14px;margin-bottom:18px}
img.qr{width:230px;height:230px;border-radius:14px;border:4px solid #e8c547}
.steps{text-align:left;color:#e8dcbc;font-size:13.5px;line-height:2;margin:16px auto 4px;display:inline-block}
.btn{display:inline-block;margin-top:14px;background:linear-gradient(90deg,#b8871b,#e8c547);color:#0d0b08;font-weight:600;border-radius:10px;padding:10px 26px;text-decoration:none}
.ft{color:#b3a479;font-size:11.5px;margin-top:14px}</style></head><body>
<div class="card">
<h1>ENER SCAN</h1>
<div class="sub">อาจารย์อ่านพลังวัตถุมงคล · ฟรีวันละ 1 ครั้ง</div>
<img class="qr" src="${ytQrDataUrl}" alt="QR code สำหรับแอดไลน์ Ener Scan สแกนด้วยกล้องมือถือหรือแอป LINE">
<div class="steps">1. เปิดกล้องมือถือ สแกน QR นี้<br>2. แอดไลน์ Ener Scan แล้วบอกวันเกิด<br>3. ส่งรูปชิ้นของคุณ 1 รูป รอรับผลได้เลย</div>
<br><a class="btn" href="${oaLink}">หรือเปิด LINE บนเครื่องนี้</a>
<div class="ft">อ่านพลังตามแนวทาง Ener ไม่ใช่คำทำนาย · ไม่ตัดสินแท้เก๊หรือมูลค่า</div>
</div></body></html>`);
});

// รายงานจัดชุดพลัง (Synergy — กบเคาะ 31 ก.ค.) — token ถาวรต่อลูกค้า
app.get("/synergy/:token", async (req, res) => {
  try {
    const { getLineUserIdBySynergyToken, renderSynergyPage } = await import(
      "./services/synergy/synergyReport.service.js"
    );
    const uid = await getLineUserIdBySynergyToken(req.params.token);
    if (!uid) return res.status(404).send("ไม่พบรายงาน");
    const out = await renderSynergyPage(uid);
    if (!out.ok) {
      return res
        .status(200)
        .type("html")
        .send(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>จัดชุดพลัง - Ener Scan</title></head><body style="font-family:sans-serif;background:#0d0b08;color:#f5edd8;text-align:center;padding:60px 20px"><h2 style="color:#e8c547">คลังของคุณยังมีไม่ถึง 3 ชิ้น</h2><p>ส่งรูปชิ้นเพิ่มให้อาจารย์อ่านก่อน แล้วอาจารย์จะจัดชุดให้ครับ</p></body></html>`);
    }
    res.status(200).type("html").send(out.html);
  } catch (e) {
    console.error(JSON.stringify({ event: "SYNERGY_PAGE_ERROR", message: String(e?.message || e).slice(0, 160) }));
    res.status(500).send("ระบบขัดข้อง ลองใหม่อีกครั้งครับ");
  }
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