/**
 * Thai LINE copy for flows not yet on Ajarn Ener persona pools.
 * Persona-driven types live in `personaEner.th.js` + `replyPersona.util.js`.
 */

/** Shown with birthdate prompts so users always see a concrete example. */
export const BIRTHDATE_EXAMPLE_LINE = "19/08/2528";

export const REPLY_VARIANTS = {
  birthdate_update_prompt: [
    "ขอวันเกิดชุดใหม่หน่อยครับ",
    "บอกวันเกิดใหม่ในแชตนี้ได้เลยครับ",
    "จะใช้วันเกิดแทนเดิมเป็นอันไหน บอกอาจารย์ได้เลยครับ",
  ],

  birthdate_saved_after_update: [
    "บันทึกวันเกิดใหม่แล้วนะ ส่งรูปมาใหม่ได้เลย",
    "เซฟวันเกิดใหม่เรียบร้อย ส่งรูปต่อได้ครับ",
    "อัปเดตวันเกิดแล้ว ส่งรูปวัตถุมาได้เลย",
  ],
};
