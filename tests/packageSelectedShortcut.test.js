import test from "node:test";
import assert from "node:assert/strict";
import { loadActiveScanOffer } from "../src/services/scanOffer.loader.js";
import { findPackageByKey } from "../src/services/scanOffer.packages.js";
import {
  shouldPackageSelectedShortcutToQr,
  isPackageSelectedSamePackageConfirmText,
} from "../src/utils/stateMicroIntent.util.js";
import {
  buildPaywallFatiguePromptText,
  buildPaymentPackageSelectedUnclearText,
} from "../src/utils/webhookText.util.js";

test("package-selected sticky: shortcut to QR for ack / price / proceed phrases", () => {
  const offer = loadActiveScanOffer();
  const pkg = findPackageByKey(offer, "49baht_4scans_24h");
  assert.ok(pkg, "fixture package");

  const shortcutTexts = [
    "ครับ",
    "49",
    "ส่งมาเลย",
    "เอาเลย",
    "ต่อเลย",
    "โอเค",
    "ขอคิวอาร์",
    "ส่งคิวอาร์",
    "payment",
    "แพ็กนี้",
  ];
  for (const t of shortcutTexts) {
    assert.equal(
      shouldPackageSelectedShortcutToQr(t, pkg, offer),
      true,
      `expected QR shortcut for: ${t}`,
    );
  }

  assert.equal(shouldPackageSelectedShortcutToQr("hello", pkg, offer), false);
  assert.equal(shouldPackageSelectedShortcutToQr("ครับ", null, offer), false);
});

test("same_package_confirm: only when parsed key matches selected", () => {
  const offer = loadActiveScanOffer();
  const pkg = findPackageByKey(offer, "49baht_4scans_24h");
  assert.ok(pkg);
  assert.equal(
    isPackageSelectedSamePackageConfirmText("49", pkg, offer),
    true,
  );
  assert.equal(
    isPackageSelectedSamePackageConfirmText("อันนี้", pkg, offer),
    true,
  );
});

test("package-selected unclear copy avoids full free-exhausted paywall intro", () => {
  const offer = loadActiveScanOffer();
  const genericUnclearFull = buildPaywallFatiguePromptText({
    offer,
    userId: "u_test",
    tier: "full",
    branch: "unclear",
  });
  const selectedUnclearFull = buildPaymentPackageSelectedUnclearText({
    tier: "full",
  });
  assert.ok(
    genericUnclearFull.length > selectedUnclearFull.length * 2,
    "generic paywall unclear full should be longer than package-selected nudge",
  );
  assert.equal(selectedUnclearFull.includes("ฟรีวันนี้ครบ"), false);
});
