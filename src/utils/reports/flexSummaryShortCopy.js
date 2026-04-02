/**
 * Flex “short” copy: complete Thai phrases only — no char-cut of long prose.
 * Thai has no reliable space word boundaries; truncation strategies belong here as composition, not tail cuts.
 */
import { ENERGY_TYPES } from "../../services/flex/scanCopy.config.js";
import { resolveEnergyType } from "../../services/flex/scanCopy.utils.js";

/** Aligned with {@link ../flexSummarySurface.util.js FLEX_SUMMARY_HEADLINE_MAX} (guardrail only). */
export const FLEX_SHORT_HEADLINE_MAX = 42;
export const FLEX_SHORT_FIT_MAX = 64;
export const FLEX_SHORT_BULLET_MAX = 38;

/**
 * Known tails from production when long strings were hard-truncated (mid-word / mid-phrase).
 * Used to reject legacy stored payloads so we recompose instead of re-truncating.
 */
export const TRUNCATION_ARTIFACT_SUFFIXES = [
  "ต้องการคว",
  "ทำงานห",
  "เสริมควา",
  "ให้เท่าก",
  "การเสริมควา",
  "สำหรับคว",
  "เสริมคว",
  "ความห",
  "เหมาะอย่างยิ่งสำหรับคนที่ต้องการคว",
];

/**
 * @param {string} line
 * @returns {boolean}
 */
export function lineLooksLikeThaiTruncationArtifact(line) {
  const t = String(line || "").trim();
  if (!t) return false;
  return TRUNCATION_ARTIFACT_SUFFIXES.some((suf) => t.endsWith(suf));
}

/**
 * @param {string} seed
 * @param {readonly string[]} arr
 * @returns {string}
 */
export function stablePick(arr, seed) {
  if (!arr?.length) return "";
  let h = 0;
  const x = String(seed || "s");
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

/**
 * @param {string} [wf]
 * @returns {string} one of protection | shielding | authority | attraction | ''
 */
export function normalizeWordingFamilyKey(wf) {
  const s = String(wf || "")
    .trim()
    .toLowerCase();
  const aliases = {
    protection: "protection",
    shielding: "shielding",
    authority: "authority",
    attraction: "attraction",
    premium: "authority",
    authoritative: "authority",
    thai_mystic: "authority",
    mystic_th: "authority",
    conversion: "authority",
    conversion_focus: "authority",
    cta_focus: "authority",
  };
  if (aliases[s]) return aliases[s];
  if (["protection", "shielding", "authority", "attraction"].includes(s)) {
    return s;
  }
  return "";
}

/**
 * @param {string} energyType — ENERGY_TYPES value
 * @returns {import('./flexSummaryShortCopy.js').WordingFamilyKey}
 */
function inferFamilyFromEnergy(energyType) {
  switch (energyType) {
    case ENERGY_TYPES.PROTECT:
      return "protection";
    case ENERGY_TYPES.BALANCE:
      return "shielding";
    case ENERGY_TYPES.POWER:
      return "authority";
    case ENERGY_TYPES.KINDNESS:
    case ENERGY_TYPES.ATTRACT:
    case ENERGY_TYPES.LUCK:
      return "attraction";
    default:
      return "protection";
  }
}

/** @typedef {'protection'|'shielding'|'authority'|'attraction'} WordingFamilyKey */

/**
 * Headlines: each string is a finished phrase, ≤ FLEX_SHORT_HEADLINE_MAX (verified manually).
 * @type {Record<string, Partial<Record<WordingFamilyKey|string, string[]>>>}
 */
const HEADLINE_POOLS = {
  [ENERGY_TYPES.PROTECT]: {
    protection: [
      "เด่นด้านพลังคุ้มครองและความนิ่ง",
      "เหมาะกับคนที่ต้องการความมั่นคง",
      "ช่วยตั้งหลักใจเมื่อแรงกดรอบตัว",
      "พลังประคองที่นิ่งและไม่แกว่งง่าย",
    ],
    shielding: [
      "เน้นคุ้มกันและตั้งหลักไม่ให้เสียศูนย์",
      "เหมาะเมื่อรับแรงกดแต่ยังยืนของตัวเองได้",
      "พลังป้องกันที่นิ่งและหนักแน่น",
      "ช่วยคุมขอบเขตพลังเมื่อรอบตัววุ่นวาย",
    ],
    authority: [
      "เด่นด้านพลังคุ้มครองและความชัดเจน",
      "เหมาะกับช่วงที่ต้องยืนหยัดและตั้งใจ",
      "พลังคุ้มกันที่ไม่นุ่มจนเสียโฟกัส",
      "ช่วยพยุงใจเมื่อต้องตัดสินใจเรื่องสำคัญ",
    ],
    attraction: [
      "เด่นด้านคุ้มกันและความอบอุ่นแบบนุ่ม",
      "เหมาะกับช่วงที่ต้องการความปลอดภัยทางใจ",
      "พลังปกป้องที่ไม่แข็งจนเกินไป",
      "ช่วยให้รู้สึกมั่นคงขึ้นในวันที่เหนื่อย",
    ],
    default: [
      "เด่นด้านพลังคุ้มครองและความนิ่ง",
      "เหมาะกับคนที่ต้องการความมั่นคง",
      "ช่วยตั้งหลักใจเมื่อแรงกดรอบตัว",
      "พลังประคองที่นิ่งและไม่แกว่งง่าย",
    ],
  },
  [ENERGY_TYPES.BALANCE]: {
    protection: [
      "เน้นความสมดุลและความนิ่งภายใน",
      "เหมาะเมื่อใจแกว่งหรือต้องการโฟกัส",
      "ช่วยรักษาจังหวะภายในให้สม่ำเสมอ",
      "พลังพยุงที่ไม่เร่งแต่ตั้งหลักได้",
    ],
    shielding: [
      "เน้นสมดุลและกันแรงรบกวนจากภายนอก",
      "เหมาะกับช่วงที่หลายเรื่องพร้อมกัน",
      "ช่วยให้ใจไม่ไหลตามแรงรอบตัวง่าย",
      "พลังนิ่งที่ช่วยคุมขอบเขตทางใจ",
    ],
    authority: [
      "เด่นด้านสมดุลและการตั้งหลักให้ชัด",
      "เหมาะกับช่วงที่ต้องตัดสินใจอย่างรอบคอบ",
      "พลังสมดุลที่ช่วยให้ยืนของตัวเองได้",
      "ช่วยรักษาจังหวะเมื่อถูกท้าทาย",
    ],
    attraction: [
      "เน้นสมดุลและความอ่อนโยนต่อคนรอบข้าง",
      "เหมาะเมื่ออยากให้บรรยากาศนุ่มและนิ่งขึ้น",
      "พลังสมดุลที่ไม่แข็งและไม่แกว่งเกินไป",
      "ช่วยลดแรงเสียดทานในชีวิตประจำวัน",
    ],
    default: [
      "เน้นความสมดุลและความนิ่งภายใน",
      "เหมาะเมื่อใจแกว่งหรือต้องการโฟกัส",
      "ช่วยรักษาจังหวะภายในให้สม่ำเสมอ",
      "พลังพยุงที่ไม่เร่งแต่ตั้งหลักได้",
    ],
  },
  [ENERGY_TYPES.POWER]: {
    protection: [
      "เด่นด้านอำนาจและการตั้งหลัก",
      "เหมาะกับช่วงที่ต้องตัดสินใจสำคัญ",
      "พลังหนักแน่นคุมจังหวะของตัวเอง",
      "ช่วยยืนข้อความของตัวเองให้ชัดขึ้น",
    ],
    shielding: [
      "เด่นด้านอำนาจและการกันแรงปะทะ",
      "เหมาะเมื่อต้องรับแรงกดแล้วยังนำเกมได้",
      "พลังตั้งมั่นที่ไม่แกว่งตามคนรอบข้าง",
      "ช่วยคุมสถานการณ์ให้อยู่ในจังหวะตัวเอง",
    ],
    authority: [
      "เด่นด้านบารมีและการตั้งหลักที่ชัด",
      "เหมาะกับช่วงเจรจาหรือต้องนำทิศ",
      "พลังอำนาจที่นิ่งและมีน้ำหนัก",
      "ช่วยให้ตัดสินใจได้หนักแน่นโดยไม่เกินจริง",
    ],
    attraction: [
      "เด่นด้านอำนาจนำและความเปิดทางคน",
      "เหมาะกับช่วงโดดเด่นแบบเป็นธรรมชาติ",
      "พลังนำที่ไม่กดคนแต่ชัดในโฟกัส",
      "ช่วยให้ถูกมองเห็นมากขึ้นในจังหวะที่เหมาะ",
    ],
    default: [
      "เด่นด้านอำนาจและการตั้งหลัก",
      "เหมาะกับช่วงที่ต้องตัดสินใจสำคัญ",
      "พลังหนักแน่นคุมจังหวะของตัวเอง",
      "ช่วยยืนข้อความของตัวเองให้ชัดขึ้น",
    ],
  },
  [ENERGY_TYPES.KINDNESS]: {
    default: [
      "เด่นด้านเมตตาและความอ่อนโยน",
      "เหมาะกับช่วงที่ต้องคุยกับคนรอบข้าง",
      "พลังอบอุ่นที่ลดแรงปะทะในสัมพันธ์",
      "ช่วยให้บทสนทนานุ่มลงแม้ประเด็นยังอยู่",
    ],
  },
  [ENERGY_TYPES.ATTRACT]: {
    default: [
      "เด่นด้านแรงดึงดูดและความเป็นมิตร",
      "เหมาะกับช่วงเปิดโอกาสและคนเข้าหา",
      "พลังเสน่ห์ที่ดูเป็นธรรมชาติไม่ฝืน",
      "ช่วยให้ถูกมองหรือเข้าถึงโอกาสได้ง่ายขึ้น",
    ],
  },
  [ENERGY_TYPES.LUCK]: {
    default: [
      "เด่นด้านโชคลาภและจังหวะชีวิต",
      "เหมาะกับช่วงมองหาช่องทางหรือโอกาสใหม่",
      "พลังสนับสนุนเรื่องโชคเชิงจังหวะ",
      "ช่วยให้เห็นช่องที่เคยมองข้ามได้ง่ายขึ้น",
    ],
  },
  [ENERGY_TYPES.BOOST]: {
    default: [
      "หนุนแรงใจและความต่อเนื่องในวัน",
      "เหมาะกับช่วงที่ต้องการแรงเสริม",
      "พลังเสริมที่ไม่เร่งแต่หนุนทุกวัน",
      "ช่วยให้ลุกขึ้นทำในวันนั้นได้จริง",
    ],
  },
};

/**
 * @type {Record<string, Partial<Record<WordingFamilyKey|string, string[]>>>}
 */
const FIT_POOLS = {
  [ENERGY_TYPES.PROTECT]: {
    protection: [
      "เหมาะกับช่วงที่ต้องคุมใจและตัดสินใจอย่างมั่นคง",
      "ช่วยประคองสติเมื่อแรงกดรอบตัวสูงหรือมีหลายเรื่องพร้อมกัน",
    ],
    shielding: [
      "เหมาะกับช่วงที่ต้องรับแรงกดแต่ยังยืนของตัวเองให้มั่น",
      "ช่วยตั้งขอบเขตทางใจเมื่อคนหรืองานกดต่อเนื่อง",
    ],
    authority: [
      "เหมาะกับช่วงที่ต้องนำจังหวะและตัดสินใจเรื่องสำคัญ",
      "ช่วยให้ยืนข้อเท็จจริงของตัวเองได้ชัดขึ้น",
    ],
    attraction: [
      "เหมาะกับช่วงที่ต้องการความปลอดภัยทางใจและความอบอุ่น",
      "ช่วยพยุงความรู้สึกมั่นคงเมื่อรอบตัววุ่นหรือเหนื่อย",
    ],
    default: [
      "เหมาะกับช่วงที่ต้องคุมใจและตัดสินใจอย่างมั่นคง",
      "ช่วยประคองสติเมื่อแรงกดรอบตัวสูงหรือมีหลายเรื่องพร้อมกัน",
    ],
  },
  [ENERGY_TYPES.BALANCE]: {
    default: [
      "เหมาะกับช่วงที่ใจแกว่งง่ายหรืออยากให้โทนในวันนิ่งขึ้น",
      "ช่วยรักษาจังหวะภายในโดยไม่ต้องฝืนหรือเร่งเกินเหตุ",
    ],
  },
  [ENERGY_TYPES.POWER]: {
    default: [
      "เหมาะกับช่วงที่ต้องยืนข้อเท็จจริงและนำจังหวะของตัวเอง",
      "ช่วยให้ตัดสินใจได้หนักแน่นเมื่อมีเรื่องสำคัญต้องคิด",
    ],
  },
  [ENERGY_TYPES.KINDNESS]: {
    default: [
      "เหมาะกับช่วงที่ต้องคุยกับคนหรือลดความตึงในสัมพันธ์",
      "ช่วยให้บรรยากาศการพูดคุยนุ่มลงโดยไม่ต้องยอมเกินจริง",
    ],
  },
  [ENERGY_TYPES.ATTRACT]: {
    default: [
      "เหมาะกับช่วงที่อยากให้โอกาสหรือความสนใจเข้ามาเป็นธรรมชาติ",
      "ช่วยเปิดบรรยากาศให้คนรอบตัวรับพลังของคุณได้ง่ายขึ้น",
    ],
  },
  [ENERGY_TYPES.LUCK]: {
    default: [
      "เหมาะกับช่วงที่กำลังมองหาจังหวะหรือช่องทางใหม่",
      "ช่วยให้จับจังหวะหรือเห็นช่องที่เคยมองข้ามได้ง่ายขึ้น",
    ],
  },
  [ENERGY_TYPES.BOOST]: {
    default: [
      "เหมาะกับช่วงที่ต้องการแรงหนุนในแต่ละวันให้ไหลต่อได้",
      "ช่วยเติมแรงใจโดยไม่ต้องพึ่งการเร่งหรือกดดันตัวเอง",
    ],
  },
};

/**
 * Pairs of complete bullet lines (each ≤ FLEX_SHORT_BULLET_MAX).
 * @type {Record<string, string[][]>}
 */
const BULLET_PAIR_POOLS = {
  [ENERGY_TYPES.PROTECT]: [
    ["ช่วยให้ใจไม่แกว่งเวลาเจอแรงกดดัน", "เหมาะกับช่วงที่ต้องตั้งสติและตัดสินใจ"],
    ["ใช้เมื่อต้องการความมั่นคงทางใจ", "เด่นในช่วงที่แรงกดจากคนหรืองานสูง"],
    ["ช่วยประคองนิ่งเมื่อหลายเรื่องพร้อมกัน", "เหมาะกับวันที่ต้องยืนของตัวเองให้มั่น"],
    ["ช่วยกลับมาอยู่กับตัวเองได้ง่ายขึ้น", "ใช้ดีเมื่อรอบตัววุ่นแต่ต้องการโฟกัส"],
  ],
  [ENERGY_TYPES.BALANCE]: [
    ["ช่วยให้ตอบสนองช้าลงและนิ่งขึ้น", "เหมาะเมื่อใจวอกแวกหรือเรื่องพร้อมกัน"],
    ["ช่วยลดการไหลตามอารมณ์รอบตัว", "เหมาะกับช่วงรักษาจังหวะภายในให้เท่ากัน"],
    ["ช่วยให้โฟกัสกลับมาที่ตัวเอง", "ใช้ดีเมื่ออยากให้วันนิ่งขึ้นโดยไม่ฝืน"],
    ["ช่วยพยุงความสมดุลระหว่างวัน", "เหมาะเมื่อตัดสินใจเล็ก ๆ บ่อย ๆ"],
  ],
  [ENERGY_TYPES.POWER]: [
    ["ช่วยให้ยืนข้อความของตัวเองได้ชัดขึ้น", "เหมาะกับช่วงเจรจาหรือต้องนำทิศ"],
    ["ช่วยให้ตัดสินใจได้หนักแน่นขึ้น", "เหมาะเมื่อคุมสถานการณ์ให้อยู่จังหวะ"],
    ["ช่วยให้มั่นใจในจังหวะของตัวเอง", "เด่นเมื่อต้องเดินหน้าอย่างไม่เสียโฟกัส"],
    ["ช่วยให้เห็นทิศทางชัดในวันที่วุ่น", "เหมาะกับช่วงต้องตัดสินใจเรื่องสำคัญ"],
  ],
  [ENERGY_TYPES.KINDNESS]: [
    ["ช่วยให้บทสนทนานุ่มลงแม้ประเด็นยังอยู่", "เหมาะกับช่วงที่ต้องคุมโทนกับคนรอบข้าง"],
    ["ช่วยลดแรงเสียดทานในที่ทำงานหรือบ้าน", "ใช้ดีเมื่ออยากให้บรรยากาศอ่อนลง"],
    ["ช่วยให้พูดจากใจได้โดยไม่แข็งเกินไป", "เหมาะเมื่อต้องทำงานร่วมกับหลายฝ่าย"],
  ],
  [ENERGY_TYPES.ATTRACT]: [
    ["ช่วยให้ถูกมองหรือเห็นโอกาสได้ง่ายขึ้น", "เหมาะกับช่วงเปิดตัวงานหรือพบคนใหม่"],
    ["ช่วยให้ความโดดเด่นดูเป็นธรรมชาติ", "ใช้ดีเมื่ออยากให้คนจำหรือเอ็นดูมากขึ้น"],
    ["ช่วยเปิดบรรยากาศให้คนเข้าหาง่ายขึ้น", "เหมาะเมื่ออยากให้จังหวะการพบเจอไหลลื่น"],
  ],
  [ENERGY_TYPES.LUCK]: [
    ["ช่วยให้จับจังหวะหรือเห็นช่องทางใหม่", "เหมาะกับช่วงลองสิ่งใหม่หรือขยายโอกาส"],
    ["ช่วยให้รู้สึกว่ามีช่องให้เดินต่อ", "ใช้ดีเมื่อกำลังมองหาโอกาสหรือทางเลือก"],
    ["ช่วยให้เห็นโอกาสที่เคยมองข้าม", "เหมาะกับช่วงที่ต้องการจังหวะดีขึ้น"],
  ],
  [ENERGY_TYPES.BOOST]: [
    ["ช่วยหนุนให้ลุกมาทำในวันนั้นได้จริง", "เหมาะกับช่วงที่แรงใจต่ำหรือเหนื่อยสะสม"],
    ["ช่วยให้รู้สึกมีแรงพอดีไม่เร่งจนหมดแรง", "ใช้ดีเมื่อต้องการแรงเสริมในแต่ละวัน"],
    ["ช่วยเติมแรงใจแบบต่อเนื่อง", "เหมาะกับช่วงที่อยากให้วันไหลต่อได้จริง"],
  ],
};

function headlinePool(energyType, familyKey) {
  const byE = HEADLINE_POOLS[energyType] || HEADLINE_POOLS[ENERGY_TYPES.BOOST];
  const fk = familyKey && byE[familyKey] ? familyKey : null;
  const pool = (fk && byE[fk]) || byE.default || [];
  return pool.length ? pool : HEADLINE_POOLS[ENERGY_TYPES.BOOST].default;
}

function fitPool(energyType, familyKey) {
  const byE = FIT_POOLS[energyType] || FIT_POOLS[ENERGY_TYPES.BOOST];
  const fk = familyKey && byE[familyKey] ? familyKey : null;
  const pool = (fk && byE[fk]) || byE.default || FIT_POOLS[ENERGY_TYPES.BOOST].default;
  return pool.length ? pool : FIT_POOLS[ENERGY_TYPES.BOOST].default;
}

function bulletPairs(energyType) {
  return BULLET_PAIR_POOLS[energyType] || BULLET_PAIR_POOLS[ENERGY_TYPES.BOOST];
}

/**
 * @param {object} p
 * @param {string} [p.mainEnergyLabel]
 * @param {string} [p.wordingFamily]
 * @param {string} [p.seed]
 * @returns {{ headlineShort: string, fitReasonShort: string, bulletsShort: string[] }}
 */
export function composeFlexShortSurface({
  mainEnergyLabel,
  wordingFamily,
  seed = "flex",
}) {
  const energyType = resolveEnergyType(mainEnergyLabel);
  const fam =
    normalizeWordingFamilyKey(wordingFamily) || inferFamilyFromEnergy(energyType);

  const headlineShort = stablePick(headlinePool(energyType, fam), `${seed}:headline`);
  const fitReasonShort = stablePick(fitPool(energyType, fam), `${seed}:fit`);
  const pairs = bulletPairs(energyType);
  const pair = stablePick(pairs, `${seed}:bullets`);
  const bulletsShort = [pair[0], pair[1]].filter(Boolean);

  return {
    headlineShort,
    fitReasonShort,
    bulletsShort,
  };
}

/**
 * Wording-layer teasers (same composition rules as Flex surface; HTML full report unchanged).
 * @param {object} p
 * @param {string} p.energyType — ENERGY_TYPES
 * @param {string} [p.wordingFamily]
 * @param {string} p.seed
 * @returns {{ flexHeadline: string, flexBullets: string[] }}
 */
export function composeFlexWordingTeasers({ energyType, wordingFamily, seed }) {
  const fam =
    normalizeWordingFamilyKey(wordingFamily) || inferFamilyFromEnergy(energyType);
  const flexHeadline = stablePick(headlinePool(energyType, fam), `${seed}:wHeadline`);
  const pair = stablePick(bulletPairs(energyType), `${seed}:wBullets`);
  return {
    flexHeadline,
    flexBullets: [pair[0], pair[1]].filter(Boolean),
  };
}

/**
 * @param {object} s
 * @param {string} [s.headlineShort]
 * @param {string} [s.fitReasonShort]
 * @param {string[]} [s.bulletsShort]
 * @returns {boolean} true if safe to use stored summary fields as-is
 */
export function storedFlexSummaryLooksComplete(s) {
  const h = String(s?.headlineShort || "").trim();
  const f = String(s?.fitReasonShort || "").trim();
  const bullets = Array.isArray(s?.bulletsShort)
    ? s.bulletsShort.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (!h || bullets.length < 1) return false;
  if (h.length > FLEX_SHORT_HEADLINE_MAX + 2) return false;
  if (f.length > FLEX_SHORT_FIT_MAX + 2) return false;
  if (bullets.some((b) => b.length > FLEX_SHORT_BULLET_MAX + 2)) return false;
  const all = [h, f, ...bullets].filter(Boolean);
  for (const line of all) {
    if (lineLooksLikeThaiTruncationArtifact(line)) return false;
  }
  return true;
}
