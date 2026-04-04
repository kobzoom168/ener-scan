/**
 * Derives structured report wording from parsed scan text + scores.
 * Does not change scan core or scoring — display-layer only.
 */
import { ENERGY_TYPES } from "../flex/scanCopy.config.js";
import { resolveEnergyTypeMetaForFamily } from "../flex/scanCopy.utils.js";
import { composeFlexWordingTeasers } from "../../utils/reports/flexSummaryShortCopy.js";
import {
  inferEnergyCategoryCodeFromMainEnergy,
  normalizeObjectFamilyForEnergyCopy,
  resolveCrystalMode,
} from "../../utils/energyCategoryResolve.util.js";

/**
 * @param {string} text
 * @returns {string}
 */
function firstSentence(text) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const cut = s.split(/(?<=[.!?…])\s+/)[0] || s;
  return cut.length > 180 ? `${cut.slice(0, 177)}…` : cut;
}

/**
 * @param {string} seed
 * @param {string[]} arr
 * @returns {string}
 */
function stablePick(arr, seed) {
  if (!arr?.length) return "";
  let h = 0;
  const x = String(seed || "s");
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

/** @type {Record<string, keyof import("./reportPayload.types.js").ReportWording["energyBreakdown"]>} */
const PILLAR_FOR_TYPE = {
  [ENERGY_TYPES.PROTECT]: "protection",
  [ENERGY_TYPES.BALANCE]: "balance",
  [ENERGY_TYPES.POWER]: "authority",
  [ENERGY_TYPES.KINDNESS]: "metta",
  [ENERGY_TYPES.ATTRACT]: "attraction",
  [ENERGY_TYPES.LUCK]: "attraction",
  [ENERGY_TYPES.BOOST]: "balance",
};

/** One memorable line per canonical energy (Thai). */
const HERO_NAMING_BY_TYPE = {
  [ENERGY_TYPES.PROTECT]: [
    "พลังคุ้มกันสายตั้งหลัก",
    "พลังนิ่งและประคองใจ",
    "พลังหนักแน่นคุมสภาวะ",
  ],
  [ENERGY_TYPES.BALANCE]: [
    "พลังนิ่งและประคองใจ",
    "พลังสมดุลแบบไม่แกว่งง่าย",
    "พลังหนักแน่นรักษาจังหวะภายใน",
  ],
  [ENERGY_TYPES.POWER]: [
    "พลังหนักแน่นคุมสภาวะ",
    "พลังตั้งหลักและมีน้ำหนักตัดสินใจ",
    "พลังบารมีนิ่งที่ยืนของตัวเองได้",
  ],
  [ENERGY_TYPES.KINDNESS]: [
    "พลังอ่อนโยนลดแรงเสียดทาน",
    "พลังเมตตาที่ทำให้บรรยากาศนุ่มลง",
    "พลังอบอุ่นแบบไม่เร่งเกินจริง",
  ],
  [ENERGY_TYPES.ATTRACT]: [
    "พลังดึงสายตาและโอกาสแบบเป็นธรรมชาติ",
    "พลังเสน่ห์ที่ไม่ต้องขูดรีด",
    "พลังเปิดช่องให้ถูกมองเห็นมากขึ้น",
  ],
  [ENERGY_TYPES.LUCK]: [
    "พลังจังหวะและช่องทาง",
    "พลังเปิดโอกาสแบบพอดี ๆ",
    "พลังสนับสนุนเรื่องโชคเชิงจังหวะ",
  ],
  [ENERGY_TYPES.BOOST]: [
    "พลังเสริมแรงใจในทุกวัน",
    "พลังหนุนพลังกายใจแบบต่อเนื่อง",
    "พลังกระตุ้นให้ลุกขึ้นเดินต่อได้",
  ],
};

const CHARACTER_FALLBACK = {
  [ENERGY_TYPES.PROTECT]:
    "พลังของชิ้นนี้จะไปทางคุ้มกันและตั้งหลัก มากกว่าสายเร่งแรงจากภายนอก",
  [ENERGY_TYPES.BALANCE]:
    "พลังของชิ้นนี้เน้นความนิ่งและความสมดุลภายใน ไม่ใช่การเร่งให้ตื่นเต้นทันที",
  [ENERGY_TYPES.POWER]:
    "พลังของชิ้นนี้มีน้ำหนักและความชัดในการยืนของตัวเอง มากกว่าการประคองอย่างเดียว",
  [ENERGY_TYPES.KINDNESS]:
    "พลังของชิ้นนี้ไปทางความอ่อนโยนและลดแรงปะทะในสัมพันธ์ มากกว่าการแข่งหรือกดดัน",
  [ENERGY_TYPES.ATTRACT]:
    "พลังของชิ้นนี้เน้นการถูกมองเห็นและดึงดูดแบบเป็นธรรมชาติ ไม่ใช่แค่ความนิ่งอย่างเดียว",
  [ENERGY_TYPES.LUCK]:
    "พลังของชิ้นนี้ไปทางจังหวะและโอกาส มากกว่าการคุมสภาวะอย่างหนัก",
  [ENERGY_TYPES.BOOST]:
    "พลังของชิ้นนี้หนุนแรงใจและความต่อเนื่องในวัน ๆ ไม่ใช่แค่ช่วงเดียว",
};

const LIFE_FALLBACK = {
  [ENERGY_TYPES.PROTECT]:
    "เหมาะกับช่วงที่ต้องคุมใจ รับแรงกดดัน และตัดสินใจอย่างมั่นคง",
  [ENERGY_TYPES.BALANCE]:
    "เหมาะกับช่วงที่ใจแกว่งง่ายหรืออยากให้โทนในวันนิ่งขึ้นโดยไม่ดิ้นรนเกินเหตุ",
  [ENERGY_TYPES.POWER]:
    "เหมาะกับช่วงที่ต้องยืนข้อเท็จจริงของตัวเอง นำจังหวะ หรือตัดสินใจเรื่องสำคัญ",
  [ENERGY_TYPES.KINDNESS]:
    "เหมาะกับช่วงที่ต้องคุยกับคน ทำงานร่วมกัน หรือลดความตึงในสัมพันธ์",
  [ENERGY_TYPES.ATTRACT]:
    "เหมาะกับช่วงที่อยากให้โอกาสหรือความสนใจเข้ามาแบบเป็นธรรมชาติมากขึ้น",
  [ENERGY_TYPES.LUCK]:
    "เหมาะกับช่วงที่กำลังมองหาจังหวะหรือช่องทางใหม่ ๆ",
  [ENERGY_TYPES.BOOST]:
    "เหมาะกับช่วงที่ต้องการแรงหนุนในแต่ละวันให้ไหลต่อได้",
};

const NOT_BEST_FALLBACK = {
  [ENERGY_TYPES.PROTECT]:
    "ไม่ใช่สายดึงดูดหรือเมตตาที่นำ — ถ้าต้องการโดดเด่นเรื่องเสน่ห์เป็นหลัก อาจไม่ใช่จุดแข็งของชิ้นนี้",
  [ENERGY_TYPES.BALANCE]:
    "ไม่ใช่สายอำนาจกดเกมหรือดึงความสนใจแบบฉับพลันเป็นหลัก",
  [ENERGY_TYPES.POWER]:
    "ไม่ใช่สายอ่อนโยนประคองอย่างเดียว — ถ้าต้องการแต่ความนุ่มนวลโดยไม่ต้องตั้งหลัก อาจไม่ตรงจุดที่สุด",
  [ENERGY_TYPES.KINDNESS]:
    "ไม่ใช่สายคุ้มกันแบบหนักหนาหรืออำนาจกดสนามเป็นหลัก",
  [ENERGY_TYPES.ATTRACT]:
    "ไม่ใช่สายนิ่งกันภายในหรือคุมแรงกดแบบเน้นป้องกันเป็นหลัก",
  [ENERGY_TYPES.LUCK]:
    "ไม่ใช่สายตั้งหลักหนักหรือคุมอารมณ์แบบเน้นเกราะในใจเป็นหลัก",
  [ENERGY_TYPES.BOOST]:
    "ไม่ใช่สายบารมีหนักหรือดึงดูดเด่นเป็นหลัก — เน้นหนุนทั่วไปมากกว่าโชว์จุดเด่นเฉพาะทาง",
};

const PRACTICAL_FALLBACK = {
  [ENERGY_TYPES.PROTECT]: [
    "ช่วยให้ใจไม่แกว่งง่ายเวลาเจอแรงกดดัน",
    "เหมาะกับช่วงที่ต้องตัดสินใจเรื่องสำคัญ",
    "ช่วยประคองสติและแรงใจเมื่ออยู่ในบรรยากาศกดดัน",
  ],
  [ENERGY_TYPES.BALANCE]: [
    "ช่วยให้ตอบสนองช้าลงและนิ่งขึ้นเมื่อใจเริ่มวอกแวก",
    "เหมาะกับช่วงที่ต้องรักษาจังหวะภายในให้เท่ากันทั้งวัน",
    "ช่วยลดการไหลตามอารมณ์รอบตัวโดยไม่ต้องฝืนเกินไป",
  ],
  [ENERGY_TYPES.POWER]: [
    "ช่วยให้ยืนข้อความของตัวเองได้ชัดขึ้นเวลาถูกท้าทาย",
    "เหมาะกับช่วงเจรจาหรือต้องนำทีมให้เห็นทิศ",
    "ช่วยให้ตัดสินใจได้หนักแน่นขึ้นโดยไม่พึ่งคำพูดเกินจริง",
  ],
  [ENERGY_TYPES.KINDNESS]: [
    "ช่วยให้บทสนทนานุ่มลงแม้ประเด็นจะยังอยู่",
    "เหมาะกับช่วงที่ต้องคุมโทนกับคนรอบข้าง",
    "ช่วยลดแรงเสียดทานในที่ทำงานหรือบ้านเล็กน้อย",
  ],
  [ENERGY_TYPES.ATTRACT]: [
    "ช่วยให้ถูกมองหรือเข้าถึงโอกาสได้ง่ายขึ้นในแบบเป็นธรรมชาติ",
    "เหมาะกับช่วงเปิดตัวงานหรืออยากให้คนจำได้มากขึ้น",
    "ช่วยเสริมความโดดเด่นโดยไม่ต้องพยายามเกินจริง",
  ],
  [ENERGY_TYPES.LUCK]: [
    "ช่วยให้จับจังหวะหรือเห็นช่องทางที่เคยมองข้าม",
    "เหมาะกับช่วงลองสิ่งใหม่หรือขยายโอกาส",
    "ช่วยให้รู้สึกว่ามี “ช่อง” ให้เดินต่อแม้ยังไม่ชัดทุกอย่าง",
  ],
  [ENERGY_TYPES.BOOST]: [
    "ช่วยหนุนให้ลุกมาทำในวันนั้นได้จริง",
    "เหมาะกับช่วงที่แรงใจต่ำหรือเหนื่อยสะสม",
    "ช่วยให้รู้สึกมีแรงพอดี ๆ ไม่เร่งจนหมดแรง",
  ],
};

/** Crystal path: stone-forward phrasing (avoid generic “protection” Thai-amulet tone). */
const CRYSTAL_HERO_NAMING_BY_TYPE = {
  [ENERGY_TYPES.PROTECT]: [
    "หินชิ้นนี้เด่นด้านคุ้มครองและกันพลังรบกวน",
    "พลังหินเน้นเกราะกันและตั้งหลักในใจ",
    "โทนหินหนุนให้ไม่รับพลังแย่ ๆ เข้าง่าย",
  ],
  [ENERGY_TYPES.BALANCE]: [
    "พลังหินเน้นสมดุลและโฟกัสนิ่งในใจ",
    "หินชิ้นนี้หนุนให้จังหวะภายในไม่แกว่งง่าย",
    "โทนหินช่วยตั้งหลักเมื่อบรรยากาศรอบตัววุ่น",
  ],
  [ENERGY_TYPES.POWER]: [
    "พลังหินมีน้ำหนักและความชัดในการยืนของตัวเอง",
    "หินชิ้นนี้เสริมบารมีแบบตั้งหลัก ไม่ใช่แค่ประคองอย่างเดียว",
    "โทนหินหนุนให้ตัดสินใจได้หนักแน่นเมื่อถูกท้าทาย",
  ],
  [ENERGY_TYPES.KINDNESS]: [
    "พลังหินอ่อนโยนลดแรงเสียดทานในสัมพันธ์",
    "หินชิ้นนี้ทำให้บรรยากาศนุ่มลงแม้ประเด็นยังอยู่",
    "โทนหินเน้นเมตตาและการเปิดรับมากกว่าการกดดัน",
  ],
  [ENERGY_TYPES.ATTRACT]: [
    "พลังหินดึงสายตาและโอกาสแบบเป็นธรรมชาติ",
    "หินชิ้นนี้เสริมการถูกมองเห็นโดยไม่ต้องขูดรีด",
    "โทนหินเปิดช่องให้คนเข้าหาง่ายขึ้น",
  ],
  [ENERGY_TYPES.LUCK]: [
    "พลังหินไปทางจังหวะและโอกาสแบบพอดี ๆ",
    "หินชิ้นนี้หนุนให้เห็นช่องทางที่เคยมองข้าม",
    "โทนหินช่วยดันจังหวะดีให้เข้ามาไม่ฝืดเกินไป",
  ],
  [ENERGY_TYPES.BOOST]: [
    "พลังหินหนุนแรงใจและความต่อเนื่องในวัน ๆ",
    "หินชิ้นนี้ช่วยให้ลุกมาทำในวันนั้นได้จริง",
    "โทนหินเสริมพลังกายใจแบบไม่เร่งจนหมดแรง",
  ],
};

const CRYSTAL_CHARACTER_FALLBACK = {
  [ENERGY_TYPES.PROTECT]:
    "พลังของหินชิ้นนี้ไปทางเกราะกันพลังรบกวนและตั้งหลักในใจ มากกว่าสายเร่งดึงดูดจากภายนอก",
  [ENERGY_TYPES.BALANCE]:
    "พลังของหินชิ้นนี้เน้นความนิ่งและความสมดุลภายใน ไม่ใช่การเร่งให้ตื่นเต้นทันที",
  [ENERGY_TYPES.POWER]:
    "พลังของหินชิ้นนี้มีน้ำหนักและความชัดในการยืนของตัวเอง มากกว่าการประคองอย่างเดียว",
  [ENERGY_TYPES.KINDNESS]:
    "พลังของหินชิ้นนี้ไปทางความอ่อนโยนและลดแรงปะทะในสัมพันธ์ มากกว่าการแข่งหรือกดดัน",
  [ENERGY_TYPES.ATTRACT]:
    "พลังของหินชิ้นนี้เน้นการถูกมองเห็นและดึงดูดแบบเป็นธรรมชาติ ไม่ใช่แค่ความนิ่งอย่างเดียว",
  [ENERGY_TYPES.LUCK]:
    "พลังของหินชิ้นนี้ไปทางจังหวะและโอกาส มากกว่าการคุมสภาวะอย่างหนัก",
  [ENERGY_TYPES.BOOST]:
    "พลังของหินชิ้นนี้หนุนแรงใจและความต่อเนื่องในวัน ๆ ไม่ใช่แค่ช่วงเดียว",
};

const CRYSTAL_LIFE_FALLBACK = {
  [ENERGY_TYPES.PROTECT]:
    "เหมาะกับช่วงที่ต้องเจอคนเยอะ แรงกดดัน หรืออยากให้โฟกัสนิ่งขึ้นโดยไม่รับพลังแย่ ๆ เข้าตัวง่าย",
  [ENERGY_TYPES.BALANCE]:
    "เหมาะกับช่วงที่ใจแกว่งง่ายหรืออยากให้โทนในวันนิ่งขึ้นโดยไม่ดิ้นรนเกินเหตุ",
  [ENERGY_TYPES.POWER]:
    "เหมาะกับช่วงที่ต้องยืนข้อเท็จจริงของตัวเอง นำจังหวะ หรือตัดสินใจเรื่องสำคัญ",
  [ENERGY_TYPES.KINDNESS]:
    "เหมาะกับช่วงที่ต้องคุยกับคน ทำงานร่วมกัน หรือลดความตึงในสัมพันธ์",
  [ENERGY_TYPES.ATTRACT]:
    "เหมาะกับช่วงที่อยากให้โอกาสหรือความสนใจเข้ามาแบบเป็นธรรมชาติมากขึ้น",
  [ENERGY_TYPES.LUCK]:
    "เหมาะกับช่วงที่กำลังมองหาจังหวะหรือช่องทางใหม่ ๆ",
  [ENERGY_TYPES.BOOST]:
    "เหมาะกับช่วงที่ต้องการแรงหนุนในแต่ละวันให้ไหลต่อได้",
};

const CRYSTAL_NOT_BEST_FALLBACK = {
  [ENERGY_TYPES.PROTECT]:
    "ไม่ใช่สายดึงดูดหรือเมตตาที่นำ — ถ้าต้องการโดดเด่นเรื่องเสน่ห์เป็นหลัก อาจไม่ใช่จุดแข็งของหินชิ้นนี้",
  [ENERGY_TYPES.BALANCE]:
    "ไม่ใช่สายอำนาจกดเกมหรือดึงความสนใจแบบฉับพลันเป็นหลัก",
  [ENERGY_TYPES.POWER]:
    "ไม่ใช่สายอ่อนโยนประคองอย่างเดียว — ถ้าต้องการแต่ความนุ่มนวลโดยไม่ต้องตั้งหลัก อาจไม่ตรงจุดที่สุด",
  [ENERGY_TYPES.KINDNESS]:
    "ไม่ใช่สายคุ้มกันแบบหนักหนาหรืออำนาจกดสนามเป็นหลัก",
  [ENERGY_TYPES.ATTRACT]:
    "ไม่ใช่สายนิ่งกันภายในหรือคุมแรงกดแบบเน้นป้องกันเป็นหลัก",
  [ENERGY_TYPES.LUCK]:
    "ไม่ใช่สายตั้งหลักหนักหรือคุมอารมณ์แบบเน้นเกราะในใจเป็นหลัก",
  [ENERGY_TYPES.BOOST]:
    "ไม่ใช่สายบารมีหนักหรือดึงดูดเด่นเป็นหลัก — เน้นหนุนทั่วไปมากกว่าโชว์จุดเด่นเฉพาะทาง",
};

const CRYSTAL_PRACTICAL_FALLBACK = {
  [ENERGY_TYPES.PROTECT]: [
    "ช่วยให้ใจไม่แกว่งง่ายเวลาเจอแรงกดดันหรือสนามพลังรบกวน",
    "เหมาะกับช่วงที่ต้องตัดสินใจเรื่องสำคัญโดยไม่รับพลังแย่ ๆ เข้าตัวง่าย",
    "ช่วยประคองสติเมื่อบรรยากาศรอบตัววุ่นหรือมีคนเยอะ",
  ],
  [ENERGY_TYPES.BALANCE]: [
    "ช่วยให้ตอบสนองช้าลงและนิ่งขึ้นเมื่อใจเริ่มวอกแวก",
    "เหมาะกับช่วงที่ต้องรักษาจังหวะภายในให้เท่ากันทั้งวัน",
    "ช่วยลดการไหลตามอารมณ์รอบตัวโดยไม่ต้องฝืนเกินไป",
  ],
  [ENERGY_TYPES.POWER]: [
    "ช่วยให้ยืนข้อความของตัวเองได้ชัดขึ้นเวลาถูกท้าทาย",
    "เหมาะกับช่วงเจรจาหรือต้องนำทีมให้เห็นทิศ",
    "ช่วยให้ตัดสินใจได้หนักแน่นขึ้นโดยไม่พึ่งคำพูดเกินจริง",
  ],
  [ENERGY_TYPES.KINDNESS]: [
    "ช่วยให้บทสนทนานุ่มลงแม้ประเด็นจะยังอยู่",
    "เหมาะกับช่วงที่ต้องคุมโทนกับคนรอบข้าง",
    "ช่วยลดแรงเสียดทานในที่ทำงานหรือบ้านเล็กน้อย",
  ],
  [ENERGY_TYPES.ATTRACT]: [
    "ช่วยให้ถูกมองหรือเข้าถึงโอกาสได้ง่ายขึ้นในแบบเป็นธรรมชาติ",
    "เหมาะกับช่วงเปิดตัวงานหรืออยากให้คนจำได้มากขึ้น",
    "ช่วยเสริมความโดดเด่นโดยไม่ต้องพยายามเกินจริง",
  ],
  [ENERGY_TYPES.LUCK]: [
    "ช่วยให้จับจังหวะหรือเห็นช่องทางที่เคยมองข้าม",
    "เหมาะกับช่วงลองสิ่งใหม่หรือขยายโอกาส",
    "ช่วยให้รู้สึกว่ามี “ช่อง” ให้เดินต่อแม้ยังไม่ชัดทุกอย่าง",
  ],
  [ENERGY_TYPES.BOOST]: [
    "ช่วยหนุนให้ลุกมาทำในวันนั้นได้จริง",
    "เหมาะกับช่วงที่แรงใจต่ำหรือเหนื่อยสะสม",
    "ช่วยให้รู้สึกมีแรงพอดี ๆ ไม่เร่งจนหมดแรง",
  ],
};

function wordingFamilyFromType(energyType) {
  const map = {
    [ENERGY_TYPES.PROTECT]: "protection",
    [ENERGY_TYPES.BALANCE]: "shielding",
    [ENERGY_TYPES.POWER]: "authority",
    [ENERGY_TYPES.ATTRACT]: "attraction",
    [ENERGY_TYPES.KINDNESS]: "attraction",
    [ENERGY_TYPES.LUCK]: "attraction",
    [ENERGY_TYPES.BOOST]: "protection",
  };
  return map[energyType] || "protection";
}

/**
 * @param {Record<string, unknown>} parsed — same shape as `parseScanText` output
 * @param {{ energyScore?: number|null, compatibilityPercent?: number|null, seed?: string, objectFamily?: string }} opts
 * @returns {import("./reportPayload.types.js").ReportWording}
 */
export function deriveReportWordingFromParsed(parsed, opts = {}) {
  const seed = String(opts.seed || "wording");
  const energyScore =
    opts.energyScore != null && Number.isFinite(Number(opts.energyScore))
      ? Number(opts.energyScore)
      : null;
  const compatibilityScore =
    opts.compatibilityPercent != null &&
    Number.isFinite(Number(opts.compatibilityPercent))
      ? Math.min(100, Math.max(0, Math.round(Number(opts.compatibilityPercent))))
      : null;

  const mainRaw =
    parsed.mainEnergy && parsed.mainEnergy !== "-"
      ? String(parsed.mainEnergy)
      : "";
  const objectFamilyRaw = String(opts.objectFamily || "").trim();
  const energyType = resolveEnergyTypeMetaForFamily(
    mainRaw,
    objectFamilyRaw,
  ).energyType;
  const mainEnergy = energyType;
  const famNorm = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw);
  const useCrystalWording = famNorm === "crystal";
  const energyCategoryCode = inferEnergyCategoryCodeFromMainEnergy(
    mainRaw,
    objectFamilyRaw,
  );
  const crystalModeResolved = resolveCrystalMode(objectFamilyRaw, mainRaw);

  const overview =
    parsed.overview && parsed.overview !== "-"
      ? String(parsed.overview).trim()
      : "";
  const fitReason =
    parsed.fitReason && parsed.fitReason !== "-"
      ? String(parsed.fitReason).trim()
      : "";

  const energyCharacter = overview
    ? firstSentence(overview)
    : useCrystalWording
      ? CRYSTAL_CHARACTER_FALLBACK[energyType] ||
        CHARACTER_FALLBACK[energyType] ||
        CHARACTER_FALLBACK[ENERGY_TYPES.BOOST]
      : CHARACTER_FALLBACK[energyType] || CHARACTER_FALLBACK[ENERGY_TYPES.BOOST];

  const lifeTranslation = fitReason
    ? firstSentence(fitReason)
    : useCrystalWording
      ? CRYSTAL_LIFE_FALLBACK[energyType] ||
        LIFE_FALLBACK[energyType] ||
        LIFE_FALLBACK[ENERGY_TYPES.BOOST]
      : LIFE_FALLBACK[energyType] || LIFE_FALLBACK[ENERGY_TYPES.BOOST];

  const suitable = Array.isArray(parsed.suitable) ? parsed.suitable : [];
  const suitableClean = suitable
    .map((x) => String(x || "").replace(/^•\s*/, "").trim())
    .filter(Boolean);

  const bestFor =
    suitableClean[0] ||
    (() => {
      const b = useCrystalWording
        ? CRYSTAL_LIFE_FALLBACK[energyType] || LIFE_FALLBACK[energyType]
        : LIFE_FALLBACK[energyType];
      return b ? firstSentence(b) : "";
    })();

  const ns =
    parsed.notStrong && parsed.notStrong !== "-"
      ? String(parsed.notStrong).trim()
      : "";
  const notTheBestFor =
    ns ||
    (useCrystalWording
      ? CRYSTAL_NOT_BEST_FALLBACK[energyType] || NOT_BEST_FALLBACK[energyType]
      : NOT_BEST_FALLBACK[energyType]) ||
    "";

  const support = Array.isArray(parsed.supportTopics) ? parsed.supportTopics : [];
  const strippedSupport = support
    .map((x) => String(x || "").replace(/^•\s*/, "").trim())
    .filter(Boolean);

  const fbPractical = useCrystalWording
    ? CRYSTAL_PRACTICAL_FALLBACK[energyType] || PRACTICAL_FALLBACK[energyType]
    : PRACTICAL_FALLBACK[energyType] || PRACTICAL_FALLBACK[ENERGY_TYPES.BOOST];
  const practicalEffects = [0, 1, 2].map((i) => {
    const fromScan = strippedSupport[i];
    return fromScan && fromScan.length > 8 ? fromScan : fbPractical[i] || fbPractical[0];
  });

  const heroNaming = stablePick(
    useCrystalWording
      ? CRYSTAL_HERO_NAMING_BY_TYPE[energyType] ||
          HERO_NAMING_BY_TYPE[energyType] ||
          HERO_NAMING_BY_TYPE[ENERGY_TYPES.BOOST]
      : HERO_NAMING_BY_TYPE[energyType] || HERO_NAMING_BY_TYPE[ENERGY_TYPES.BOOST],
    `${seed}:hero`,
  );

  const wfKey = wordingFamilyFromType(energyType);
  const crystalModeForFlex =
    crystalModeResolved === null || crystalModeResolved === undefined
      ? ""
      : crystalModeResolved;
  const { flexHeadline, flexBullets } = composeFlexWordingTeasers({
    energyType,
    wordingFamily: wfKey,
    seed,
    objectFamily: objectFamilyRaw,
    energyCategoryCode,
    crystalMode: crystalModeForFlex,
  });

  const htmlOpeningLine = (() => {
    const parts = [
      energyCharacter,
      lifeTranslation,
      bestFor ? `ช่วงที่เข้ากับชิ้นนี้: ${firstSentence(bestFor)}` : "",
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    const joined = parts.join(" ");
    return joined.length > 320 ? `${joined.slice(0, 317)}…` : joined;
  })();

  const pillar = PILLAR_FOR_TYPE[energyType] || "balance";
  const intensity =
    energyScore != null
      ? Math.min(100, Math.max(0, Math.round(energyScore * 10)))
      : 0;
  const energyBreakdown = {
    protection: pillar === "protection" ? intensity : 0,
    balance: pillar === "balance" ? intensity : 0,
    authority: pillar === "authority" ? intensity : 0,
    metta: pillar === "metta" ? intensity : 0,
    attraction: pillar === "attraction" ? intensity : 0,
  };

  return {
    objectLabel: "",
    heroNaming,
    energyCharacter,
    mainEnergy,
    secondaryEnergies: [],
    powerScore: energyScore != null ? energyScore : 0,
    compatibilityScore: compatibilityScore != null ? compatibilityScore : 0,
    energyBreakdown,
    lifeTranslation,
    bestFor,
    notTheBestFor,
    practicalEffects,
    flexHeadline,
    flexBullets: flexBullets.length >= 2 ? flexBullets.slice(0, 2) : flexBullets,
    htmlOpeningLine,
    wordingFamily: wfKey,
    clarityLevel: "l2",
  };
}
