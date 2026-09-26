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
   * Free quota for today is exhausted — distinct from scan-lock / abuse (quota only).
   */
  free_quota_exhausted: [
    [
      "วันนี้ใช้สิทธิ์สแกนฟรีครบแล้วครับ",
      "พรุ่งนี้ยังใช้ฟรีต่อได้อีก {freeQuotaPerDay} ครั้งนะครับ",
      "",
      "ถ้าอยากสแกนต่อวันนี้ เดี๋ยวอาจารย์เปิดค่าครูให้ต่อได้ครับ",
      "",
      "{pkgPaywallLines}",
      "พร้อมเมื่อไหร่แตะปุ่มด้านล่าง หรือบอกอาจารย์ได้เลยครับ",
    ],
    [
      "วันนี้สิทธิ์สแกนฟรีครบแล้วครับ",
      "พรุ่งนี้มีฟรีใหม่ {freeQuotaPerDay} ครั้งเหมือนเดิม",
      "",
      "อยากสแกนต่อวันนี้ เปิดเพิ่มได้ครับ",
      "{pkgPaywallLines}",
      "สะดวกค่าครูแบบไหนแตะปุ่มด้านล่าง หรือบอกราคามาเลยครับ",
    ],
  ],

  /**
   * Paid pack exhausted or window ended (blocked at gate).
   */
  paid_quota_exhausted: [
    [
      "สิทธิ์ที่เปิดไว้หมดตามเงื่อนไขแล้วครับ",
      "ถ้าต้องการสแกนต่อ เปิดใหม่ได้ครับ",
      "{pkgPaywallLines}",
      "",
      "พร้อมเมื่อไหร่แจ้งอาจารย์ได้เลยครับ",
    ],
    [
      "รอบสิทธิ์ชำระเงินครั้งก่อนจบลงแล้วครับ",
      "เปิดใหม่ได้ครับ",
      "{pkgPaywallLines}",
    ],
  ],

  /**
   * Primary paywall: free exhausted + single paid path (blocked).
   */
  offer_intro: [
    [
      "วันนี้ใช้สิทธิ์สแกนฟรีครบแล้วครับ",
      "พรุ่งนี้ยังใช้ฟรีต่อได้อีก {freeQuotaPerDay} ครั้งนะครับ",
      "",
      "ถ้าอยากสแกนต่อวันนี้ เดี๋ยวอาจารย์เปิดค่าครูให้ต่อได้ครับ",
      "",
      "{pkgPaywallLines}",
      "พร้อมเมื่อไหร่แตะปุ่มด้านล่าง หรือบอกอาจารย์ได้เลยครับ",
    ],
    [
      "ฟรีวันนี้ครบแล้วนะครับ",
      "พรุ่งนี้จะมีฟรีใหม่ {freeQuotaPerDay} ครั้ง",
      "",
      "อยากใช้ต่อเลยวันนี้ เปิดเพิ่มได้ครับ",
      "{pkgPaywallLines}",
      "สะดวกค่าครูแบบไหนแตะปุ่มด้านล่าง หรือบอกราคามาเลยครับ",
    ],
    [
      "วันนี้สิทธิ์สแกนฟรีครบแล้วครับ",
      "พรุ่งนี้ค่อยมาใหม่ก็ได้ หรือจะเปิดเพิ่มวันนี้ก็ได้นะครับ",
      "",
      "ค่าครูตอนนี้มีให้เลือกครับ",
      "{pkgPaywallLines}",
      "พร้อมเมื่อไหร่แจ้งอาจารย์ได้เลยครับ",
    ],
  ],

  /**
   * โหมดลูกค้าใหม่ (ทดลองรวม 2 ครั้ง) — ห้ามพูดฟรีรายวัน/พรุ่งนี้ · คลังเดิมดูได้เสมอ
   */
  free_quota_low_trial: [
    [
      "สิทธิ์ทดลองฟรีคงเหลือ {freeRemaining} ครั้งครับ",
      "สำหรับลูกค้าใหม่ รวม 2 ครั้งต่อบัญชี ไม่เติมใหม่รายวัน",
    ],
  ],
  offer_intro_trial: [
    [
      "ใช้สิทธิ์ทดลองฟรีครบ 2 ครั้งแล้วครับ",
      "หากต้องการสแกนองค์ใหม่ เลือกเติมสิทธิ์ด้านล่างได้เลย ส่วนรายงานที่เคยสแกนยังเปิดดูได้ตามเดิมครับ",
      "",
      "{pkgPaywallLines}",
      "พร้อมเมื่อไหร่แตะปุ่มด้านล่าง หรือบอกอาจารย์ได้เลยครับ",
    ],
  ],
  existing_no_rights_trial: [
    [
      "เติมสิทธิ์เพื่อสแกนองค์ใหม่ครับ",
      "เลือกแพ็กสแกนด้านล่างได้เลย คลังและรายงานเดิมของคุณยังเปิดดูได้โดยไม่ต้องซื้อแพ็ก",
      "",
      "{pkgPaywallLines}",
      "พร้อมเมื่อไหร่แตะปุ่มด้านล่าง หรือบอกอาจารย์ได้เลยครับ",
    ],
  ],

  /**
   * After slip approved (push / system line) — detail lines follow in webhook builder.
   */
  approved_intro: [
    ["อนุมัติแล้วครับ", "ส่งรูปมาสแกนต่อได้เลยครับ"],
    [
      "อนุมัติแล้วครับ",
      "ตอนนี้ใช้สแกนเพิ่มได้ {count} ครั้ง ภายใน {hours} ชั่วโมงนับจากตอนนี้",
    ],
    ["เปิดสิทธิ์ให้แล้วครับ", "ค่าครู {price} บาท ใช้ได้ {count} ครั้ง ภายใน {hours} ชม."],
  ],
};
