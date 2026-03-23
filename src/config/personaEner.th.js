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

/**
 * Slot names (semantic, not single letters):
 * OPEN, ASK, CONTINUE, EXAMPLE, REMIND, OPEN_SHORT, ASK_SHORT,
 * SOFT, HINT, NUDGE, WAIT, ACTION, CONTEXT, OFFER, CTA, STATUS
 *
 * Paywall CTA lines may contain {{AMOUNT}} (THB).
 */

/** @typedef {{ patterns: string[][], pools: Record<string, string[]>, maxMessages?: number }} PersonaReplyConfig */

/** @type {Record<string, PersonaReplyConfig>} */
export const PERSONA_REPLY_CONFIG = {
  waiting_birthdate_initial: {
    maxMessages: 3,
    patterns: [
      ["OPEN", "ASK", "CONTINUE"],
      ["ASK", "OPEN", "CONTINUE"],
      ["OPEN", "CONTINUE"],
      ["ASK", "EXAMPLE"],
      ["OPEN", "ASK", "EXAMPLE"],
      ["ASK", "CONTINUE", "EXAMPLE"],
      ["CONTINUE", "OPEN", "ASK"],
      ["OPEN_SHORT", "ASK_SHORT"],
    ],
    pools: {
      OPEN: [
        "ได้รูปแล้วนะ",
        "ผมได้รูปแล้ว",
        "รับภาพแล้วครับ",
        "เห็นรูปแล้วนะ",
      ],
      OPEN_SHORT: ["ได้รูปแล้ว", "รูปมาแล้วนะ"],
      ASK: [
        "ขอวันเกิดเจ้าของวัตถุนิดนึง",
        "ขอวันเกิดก่อนนะ",
        "ขอวันเกิดเจ้าของวัตถุหน่อย",
        "ส่งวันเกิดมาก่อนได้เลย",
      ],
      ASK_SHORT: ["ขอวันเกิดก่อนนะ", "พิมพ์วันเกิดมาก่อน"],
      CONTINUE: [
        "เดี๋ยวผมดูให้",
        "จะได้อ่านให้ตรงขึ้น",
        "พอได้แล้วผมจะดูให้ต่อ",
        "แล้วผมจะดูให้",
      ],
      EXAMPLE: [
        "14/09/1995 หรือ 14/09/2538",
        "ลองแบบนี้ได้ 14/09/1995 หรือ 14/09/2538",
        "พิมพ์แบบนี้ได้ 14/09/1995 หรือ 14/09/2538",
      ],
    },
  },

  waiting_birthdate_guidance: {
    maxMessages: 3,
    patterns: [
      ["REMIND", "ASK", "CONTINUE"],
      ["ASK", "REMIND", "CONTINUE"],
      ["REMIND", "CONTINUE"],
      ["ASK", "EXAMPLE"],
      ["REMIND", "ASK", "EXAMPLE"],
      ["CONTINUE", "REMIND", "ASK"],
      ["OPEN_SHORT", "ASK_SHORT", "EXAMPLE"],
    ],
    pools: {
      REMIND: [
        "ตอนนี้ขอวันเกิดก่อนนะ",
        "ขอวันเกิดเจ้าของวัตถุก่อน",
        "ยังรอวันเกิดอยู่นะ",
        "ยังไม่ได้วันเกิดเลย",
      ],
      OPEN_SHORT: ["ยังรอวันเกิดอยู่", "ขอวันเกิดก่อนนะ"],
      ASK: [
        "พิมพ์วันเกิดเจ้าของวัตถุมาได้เลย",
        "ขอวันเกิดแบบตัวเลขมาก่อน",
        "ส่งวันเกิดมาก่อนนะ",
        "บอกวันเกิดมาแล้วค่อยทำอย่างอื่นต่อ",
      ],
      ASK_SHORT: ["พิมพ์วันเกิดมาก่อน", "ขอวันเกิดก่อน"],
      CONTINUE: [
        "เดี๋ยวผมอ่านให้ต่อ",
        "มีวันเกิดแล้วค่อยดูให้ละเอียด",
        "พอมีวันเกิด ผมจะไล่ให้ครบ",
        "ขอแค่วันเกิดก่อน ที่เหลือค่อยว่ากัน",
      ],
      EXAMPLE: [
        "14/09/1995 หรือ 14/09/2538",
        "ลองพิมพ์แบบนี้ 14/09/1995 หรือ 14/09/2538",
      ],
    },
  },

  waiting_birthdate_invalid_format: {
    maxMessages: 3,
    patterns: [
      ["SOFT", "HINT", "EXAMPLE"],
      ["HINT", "SOFT", "EXAMPLE"],
      ["SOFT", "EXAMPLE"],
      ["HINT", "EXAMPLE"],
      ["EXAMPLE", "SOFT"],
    ],
    pools: {
      SOFT: [
        "วันเกิดยังอ่านไม่ค่อยออก",
        "รูปแบบยังไม่ตรงที่ผมอ่านได้",
        "ตัวเลขยังไม่ชัดนะ",
      ],
      HINT: [
        "ลองพิมพ์ใหม่อีกทีได้",
        "ลองจัดรูปแบบใหม่นิดนึง",
        "พิมพ์ใหม่ตามตัวอย่างด้านล่างได้เลย",
      ],
      EXAMPLE: [
        "14/09/1995 หรือ 14/09/2538",
        "แบบนี้ได้ 14/09/1995 หรือ 14/09/2538",
      ],
    },
  },

  waiting_birthdate_invalid_date: {
    maxMessages: 3,
    patterns: [
      ["SOFT", "HINT", "EXAMPLE"],
      ["SOFT", "EXAMPLE"],
      ["HINT", "SOFT"],
      ["EXAMPLE", "HINT"],
    ],
    pools: {
      SOFT: [
        "วันนี้ดูไม่ตรงปฏิทินนะ",
        "วันเดือนปีอาจจะพิมพ์เพี้ยน",
        "วันที่ยังไม่น่าใช่",
      ],
      HINT: [
        "ลองเช็กอีกทีแล้วส่งใหม่ได้",
        "แก้แล้วพิมพ์ใหม่ได้เลย",
        "ลองตรวจวันเดือนปีอีกครั้ง",
      ],
      EXAMPLE: [
        "14/09/1995 หรือ 14/09/2538",
        "ลองแบบนี้ 14/09/1995 หรือ 14/09/2538",
      ],
    },
  },

  waiting_birthdate_out_of_range: {
    maxMessages: 3,
    patterns: [
      ["SOFT", "HINT", "EXAMPLE"],
      ["SOFT", "HINT"],
      ["HINT", "EXAMPLE"],
    ],
    pools: {
      SOFT: [
        "ปีที่พิมพ์มายังไม่เข้าช่วงที่ผมรับได้",
        "ช่วงปีดูแปลกนิดนึง",
        "ปีเกิดยังไม่ตรงช่วงที่ใช้ได้",
      ],
      HINT: [
        "ลองปรับปีใหม่นะ",
        "ลองใช้ปีที่สมเหตุสมผลตามตัวอย่าง",
        "ลองพิมพ์ใหม่ได้เลย",
      ],
      EXAMPLE: [
        "14/09/1995 หรือ 14/09/2538",
        "ลองอิงตัวอย่างนี้ 14/09/1995 หรือ 14/09/2538",
      ],
    },
  },

  waiting_birthdate_image_reminder: {
    maxMessages: 3,
    patterns: [
      ["REMIND", "NUDGE", "ASK"],
      ["NUDGE", "REMIND"],
      ["REMIND", "ASK"],
      ["ASK", "REMIND", "CONTINUE"],
    ],
    pools: {
      REMIND: [
        "ผมขอทีละชิ้นนะ ตอนนี้ขอวันเกิดก่อน",
        "เดี๋ยวดูให้ทีละรูป แต่ขอวันเกิดก่อน",
        "ขอจัดทีละชิ้น พิมพ์วันเกิดก่อน",
      ],
      NUDGE: [
        "ยังรอวันเกิดอยู่นะ",
        "พิมพ์วันเกิดมาก่อนแล้วค่อยส่งรูปเพิ่ม",
        "ขอวันเกิดก่อนนะ",
      ],
      ASK: [
        "พิมพ์วันเกิดเจ้าของวัตถุมาได้เลย",
        "ส่งวันเกิดมาก่อนได้เลย",
      ],
      CONTINUE: ["แล้วผมจะดูให้ต่อ", "เดี๋ยวผมไล่ให้"],
    },
  },

  before_scan: {
    maxMessages: 3,
    patterns: [
      ["OPEN", "WAIT", "CONTINUE"],
      ["WAIT", "OPEN"],
      ["OPEN", "WAIT"],
      ["OPEN"],
      ["WAIT", "CONTINUE"],
      ["CONTINUE", "OPEN", "WAIT"],
    ],
    pools: {
      OPEN: [
        "โอเค เดี๋ยวผมดูให้เลย",
        "ได้แล้ว เดี๋ยวลองอ่านให้",
        "เรียบร้อย ผมจัดให้",
      ],
      WAIT: [
        "รอสักครู่นะ",
        "รอผลแป๊บนึง",
        "แป๊บนึงนะ",
        "รอแชตนี้ได้เลย",
      ],
      CONTINUE: [
        "กำลังไล่อ่านให้อยู่",
        "เดี๋ยวส่งผลให้",
      ],
    },
  },

  paywall: {
    maxMessages: 3,
    patterns: [
      ["PAYWALL_BODY"],
    ],
    pools: {
      PAYWALL_BODY: [
        "วันนี้ใช้ฟรีครบ 2 ครั้งแล้วนะ\n\nระบบให้ใช้ฟรีวันละ 2 ครั้ง\nถ้ายังอยากสแกนต่อวันนี้ พิมพ์ จ่ายเงิน ได้เลย\n\nช่วงพลังงานของวันนี้ยังเปิดอยู่\nถ้าปล่อยผ่าน อาจไม่ตรงจังหวะเดิมแล้ว\n\nปลดล็อกเพิ่มเพียง {{AMOUNT}} บาท\nใช้ได้ทันที ดูต่อเนื่องได้เลย\n\nหรือจะกลับมาสแกนใหม่พรุ่งนี้ก็ได้",
        "วันนี้ใช้ฟรีครบ 2 ครั้งแล้วนะ\n\nระบบให้ใช้ฟรีวันละ 2 ครั้ง\nแต่พลังของแต่ละวันจะไม่เหมือนกัน\n\nถ้ายังอยากดูต่อวันนี้ สามารถปลดล็อกเพิ่มได้\nเพียง {{AMOUNT}} บาท ใช้งานได้ทันที\n\nหรือค่อยกลับมาสแกนใหม่พรุ่งนี้ก็ได้",
        "วันนี้ใช้ฟรีครบ 2 ครั้งแล้วนะ\n\nระบบให้ใช้ฟรีวันละ 2 ครั้ง\nถ้ายังอยากสแกนต่อวันนี้ พิมพ์ จ่ายเงิน ได้เลย\n\nผลที่กำลังต่อเนื่องตอนนี้\nจะอ่านได้ชัดที่สุดในจังหวะนี้\n\nปลดล็อกเพิ่มเพียง {{AMOUNT}} บาท\nใช้ได้ทันที ไม่ต้องเริ่มใหม่\n\nหรือกลับมาสแกนใหม่พรุ่งนี้ก็ได้",
      ],
    },
  },

  awaiting_slip: {
    maxMessages: 3,
    patterns: [
      ["WAIT", "ACTION", "SOFT"],
      ["ACTION", "WAIT"],
      ["WAIT", "ACTION"],
      ["ACTION", "SOFT"],
    ],
    pools: {
      WAIT: [
        "รอสลิปอยู่ครับ",
        "ยังไม่เห็นสลิปนะ",
        "ขอสลิปก่อนนะ",
      ],
      ACTION: [
        "โอนแล้วส่งรูปเดียวในแชตนี้ได้เลย",
        "พอโอนแล้วส่งรูปมาในแชตนี้",
        "ส่งรูปสลิปมาในแชตนี้ได้เลย",
      ],
      SOFT: [
        "เดี๋ยวตรวจให้",
        "พอมีสลิปแล้วค่อยไปต่อ",
        "ส่งมาแล้วรอในแชตนี้ได้",
      ],
    },
  },

  pending_verify: {
    maxMessages: 3,
    patterns: [
      ["STATUS", "SOFT", "WAIT"],
      ["STATUS", "WAIT"],
      ["SOFT", "STATUS"],
      ["WAIT", "STATUS", "SOFT"],
    ],
    pools: {
      STATUS: [
        "สลิปรอตรวจอยู่ครับ",
        "รับสลิปแล้วนะ กำลังตรวจอยู่",
        "ตอนนี้รอตรวจสลิปอยู่",
      ],
      SOFT: [
        "รอแป๊บนึง ยังไม่ต้องส่งซ้ำ",
        "มีอัปเดตจะบอกในแชตนี้",
        "รอผลในแชตนี้ได้เลย",
      ],
      WAIT: [
        "เดี๋ยวมีข่าวให้",
        "ไม่ต้องรีบส่งซ้ำนะ",
        "รอก่อนนะ",
      ],
    },
  },

  pending_verify_block_scan: {
    maxMessages: 3,
    patterns: [
      ["STATUS", "SOFT", "WAIT"],
      ["STATUS", "SOFT"],
      ["SOFT", "STATUS"],
    ],
    pools: {
      STATUS: [
        "สลิปเข้าคิวตรวจแล้วครับ ตอนนี้ยังสแกนต่อไม่ได้",
        "รับสลิปไปแล้ว กำลังตรวจอยู่",
        "ตอนนี้รอตรวจสลิปอยู่",
      ],
      SOFT: [
        "รอผลก่อนนะ",
        "ยังไม่ต้องส่งรูปสแกนเพิ่ม",
        "พอผ่านแล้วค่อยสแกนต่อได้",
      ],
      WAIT: [
        "เดี๋ยวแจ้งในแชตนี้",
        "รอแป๊บนะ",
      ],
    },
  },

  pending_verify_payment_again: {
    maxMessages: 3,
    patterns: [
      ["STATUS", "SOFT", "WAIT"],
      ["STATUS", "WAIT"],
    ],
    pools: {
      STATUS: [
        "ตอนนี้มีสลิปรอตรวจอยู่แล้วครับ",
        "สลิปเข้าคิวตรวจแล้ว",
        "รับสลิปไปแล้ว",
      ],
      SOFT: [
        "รอผลก่อนนะ ไม่ต้องพิมพ์ payment ซ้ำ",
        "เดี๋ยวรอข่าวก่อน ยังไม่ต้องสั่งจ่ายใหม่",
        "รอตรวจแป๊บนึง ยังไม่ต้องกดจ่ายซ้ำ",
      ],
      WAIT: [
        "มีอัปเดตจะบอกในแชตนี้",
        "รอก่อนนะ",
      ],
    },
  },

  approved_intro: {
    maxMessages: 1,
    patterns: [["OPEN"]],
    pools: {
      OPEN: [
        "แอดมินอนุมัติแล้ว เปิดสิทธิ์ให้แล้วนะครับ",
        "ผ่านแล้วครับ สิทธิ์พร้อมใช้งานแล้ว",
        "โอเค อนุมัติแล้ว เข้าใช้งานได้เลย",
        "เรียบร้อย สิทธิ์พร้อมแล้วนะ",
      ],
    },
  },
};
