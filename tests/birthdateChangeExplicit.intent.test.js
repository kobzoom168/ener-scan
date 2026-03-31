import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  matchesExplicitBirthdateChangeCommand,
  normalizeBirthdateChangeIntentTypos,
} from "../src/utils/birthdateChangeFlow.util.js";
import { parseBirthdateInput } from "../src/utils/birthdateParse.util.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("explicit matcher: canonical + polite + ใหม่ suffix", () => {
  assert.equal(matchesExplicitBirthdateChangeCommand("เปลี่ยนวันเกิด"), true);
  assert.equal(matchesExplicitBirthdateChangeCommand("ขอเปลี่ยนวันเกิด"), true);
  assert.equal(matchesExplicitBirthdateChangeCommand("แก้วันเกิด"), true);
  assert.equal(matchesExplicitBirthdateChangeCommand("เปลี่ยนวันเกิดครับ"), true);
  assert.equal(matchesExplicitBirthdateChangeCommand("เปลี่ยนวันเกิดค่ะ"), true);
  assert.equal(matchesExplicitBirthdateChangeCommand("เปลี่ยนวันเกิดใหม่"), true);
});

test("explicit matcher: typo เปลืยน / เปลียน", () => {
  assert.equal(matchesExplicitBirthdateChangeCommand("เปลืยนวันเกิด"), true);
  assert.equal(matchesExplicitBirthdateChangeCommand("เปลียนวันเกิด"), true);
});

test("explicit matcher: not matched for unrelated text", () => {
  assert.equal(matchesExplicitBirthdateChangeCommand("สวัสดี"), false);
  assert.equal(matchesExplicitBirthdateChangeCommand("19/08/2528"), false);
});

test("normalizeBirthdateChangeIntentTypos maps typos to เปลี่ยน", () => {
  assert.equal(
    normalizeBirthdateChangeIntentTypos("เปลืยนวันเกิด"),
    "เปลี่ยนวันเกิด",
  );
  assert.equal(
    normalizeBirthdateChangeIntentTypos("เปลียนวันเกิด"),
    "เปลี่ยนวันเกิด",
  );
});

test("awaiting_new_birthdate: valid Thai date parses to ok", () => {
  const p = parseBirthdateInput("19/08/2528");
  assert.equal(p.ok, true);
  assert.ok(p.isoDate);
});

test("awaiting_new_birthdate: invalid fragment rejected by parser", () => {
  const p = parseBirthdateInput("ไม่ใช่วันเกิด");
  assert.equal(p.ok, false);
});

test("lineWebhook: explicit birthdate block runs before paywall_offer_single (text handler)", () => {
  const path = join(__dirname, "../src/routes/lineWebhook.js");
  const src = readFileSync(path, "utf8");
  const early = src.indexOf("BIRTHDATE_CHANGE_INTENT_MATCHED");
  const paywall = src.search(
    /if \(paymentState === "paywall_offer_single"\) \{\s+const offer = loadActiveScanOffer\(\);/,
  );
  assert.ok(early !== -1, "expected early explicit birthdate intent block");
  assert.ok(paywall !== -1, "expected paywall branch in handleTextMessage");
  assert.ok(
    early < paywall,
    "explicit birthdate must run before paywall text handling",
  );
});
