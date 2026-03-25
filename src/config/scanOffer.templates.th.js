/**
 * Thai template pools for scan offer copy (PR2).
 * Tone: plain Thai, short, soft — not pushy. Numbers from placeholders only.
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
      "วันนี้สิทธิ์สแกนฟรีครบแล้วครับ",
      "ถ้าสะดวก รอพรุ่งนี้แล้วค่อยสแกนต่อได้เลย",
      "",
      "แต่ถ้าต้องการใช้ต่อทันที",
      "เปิดสิทธิ์เพิ่มได้ {price} บาท",
      "สแกนได้ {count} ครั้ง ภายใน {hours} ชั่วโมงหลังอนุมัติ",
      "",
      "ถ้าพร้อม พิมพ์ 'จ่ายเงิน' ได้เลยครับ",
    ],
    [
      "รอบฟรีวันนี้เต็มแล้วนะครับ",
      "พรุ่งนี้มีสิทธิ์ฟรีใหม่ {freeQuotaPerDay} ครั้งเหมือนเดิม",
      "",
      "อยากสแกนต่อวันนี้ เปิดเพิ่มได้ {price} บาท / {count} ครั้ง / {hours} ชม.",
      "พร้อมแล้วพิมพ์ 'จ่ายเงิน' ได้เลยครับ",
    ],
  ],

  /**
   * Paid pack exhausted or window ended (blocked at gate).
   */
  paid_quota_exhausted: [
    [
      "สิทธิ์ที่เปิดไว้หมดตามเงื่อนไขแล้วครับ",
      "ถ้าต้องการสแกนต่อ เปิดใหม่ได้ {price} บาท / {count} ครั้ง / {hours} ชม.",
      "",
      "พร้อมแล้วพิมพ์ 'จ่ายเงิน' ได้เลยครับ",
    ],
    [
      "รอบสิทธิ์ชำระเงินครั้งก่อนจบลงแล้วครับ",
      "เปิดใหม่ได้ {price} บาท สแกนได้ {count} ครั้ง ภายใน {hours} ชั่วโมงหลังอนุมัติ",
    ],
  ],

  /**
   * Primary paywall: free exhausted + single paid path (blocked).
   */
  offer_intro: [
    [
      "วันนี้สิทธิ์สแกนฟรีครบแล้วครับ",
      "ถ้าสะดวก รอพรุ่งนี้แล้วค่อยสแกนต่อได้เลย",
      "",
      "แต่ถ้าต้องการใช้ต่อทันที",
      "เปิดสิทธิ์เพิ่มได้ {price} บาท",
      "สแกนได้ {count} ครั้ง ภายใน {hours} ชั่วโมงหลังอนุมัติ",
      "",
      "ถ้าพร้อม พิมพ์ 'จ่ายเงิน' ได้เลยครับ",
    ],
    [
      "ฟรีวันนี้ครบแล้วนะครับ",
      "พรุ่งนี้จะมีฟรีใหม่ {freeQuotaPerDay} ครั้ง",
      "",
      "ถ้าอยากใช้ต่อเลยวันนี้ เปิดเพิ่มได้ {price} บาท / {count} ครั้ง / {hours} ชม.",
      "พร้อมแล้วพิมพ์ 'จ่ายเงิน' ได้เลยครับ",
    ],
    [
      "วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ",
      "พรุ่งนี้ค่อยมาใหม่ก็ได้ หรือจะเปิดสิทธิ์เพิ่มวันนี้ก็ได้นะ",
      "",
      "แพ็กเดียวตอนนี้คือ {price} บาท สแกนได้ {count} ครั้ง ภายใน {hours} ชม.",
      "พิมพ์ 'จ่ายเงิน' มาได้เลยครับ",
    ],
  ],

  /**
   * After slip approved (push / system line) — detail lines follow in webhook builder.
   */
  approved_intro: [
    [
      "อนุมัติแล้วครับ",
      "ตอนนี้ใช้สแกนเพิ่มได้ {count} ครั้ง ภายใน {hours} ชั่วโมงนับจากตอนนี้",
    ],
    ["เปิดสิทธิ์ให้แล้วครับ", "แพ็ก {price} บาท ใช้ได้ {count} ครั้ง ภายใน {hours} ชม."],
  ],
};
