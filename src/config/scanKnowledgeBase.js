/**
 * Thai reference knowledge for deep scan, keyed by object category from {@link classifyObjectCategory}.
 * Unknown / unmatched category → empty string (caller may omit block).
 *
 * energyName / secondaryEnergyName in JSON output must be chosen ONLY from
 * {@link DEEP_SCAN_ALLOWED_ENERGY_NAMES}.
 */

/** Canonical allowed energy labels for deep-scan JSON (order fixed for prompts). */
export const DEEP_SCAN_ALLOWED_ENERGY_NAMES = [
  "พลังคุ้มครอง",
  "พลังบารมี",
  "พลังโชคลาภ",
  "พลังดูดเงิน",
  "พลังเปิดทาง",
  "พลังการงาน",
  "พลังวาสนา",
  "พลังเสน่หา",
  "พลังเมตตา",
  "พลังมหานิยม",
  "พลังสมดุล",
  "พลังใจนิ่ง",
  "พลังปัญญา",
];

/** When secondaryEnergyName is missing, map dimension row → allowed label. */
export const SCAN_DIMENSION_TO_FALLBACK_ENERGY = {
  คุ้มกัน: "พลังคุ้มครอง",
  สมดุล: "พลังสมดุล",
  อำนาจ: "พลังบารมี",
  เมตตา: "พลังเมตตา",
  ดึงดูด: "พลังเสน่หา",
};

/** @type {Record<string, string>} */
const KNOWLEDGE_BY_CATEGORY = {
  พระเครื่อง: `
- พระนั่งสมาธิ / โทนสงบ = พลังใจนิ่ง พลังสมดุล — เหมาะคนต้องการความนิ่ง
- พระยืน ปางประทาน = พลังเมตตา พลังเปิดทาง — เหมาะคนทำงานกับคน
- พระยอดนิยม / หลวงปู่รุ่นดัง = พลังคุ้มครอง พลังบารมี — เหมาะคนเผชิญอุปสรรค
- พระปิดตา กันภัย = พลังคุ้มครอง พลังวาสนา — เซฟตัว เหมาะคนเดินทาง
- พระเสริมโชค ค้าขาย = พลังโชคลาภ พลังดูดเงิน พลังการงาน
- ผงใบลาน / นักษัตร = พลังวาสนา พลังเปิดทาง — เสริมจังหวะชีวิตโดยทั่วไป
`.trim(),

  "คริสตัล/หิน": `
- คริสตัลใส / ขาว = พลังสมดุล พลังปัญญา — ความชัดเจน สมาธิ
- โรสควอตซ์ ชมพู = พลังเมตตา พลังเสน่หา — อบอุ่น เยียวยา
- อเมทิสต์ ม่วง = พลังปัญญา พลังใจนิ่ง — ตัดสินใจ ลดวน
- ไทเกอร์อาย = พลังบารมี พลังคุ้มครอง — กล้าตัดสินใจ
- ชุดหินหลายแบบ = พลังสมดุล พลังวาสนา — ครบหลายแง่
- ลาบราโดไรต์ / ฟ้าเขียว = พลังคุ้มครอง พลังสมดุล — ลดรับพลังแย่รอบตัว
- ทัวร์มาลีนดำ = พลังใจนิ่ง พลังสมดุล — ตั้งราก ลดคิดวน
`.trim(),

  เครื่องรางของขลัง: `
- ตะกรุด = พลังคุ้มครอง พลังเปิดทาง
- เสือ / สิงห์ = พลังบารมี พลังมหานิยม
- นางกวัก = พลังโชคลาภ พลังดูดเงิน
- ปลัดขิก = พลังโชคลาภ พลังวาสนา
- เบี้ยแก้ = พลังคุ้มครอง พลังสมดุล — สะท้อนสิ่งไม่ดี
- ผ้ายันต์ คู่กาย = พลังคุ้มครอง พลังเปิดทาง — เดินทาง
`.trim(),

  พระบูชา: `
- ปางมาร = พลังบารมี พลังปัญญา — ชนะอุปสรรค
- ปางสมาธิ = พลังใจนิ่ง พลังสมดุล — นิ่งกลางวิกฤต
- ปางประทาน = พลังเมตตา พลังเปิดทาง — ดูแลคนรอบตัว
- เจ้าแม่กวนอิม = พลังเมตตา พลังคุ้มครอง — ประคองใจ
- หน้าบูชาสายธรรม = พลังสมดุล พลังปัญญา — ยึดศีลธรรม
`.trim(),

  อื่นๆ: `
- วัตถุมงคลหลากแบบ = อ่านจากฟอร์ม วัสดุ และแสงในภาพ — เลือก พลังคุ้มครอง พลังสมดุล พลังโชคลาภ พลังเปิดทาง ฯลฯ ให้ตรงสัญญาณ
- ของใช้ที่ผ่านพิธี = พลังวาสนา พลังเมตตา — โยงเจตนาผู้ปลุกเสก ตอบกลาง ๆ
- เครื่องประดับสายพลัง = พลังสมดุล พลังเสน่หา — สวยและมีความหมาย
`.trim(),
};

/** Canonical category labels (must match classifier output). */
export const SCAN_OBJECT_CATEGORY_KEYS = [
  "พระเครื่อง",
  "คริสตัล/หิน",
  "เครื่องรางของขลัง",
  "พระบูชา",
  "อื่นๆ",
];

/**
 * @param {string} category — raw label from classifier
 * @returns {string} multi-line Thai knowledge or ""
 */
export function getKnowledgeForCategory(category) {
  const raw = String(category || "").trim();
  if (!raw) return "";

  if (KNOWLEDGE_BY_CATEGORY[raw]) {
    return KNOWLEDGE_BY_CATEGORY[raw];
  }

  for (const key of Object.keys(KNOWLEDGE_BY_CATEGORY)) {
    if (raw.includes(key) || key.includes(raw)) {
      return KNOWLEDGE_BY_CATEGORY[key];
    }
  }

  return "";
}
