import { saveBirthdate } from "./stores/userProfile.db.js";

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