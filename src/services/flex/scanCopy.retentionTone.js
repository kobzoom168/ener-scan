/**
 * Rule-based retention microcopy by tone preset (no LLM).
 * Picks are deterministic from (tone + energy key + score tier + compat bucket).
 */
import { ENERGY_TYPES, SCORE_TIERS } from "./scanCopy.config.js";
import { cleanLine, safeThaiCut } from "./flex.utils.js";

const MAX_NICK = 26;
const MAX_HOOK = 72;

/** @typedef {'high'|'mid'|'low'} CompatBucket */

/**
 * @param {string|undefined|null} compatibility
 * @returns {CompatBucket}
 */
export function compatibilityToBucket(compatibility) {
  const raw = String(compatibility ?? "").replace(/%/g, "").trim();
  const n = Number.parseInt(raw.replace(/\D/g, ""), 10);
  if (!Number.isFinite(n)) return "mid";
  if (n >= 70) return "high";
  if (n >= 40) return "mid";
  return "low";
}

function pickDeterministic(options, key) {
  const arr = Array.isArray(options) ? options.filter(Boolean) : [];
  if (arr.length === 0) return "";
  let h = 0;
  const k = String(key || "");
  for (let i = 0; i < k.length; i += 1) {
    h = (h * 31 + k.charCodeAt(i)) % 2147483647;
  }
  return arr[Math.abs(h) % arr.length];
}

function cap(s, max) {
  const t = cleanLine(s);
  if (!t) return "";
  if (t.length <= max) return t;
  return safeThaiCut(t, max);
}

/**
 * @param {string} energyType
 * @param {string} tier
 * @param {CompatBucket} compat
 */
function keyParts(energyType, tier, compat) {
  return `${energyType}|${tier}|${compat}`;
}

const NICK = {
  youthful: {
    [ENERGY_TYPES.PROTECT]: {
      [SCORE_TIERS.HIGH]: ["เอาอยู่เงียบ ๆ", "คุมฟีลได้", "ไม่สั่นง่าย"],
      [SCORE_TIERS.MEDIUM]: ["นิ่งแต่มีของ", "พกแล้วนิ่ง", "มั่นใจขึ้นนิด"],
      [SCORE_TIERS.LOW]: ["อุ่นใจขึ้น", "ใจไม่วอก", "เบาลงหน่อย"],
    },
    [ENERGY_TYPES.POWER]: {
      [SCORE_TIERS.HIGH]: ["มั่นใจเต็มที่", "พูดแล้วจึ้ง", "ไม่แผ่ว"],
      [SCORE_TIERS.MEDIUM]: ["ใจมาพอดี", "พูดชัดขึ้น", "ยืนหยัดขึ้น"],
      [SCORE_TIERS.LOW]: ["กล้าขึ้นนิด", "ไม่เก้อ", "เก็บท่าได้"],
    },
    [ENERGY_TYPES.BALANCE]: {
      [SCORE_TIERS.HIGH]: ["อยู่กับตอนนี้", "ไม่หลุดโฟกัส", "นิ่งในใจ"],
      [SCORE_TIERS.MEDIUM]: ["วุ่นน้อยลง", "คิดชัดขึ้น", "หายใจแล้วนิ่ง"],
      [SCORE_TIERS.LOW]: ["เบาลง", "ไม่ร้อนรน", "นุ่มขึ้นนิด"],
    },
    [ENERGY_TYPES.KINDNESS]: {
      [SCORE_TIERS.HIGH]: ["พูดนุ่มขึ้น", "เข้าถึงง่าย", "โทนอบอุ่น"],
      [SCORE_TIERS.MEDIUM]: ["น้ำเสียงนุ่ม", "คุยแล้วลื่น", "ใจอ่อนลง"],
      [SCORE_TIERS.LOW]: ["นุ่มขึ้น", "ไม่แข็ง", "อุ่นขึ้น"],
    },
    [ENERGY_TYPES.ATTRACT]: {
      [SCORE_TIERS.HIGH]: ["โดดเด่นเอง", "กล้าโชว์ตัว", "สายตาติด"],
      [SCORE_TIERS.MEDIUM]: ["คนมองต่างไป", "กล้าออกมา", "มีเสน่ห์ขึ้น"],
      [SCORE_TIERS.LOW]: ["เจอคนมั่นใจ", "ไม่หดตัว", "เปิดกว้างขึ้น"],
    },
    [ENERGY_TYPES.LUCK]: {
      [SCORE_TIERS.HIGH]: ["จับจังหวะได้", "โอกาสชัดขึ้น", "เล่นเกมเป็น"],
      [SCORE_TIERS.MEDIUM]: ["จังหวะมาเนียน ๆ", "ลุ้นมีแผน", "วันนั้นดีขึ้น"],
      [SCORE_TIERS.LOW]: ["พลาดแล้วไม่ติด", "ปล่อยวางขึ้น", "ไม่จม"],
    },
    [ENERGY_TYPES.BOOST]: {
      [SCORE_TIERS.HIGH]: ["แรงในใจขึ้น", "พกแล้วมีแรง", "สู้ต่อได้"],
      [SCORE_TIERS.MEDIUM]: ["ไม่หมดเร็ว", "ยืนหยัดขึ้น", "พกแล้วไหว"],
      [SCORE_TIERS.LOW]: ["เติมแรงนิด", "ไฟยังติด", "อุ่นใจขึ้น"],
    },
  },
  warm: {
    [ENERGY_TYPES.PROTECT]: {
      [SCORE_TIERS.HIGH]: ["พกแล้วอุ่นใจ", "ประคองใจได้", "มั่นคงในใจ"],
      [SCORE_TIERS.MEDIUM]: ["หนุนวันหนัก", "พกแล้วนิ่ง", "ใจสบายขึ้น"],
      [SCORE_TIERS.LOW]: ["เบาลง", "ไม่สั่นง่าย", "อุ่นขึ้น"],
    },
    [ENERGY_TYPES.POWER]: {
      [SCORE_TIERS.HIGH]: ["พูดน่าเชื่อถือ", "ตัดสินใจแน่", "ยืนหยัดได้"],
      [SCORE_TIERS.MEDIUM]: ["พูดชัดตรง", "หนุนเวลานำ", "จังหวะมั่นใจ"],
      [SCORE_TIERS.LOW]: ["กล้าพอดี", "ไม่หนี", "มั่นใจขึ้น"],
    },
    [ENERGY_TYPES.BALANCE]: {
      [SCORE_TIERS.HIGH]: ["อยู่กับตอนนี้ได้", "ใจไม่วอก", "คิดชัดขึ้น"],
      [SCORE_TIERS.MEDIUM]: ["วุ่นในใจน้อยลง", "เหมาะงานยาว", "นิ่งในวันหนัก"],
      [SCORE_TIERS.LOW]: ["เย็นลงนิด", "ไม่ร้อนรน", "พอดีไม่ฝืน"],
    },
    [ENERGY_TYPES.KINDNESS]: {
      [SCORE_TIERS.HIGH]: ["อ่อนโยนเข้าถึงง่าย", "อบอุ่นขึ้น", "พูดฟังสบาย"],
      [SCORE_TIERS.MEDIUM]: ["คุยกับคนใกล้ชิดดี", "เยียวยาความสัมพันธ์", "น้ำเสียงนุ่ม"],
      [SCORE_TIERS.LOW]: ["นุ่มขึ้น", "ไม่แข็ง", "วันวุ่นโอเคขึ้น"],
    },
    [ENERGY_TYPES.ATTRACT]: {
      [SCORE_TIERS.HIGH]: ["โดดเด่นมุมที่ใช่", "กล้าโชว์ตัว", "ดึงดูดธรรมชาติ"],
      [SCORE_TIERS.MEDIUM]: ["คนเข้าถึงง่าย", "อยู่กับคนแล้วไหล", "เสน่ห์ขึ้น"],
      [SCORE_TIERS.LOW]: ["ไม่หดตัว", "เปิดกว้างขึ้น", "เจอคนมั่นใจ"],
    },
    [ENERGY_TYPES.LUCK]: {
      [SCORE_TIERS.HIGH]: ["จับจังหวะได้", "โอกาสชัดขึ้น", "เลือกจังหวะเป็น"],
      [SCORE_TIERS.MEDIUM]: ["จังหวะพอดี", "ลุ้นมีแผน", "ไม่พลาดง่าย"],
      [SCORE_TIERS.LOW]: ["พลาดแล้วไปต่อได้", "ไม่ยึดติด", "ใจเบาลง"],
    },
    [ENERGY_TYPES.BOOST]: {
      [SCORE_TIERS.HIGH]: ["เติมกำลังใจ", "พกแล้วมีแรง", "หนุนวันหนัก"],
      [SCORE_TIERS.MEDIUM]: ["ไม่หมดเร็ว", "ยืนหยัดขึ้น", "พกประจำได้"],
      [SCORE_TIERS.LOW]: ["เติมแรงนิด", "อุ่นใจขึ้น", "ไฟยังติด"],
    },
  },
  mystic: {
    [ENERGY_TYPES.PROTECT]: {
      [SCORE_TIERS.HIGH]: ["เกราะนิ่งในใจ", "พลังคุ้มใจ", "นิ่งลึก"],
      [SCORE_TIERS.MEDIUM]: ["ขลังเงียบพอดี", "พกแล้วนิ่ง", "คุ้มเวลาโดนกด"],
      [SCORE_TIERS.LOW]: ["ประคองนุ่ม", "ไม่สั่น", "นิ่งในวันหนัก"],
    },
    [ENERGY_TYPES.POWER]: {
      [SCORE_TIERS.HIGH]: ["อำนาจในใจเนียน", "พูดมีน้ำหนัก", "ตัดสินใจแน่"],
      [SCORE_TIERS.MEDIUM]: ["มั่นใจจังหวะสำคัญ", "คำสั่งมีเม็ด", "ทรงพลังนิ่ง"],
      [SCORE_TIERS.LOW]: ["มั่นใจนุ่ม ๆ", "ไม่เก้อ", "มั่นคงขึ้น"],
    },
    [ENERGY_TYPES.BALANCE]: {
      [SCORE_TIERS.HIGH]: ["นิ่งลึกในใจ", "อยู่กับตอนนี้จริง", "ไม่หลงอารมณ์"],
      [SCORE_TIERS.MEDIUM]: ["สมดุลในใจ", "คิดชัด", "วุ่นน้อยลง"],
      [SCORE_TIERS.LOW]: ["เบาลงพอดี", "ไม่ร้อนรน", "นิ่งวันหนัก"],
    },
    [ENERGY_TYPES.KINDNESS]: {
      [SCORE_TIERS.HIGH]: ["เมตตาเนียน ๆ", "อ่อนโยนแต่ชัด", "อบอุ่นเงียบ ๆ"],
      [SCORE_TIERS.MEDIUM]: ["เข้าถึงง่ายขึ้น", "น้ำเสียงนุ่ม", "สายใยนุ่ม"],
      [SCORE_TIERS.LOW]: ["นุ่มขึ้น", "ไม่แข็ง", "วันวุ่นเบาลง"],
    },
    [ENERGY_TYPES.ATTRACT]: {
      [SCORE_TIERS.HIGH]: ["เสน่ห์เงียบแต่ชัด", "โดดเด่นมุมที่ใช่", "ดึงดูดลึก"],
      [SCORE_TIERS.MEDIUM]: ["คนเข้าถึงง่าย", "อยู่กับคนไหล", "เสน่ห์เงียบ ๆ"],
      [SCORE_TIERS.LOW]: ["ไม่หดตัว", "เปิดกว้างขึ้น", "เจอคนมั่นใจ"],
    },
    [ENERGY_TYPES.LUCK]: {
      [SCORE_TIERS.HIGH]: ["จับจังหวะลึก", "โอกาสชัด", "เลือกจังหวะเนียน"],
      [SCORE_TIERS.MEDIUM]: ["จังหวะพอดี", "ลุ้นมีแผน", "ไม่พลาดง่าย"],
      [SCORE_TIERS.LOW]: ["พลาดแล้วไปต่อ", "ไม่ยึดติด", "ใจเบาเมื่อพลาด"],
    },
    [ENERGY_TYPES.BOOST]: {
      [SCORE_TIERS.HIGH]: ["พลังคุ้มใจ", "แรงในใจ", "พกแล้วมีแรง"],
      [SCORE_TIERS.MEDIUM]: ["หนุนวันหนัก", "ไม่หมดเร็ว", "ยืนหยัดขึ้น"],
      [SCORE_TIERS.LOW]: ["เติมแรงนิด", "อุ่นใจขึ้น", "ไฟยังติด"],
    },
  },
};

const HOOK = {
  youthful: {
    high: [
      "โทนนี้นิ่งและตั้งหลักพอดี — ยังมีมุมที่ว่างอยู่",
      "จังหวะยังเปิดอยู่ — อีกด้านอาจเล่นคนละฟีล",
    ],
    mid: [
      "พกบ่อยชิ้นนี้ — โทนก็ยังเปิดอยู่นิด ๆ",
      "ยังรู้สึกว่ามีมุมที่ไม่ได้จับ",
    ],
    low: [
      "บางทียังมีมุมที่อ่อนกว่านี้",
      "ยังไม่โดนใจ — ฟีลยังลอยอยู่เล็กน้อย",
    ],
  },
  warm: {
    high: [
      "พกบ่อยชิ้นนี้ — โทนนิ่งและอุ่นในใจ",
      "พลังเงียบแต่ลึก — ยังมีช่องให้มุมอื่น",
    ],
    mid: [
      "มีมุมที่ยังไม่ได้ถูกลงลึก",
      "โทนอาจไปต่อได้อีกด้าน",
    ],
    low: [
      "ยังไม่โดนจุดที่อยากได้ — โทนยังนุ่มอยู่",
      "ยังรู้สึกว่ามีช่องว่างเล็กน้อย",
    ],
  },
  mystic: {
    high: [
      "ชิ้นนี้คุ้มใจ — ทางลึกยังไม่ปิด",
      "พลังเงียบแต่ลึก — ยังมีชั้นที่ไม่ได้เอ่ย",
    ],
    mid: [
      "สัมผัสต่อไปอาจเล่นคนละชั้น",
      "พกประจำชิ้นนี้ — แสงยังว่างให้มุมอื่น",
    ],
    low: [
      "ยังไม่ใช่ชิ้นที่สุด — ความลึกยังว่าง",
      "มุมอื่นยังพร่า — ยังไม่จบ",
    ],
  },
};

const CTA = {
  youthful: {
    label: "ต่างกันไหม",
    text: "ขอสแกนชิ้นถัดไป",
  },
  warm: {
    label: "ดูความต่าง",
    text: "ลองสแกนอีกชิ้น",
  },
  mystic: {
    label: "ลึกกว่าไหม",
    text: "ขอสแกนชิ้นถัดไป",
  },
};

function nickTable(tone) {
  return NICK[tone] || NICK.warm;
}

/**
 * @param {{
 *   tonePreset: 'youthful'|'warm'|'mystic',
 *   energyType: string,
 *   tier: string,
 *   compatBucket: CompatBucket,
 * }} p
 */
export function getRetentionMicrocopy({
  tonePreset,
  energyType,
  tier,
  compatBucket,
}) {
  const tone = tonePreset === "youthful" || tonePreset === "mystic" ? tonePreset : "warm";
  const et = energyType && nickTable(tone)[energyType] ? energyType : ENERGY_TYPES.BOOST;
  const tr =
    tier === SCORE_TIERS.HIGH || tier === SCORE_TIERS.LOW
      ? tier
      : SCORE_TIERS.MEDIUM;
  const cb =
    compatBucket === "high" || compatBucket === "low" ? compatBucket : "mid";

  const nickOpts = nickTable(tone)[et]?.[tr] || nickTable(tone)[ENERGY_TYPES.BOOST][tr];
  const nick = cap(
    pickDeterministic(nickOpts, keyParts(et, tr, cb)),
    MAX_NICK,
  );

  const hookOpts = HOOK[tone]?.[cb] || HOOK.warm[cb];
  const hook = cap(
    pickDeterministic(hookOpts, keyParts(et, tr, cb)),
    MAX_HOOK,
  );

  const cta = CTA[tone] || CTA.warm;

  return {
    energyNickname: nick,
    retentionHook: hook,
    nextScanCta: { label: cta.label, text: cta.text },
  };
}
