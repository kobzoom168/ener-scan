import express from "express";
import line from "@line/bot-sdk";
import { env } from "./config/env.js";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import { saveBirthdate } from "./stores/userProfile.db.js";

const app = express();

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

// webhook route ...