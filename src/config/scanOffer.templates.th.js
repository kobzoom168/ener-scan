/**
 * Thai template pools for scan offer copy (PR2).
 * Tone: LINE operator — calm, short, non-pushy. Numbers from placeholders only.
 * Single paid offer (49 THB / 4 scans / 24h) — no multi-package choice.
 *
 * Placeholders: {price}, {count}, {hours}, {nextResetLabel}, {freeRemaining},
 * {offerLabel}, {freeQuotaPerDay}, {pkgPaywallLines}, {pkgNumberedList}, {priceTokens}
 */

/** @type {Record<string, string[][]>} */
export const SCAN_OFFER_TEMPLATES_TH = {
  /**
   * User still has free scans but only one left today (allowed path).
   */
  free_quota_low: [
    ["สิทธิ์ฟรีวันนี้เหลือ {freeRemaining} ครั้ง"],
    ["เหลือสิทธิ์ฟรีวันนี้ {freeRemaining} ครั้ง"],
  ],

  /**
   * Free quota for today is exhausted — distinct from scan-lock / abuse (quota only).
   */
  free_quota_exhausted: [
    [
      "สิทธิ์ฟรีวันนี้หมดแล้ว พรุ่งนี้ได้อีก {freeQuotaPerDay} ครั้ง",
      "",
      "{pkgPaywallLines}",
    ],
    [
      "สิทธิ์ฟรีวันนี้หมด พรุ่งนี้รีเซ็ต {freeQuotaPerDay} ครั้ง",
      "",
      "{pkgPaywallLines}",
    ],
  ],

  /**
   * Paid pack exhausted or window ended (blocked at gate).
   */
  paid_quota_exhausted: [
    [
      "สิทธิ์ที่เปิดไว้หมดแล้ว",
      "{pkgPaywallLines}",
    ],
    [
      "สิทธิ์หมดตามเงื่อนไขแล้ว",
      "{pkgPaywallLines}",
    ],
  ],

  offer_intro: [
    ["{pkgPaywallLines}"],
  ],

  approved_intro: [
    ["เปิดสิทธิ์แล้ว ส่งรูปได้"],
    ["เปิดสิทธิ์แล้ว ใช้ได้ {count} ครั้ง ภายใน {hours} ชม."],
    ["เปิดสิทธิ์แล้ว {price} บาท {count} ครั้ง ภายใน {hours} ชม."],
  ],
};
