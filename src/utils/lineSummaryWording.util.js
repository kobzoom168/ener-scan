/**
 * LINE-only summary copy banks (short, conversational) — separate from HTML/report wording.
 * Does not change scores, categories, or deterministic fields.
 * @module
 */

import { normalizeObjectFamilyForEnergyCopy } from "./energyCategoryResolve.util.js";
import { pickVariantAvoidingRepeat } from "./wordingVariantGuard.util.js";

/**
 * @typedef {Object} LineSummaryWordingResolved
 * @property {string} opening — one short line
 * @property {string} fitLine — one short line (use case / fit)
 * @property {string} summaryBankUsed
 * @property {string} summaryVariantId
 * @property {boolean} summaryDiversified
 * @property {boolean} summaryAvoidedRepeat
 */

/** @type {Record<string, Record<string, Array<{ opening: string, fit: string }>>>} */
const LINE_BANKS = {
  crystal: {
    protection: [
      {
        opening: "โทนนี้เน้นพื้นที่ปลอดภัยรอบตัว",
        fit: "เหมาะเวลาต้องเจอคนหลากหลายหรืออยากกันแรงลบ",
      },
      {
        opening: "เน้นเกราะพลังและเขตแดนส่วนตัว",
        fit: "ช่วยให้ไม่รับพลังแปลกปลอมเข้าตัวง่ายเกินไป",
      },
      {
        opening: "เน้นตั้งหลักและลดการส่งต่ออารมณ์",
        fit: "เหมาะช่วงที่ต้องคุยกับหลายฝ่ายในวันเดียว",
      },
    ],
    balance: [
      {
        opening: "โทนนี้ช่วยถ่วงจังหวะภายใน",
        fit: "เหมาะช่วงใจแกว่งหรืออยากให้การตอบสนองนิ่งขึ้น",
      },
      {
        opening: "เน้นคืนจังหวะให้ร่างกายและโฟกัส",
        fit: "เหมาะวันที่เหนื่อยแต่ยังต้องลุยต่อ",
      },
    ],
    confidence: [
      {
        opening: "เน้นน้ำหนักในตัวเวลาต้องพูดให้คนฟัง",
        fit: "เหมาะงานหน้าคนหรือเจรจาให้โปรเจ็กต์เดิน",
      },
      {
        opening: "เน้นความน่าเชื่อถือแบบไม่ต้องเสียงดัง",
        fit: "เหมาะช่วงถูกจับจ้องหรือต้องยืนหยัดในที่ประชุม",
      },
    ],
    luck_fortune: [
      {
        opening: "โทนนี้เปิดจังหวะดีและโอกาสใหม่",
        fit: "เหมาะช่วงอยากให้เรื่องโชคและจังหวะเดินคล่องขึ้น",
      },
    ],
    money_work: [
      {
        opening: "โทนนี้เน้นเงิน งาน และโอกาสใหม่ ๆ",
        fit: "เหมาะช่วงอยากให้เรื่องรายได้และงานขยับชัดขึ้น",
      },
    ],
    charm: [
      {
        opening: "โทนนี้เน้นเสน่ห์และแรงดึงดูดในบทสนทนา",
        fit: "เหมาะช่วงอยากให้คนเปิดรับและบรรยากาศคุยลื่นขึ้น",
      },
    ],
    spiritual_growth: [
      {
        opening: "โทนนี้เน้นพลังสูงและการยกระดับตัวเอง",
        fit: "เหมาะช่วงเปลี่ยนแปลงใหญ่หรืออยากหยั่งรู้ลึกขึ้น",
      },
    ],
  },
  thai: {
    protection: [
      {
        opening: "โทนนี้เน้นคุ้มครองและกันแรงลบรอบตัว",
        fit: "เหมาะอยากมีของติดตัวไว้เสริมความอุ่นใจในวันวุ่น ๆ",
      },
      {
        opening: "เน้นเกราะพลังและความสงบในกระแสคน",
        fit: "เหมาะเดินทางหรือเจอคนหมุนเวียนหลากหลาย",
      },
      {
        opening: "เน้นกันพลังรบกวนและคืนจังหวะให้วัน",
        fit: "เหมาะคนรับรู้ไวและเหนื่อยเพราะคนรอบข้าง",
      },
    ],
    confidence: [
      {
        opening: "โทนนี้เน้นบารมีและน้ำหนักเวลาพูด",
        fit: "เหมาะช่วงต้องนำทีมหรือเจรจากับหลายฝ่าย",
      },
      {
        opening: "เน้นออร่าหนักแน่นโดยไม่ต้องเก่งคำพูด",
        fit: "เหมาะงานที่ต้องให้คนรับรู้ว่าคุณจริงจัง",
      },
      {
        opening: "เน้นยืนหยัดในที่ประชุมและข้อถกเถียง",
        fit: "เหมาะช่วงโดนคำถามกดดันหรือต้องคุมสถานการณ์",
      },
    ],
    metta: [
      {
        opening: "โทนนี้เน้นเมตตาและความเปิดรับจากคนรอบข้าง",
        fit: "เหมาะคุยงาน ขาย หรือสร้างความสัมพันธ์ใหม่",
      },
    ],
    luck_fortune: [
      {
        opening: "โทนนี้เน้นโชคลาภและจังหวะดี",
        fit: "เหมาะช่วงอยากให้โอกาสใหม่เข้ามาง่ายขึ้น",
      },
    ],
  },
  talisman: {
    protection: [
      {
        opening: "เครื่องรางโทนนี้เน้นคุ้มครองและกันแรงรบกวน",
        fit: "เหมาะพกติดตัวในวันที่ต้องเจอคนหรือสถานการณ์หลากหลาย",
      },
      {
        opening: "เน้นเขตแดนพลังและความอุ่นใจเวลาออกนอกบ้าน",
        fit: "เหมาะเดินทางหรือทำงานที่ต้องพึ่งจังหวะและสติ",
      },
    ],
    confidence: [
      {
        opening: "เครื่องรางโทนนี้เน้นน้ำหนักและความมั่นในบทบาท",
        fit: "เหมาะเจรจา นำทีม หรืออยากให้คำพูดมีแกน",
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
  return fallbackCode && fallbackCode.length ? fallbackCode : [{ opening: "", fit: "" }];
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
  const list = getLineVariantList(bankKey) || [{ opening: "", fit: "" }];
  const { variantIndex, avoidedRepeat } = pickVariantAvoidingRepeat(
    lineUserId,
    `line.${bankKey}`,
    list.length,
    String(seed || reportPayload?.reportId || "line"),
  );
  const picked = list[variantIndex] || list[0];
  const summaryDiversified = list.length > 1 && variantIndex !== 0;

  const resolved = {
    opening: String(picked.opening || "").trim(),
    fit: String(picked.fit || "").trim(),
    summaryBankUsed: bankKey,
    summaryVariantId: `${bankKey}:v${variantIndex}`,
    summaryDiversified,
    summaryAvoidedRepeat: avoidedRepeat,
  };

  console.log(
    JSON.stringify({
      event: "LINE_SUMMARY_WORDING_SELECTED",
      summaryBankUsed: resolved.summaryBankUsed,
      summaryVariantId: resolved.summaryVariantId,
      summaryDiversified: resolved.summaryDiversified,
      summaryAvoidedRepeat: resolved.summaryAvoidedRepeat,
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
    summaryDiversified: resolved.summaryDiversified,
    summaryAvoidedRepeat: resolved.summaryAvoidedRepeat,
  };
}
