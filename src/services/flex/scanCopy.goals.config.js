/**
 * Goal Mapping Layer — Thai strings only. Interpretive, not guarantees.
 * @see scanCopy.goalMapping.js
 */
import { ENERGY_TYPES } from "./scanCopy.config.js";

/** @typedef {'clear'|'moderate'|'soft'|'unclear'} GoalClarity */

/** User-facing clarity chip (short). */
export const GOAL_CLARITY_LABEL_THAI = {
  clear: "เด่นชัด",
  moderate: "ค่อนข้างชัด",
  soft: "พอมีแนวโน้ม",
  unclear: "ยังไม่เด่นชัด",
};

/**
 * One primary cluster phrase per energy (human life-goal direction).
 * Soft wording — no ถูกหวย / รวยแน่ / กันผีชัวร์.
 */
export const GOAL_CLUSTER_PRIMARY = {
  [ENERGY_TYPES.PROTECT]: "คุ้มกัน ตั้งหลัก ใจนิ่ง — กันพลังรบกวนเบา ๆ",
  [ENERGY_TYPES.LUCK]: "เรียกโชค เปิดทาง หนุนจังหวะ — โอกาสไหลลื่นในแนวพอดี",
  [ENERGY_TYPES.ATTRACT]: "เสน่ห์ เข้าหาง่าย — คนอยากเข้าใกล้ในโทนนุ่ม",
  [ENERGY_TYPES.KINDNESS]: "เมตตา คนเอ็นดู — สายสัมพันธ์นุ่มขึ้น",
  [ENERGY_TYPES.POWER]: "หนุนอำนาจในที่พูด มั่นใจ คุมจังหวะ ยืนทรง",
  [ENERGY_TYPES.BALANCE]: "ประคองชีวิต คุมใจ — ผ่านช่วงแกว่งแล้วกลับมาตั้งหลัก",
  [ENERGY_TYPES.BOOST]: "กำลังใจ สู้ต่อ — ไม่หมดเร็วในแนวพอดี",
};

/**
 * Optional softer caveat — suggestive, not denial of the reading.
 */
export const GOAL_NOT_PRIMARY_HINT = {
  [ENERGY_TYPES.LUCK]: "ไม่ได้ชี้ผลลัพธ์ขาด — เป็นแนวโอกาสและจังหวะมากกว่าตัวเลขชี้ขาด",
  [ENERGY_TYPES.PROTECT]: "ไม่ได้หมายถึงกันทุกสิ่ง — เป็นแนวคุ้มกันในใจมากกว่าคำมั่น",
  [ENERGY_TYPES.ATTRACT]: "ไม่ได้ชี้ว่าทุกคนจะชอบ — เป็นแนวเข้าหาง่ายในโทนนุ่ม",
};

/** When score/main energy unusable — believable soft path. */
export const GOAL_UNCLEAR = {
  headline:
    "ยังไม่พบพลังเด่นชัดจากภาพนี้ — พลังของชิ้นนี้ออกกลาง ด้านที่เด่นยังไม่ชัดพอ",
  secondary: "ลองให้วัตถุเต็มเฟรม แสงพอ จะอ่านทิศทางได้ชัดขึ้น",
};

/**
 * Sentence templates by clarity. {cluster} = primary cluster phrase.
 */
export const GOAL_HEADLINE_TEMPLATE = {
  clear: "ชิ้นนี้เด่นเรื่อง {cluster}",
  moderate: "ชิ้นนี้โฟกัสไปทาง {cluster}",
  soft: "มีแนวโน้มไปทาง {cluster}",
};
