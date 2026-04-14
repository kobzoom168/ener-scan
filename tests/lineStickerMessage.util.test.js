import test from "node:test";
import assert from "node:assert/strict";
import {
  LINE_STICKER_PACKAGE_BROWN_CONY_SALLY_ANIMATED,
  LINE_STICKER_ID_PAYMENT_SUPPORT,
  LINE_STICKER_ID_PAYMENT_APPROVED_BLESSING,
  buildLineStickerMessage,
  lineStickerPaymentSupportMessage,
  lineStickerPaymentApprovedBlessingMessage,
} from "../src/utils/lineStickerMessage.util.js";

test("buildLineStickerMessage: official sticker payload shape", () => {
  const m = buildLineStickerMessage({
    packageId: LINE_STICKER_PACKAGE_BROWN_CONY_SALLY_ANIMATED,
    stickerId: LINE_STICKER_ID_PAYMENT_SUPPORT,
  });
  assert.equal(m.type, "sticker");
  assert.equal(m.packageId, "11537");
  assert.equal(m.stickerId, "52002739");
});

test("payment support vs approval stickers use same package, distinct ids", () => {
  const a = lineStickerPaymentSupportMessage();
  const b = lineStickerPaymentApprovedBlessingMessage();
  assert.equal(a.packageId, b.packageId);
  assert.equal(a.stickerId, LINE_STICKER_ID_PAYMENT_SUPPORT);
  assert.equal(b.stickerId, LINE_STICKER_ID_PAYMENT_APPROVED_BLESSING);
  assert.notEqual(a.stickerId, b.stickerId);
});
