/**
 * Ener Scan — all template copy in one place.
 * Edit wording here; generator only resolves type/tier and assembles output.
 * Tone: `docs/ENER_SYSTEM_TONE_GUIDE.md`
 */

/**
 * Bump when `ENERGY_COPY`, `MAIN_LABEL`, scan tone bundles, trait rules, or age-tone retention copy meaningfully change.
 * Independent from `SCAN_CACHE_PROMPT_VERSION` (deep-scan LLM prompt).
 */
export const SCAN_COPY_CONFIG_VERSION = "6";

/** Canonical energy keys (Thai strings — match `resolveEnergyType` output). */
export const ENERGY_TYPES = {
  PROTECT: "ปกป้อง",
  BALANCE: "สมดุล",
  POWER: "อำนาจ",
  KINDNESS: "เมตตา",
  ATTRACT: "ดึงดูด",
  LUCK: "โชคลาภ",
  BOOST: "เสริมพลัง",
};

export const SCORE_TIERS = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

/** Short plain headline under score (small box). */
export const MAIN_LABEL = {
  [ENERGY_TYPES.PROTECT]: "ปกป้องและมั่นคง",
  [ENERGY_TYPES.BALANCE]: "สมดุลและจังหวะในใจ",
  [ENERGY_TYPES.POWER]: "มั่นใจและตัดสินใจชัด",
  [ENERGY_TYPES.KINDNESS]: "อ่อนโยนกับคนรอบข้าง",
  [ENERGY_TYPES.ATTRACT]: "น่าเข้าหาและโดดเด่น",
  [ENERGY_TYPES.LUCK]: "โอกาสและจังหวะ",
  [ENERGY_TYPES.BOOST]: "กำลังใจในทุกวัน",
};

/** Shorter label for LINE altText / notifications. */
export const MAIN_LABEL_ALT = {
  [ENERGY_TYPES.PROTECT]: "ปกป้องและมั่นคง",
  [ENERGY_TYPES.BALANCE]: "สมดุลและจังหวะ",
  [ENERGY_TYPES.POWER]: "มั่นใจและตัดสินใจ",
  [ENERGY_TYPES.KINDNESS]: "อ่อนโยนกับคน",
  [ENERGY_TYPES.ATTRACT]: "น่าเข้าหาและโดดเด่น",
  [ENERGY_TYPES.LUCK]: "โอกาสและจังหวะ",
  [ENERGY_TYPES.BOOST]: "กำลังใจทุกวัน",
};

/**
 * Per energy: `summary[tier]` = [line1, line2] for main metric card — category + short gloss only.
 * `traits`: feel (sensation) / useCase (middle slot: received signal, not situations) / effect (shift).
 */
export const ENERGY_COPY = {
  [ENERGY_TYPES.PROTECT]: {
    summary: {
      high: [
        "แนวปกป้องและมั่นคง",
        "โทนนิ่งและตั้งหลักในใจ",
      ],
      medium: [
        "แนวรับแรงและความปลอดภัยในใจ",
        "ใจสบายขึ้นแบบพอดี ๆ",
      ],
      low: [
        "เสริมความมั่นใจแบบนุ่ม",
        "ใจเบาโดยไม่อึดอัด",
      ],
    },
    traits: {
      feel: {
        high: "ใจนิ่งและมั่นใจขึ้น",
        medium: "ใจนิ่งขึ้น",
        low: "ใจเบาลงเล็กน้อย",
      },
      useCase: {
        high: "รู้สึกหลักแน่นในใจมากขึ้น",
        medium: "รู้สึกมีที่พิงในใจมากขึ้น",
        low: "โล่งและอุ่นในใจขึ้นเล็กน้อย",
      },
      effect: {
        high: "เลือกได้หนักแน่น ไม่สั่นไหวง่าย",
        medium: "รู้สึกมั่นคงพอลงมือจริง",
        low: "ใจเบาและโล่งขึ้น",
      },
    },
  },

  [ENERGY_TYPES.BALANCE]: {
    summary: {
      high: [
        "แนวสมดุลในใจ",
        "โทนอยู่กับตอนนี้ได้มั่นขึ้น",
      ],
      medium: [
        "แนวคลายวุ่นในใจ",
        "โทนนิ่งกับปัจจุบันมากขึ้น",
      ],
      low: [
        "แนวนุ่มลงเล็กน้อย",
        "โทนไม่ร้อนรนเกินไป",
      ],
    },
    traits: {
      feel: {
        high: "ใจสงบและชัดขึ้น",
        medium: "ใจไม่วอกแวกง่าย",
        low: "ใจเย็นลงเล็กน้อย",
      },
      useCase: {
        high: "รู้สึกตั้งหลักกับลมหายใจได้ดีขึ้น",
        medium: "รู้สึกนิ่งและต่อเนื่องขึ้น",
        low: "รู้สึกเบาและนุ่มขึ้นในใจ",
      },
      effect: {
        high: "เห็นทางเลือกชัด ไม่หลงกับอารมณ์",
        medium: "อยู่กับปัจจุบันได้นานขึ้น",
        low: "ใจไม่ร้อนรนจนเกินเหตุ",
      },
    },
  },

  [ENERGY_TYPES.POWER]: {
    summary: {
      high: [
        "แนวอำนาจและความมั่นใจ",
        "โทนตัดสินใจชัดและยืนหยัดได้",
      ],
      medium: [
        "แนวมั่นใจในการนำและตัดสินใจ",
        "โทนพูดชัดและตรงประเด็น",
      ],
      low: [
        "แนวกล้าในระดับพอดี",
        "โทนมั่นใจขึ้นเล็กน้อย",
      ],
    },
    traits: {
      feel: {
        high: "ถือตัวตรงและน่าเชื่อถือขึ้น",
        medium: "กล้าพูดและยืนหยัดขึ้น",
        low: "มั่นใจในระดับพอดี",
      },
      useCase: {
        high: "รู้สึกมีน้ำหนักและน่าเชื่อถือขึ้น",
        medium: "รู้สึกพูดแล้วตั้งหลักได้มากขึ้น",
        low: "รู้สึกกล้าแสดงออกขึ้น",
      },
      effect: {
        high: "พูดจาชัด ฟังแล้วเชื่อถือ",
        medium: "ยืนข้อความได้มั่นขึ้น",
        low: "กล้าแสดงความเห็นมากขึ้น",
      },
    },
  },

  [ENERGY_TYPES.KINDNESS]: {
    summary: {
      high: [
        "แนวเมตตาและอ่อนโยน",
        "โทนนุ่มและเข้าถึงคนรอบข้าง",
      ],
      medium: [
        "แนวลดความแข็งในน้ำเสียง",
        "โทนสนทนานุ่มลง",
      ],
      low: [
        "แนวอ่อนโยนเล็กน้อย",
        "โทนใจเย็นและนุ่มลง",
      ],
    },
    traits: {
      feel: {
        high: "พูดจาอ่อนโยนขึ้น",
        medium: "ใจอ่อนลง เข้าถึงคนง่ายขึ้น",
        low: "ใจไม่แข็งเกินไป",
      },
      useCase: {
        high: "รู้สึกอบอุ่นและเปิดกว้างขึ้นในใจ",
        medium: "รู้สึกนุ่มและเยียวยาในโทนมากขึ้น",
        low: "รู้สึกโล่งและอ่อนลงในใจ",
      },
      effect: {
        high: "บรรยากาศการคุยอบอุ่นขึ้น",
        medium: "คนรอบข้างเข้าถึงง่ายขึ้น",
        low: "ความสัมพันธ์นุ่มลงโดยไม่ฝืน",
      },
    },
  },

  [ENERGY_TYPES.ATTRACT]: {
    summary: {
      high: [
        "แนวดึงดูดและเสน่ห์",
        "โทนกล้าแสดงตัวตนกับคนรอบข้าง",
      ],
      medium: [
        "แนวโดดเด่นในมุมมองคนรอบข้าง",
        "โทนกล้าแสดงออกมากขึ้น",
      ],
      low: [
        "แนวน่าเข้าหาเล็กน้อย",
        "โทนสบายใจกับคนใหม่",
      ],
    },
    traits: {
      feel: {
        high: "รู้สึกโดดเด่นและจดจำง่ายขึ้น",
        medium: "กล้าเปิดบทสนทนาโดยไม่เก้อ",
        low: "สบายใจกับคนใหม่มากขึ้น",
      },
      useCase: {
        high: "รู้สึกมีเสน่ห์เงียบแต่ชัดขึ้น",
        medium: "รู้สึกเปิดและเป็นธรรมชาติขึ้น",
        low: "รู้สึกเบาและกล้าแสดงออกขึ้น",
      },
      effect: {
        high: "คนรอบข้างอยากเข้าหาและจดจำมากขึ้น",
        medium: "เปิดบทสนทนาได้ลื่นขึ้น",
        low: "เป็นธรรมชาติกับคนใหม่มากขึ้น",
      },
    },
  },

  [ENERGY_TYPES.LUCK]: {
    summary: {
      high: [
        "แนวโชคลาภและจังหวะ",
        "โทนมองเห็นช่องทางชัดขึ้น",
      ],
      medium: [
        "แนวโล่งและเปิดรับ",
        "โทนตัดสินใจเรื่องโอกาสได้ดีขึ้น",
      ],
      low: [
        "แนวหวังในระดับพอดี",
        "โทนใจไม่แคบจนเกินไป",
      ],
    },
    traits: {
      feel: {
        high: "ใจกล้าเลือกโดยไม่รีบเกินไป",
        medium: "มองเห็นจังหวะดีขึ้น",
        low: "ใจไม่แคบจนเกินไป",
      },
      useCase: {
        high: "รู้สึกโฟกัสกับโอกาสได้ดีขึ้น",
        medium: "รู้สึกเปิดรับและชัดขึ้นในใจ",
        low: "รู้สึกเบาและหวังในระดับพอดี",
      },
      effect: {
        high: "มองเห็นโอกาสและช่องทางชัดขึ้น",
        medium: "ตัดสินใจเรื่องโอกาสได้รอบคอบขึ้น",
        low: "ใจเปิดรับโดยไม่เสี่ยงเกิน",
      },
    },
  },

  [ENERGY_TYPES.BOOST]: {
    summary: {
      high: [
        "แนวเสริมพลังใจ",
        "โทนพร้อมลุยและตั้งใจมากขึ้น",
      ],
      medium: [
        "แนวมั่นใจในการใช้งาน",
        "โทนตั้งใจกับสิ่งที่ทำอยู่",
      ],
      low: [
        "แนวสบายใจเล็กน้อย",
        "โทนไม่หมดกับเรื่องเล็กน้อย",
      ],
    },
    traits: {
      feel: {
        high: "รู้สึกพร้อมลุยและตั้งตัวได้มากขึ้น",
        medium: "ใจสบายและตั้งสติได้ดีขึ้น",
        low: "ใจไม่หมดกับเรื่องเล็กน้อย",
      },
      useCase: {
        high: "รู้สึกมีแรงและยืนหยัดในใจมากขึ้น",
        medium: "รู้สึกต่อเนื่องและไม่หมดเร็ว",
        low: "รู้สึกอุ่นและพอดีในใจ",
      },
      effect: {
        high: "ลุยต่อได้โดยไม่หมดแรงเร็ว",
        medium: "ทำงานต่อเนื่องได้โดยไม่หมดแรงเร็ว",
        low: "ใจไม่หมดไปกับเรื่องเล็กน้อย",
      },
    },
  },
};

/** Fallback when energy block missing (should not happen if keys align). */
export const DEFAULT_COPY = ENERGY_COPY[ENERGY_TYPES.BOOST];

/** Label length caps (display polish only). */
export const CAP_MAIN_LABEL = 36;
export const CAP_MAIN_LABEL_ALT = 28;
export const CAP_FEEL = 40;
export const CAP_USE = 40;
export const CAP_EFFECT = 40;
