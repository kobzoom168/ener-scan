import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldRemindWaitingBirthdateOnSticker } from "../src/handlers/stickerMessage.handler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("regression sequence: stale pendingImage is cleared after saved-birthdate ingest success", () => {
  const src = readFileSync(join(__dirname, "../src/routes/lineWebhook.js"), "utf8");
  assert.ok(src.includes("event: \"PENDING_IMAGE_CLEARED_AFTER_SCAN_SUCCESS\""));
  assert.ok(src.includes("clearSessionIfFlowVersionMatches(userId, flowVersion)"));
  assert.ok(src.includes("path: \"saved_birthdate_ingest_ok\""));
});

test("sticker guard: pendingImage + saved birthdate should NOT remind waiting_birthdate", () => {
  const shouldRemind = shouldRemindWaitingBirthdateOnSticker({
    hasPendingImage: true,
    paymentState: "none",
    hasSavedBirthdate: true,
  });
  assert.equal(shouldRemind, false);
});

test("sticker guard: pendingImage + no saved birthdate still reminds waiting_birthdate", () => {
  const shouldRemind = shouldRemindWaitingBirthdateOnSticker({
    hasPendingImage: true,
    paymentState: "none",
    hasSavedBirthdate: false,
  });
  assert.equal(shouldRemind, true);
});

test("sticker guard: awaiting_slip is unaffected by pendingImage reminder rule", () => {
  const shouldRemind = shouldRemindWaitingBirthdateOnSticker({
    hasPendingImage: true,
    paymentState: "awaiting_slip",
    hasSavedBirthdate: false,
  });
  assert.equal(shouldRemind, false);
});

test("sticker handler telemetry includes saved-birthdate skip event", () => {
  const src = readFileSync(
    join(__dirname, "../src/handlers/stickerMessage.handler.js"),
    "utf8",
  );
  assert.ok(src.includes("STICKER_WAITING_BIRTHDATE_SKIPPED_SAVED_BIRTHDATE"));
});

