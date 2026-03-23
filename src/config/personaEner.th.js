/**
 * Ajarn Ener — non-scan LINE persona (text only).
 *
 * Layers:
 * 1) Persona rules (tone, forbidden / preferred phrasing)
 * 2) Conversation patterns (slot order per reply type)
 * 3) Content pools (variants per slot)
 * 4) Delivery: 1–3 short bubbles; pacing via existing sendTextSequence delays
 *
 * Scan result / Flex / payment business rules live outside this file.
 */

/** Tone & guardrails (for authors; runtime does not enforce automatically). */
export const AJARN_ENER_PERSONA_RULES = {
  name: "Ajarn Ener",
  locale: "th",
  tone: [
    "พูดแบบคนจริงพิมพ์ในแชต ไม่รีบ ไม่เป็นทางการ",
    "สุภาพแบบสบาย ๆ ไม่ขายของเกินเรื่อง",
    "แนะนำกลับเข้า flow ได้ โดยไม่กดดัน",
  ],
  avoid: [
    "กรุณา",
    "โปรด",
    "ข้อมูลไม่ถูกต้อง",
    "ดำเนินการ",
    "ท่าน",
    "emoji / ไอคอน",
    "ทางการแบบ call center",
  ],
  prefer: [
    "ได้รูปแล้วนะ",
    "ขอวันเกิดก่อนนะ",
    "เดี๋ยวผมดูให้",
    "ลองพิมพ์แบบนี้ได้",
    "พอได้แล้วผมจะดูให้ต่อ",
  ],
};

/** @typedef {{ patterns: string[][], pools: Record<string, string[]>, maxMessages?: number }} PersonaReplyConfig */

const BASE_POOLS = {
  OPEN: [
    "โอเค",
    "รับแล้ว",
    "เห็นแล้ว",
    "ได้ครับ",
    "มาแล้ว",
    "เรียบร้อย",
    "โอเค ได้อยู่",
  ],
  ASK: [
    "ขอวันเกิดเจ้าของหน่อย",
    "ขอวันเกิดเจ้าของวัตถุหน่อย",
    "พิมพ์วันเกิดให้ผมหน่อย",
    "ขอวันเกิดนิดนึง",
    "ส่งวันเกิดมาได้เลย",
  ],
  EXAMPLE: [
    "เช่น 14/09/1995",
    "รูปแบบประมาณ 14/09/1995",
    "ตัวอย่าง 14/09/1995",
    "พิมพ์แบบ 14/09/1995 ได้เลย",
  ],
  CONTINUE: [
    "เดี๋ยวผมดูให้ต่อ",
    "จะอ่านให้ต่อเลย",
    "ผมจะไล่ดูให้ทีละส่วน",
    "ขอเวลาแป๊บนึง",
    "กำลังดูให้",
  ],
  REMIND: [
    "ขอวันเกิดก่อนนะ",
    "ยังขาดวันเกิดอยู่",
    "ส่งวันเกิดมาก่อน",
    "ต้องใช้วันเกิดก่อนถึงจะดูต่อได้",
  ],
  CLOSE: [
    "ถ้าจะดูต่อเต็ม ๆ เดี๋ยวผมเปิดให้",
    "ถ้าจะเอาฉบับเต็ม เดี๋ยวจัดให้ได้",
    "ตัวเต็มมีรายละเอียดลึกกว่านี้",
    "ถ้าจะดูละเอียด เดี๋ยวเปิดให้ต่อ",
  ],
};

/** @type {Record<string, PersonaReplyConfig>} */
export const PERSONA_REPLY_CONFIG = {
  waiting_birthdate_initial: {
    maxMessages: 3,
    patterns: [["OPEN", "ASK", "EXAMPLE"]],
    pools: BASE_POOLS,
  },

  waiting_birthdate_guidance: {
    maxMessages: 3,
    patterns: [["REMIND", "CONTINUE", "EXAMPLE"]],
    pools: BASE_POOLS,
  },

  waiting_birthdate_invalid_format: {
    maxMessages: 2,
    patterns: [["OPEN", "EXAMPLE"]],
    pools: BASE_POOLS,
  },

  waiting_birthdate_invalid_date: {
    maxMessages: 3,
    patterns: [["OPEN", "CONTINUE", "EXAMPLE"]],
    pools: BASE_POOLS,
  },

  waiting_birthdate_out_of_range: {
    maxMessages: 3,
    patterns: [["OPEN", "CONTINUE", "EXAMPLE"]],
    pools: BASE_POOLS,
  },

  waiting_birthdate_image_reminder: {
    maxMessages: 2,
    patterns: [["OPEN", "CONTINUE"]],
    pools: BASE_POOLS,
  },

  before_scan: {
    maxMessages: 2,
    patterns: [["OPEN", "CONTINUE"]],
    pools: BASE_POOLS,
  },

  paywall: {
    maxMessages: 3,
    patterns: [["OPEN", "CONTINUE", "CLOSE"]],
    pools: BASE_POOLS,
  },

  awaiting_slip: {
    maxMessages: 2,
    patterns: [["OPEN", "CONTINUE"]],
    pools: BASE_POOLS,
  },

  pending_verify: {
    maxMessages: 2,
    patterns: [["OPEN", "CONTINUE"]],
    pools: {
      ...BASE_POOLS,
      OPEN: [
        "ได้รับสลิปแล้ว",
        "เห็นสลิปแล้ว",
        "รับรายการแล้ว",
      ],
      CONTINUE: [
        "กำลังตรวจสอบให้อยู่",
        "รอแอดมินเช็คให้แป๊บนึง",
        "เดี๋ยวตรวจให้ก่อน",
      ],
    },
  },

  pending_verify_block_scan: {
    maxMessages: 2,
    patterns: [["OPEN", "CONTINUE"]],
    pools: BASE_POOLS,
  },

  pending_verify_payment_again: {
    maxMessages: 2,
    patterns: [["OPEN", "CONTINUE"]],
    pools: BASE_POOLS,
  },

  approved_intro: {
    maxMessages: 2,
    patterns: [["OPEN", "CONTINUE"]],
    pools: {
      ...BASE_POOLS,
      OPEN: [
        "เรียบร้อยแล้ว",
        "ผ่านแล้ว",
        "เปิดให้แล้ว",
      ],
      CONTINUE: [
        "ลองส่งรูปมาได้เลย",
        "สแกนต่อได้แล้ว",
        "พร้อมใช้งานแล้ว",
      ],
    },
  },

  idle_post_scan: {
    maxMessages: 2,
    patterns: [["OPEN", "CONTINUE"]],
    pools: {
      ...BASE_POOLS,
      OPEN: [
        "ส่งรูปมาได้เลย",
        "มีชิ้นไหนอยากให้ดูต่อก็ส่งมา",
        "ลองส่งชิ้นถัดไปมาได้เลย",
        "ถ้ามีอีกชิ้นก็ส่งมาได้เลย",
      ],
      CONTINUE: [
        "ผมจะดูให้ทีละชิ้น",
        "เดี๋ยวไล่ดูให้",
        "จะอ่านให้เหมือนเดิม",
        "ดูให้ต่อได้เลย",
      ],
    },
  },
};
