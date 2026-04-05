import { fnv1a32 } from "../moldavite/moldaviteScores.util.js";

/** @typedef {"generic_safe_v1"} CrystalGenericSafeMode */

export const CRYSTAL_GENERIC_SAFE_MODE = /** @type {const} */ ("generic_safe_v1");

/**
 * Neutral crystal fallback when object family is crystal but Moldavite v1 did not attach.
 * Does not claim a mineral subtype; avoids DB confidence-hero / misleading visible labels.
 *
 * @param {object} p
 * @param {string} [p.scanResultId]
 * @param {string} p.seedKey
 * @returns {import("../services/reports/reportPayload.types.js").ReportCrystalGenericSafeV1}
 */
export function buildCrystalGenericSafeV1Slice({ scanResultId, seedKey }) {
  const key = String(seedKey || scanResultId || "").trim() || "crystal_generic_safe";
  const h = fnv1a32(`${key}|crystal_generic_safe_v1`);
  const bulletVariant = h % 2;
  const bullets =
    bulletVariant === 0
      ? [
          "พลังของชิ้นนี้เด่นในทางโทนรวม — อ่านเป็นภาพใหญ่ ไม่ใช่ชนิดแร่เฉพาะ",
          "เข้ากับเจ้าของระดับที่อ่านจากตัวเลขความเข้ากัน — ใช้ประกอบการตัดสินใจ",
        ]
      : [
          "เหมาะใช้ในช่วงที่อยากดูภาพรวมของพลังก่อนลงมือจริง",
          "อ่านคู่กับบริบทชีวิต ไม่แทนคำแนะนำเชิงวิชาชีพ",
        ];

  return {
    version: "1",
    mode: CRYSTAL_GENERIC_SAFE_MODE,
    flexSurface: {
      headline: "วัตถุชิ้นนี้อยู่ในกลุ่มหินและคริสตัล",
      fitLine:
        "สรุปนี้เน้นภาพรวมของพลังที่อ่านได้ ไม่ได้ระบุชนิดแร่แบบตรวจทางวิทยาศาสตร์",
      bullets,
      mainEnergyShort: "หิน/คริสตัล",
    },
    display: {
      heroNaming: "วัตถุชิ้นนี้อยู่ในกลุ่มหินและคริสตัล",
      mainEnergyLabelNeutral: "พลังหลักจากการอ่านภาพรวม",
      visibleMainLabelNeutral: "หิน/คริสตัล",
      mainEnergyWordingLine:
        "พลังของชิ้นนี้สะท้อนภาพรวมจากการอ่าน — ไม่ได้ระบุชนิดแร่โดยตรง",
      htmlOpeningNeutral:
        "พลังของชิ้นนี้ถูกอ่านเป็นภาพรวมจากรูปและบริบท ไม่ได้ยืนยันชนิดแร่หรือแหล่งที่มา เหมาะใช้เป็นตัวช่วยจับโทน ไม่ใช่คำทำนายแบบแน่นอน",
    },
    context: {
      scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
    },
  };
}
