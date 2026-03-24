/**
 * Thai template pools for scan offer copy (PR2).
 * Tone: plain Thai, short, soft — not pushy. Numbers from placeholders only.
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
    [
      "วันนี้เหลือสิทธิ์สแกนฟรีอีก {freeRemaining} ครั้งครับ",
      "ใช้ให้คุ้มแล้วค่อยว่ากันใหม่พรุ่งนี้ก็ได้",
    ],
    [
      "โควตฟรีวันนี้เหลือ {freeRemaining} ครั้งนะครับ",
      "ถ้าอยากพักก่อน พรุ่งนี้จะรีเซ็ตตามรอบปกติ",
    ],
  ],

  /**
   * Free quota for today is exhausted (informational alternates).
   */
  free_quota_exhausted: [
    [
      "วันนี้สิทธิ์ฟรีครบแล้วครับ",
      "พรุ่งนี้จะได้สิทธิ์ฟรีใหม่ {freeQuotaPerDay} ครั้งด้วยนะครับ",
      "",
      "ถ้าอยากสแกนต่อเลย ตอนนี้เลือกแพ็กเกจได้ครับ",
      "{pkgPaywallLines}",
      "",
      "พิมพ์ {priceTokens} ได้เลยครับ",
    ],
    [
      "รอบฟรีวันนี้เต็มแล้วนะครับ",
      "พรุ่งนี้มีสิทธิ์ฟรีใหม่ {freeQuotaPerDay} ครั้งเหมือนเดิม",
      "",
      "อยากสแกนต่อวันนี้ เลือกแพ็กได้แบบนี้",
      "{pkgPaywallLines}",
      "",
      "พิมพ์เลข {priceTokens} ตามแพ็กที่สะดวกได้เลยครับ",
    ],
  ],

  /**
   * Paid pack exhausted or window ended (blocked at gate).
   */
  paid_quota_exhausted: [
    [
      "สิทธิ์แพ็กที่เปิดไว้หมดตามเงื่อนไขแล้วครับ",
      "ถ้าต้องการสแกนต่อ เลือกแพ็กใหม่ได้เหมือนเดิม",
      "",
      "{pkgNumberedList}",
      "",
      "พิมพ์ {priceTokens} แล้วตามด้วย จ่ายเงิน ได้เลยครับ",
    ],
    [
      "รอบสิทธิ์ชำระเงินครั้งก่อนจบลงแล้วครับ",
      "เปิดแพ็กใหม่ได้เมื่อพร้อม",
      "",
      "{pkgPaywallLines}",
    ],
  ],

  /**
   * Primary paywall: free exhausted + both packages (blocked).
   */
  offer_intro: [
    [
      "วันนี้สิทธิ์ฟรีครบแล้วครับ",
      "พรุ่งนี้จะได้สิทธิ์ฟรีใหม่ {freeQuotaPerDay} ครั้งด้วยนะครับ",
      "",
      "ถ้าอยากสแกนต่อเลย ตอนนี้เลือกแพ็กเกจได้ครับ",
      "{pkgPaywallLines}",
      "",
      "พิมพ์ {priceTokens} ได้เลยครับ",
    ],
    [
      "ฟรีวันนี้ครบแล้วนะครับ",
      "พรุ่งนี้จะมีฟรีใหม่ {freeQuotaPerDay} ครั้ง",
      "",
      "ถ้าอยากใช้ต่อเลย มีตัวเลือกแบบนี้",
      "{pkgPaywallLines}",
      "",
      "พิมพ์เลข {priceTokens} เพื่อเลือกแพ็กได้ครับ",
    ],
    [
      "วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ",
      "พรุ่งนี้ค่อยมาใหม่ก็ได้ หรือจะเปิดแพ็กวันนี้ก็ได้นะ",
      "",
      "{pkgPaywallLines}",
      "",
      "สะดวกแพ็กไหน พิมพ์ {priceTokens} มาได้เลยครับ",
    ],
  ],

  /**
   * After slip approved (push / system line) — detail lines follow in webhook builder.
   */
  approved_intro: [
    [
      "เปิดสิทธิ์สแกนให้แล้วครับ",
      "แพ็กเกจ {price} บาท ใช้ได้ {count} ครั้ง ภายใน {hours} ชั่วโมง",
    ],
    ["สลิปผ่านแล้วครับ", "ใช้สิทธิ์ตามแพ็กได้เลย"],
  ],
};
