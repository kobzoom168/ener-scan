/**
 * LINE-only summary copy banks (short, conversational) — separate from HTML/report wording.
 * Does not change scores, categories, or deterministic fields.
 * @module
 */

import { normalizeObjectFamilyForEnergyCopy } from "./energyCategoryResolve.util.js";
import { pickVariantAvoidingRepeatWithAngles } from "./wordingVariantGuard.util.js";

/**
 * @typedef {Object} LineSummaryWordingResolved
 * @property {string} opening — one short line
 * @property {string} fitLine — one short line (use case / fit)
 * @property {string} summaryBankUsed
 * @property {string} summaryVariantId
 * @property {string} presentationAngleId — surface angle (truth category unchanged)
 * @property {boolean} summaryDiversified
 * @property {boolean} summaryAvoidedRepeat
 * @property {boolean} summaryAvoidedAngleCluster
 */

/** @type {Record<string, Record<string, Array<{ opening: string, fit: string, presentationAngle: string }>>>} */
const LINE_BANKS = {
  crystal: {
    protection: [
      {
        presentationAngle: "guard",
        opening: "โทนนี้เน้นพื้นที่ปลอดภัยรอบตัว",
        fit: "เหมาะเวลาต้องเจอคนหลากหลายหรืออยากกันแรงลบ",
      },
      {
        presentationAngle: "boundary",
        opening: "เน้นเกราะพลังและเขตแดนส่วนตัว",
        fit: "ช่วยให้ไม่รับพลังแปลกปลอมเข้าตัวง่ายเกินไป",
      },
      {
        presentationAngle: "calm_shield",
        opening: "เน้นตั้งหลักและลดการส่งต่ออารมณ์",
        fit: "เหมาะช่วงที่ต้องคุยกับหลายฝ่ายในวันเดียว",
      },
      {
        presentationAngle: "interference",
        opening: "เน้นกรองแรงปะทะและเสียงรบกวนรอบตัว",
        fit: "เหมาะคนทำงานหน้าคนหรือรับรู้ไวต่อบรรยากาศ",
      },
      {
        presentationAngle: "emotional_filter",
        opening: "เน้นไม่ให้อารมณ์คนอื่นถูกส่งต่อเข้ามาโดยไม่รู้ตัว",
        fit: "เหมาะช่วงโซเชียลหนักหรือต้องคุยกับหลายคนรัว ๆ",
      },
      {
        presentationAngle: "steady_core",
        opening: "เน้นหาจุดยืนภายในเวลาโดนกดดัน",
        fit: "เหมาะวันที่ต้องตัดสินใจสำคัญแต่ไม่อยากสั่น",
      },
    ],
    balance: [
      {
        presentationAngle: "center",
        opening: "โทนนี้ช่วยถ่วงจังหวะภายใน",
        fit: "เหมาะช่วงใจแกว่งหรืออยากให้การตอบสนองนิ่งขึ้น",
      },
      {
        presentationAngle: "rhythm",
        opening: "เน้นคืนจังหวะให้ร่างกายและสมาธิ",
        fit: "เหมาะวันที่เหนื่อยแต่ยังต้องลุยต่อ",
      },
      {
        presentationAngle: "grounding",
        opening: "เน้นประคองจังหวะหายใจและสมาธิสั้น ๆ",
        fit: "เหมาะช่วงที่อยากให้หัวสมองไม่วิ่งแข่งกับเหตุการณ์",
      },
    ],
    confidence: [
      {
        presentationAngle: "voice",
        opening: "เน้นน้ำหนักในตัวเวลาต้องพูดให้คนฟัง",
        fit: "เหมาะงานหน้าคนหรือเจรจาให้โปรเจ็กต์เดิน",
      },
      {
        presentationAngle: "presence",
        opening: "เน้นความน่าเชื่อถือแบบไม่ต้องเสียงดัง",
        fit: "เหมาะช่วงถูกจับจ้องหรือต้องยืนหยัดในที่ประชุม",
      },
      {
        presentationAngle: "stance",
        opening: "เน้นยืนชัดในบทบาทเวลาโดนท้าทาย",
        fit: "เหมาะเจรจาหลายฝ่ายหรือต้องอธิบายซ้ำโดยไม่ลดคุณภาพ",
      },
    ],
    luck_fortune: [
      {
        presentationAngle: "open_chance",
        opening: "โทนนี้เปิดจังหวะดีและโอกาสใหม่",
        fit: "เหมาะช่วงอยากให้เรื่องโชคและจังหวะเดินคล่องขึ้น",
      },
      {
        presentationAngle: "flow",
        opening: "เน้นให้เรื่องเล็ก ๆ คลิกก่อนเรื่องใหญ่จะขยับ",
        fit: "เหมาะช่วงเริ่มโปรเจ็กต์หรืออยากให้โชคเข้าข้างจังหวะ",
      },
    ],
    money_work: [
      {
        presentationAngle: "income",
        opening: "โทนนี้เน้นเงิน งาน และโอกาสใหม่ ๆ",
        fit: "เหมาะช่วงอยากให้เรื่องรายได้และงานขยับชัดขึ้น",
      },
    ],
    charm: [
      {
        presentationAngle: "soft_pull",
        opening: "โทนนี้เน้นเสน่ห์และแรงดึงดูดในบทสนทนา",
        fit: "เหมาะช่วงอยากให้คนเปิดรับและบรรยากาศคุยลื่นขึ้น",
      },
    ],
    spiritual_growth: [
      {
        presentationAngle: "ascent",
        opening: "โทนนี้เน้นพลังสูงและการยกระดับตัวเอง",
        fit: "เหมาะช่วงเปลี่ยนแปลงใหญ่หรืออยากหยั่งรู้ลึกขึ้น",
      },
    ],
  },
  thai: {
    protection: [
      {
        presentationAngle: "amulet_shield",
        opening: "โทนนี้เน้นคุ้มครองและกันแรงลบรอบตัว",
        fit: "เหมาะอยากมีของติดตัวไว้เสริมความอุ่นใจในวันวุ่น ๆ",
      },
      {
        presentationAngle: "travel_calm",
        opening: "เน้นเกราะพลังและความสงบในกระแสคน",
        fit: "เหมาะเดินทางหรือเจอคนหมุนเวียนหลากหลาย",
      },
      {
        presentationAngle: "day_reset",
        opening: "เน้นกันพลังรบกวนและคืนจังหวะให้วัน",
        fit: "เหมาะคนรับรู้ไวและเหนื่อยเพราะคนรอบข้าง",
      },
      {
        presentationAngle: "social_buffer",
        opening: "เน้นกันความวุ่นจากคนแปลกหน้าและบทสนทนาไม่จบ",
        fit: "เหมาะงานอีเวนต์ คอลเซ็นเตอร์ หรือคุยสลับคนบ่อย",
      },
      {
        presentationAngle: "quiet_barrier",
        opening: "เน้นความสงบในพื้นที่ที่เสียงและอารมณ์ปะปน",
        fit: "เหมาะออฟฟิศคนแออัดหรือบ้านที่มีแขกเข้าออก",
      },
      {
        presentationAngle: "night_ground",
        opening: "เน้นปิดวันแล้วยังรู้สึกมีพื้นที่หายใจ",
        fit: "เหมาะช่วงที่กลางวันยุ่งและอยากให้กลางคืนนิ่งขึ้น",
      },
    ],
    confidence: [
      {
        presentationAngle: "baramee_speech",
        opening: "โทนนี้เน้นบารมีและน้ำหนักเวลาพูด",
        fit: "เหมาะช่วงต้องนำทีมหรือเจรจากับหลายฝ่าย",
      },
      {
        presentationAngle: "gravitas",
        opening: "เน้นออร่าหนักแน่นโดยไม่ต้องเก่งคำพูด",
        fit: "เหมาะงานที่ต้องให้คนรับรู้ว่าคุณจริงจัง",
      },
      {
        presentationAngle: "debate_floor",
        opening: "เน้นยืนหยัดในที่ประชุมและข้อถกเถียง",
        fit: "เหมาะช่วงโดนคำถามกดดันหรือต้องคุมสถานการณ์",
      },
      {
        presentationAngle: "lead_room",
        opening: "เน้นให้ห้องประชุมหันมาฟังเมื่อคุณเปิดประเด็น",
        fit: "เหมาะนำเสนองานหรือสรุปให้หลายฝ่ายเห็นภาพเดียวกัน",
      },
    ],
    metta: [
      {
        presentationAngle: "open_heart",
        opening: "โทนนี้เน้นเมตตาและความเปิดรับจากคนรอบข้าง",
        fit: "เหมาะคุยงาน ขาย หรือสร้างความสัมพันธ์ใหม่",
      },
    ],
    luck_fortune: [
      {
        presentationAngle: "luck_gate",
        opening: "โทนนี้เน้นโชคลาภและจังหวะดี",
        fit: "เหมาะช่วงอยากให้โอกาสใหม่เข้ามาง่ายขึ้น",
      },
    ],
  },
  talisman: {
    protection: [
      {
        presentationAngle: "bracelet_guard",
        opening: "เครื่องรางโทนนี้เน้นคุ้มครองและกันแรงรบกวน",
        fit: "เหมาะพกติดตัวในวันที่ต้องเจอคนหรือสถานการณ์หลากหลาย",
      },
      {
        presentationAngle: "outbound_steady",
        opening: "เน้นเขตแดนพลังและความอุ่นใจเวลาออกนอกบ้าน",
        fit: "เหมาะเดินทางหรือทำงานที่ต้องพึ่งจังหวะและสติ",
      },
      {
        presentationAngle: "wrist_anchor",
        opening: "เน้นจุดยึดสั้น ๆ ที่ข้อมือเวลาใจเริ่มกระเซ็น",
        fit: "เหมาะวันที่ต้องสลับบทบาทบ่อยหรือโดนเร่งงาน",
      },
      {
        presentationAngle: "crowd_skin",
        opening: "เน้นลดความรู้สึกถูกแหย่งจากคนแปลกหน้า",
        fit: "เหมาะตลาด คอนเสิร์ต หรือที่คนเยอะแต่ต้องคุมสติ",
      },
    ],
    presence: [
      {
        presentationAngle: "bracelet_presence",
        opening: "เน้นออร่าเปิดพื้นที่ให้คนรับรู้ตัวตนของคุณชัดขึ้น",
        fit: "เหมาะงานหน้าคน นำเสนอ หรืออยากให้คำพูดมีน้ำหนัก",
      },
      {
        presentationAngle: "soft_spotlight",
        opening: "เน้นไม่ต้องเสียงดังแต่ยังโดดเด่นในกลุ่ม",
        fit: "เหมาะประชุม สัมภาษณ์ หรือเจอคนใหม่บ่อย",
      },
    ],
    confidence: [
      {
        presentationAngle: "role_weight",
        opening: "เครื่องรางโทนนี้เน้นน้ำหนักและความมั่นในบทบาท",
        fit: "เหมาะเจรจา นำทีม หรืออยากให้คำพูดมีแกน",
      },
      {
        presentationAngle: "closing_deal",
        opening: "เน้นจังหวะปิดดีลและให้ฝั่งตรงข้ามจำได้ง่าย",
        fit: "เหมาะเจรจาหลายรอบหรือต้องสรุปข้อตกลง",
      },
    ],
  },
};

/**
 * @param {string} objectFamilyRaw
 * @param {string} categoryCode
 * @returns {string}
 */
export function lineSummaryBankKey(objectFamilyRaw, categoryCode) {
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw);
  const code = String(categoryCode || "").trim() || "luck_fortune";
  if (fam === "crystal") return `crystal.${code}`;
  if (fam === "thai_talisman") return `talisman.${code}`;
  return `thai.${code}`;
}

/**
 * @param {string} bankKey
 * @returns {{ branch: string, code: string } | null}
 */
function parseBankKey(bankKey) {
  const parts = String(bankKey || "").split(".");
  if (parts.length < 2) return null;
  return { branch: parts[0], code: parts.slice(1).join(".") };
}

function getLineVariantList(bankKey) {
  const p = parseBankKey(bankKey);
  if (!p) return null;
  const { branch, code } = p;
  const list = LINE_BANKS[branch]?.[code];
  if (Array.isArray(list) && list.length) return list;
  const fallbackCode =
    branch === "crystal"
      ? LINE_BANKS.crystal?.protection
      : LINE_BANKS.thai?.protection;
  return fallbackCode && fallbackCode.length
    ? fallbackCode
    : [
        {
          opening: "",
          fit: "",
          presentationAngle: "neutral",
        },
      ];
}

/**
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload | null | undefined} reportPayload
 * @param {string} [lineUserId]
 * @param {string} [seed]
 * @returns {LineSummaryWordingResolved}
 */
export function resolveLineSummaryWording(reportPayload, lineUserId = "", seed = "") {
  const s = reportPayload?.summary && typeof reportPayload.summary === "object"
    ? reportPayload.summary
    : {};
  const objectFamily =
    typeof s.energyCopyObjectFamily === "string" && s.energyCopyObjectFamily.trim()
      ? s.energyCopyObjectFamily
      : "";
  const categoryCode = String(s.energyCategoryCode || "").trim() || "luck_fortune";

  const bankKey = lineSummaryBankKey(objectFamily, categoryCode);
  const list = getLineVariantList(bankKey) || [
    { opening: "", fit: "", presentationAngle: "neutral" },
  ];
  const {
    variantIndex,
    avoidedRepeat,
    avoidedAngleCluster,
  } = pickVariantAvoidingRepeatWithAngles(
    lineUserId,
    `line.${bankKey}`,
    list,
    String(seed || reportPayload?.reportId || "line"),
  );
  const picked = list[variantIndex] || list[0];
  const summaryDiversified = list.length > 1 && variantIndex !== 0;
  const presentationAngleId = String(picked.presentationAngle || `v${variantIndex}`).trim();

  const resolved = {
    opening: String(picked.opening || "").trim(),
    fit: String(picked.fit || "").trim(),
    summaryBankUsed: bankKey,
    summaryVariantId: `${bankKey}:v${variantIndex}`,
    presentationAngleId,
    summaryDiversified,
    summaryAvoidedRepeat: avoidedRepeat || avoidedAngleCluster,
    summaryAvoidedAngleCluster: avoidedAngleCluster,
  };

  console.log(
    JSON.stringify({
      event: "LINE_SUMMARY_WORDING_SELECTED",
      summaryBankUsed: resolved.summaryBankUsed,
      summaryVariantId: resolved.summaryVariantId,
      presentationAngleId: resolved.presentationAngleId,
      summaryDiversified: resolved.summaryDiversified,
      summaryAvoidedRepeat: resolved.summaryAvoidedRepeat,
      summaryAvoidedAngleCluster: resolved.summaryAvoidedAngleCluster,
    }),
  );

  if (avoidedRepeat) {
    console.log(
      JSON.stringify({
        event: "LINE_SUMMARY_WORDING_AVOIDED_REPEAT",
        summaryBankUsed: bankKey,
        summaryVariantId: resolved.summaryVariantId,
      }),
    );
  }
  if (summaryDiversified) {
    console.log(
      JSON.stringify({
        event: "LINE_SUMMARY_WORDING_DIVERSIFIED",
        summaryBankUsed: bankKey,
        note: "alternate_line_summary_angle",
      }),
    );
  }

  return {
    opening: resolved.opening,
    fitLine: resolved.fit,
    summaryBankUsed: resolved.summaryBankUsed,
    summaryVariantId: resolved.summaryVariantId,
    presentationAngleId: resolved.presentationAngleId,
    summaryDiversified: resolved.summaryDiversified,
    summaryAvoidedRepeat: resolved.summaryAvoidedRepeat,
    summaryAvoidedAngleCluster: resolved.summaryAvoidedAngleCluster,
  };
}
