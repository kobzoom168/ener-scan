import test from "node:test";
import assert from "node:assert/strict";
import {
  guidanceTierFromStreak,
  isLoosePayIntentExact,
  isResendQrIntentText,
  isAwaitingSlipStatusLikeText,
  isPendingVerifyStatusLikeText,
  isGenericAckText,
  isUnclearNoiseText,
  isPackageSelectedHesitation,
} from "../src/utils/stateMicroIntent.util.js";
import { parsePackageSelectionFromText } from "../src/services/scanOffer.packages.js";
import { loadActiveScanOffer } from "../src/services/scanOffer.loader.js";

test("guidanceTierFromStreak maps 1→full, 2→short, 3+→micro", () => {
  assert.equal(guidanceTierFromStreak(1), "full");
  assert.equal(guidanceTierFromStreak(2), "short");
  assert.equal(guidanceTierFromStreak(3), "micro");
  assert.equal(guidanceTierFromStreak(99), "micro");
});

test("isLoosePayIntentExact recognizes จ่าย / โอน", () => {
  assert.equal(isLoosePayIntentExact("จ่าย"), true);
  assert.equal(isLoosePayIntentExact("โอน"), true);
  assert.equal(isLoosePayIntentExact("hello"), false);
});

test("parsePackageSelectionFromText thaiRelativeAliases (paywall-only)", () => {
  const offer = loadActiveScanOffer();
  assert.equal(
    parsePackageSelectionFromText("อันถูก", offer, { thaiRelativeAliases: true }),
    "49baht_4scans_24h",
  );
  assert.equal(
    parsePackageSelectionFromText("แพง", offer, { thaiRelativeAliases: true }),
    "99baht_10scans_24h",
  );
  assert.equal(parsePackageSelectionFromText("แพง", offer), null);
});

test("parsePackageSelectionFromText เอา 99 phrase", () => {
  const offer = loadActiveScanOffer();
  assert.equal(
    parsePackageSelectionFromText("เอา 99", offer, { allowEoaPricePhrase: true }),
    "99baht_10scans_24h",
  );
});

test("resend QR / status hints", () => {
  assert.equal(isResendQrIntentText("ขอ qr"), true);
  assert.equal(isAwaitingSlipStatusLikeText("ยังไง"), true);
  assert.equal(isPendingVerifyStatusLikeText("ตรวจหรือยัง"), true);
});

test("generic ack + noise", () => {
  assert.equal(isGenericAckText("โอเค"), true);
  assert.equal(isUnclearNoiseText("พพ"), true);
  assert.equal(isUnclearNoiseText("411"), true);
});

test("hesitation on package selected", () => {
  assert.equal(isPackageSelectedHesitation("แพง"), true);
});
