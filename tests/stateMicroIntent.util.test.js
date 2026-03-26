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
  isBirthdateChangeIntentPhrase,
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
    "49baht_4scans_24h",
  );
  assert.equal(parsePackageSelectionFromText("แพง", offer), null);
});

test("parsePackageSelectionFromText เอา 49 phrase", () => {
  const offer = loadActiveScanOffer();
  assert.equal(
    parsePackageSelectionFromText("เอา 49", offer, { allowEoaPricePhrase: true }),
    "49baht_4scans_24h",
  );
});

test("resend QR / status hints", () => {
  assert.equal(isResendQrIntentText("ขอ qr"), true);
  assert.equal(isAwaitingSlipStatusLikeText("ยังไง"), true);
  assert.equal(isPendingVerifyStatusLikeText("ตรวจหรือยัง"), true);
});

test("generic ack + noise", () => {
  assert.equal(isGenericAckText("โอเค"), true);
  assert.equal(isGenericAckText("เค"), true);
  assert.equal(isGenericAckText("ดี"), true);
  assert.equal(isGenericAckText("👌"), true);
  assert.equal(isUnclearNoiseText("พพ"), true);
  assert.equal(isUnclearNoiseText("411"), true);
});

test("status phrases are not mistaken for generic ack", () => {
  assert.equal(isPendingVerifyStatusLikeText("เช็กยัง"), true);
  assert.equal(isGenericAckText("เช็กยัง"), false);
  assert.equal(isGenericAckText("รับทราบ"), true);
});

test("birthdate change intent phrases (deterministic)", () => {
  assert.equal(isBirthdateChangeIntentPhrase("ขอเปลี่ยนวันเกิด"), true);
  assert.equal(isBirthdateChangeIntentPhrase("แก้วันเกิด"), true);
  assert.equal(isBirthdateChangeIntentPhrase("อยากแก้วันเกิดค่ะ"), true);
  assert.equal(isBirthdateChangeIntentPhrase("ขอเปลี่ยนวันเกิดหน่อยครับ"), true);
  assert.equal(isBirthdateChangeIntentPhrase("วันเกิดไม่ถูก"), true);
  assert.equal(isBirthdateChangeIntentPhrase("14/09/1995"), false);
});

test("hesitation on package selected", () => {
  assert.equal(isPackageSelectedHesitation("แพง"), true);
});
