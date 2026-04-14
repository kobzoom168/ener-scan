/**
 * LINE Messaging API sticker messages (official sticker definitions only).
 * @see https://developers.line.biz/en/docs/messaging-api/sticker-list/#sticker-definitions
 *
 * Package `11537` — Brown & Cony & Sally: Animated Special — includes stickerIds
 * `52002739` (payment-support tone) and `52002759` (approval/blessing tone).
 */

/** @type {string} Official package id from LINE sticker definitions */
export const LINE_STICKER_PACKAGE_BROWN_CONY_SALLY_ANIMATED = "11537";

export const LINE_STICKER_ID_PAYMENT_SUPPORT = "52002739";
export const LINE_STICKER_ID_PAYMENT_APPROVED_BLESSING = "52002759";

/**
 * @param {{ packageId: string | number, stickerId: string | number }} p
 * @returns {{ type: "sticker", packageId: string, stickerId: string }}
 */
export function buildLineStickerMessage({ packageId, stickerId }) {
  return {
    type: "sticker",
    packageId: String(packageId ?? "").trim(),
    stickerId: String(stickerId ?? "").trim(),
  };
}

/** Payment / paywall / “ช่วยค่าไฟ” presentation — delivery layer only. */
export function lineStickerPaymentSupportMessage() {
  return buildLineStickerMessage({
    packageId: LINE_STICKER_PACKAGE_BROWN_CONY_SALLY_ANIMATED,
    stickerId: LINE_STICKER_ID_PAYMENT_SUPPORT,
  });
}

/** Payment approved + blessing presentation — delivery layer only. */
export function lineStickerPaymentApprovedBlessingMessage() {
  return buildLineStickerMessage({
    packageId: LINE_STICKER_PACKAGE_BROWN_CONY_SALLY_ANIMATED,
    stickerId: LINE_STICKER_ID_PAYMENT_APPROVED_BLESSING,
  });
}
