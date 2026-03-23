/**
 * Thai LINE copy for flows not yet on Ajarn Ener persona pools.
 * Persona-driven types live in `personaEner.th.js` + `replyPersona.util.js`.
 */

/** Shown with birthdate prompts so users always see a concrete example. */
export const BIRTHDATE_EXAMPLE_LINE = "14/09/1995 หรือ 14/09/2538";

export const REPLY_VARIANTS = {
  birthdate_update_prompt: [
    "พิมพ์วันเกิดใหม่มาได้เลยครับ",
    "ขอวันเกิดชุดใหม่หน่อย พิมพ์มาในแชตนี้ได้เลย",
    "พิมพ์วันเกิดที่จะใช้แทนมาได้เลยครับ",
  ],

  birthdate_saved_after_update: [
    "บันทึกวันเกิดใหม่แล้วนะ ส่งรูปมาใหม่ได้เลย",
    "เซฟวันเกิดใหม่เรียบร้อย ส่งรูปต่อได้ครับ",
    "อัปเดตวันเกิดแล้ว ส่งรูปวัตถุมาได้เลย",
  ],
};
