/**
 * Main label + alt label by scan tone (Bubble 1 headline strip).
 */
import { ENERGY_TYPES, MAIN_LABEL, MAIN_LABEL_ALT } from "./scanCopy.config.js";

/** @type {Record<import('./scanCopy.toneLevel.js').ScanToneLevel, typeof MAIN_LABEL>} */
export const MAIN_LABEL_BY_TONE = {
  standard: MAIN_LABEL,
  mystic: {
    [ENERGY_TYPES.PROTECT]: "คุ้มกันและกันแรงรบกวน",
    [ENERGY_TYPES.BALANCE]: "สมดุลและพลังนิ่งในใจ",
    [ENERGY_TYPES.POWER]: "พลังอำนาจและคุมจังหวะ",
    [ENERGY_TYPES.KINDNESS]: "เมตตาและคนเปิดใจ",
    [ENERGY_TYPES.ATTRACT]: "เสน่ห์และแรงดึงดูด",
    [ENERGY_TYPES.LUCK]: "เปิดทางและหนุนจังหวะ",
    [ENERGY_TYPES.BOOST]: "เติมแรงและพยุงใจ",
  },
  mystic_sales: {
    [ENERGY_TYPES.PROTECT]: "กันพลังไม่ดีและคุ้มใจ",
    [ENERGY_TYPES.BALANCE]: "ประคองใจและตั้งหลัก",
    [ENERGY_TYPES.POWER]: "ยืนทรงและคุมจังหวะ",
    [ENERGY_TYPES.KINDNESS]: "เมตตาและคนเอ็นดู",
    [ENERGY_TYPES.ATTRACT]: "เสน่ห์และการเข้าหา",
    [ENERGY_TYPES.LUCK]: "เปิดทางและเรียกจังหวะดี",
    [ENERGY_TYPES.BOOST]: "เติมแรงและดันจังหวะชีวิต",
  },
};

/** @type {Record<import('./scanCopy.toneLevel.js').ScanToneLevel, typeof MAIN_LABEL_ALT>} */
export const MAIN_LABEL_ALT_BY_TONE = {
  standard: MAIN_LABEL_ALT,
  mystic: {
    [ENERGY_TYPES.PROTECT]: "คุ้มกันและกันรบกวน",
    [ENERGY_TYPES.BALANCE]: "สมดุล พลังนิ่ง",
    [ENERGY_TYPES.POWER]: "อำนาจและคุมจังหวะ",
    [ENERGY_TYPES.KINDNESS]: "เมตตาและเปิดใจ",
    [ENERGY_TYPES.ATTRACT]: "เสน่ห์และดึงดูด",
    [ENERGY_TYPES.LUCK]: "เปิดทางและจังหวะ",
    [ENERGY_TYPES.BOOST]: "เติมแรงและพยุงใจ",
  },
  mystic_sales: {
    [ENERGY_TYPES.PROTECT]: "กันพลังไม่ดี คุ้มใจ",
    [ENERGY_TYPES.BALANCE]: "ประคองใจ ตั้งหลัก",
    [ENERGY_TYPES.POWER]: "ยืนทรง คุมจังหวะ",
    [ENERGY_TYPES.KINDNESS]: "เมตตา คนเอ็นดู",
    [ENERGY_TYPES.ATTRACT]: "เสน่ห์ เข้าหาง่าย",
    [ENERGY_TYPES.LUCK]: "เปิดทาง จังหวะดี",
    [ENERGY_TYPES.BOOST]: "เติมแรง ดันจังหวะ",
  },
};
