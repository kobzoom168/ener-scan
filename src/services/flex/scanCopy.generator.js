/**
 * Unified intentional copy for Ener Scan Flex.
 * Tone: see `docs/ENER_SYSTEM_TONE_GUIDE.md` (Thai, clear, warm, grounded).
 * Summary + traits: generated here. Reading & usage: pass-through from prepared display.
 */
import {
  cleanLine,
  stripBullet,
  safeThaiCut,
  sanitizeFlexDisplayText,
  sanitizeBulletLines,
} from "./flex.utils.js";

/** Label caps for plain Thai trait lines (intentional copy, room for full phrases). */
const CAP_FEEL = 40;
const CAP_USE = 40;
const CAP_EFFECT = 40;

/** @typedef {'ปกป้อง'|'สมดุล'|'อำนาจ'|'เมตตา'|'ดึงดูด'|'โชคลาภ'|'เสริมพลัง'} EnergyTypeKey */

/**
 * @param {string} mainEnergy
 * @returns {EnergyTypeKey}
 */
export function resolveEnergyType(mainEnergy) {
  const s = cleanLine(mainEnergy);
  if (!s || s === "-") return "เสริมพลัง";
  if (s.includes("ปกป้อง") || s.includes("คุ้มครอง")) return "ปกป้อง";
  if (s.includes("อำนาจ") || s.includes("บารมี")) return "อำนาจ";
  if (s.includes("โชคลาภ") || s.includes("โชค")) return "โชคลาภ";
  if (s.includes("สมดุล") || s.includes("นิ่ง")) return "สมดุล";
  if (s.includes("เมตตา")) return "เมตตา";
  if (s.includes("ดึงดูด") || s.includes("เสน่ห์")) return "ดึงดูด";
  return "เสริมพลัง";
}

/**
 * @param {number|null|undefined} numeric
 * @returns {'high'|'medium'|'low'}
 */
export function resolveScoreTier(numeric) {
  if (numeric == null || !Number.isFinite(numeric)) return "medium";
  if (numeric >= 7.5) return "high";
  if (numeric >= 5) return "medium";
  return "low";
}

function capTrait(s, maxLen) {
  const t = cleanLine(s);
  if (!t) return "";
  if (t.length <= maxLen) return sanitizeFlexDisplayText(t);
  return sanitizeFlexDisplayText(safeThaiCut(t, maxLen));
}

/** Short plain headline under score (small box — label mode). */
const MAIN_LABEL = {
  ปกป้อง: "ปกป้องและมั่นคง",
  สมดุล: "สมดุลและจังหวะในใจ",
  อำนาจ: "มั่นใจและตัดสินใจชัด",
  เมตตา: "อ่อนโยนกับคนรอบข้าง",
  ดึงดูด: "น่าเข้าหาและโดดเด่น",
  โชคลาภ: "โอกาสและจังหวะ",
  เสริมพลัง: "กำลังใจในทุกวัน",
};

/** Shorter label for LINE altText — natural, notification-friendly. */
const MAIN_LABEL_ALT = {
  ปกป้อง: "ปกป้องและมั่นคง",
  สมดุล: "สมดุลและจังหวะ",
  อำนาจ: "มั่นใจและตัดสินใจ",
  เมตตา: "อ่อนโยนกับคน",
  ดึงดูด: "น่าเข้าหาและโดดเด่น",
  โชคลาภ: "โอกาสและจังหวะ",
  เสริมพลัง: "กำลังใจทุกวัน",
};

/** Intentional 2-line main energy card (meaning + context). */
const MAIN_PAIR = {
  ปกป้อง: {
    high: {
      line1: "ยึดความมั่นคงและการปกป้อง",
      line2: "ช่วยให้ใจนิ่งเวลาเผชิญเรื่องสำคัญ",
    },
    medium: {
      line1: "รับแรงกดดันและความปลอดภัยในใจ",
      line2: "ช่วยให้ใจสบายขึ้นเวลาใช้งานในทุกวัน",
    },
    low: {
      line1: "ส่งเสริมความมั่นใจแบบนุ่มนวล",
      line2: "ช่วยให้ใจเบาลงในวันที่หนักหน่วง",
    },
  },
  สมดุล: {
    high: {
      line1: "สมดุลระหว่างหนักเบาในใจ",
      line2: "ช่วยให้ใจอยู่กับตอนนี้ได้มั่นขึ้น ไม่ปล่อยให้ใจลอย",
    },
    medium: {
      line1: "คลายความวุ่นวายในใจ",
      line2: "ช่วยให้ใจอยู่กับปัจจุบันมากขึ้น",
    },
    low: {
      line1: "นุ่มนวลลงเล็กน้อยในทุกวัน",
      line2: "ช่วยให้ใจไม่ร้อนรนเกินไป",
    },
  },
  อำนาจ: {
    high: {
      line1: "เสริมความมั่นใจและการตัดสินใจ",
      line2: "ช่วยให้ยืนหยัดในที่ประชุมได้ดีขึ้น",
    },
    medium: {
      line1: "เสริมความมั่นใจเวลาออกคำสั่ง",
      line2: "ช่วยให้พูดจาชัดและตรงประเด็น",
    },
    low: {
      line1: "เสริมความกล้าในระดับพอดี",
      line2: "ช่วยให้รู้สึกมั่นใจขึ้นเล็กน้อย",
    },
  },
  เมตตา: {
    high: {
      line1: "เปิดใจอ่อนโยนและเข้าถึงคนรอบข้าง",
      line2: "ช่วยให้สื่อสารได้อบอุ่นขึ้น",
    },
    medium: {
      line1: "ลดความแข็งในน้ำเสียง",
      line2: "ช่วยให้บทสนทนานุ่มลง",
    },
    low: {
      line1: "เติมความอ่อนโยนเล็กน้อย",
      line2: "ช่วยให้ใจเย็นลงในวันวุ่น",
    },
  },
  ดึงดูด: {
    high: {
      line1: "เสริมเสน่ห์และการดึงดูด",
      line2: "ช่วยให้กล้าแสดงตัวตนเวลาอยู่กับคนอื่น",
    },
    medium: {
      line1: "เสริมความโดดเด่นในมุมมองคนรอบข้าง",
      line2: "ช่วยให้กล้าแสดงออกมากขึ้น",
    },
    low: {
      line1: "เสริมความน่าเข้าหาเล็กน้อย",
      line2: "ช่วยให้รู้สึกสบายใจเวลาพบคนใหม่",
    },
  },
  โชคลาภ: {
    high: {
      line1: "จับจังหวะและโอกาสรอบตัว",
      line2: "ช่วยให้มองเห็นช่องทางได้ชัดขึ้น",
    },
    medium: {
      line1: "เสริมความรู้สึกโล่งและเปิดรับ",
      line2: "ช่วยให้ตัดสินใจเรื่องโอกาสได้ดีขึ้น",
    },
    low: {
      line1: "เติมความหวังในระดับพอดี",
      line2: "ช่วยให้ใจไม่แคบจนเกินไป",
    },
  },
  เสริมพลัง: {
    high: {
      line1: "เสริมพลังใจในทุกวัน",
      line2: "ช่วยให้รู้สึกพร้อมลุยมากขึ้น",
    },
    medium: {
      line1: "เสริมความมั่นใจในการใช้งาน",
      line2: "ช่วยให้โฟกัสกับสิ่งที่ทำอยู่",
    },
    low: {
      line1: "เติมความสบายใจเล็กน้อย",
      line2: "ช่วยให้ใจไม่หมดไปกับเรื่องเล็กน้อย",
    },
  },
};

/** feelShort — ช่วยให้… (feeling) */
const FEEL = {
  ปกป้อง: {
    high: "ช่วยให้ใจนิ่งและมั่นใจขึ้น",
    medium: "ช่วยให้ใจนิ่งขึ้น",
    low: "ช่วยให้ใจเบาลงเล็กน้อย",
  },
  สมดุล: {
    high: "ช่วยให้ใจสงบและชัดขึ้น",
    medium: "ช่วยให้ใจไม่วอกแวกง่าย",
    low: "ช่วยให้ใจเย็นลงเล็กน้อย",
  },
  อำนาจ: {
    high: "ช่วยให้ถือตัวตรงและน่าเชื่อถือขึ้น",
    medium: "ช่วยให้กล้าพูดและยืนหยัดในที่ประชุม",
    low: "ช่วยให้รู้สึกมั่นใจในระดับพอดี",
  },
  เมตตา: {
    high: "ช่วยให้พูดจาอ่อนโยนขึ้น",
    medium: "ช่วยให้ใจอ่อนลงและเข้าถึงคนง่ายขึ้น",
    low: "ช่วยให้ใจไม่แข็งเกินไป",
  },
  ดึงดูด: {
    high: "ช่วยให้รู้สึกโดดเด่นและจดจำง่ายขึ้น",
    medium: "ช่วยให้กล้าเปิดบทสนทนาโดยไม่เก้อ",
    low: "ช่วยให้รู้สึกสบายใจเวลาพบคนใหม่",
  },
  โชคลาภ: {
    high: "ช่วยให้ใจกล้าเลือกโอกาสโดยไม่รีบเกินไป",
    medium: "ช่วยให้มองเห็นจังหวะดีขึ้น",
    low: "ช่วยให้ใจไม่แคบจนเกินไป",
  },
  เสริมพลัง: {
    high: "ช่วยให้รู้สึกพร้อมลุยในทุกวัน",
    medium: "ช่วยให้ใจสบายและตั้งสติได้ดีขึ้น",
    low: "ช่วยให้ใจไม่หมดกับเรื่องเล็กน้อย",
  },
};

/** useCaseShort — เหมาะกับ… */
const USE_CASE = {
  ปกป้อง: {
    high: "เหมาะกับช่วงที่ต้องตัดสินใจสำคัญ",
    medium: "เหมาะกับเวลาที่ต้องการความมั่นคง",
    low: "เหมาะกับวันที่ต้องการความสบายใจ",
  },
  สมดุล: {
    high: "เหมาะกับเวลาที่หัวร้อนหรือวุ่นวาย",
    medium: "เหมาะกับช่วงที่ต้องทำงานยาว ๆ",
    low: "เหมาะกับวันที่ต้องการความนิ่ง",
  },
  อำนาจ: {
    high: "เหมาะกับการประชุมหรือนำทีม",
    medium: "เหมาะกับเวลาต้องพูดให้คนฟัง",
    low: "เหมาะกับจังหวะที่ต้องการความกล้า",
  },
  เมตตา: {
    high: "เหมาะกับการคุยกับคนใกล้ชิด",
    medium: "เหมาะกับเวลาที่ต้องเยียวยาความสัมพันธ์",
    low: "เหมาะกับวันที่อยากให้บรรยากาศนุ่มลง",
  },
  ดึงดูด: {
    high: "เหมาะกับเวลาอยากให้คนจำได้",
    medium: "เหมาะกับงานสังคมหรือเจอคนใหม่",
    low: "เหมาะกับจังหวะที่อยากเปิดตัวเบาๆ",
  },
  โชคลาภ: {
    high: "เหมาะกับช่วงที่กำลังไล่เป้าหมาย",
    medium: "เหมาะกับเวลาที่ต้องตัดสินใจเรื่องโอกาส",
    low: "เหมาะกับวันที่อยากให้โชคเข้าข้าง",
  },
  เสริมพลัง: {
    high: "เหมาะกับใช้งานหนักหรือเดินทางบ่อย",
    medium: "เหมาะกับทุกวันที่ต้องตั้งสติ",
    low: "เหมาะกับวันที่ต้องการกำลังใจ",
  },
};

/** effectShort — ทำให้… (ตั้งใจใช้คนละมุมกับ feel/use เพื่อไม่ซ้ำในกล่องเดียวกัน) */
const EFFECT = {
  ปกป้อง: {
    high: "ทำให้เลือกได้หนักแน่น ไม่สั่นไหวง่าย",
    medium: "ทำให้รู้สึกมั่นคงเวลาใช้งานจริง",
    low: "ทำให้ใจเบาและโล่งขึ้นในวันหนัก",
  },
  สมดุล: {
    high: "ทำให้เห็นทางเลือกชัดและไม่หลงกับอารมณ์",
    medium: "ทำให้ใจอยู่กับปัจจุบันได้นานขึ้น",
    low: "ทำให้ใจไม่ร้อนรนจนเกินเหตุ",
  },
  อำนาจ: {
    high: "ทำให้พูดจาชัด ฟังแล้วเชื่อถือ",
    medium: "ทำให้ยืนหยัดในที่ประชุมได้มั่นขึ้น",
    low: "ทำให้กล้าแสดงความเห็นมากขึ้น",
  },
  เมตตา: {
    high: "ทำให้บรรยากาศการคุยอบอุ่นขึ้น",
    medium: "ทำให้คนรอบข้างเข้าถึงง่ายขึ้น",
    low: "ทำให้ความสัมพันธ์นุ่มลงโดยไม่ฝืน",
  },
  ดึงดูด: {
    high: "ทำให้คนรอบข้างอยากเข้าหาและจดจำมากขึ้น",
    medium: "ทำให้เปิดบทสนทนาได้ลื่นขึ้น",
    low: "ทำให้รู้สึกเป็นธรรมชาติเวลาอยู่กับคนใหม่",
  },
  โชคลาภ: {
    high: "ทำให้มองเห็นโอกาสและช่องทางชัดขึ้น",
    medium: "ทำให้ตัดสินใจเรื่องโอกาสได้รอบคอบขึ้น",
    low: "ทำให้ใจเปิดรับโดยไม่เสี่ยงเกิน",
  },
  เสริมพลัง: {
    high: "ทำให้ผ่านวันยุ่งๆ ได้โดยไม่หมดแรงเร็ว",
    medium: "ทำให้ทำงานต่อเนื่องได้โดยไม่หมดแรงเร็ว",
    low: "ทำให้ใจไม่หมดไปกับเรื่องเล็กน้อย",
  },
};

function pickFeel(type, tier, personality) {
  const base = FEEL[type]?.[tier] || FEEL.เสริมพลัง[tier];
  const s = cleanLine(stripBullet(personality));
  if (s && s !== "-" && (/นิ่ง|สงบ|เย็น/.test(s) || /ใจไม่วอกแวก/.test(s))) {
    return (
      capTrait("ช่วยให้ใจเย็นและสงบขึ้น", CAP_FEEL) ||
      capTrait(base, CAP_FEEL)
    );
  }
  if (s && s !== "-" && /มั่นใจ|กล้า/.test(s)) {
    return (
      capTrait("ช่วยให้กล้าเผชิญหน้าเรื่องสำคัญมากขึ้น", CAP_FEEL) ||
      capTrait(base, CAP_FEEL)
    );
  }
  return capTrait(base, CAP_FEEL);
}

function pickUseCase(type, tier, tone) {
  const base = USE_CASE[type]?.[tier] || USE_CASE.เสริมพลัง[tier];
  const s = cleanLine(stripBullet(tone));
  if (s && s !== "-" && /ตัดสินใจ|ประชุม|งาน|เดินทาง|สังคม/.test(s)) {
    if (/ตัดสินใจ/.test(s)) {
      return capTrait("เหมาะกับเวลาที่ต้องตัดสินใจ", CAP_USE);
    }
    if (/ประชุม|นำทีม/.test(s)) {
      return capTrait("เหมาะกับการประชุมหรือเจรจา", CAP_USE);
    }
  }
  return capTrait(base, CAP_USE);
}

function pickEffect(type, tier, hidden) {
  const base = EFFECT[type]?.[tier] || EFFECT.เสริมพลัง[tier];
  const s = cleanLine(stripBullet(hidden));
  if (s && s !== "-" && /มั่นใจ|อดทน|หลัก|ภูมิ|ตั้งใจ/.test(s)) {
    if (/อดทน|ภูมิ/.test(s)) {
      return capTrait("ทำให้อดทนและยืนหยัดได้ดีขึ้น", CAP_EFFECT);
    }
    if (/มั่นใจ|ตั้งใจ|หลักใจ/.test(s)) {
      return capTrait("ทำให้มั่นใจและตั้งใจมั่นขึ้น", CAP_EFFECT);
    }
  }
  return capTrait(base, CAP_EFFECT);
}

/**
 * @param {{
 *   mainEnergy?: string,
 *   energyScore?: string,
 *   scoreNumeric?: number|null,
 *   compatibility?: string,
 *   personality?: string,
 *   tone?: string,
 *   hidden?: string,
 *   birthdateSignals?: unknown,
 *   objectSignals?: unknown,
 *   display?: Record<string, unknown>,
 * }} input
 */
export function generateScanCopy(input) {
  const mainEnergy = input.mainEnergy ?? "-";
  const type = resolveEnergyType(mainEnergy);
  const tier = resolveScoreTier(input.scoreNumeric);

  const label0 = MAIN_LABEL[type] || MAIN_LABEL.เสริมพลัง;
  const labelAlt0 = MAIN_LABEL_ALT[type] || MAIN_LABEL_ALT.เสริมพลัง;
  const pair0 = MAIN_PAIR[type]?.[tier] || MAIN_PAIR.เสริมพลัง[tier];

  const mainEnergyLabel = capTrait(label0, 36) || label0;
  const mainEnergyLabelAlt = capTrait(labelAlt0, 28) || labelAlt0;
  const mainEnergyLine1 = sanitizeFlexDisplayText(pair0.line1);
  const mainEnergyLine2 = sanitizeFlexDisplayText(pair0.line2);

  const feelShort = pickFeel(type, tier, input.personality ?? "-");
  const useCaseShort = pickUseCase(type, tier, input.tone ?? "-");
  const effectShort = pickEffect(type, tier, input.hidden ?? "-");

  const display = input.display || {};

  const overviewMedium = display.overviewForFlex ?? "";
  const fitReasonMedium = display.fitReasonForFlex ?? "";
  const closingMedium = display.closingForFlex ?? "";

  const supportBullets = Array.isArray(display.supportTopics)
    ? sanitizeBulletLines(display.supportTopics, 26)
    : [];
  const suitableBullets = Array.isArray(display.suitable)
    ? sanitizeBulletLines(display.suitable, 26)
    : [];
  const notStrongMedium = cleanLine(display.notStrong || "") || "";
  const usageGuideMedium = cleanLine(display.usageGuide || "") || "";

  return {
    summary: {
      mainEnergyLabel,
      /** Prefer for `buildScanFlexAltText` — shorter, notification-friendly. */
      mainEnergyLabelAlt,
      mainEnergyLine1,
      mainEnergyLine2,
    },
    traits: {
      feelShort,
      useCaseShort,
      effectShort,
    },
    reading: {
      overviewMedium,
      fitReasonMedium,
      closingMedium,
    },
    usage: {
      supportBullets,
      suitableBullets,
      notStrongMedium,
      usageGuideMedium,
    },
  };
}
