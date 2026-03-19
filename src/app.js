import express from "express";
import line from "@line/bot-sdk";

import { env } from "./config/env.js";
import { supabase } from "./config/supabase.js";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import { saveBirthdate } from "./stores/userProfile.db.js";
import { checkScanAccess } from "./services/paymentAccess.service.js";

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

const lineConfig = {
  channelAccessToken: env.CHANNEL_ACCESS_TOKEN,
  channelSecret: env.CHANNEL_SECRET,
};

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (req, res) => {
  res.send("Ener Scan API running");
});

app.get("/debug/save-birthdate", async (req, res) => {
  try {
    await saveBirthdate("debug-user", "14/09/1995");
    res.json({ ok: true });
  } catch (error) {
    console.error("[DEBUG] saveBirthdate route failed:", error);
    res.status(500).json({
      ok: false,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
  }
});

app.get("/debug/users", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id,birthdate,updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error) {
      return res.status(500).json({
        ok: false,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }

    res.json({
      ok: true,
      count: data.length,
      users: data,
    });
  } catch (error) {
    console.error("[DEBUG] /debug/users failed:", error);
    res.status(500).json({
      ok: false,
      message: error?.message,
    });
  }
});

app.get("/debug/line-users", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id,birthdate,updated_at")
      .like("id", "U%")
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error) {
      return res.status(500).json({
        ok: false,
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }

    res.json({
      ok: true,
      count: data.length,
      users: data,
    });
  } catch (error) {
    console.error("[DEBUG] /debug/line-users failed:", error);
    res.status(500).json({
      ok: false,
      message: error?.message,
    });
  }
});

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

app.post(
  "/webhook/line",
  line.middleware(lineConfig),
  lineWebhookRouter(lineConfig)
);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_server_error" });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Ener Scan API listening on port ${port}`);
});