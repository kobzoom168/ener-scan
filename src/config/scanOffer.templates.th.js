/**
 * Thai template pools for scan offer copy (PR2).
 * Tone: polite, not hard sell, no emoji. Numbers only as placeholders.
 *
 * Each variant is an array of paragraphs (joined with "\\n\\n" when rendering).
 * Placeholders: {price}, {count}, {hours}, {nextResetLabel}, {freeRemaining}, {offerLabel}
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
   * Free quota for today is exhausted (informational alternates; often paired with offer_intro).
   */
  free_quota_exhausted: [
    [
      "โควตฟรีวันนี้ครบตามที่ตั้งไว้แล้วครับ",
      "รอบถัดไปเริ่มหลัง {nextResetLabel}",
    ],
    [
      "สิทธิ์ฟรีของวันนี้ใช้ครบแล้วนะครับ",
      "พรุ่งนี้จะมีโควตใหม่ตามรอบเดิม",
    ],
  ],

  /**
   * Paid pack exhausted or window ended (blocked at gate).
   */
  paid_quota_exhausted: [
    [
      "สิทธิ์แพ็กที่เปิดไว้หมดตามเงื่อนไขแล้วครับ",
      "ถ้าต้องการสแกนต่อ แจ้งทางเมนูหรือพิมพ์คำสั่งที่ใช้ชำระเงินได้เหมือนเดิม",
    ],
    [
      "รอบสิทธิ์ชำระเงินครั้งก่อนจบลงแล้วครับ",
      "ลองใหม่ได้เมื่อพร้อมจะเปิดแพ็กใหม่ตามขั้นตอนเดิม",
    ],
  ],

  /**
   * Primary paywall: introduce paid pack (blocked, free exhausted).
   */
  offer_intro: [
    [
      "โควตฟรีวันนี้ครบแล้วครับ",
      "แพ็กถัดไป {price} บาท สแกนได้ {count} ครั้ง ภายใน {hours} ชั่วโมงหลังอนุมัติ",
      "พิมพ์ จ่ายเงิน แล้วทำตามขั้นตอนในแชตได้เลย",
    ],
    [
      "วันนี้ใช้สิทธิ์ฟรีครบตามกำหนดแล้วนะครับ",
      "ถ้าอยากสแกนต่อวันนี้ มีแพ็ก {price} บาท ได้ {count} ครั้ง ใช้ภายใน {hours} ชั่วโมงหลังอนุมัติ",
      "พิมพ์ จ่ายเงิน เพื่อเริ่มขั้นตอนได้เลย",
    ],
    [
      "รอบฟรีของวันนี้เต็มแล้วครับ",
      "ตัวเลือกถัดไปคือแพ็ก {price} บาท ({count} ครั้ง / {hours} ชม. หลังเปิดสิทธิ์)",
      "ส่งคำว่า จ่ายเงิน ในแชตนี้ได้เมื่อพร้อม",
    ],
  ],

  /**
   * After slip approved (push / system line): short intro; detail lines follow in webhook builder.
   */
  approved_intro: [
    ["อนุมัติแล้วครับ เปิดสิทธิ์ตามแพ็ก {offerLabel}"],
    ["สลิปผ่านแล้วครับ ใช้สิทธิ์ตามแพ็กได้เลย"],
  ],
};
