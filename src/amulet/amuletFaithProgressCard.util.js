/**
 * Sacred amulet — display-only “ทางไปสู่ตัว top” (progression + return-to-scan).
 * Does not alter energyScore, compatibility, or engine timing; UI estimate only.
 */

import { score10ToEnergyGrade } from "../utils/reports/energyLevelGrade.util.js";

const FULL_DAILY_GAIN10 = 0.045;

/** @type {const} */
const FAITH_ITEMS = [
  { label: "ใช้ตามวันและเวลาแนะนำ", percent: 33, dailyGain10: 0.015 },
  { label: "ตั้งจิตก่อนใช้", percent: 22, dailyGain10: 0.01 },
  { label: "สวดหรือทำสมาธิสั้น", percent: 18, dailyGain10: 0.008 },
  { label: "ผ่านพิธีปลุกเสก / บูชาต่อเนื่อง", percent: 27, dailyGain10: 0.012 },
];

/**
 * Map timing-card boost (4–12) to faith cap percent (6–15), same “strength” story.
 * @param {number} timingBoostPercent
 */
function mapTimingBoostToFaithCapPercent(timingBoostPercent) {
  const t = Math.min(12, Math.max(4, timingBoostPercent));
  return Math.round(6 + ((t - 4) / 8) * 9);
}

/**
 * When timing section is absent: deterministic 6–15 from compat + align + gap (display-only).
 */
function computeFaithBoostCapPercentFallback(payload, alignKey, ord, gapTop12) {
  let p = 6;
  const compat = Number(payload?.summary?.compatibilityPercent);
  const c = Number.isFinite(compat) ? compat : 70;
  if (c >= 76) p += 3;
  else if (c >= 62) p += 2;
  else p += 1;
  const ak = String(alignKey || "").trim();
  const o0 = String(ord[0] || "").trim();
  const o1 = String(ord[1] || "").trim();
  if (ak && o0 && ak === o0) p += 2;
  else if (ak && o1 && ak === o1) p += 1;
  const g = Number(gapTop12);
  if (Number.isFinite(g) && g >= 6) p += 1;
  return Math.min(15, Math.max(6, p));
}

/**
 * @param {number | null | undefined} timingBoostPercent
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload} payload
 * @param {string} alignKey
 * @param {readonly string[]} ord
 * @param {number} gapTop12
 */
function computeBoostCapPercent(timingBoostPercent, payload, alignKey, ord, gapTop12) {
  if (timingBoostPercent != null && Number.isFinite(Number(timingBoostPercent))) {
    return mapTimingBoostToFaithCapPercent(Number(timingBoostPercent));
  }
  return computeFaithBoostCapPercentFallback(payload, alignKey, ord, gapTop12);
}

/**
 * Next score threshold for the tier above `baseGrade` (same bands as score10ToEnergyGrade).
 * @param {string} baseGrade
 * @returns {number | null}
 */
function nextThresholdAboveGrade(baseGrade) {
  const g = String(baseGrade || "").toUpperCase();
  if (g === "D") return 6.5;
  if (g === "B") return 7.5;
  if (g === "A") return 8.9;
  return null;
}

/**
 * @param {object} p
 * @param {string} p.alignLabel
 * @param {string} p.tensionLabel
 */
function buildScanNextHint(p) {
  const al = String(p.alignLabel || "แกนที่เข้ากับคุณ").replace(/\s+/g, " ").trim();
  const tl = String(p.tensionLabel || "แกนที่ยังห่าง").replace(/\s+/g, " ").trim();
  const g = String(p.baseGrade || "").toUpperCase();
  if (g === "D") {
    return `ถ้าจะสแกนต่อ ให้เน้นชิ้นที่เด่น ${al} และอย่าเริ่มจากชิ้นที่หนักทาง ${tl} มากเกินไป`;
  }
  if (g === "S") {
    return "ถ้าจะหาต่อ ลองเทียบอีก 2–3 ชิ้นในกลุ่มเดียวกัน ว่าองค์ไหนส่งกับจังหวะคุณชัดกว่า";
  }
  return `ถ้าจะหาต่อ ให้เทียบอีก 2–3 ชิ้นในสาย ${al} เพื่อหาตัว top`;
}

/**
 * @param {object} p
 * @param {string} p.baseGrade
 * @param {boolean} p.reachableNextTier
 */
function buildBaselineHint(p) {
  const g = String(p.baseGrade || "").toUpperCase();
  if (g === "B") {
    return p.reachableNextTier
      ? "ชิ้นนี้คือตัวตั้งของรอบนี้ · มีพื้นพอให้ดันขึ้นได้"
      : "ชิ้นนี้คือตัวตั้งของรอบนี้ · ปั้นเกรดในรอบนี้จำกัด แต่ยังใช้เทียบชิ้นอื่นได้";
  }
  if (g === "A") {
    return "ชิ้นนี้คือตัวตั้งของรอบนี้ · ใช้เทียบหาองค์ที่ขึ้นได้มากกว่านี้";
  }
  if (g === "D") {
    return "ชิ้นนี้คือตัวตั้งของรอบนี้ · รอบนี้ยังไม่ใช่ตัว top และปั้นต่อได้ไม่มาก";
  }
  if (g === "S") {
    return "ชิ้นนี้คือตัวตั้งของรอบนี้ · เกรดในระบบอยู่ระดับสูงแล้ว";
  }
  return "ชิ้นนี้คือตัวตั้งของรอบนี้";
}

/**
 * @param {object} p
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload} p.payload
 * @param {string} p.alignKey
 * @param {readonly string[]} p.ord
 * @param {number} p.gapTop12
 * @param {number | null | undefined} p.timingBoostPercent — from timing card display (or null)
 * @param {string} p.alignLabel — Thai
 * @param {string} p.tensionLabel — Thai
 */
export function buildSacredAmuletFaithProgressCard(p) {
  const baseScore10 = Number(p.payload?.summary?.energyScore);
  if (!Number.isFinite(baseScore10)) return null;

  const boostCapPercent = computeBoostCapPercent(
    p.timingBoostPercent,
    p.payload,
    p.alignKey,
    p.ord,
    p.gapTop12,
  );
  const boostCap10 = Math.min(0.4, boostCapPercent * 0.03);
  const projectedScore10 = Math.min(10, baseScore10 + boostCap10);

  const baseGrade = score10ToEnergyGrade(baseScore10);
  const projectedGrade = score10ToEnergyGrade(projectedScore10);

  const nextTh = nextThresholdAboveGrade(baseGrade);
  let estimatedDaysToNextTier = null;
  let progressHint = "";

  const bg = String(baseGrade || "D").toUpperCase();
  let reachableNextTier = false;

  if (nextTh != null) {
    const gapToNext = nextTh - baseScore10;
    if (gapToNext > 0 && gapToNext <= boostCap10 + 1e-6) {
      reachableNextTier = true;
      estimatedDaysToNextTier = Math.ceil(gapToNext / FULL_DAILY_GAIN10);
    }
  }

  if (bg === "B") {
    if (reachableNextTier && estimatedDaysToNextTier != null) {
      progressHint = `B → A ได้ · ถ้าทำครบชุด คาดว่าใช้ประมาณ ${estimatedDaysToNextTier} วัน`;
    } else if (nextTh != null && nextTh - baseScore10 > boostCap10) {
      progressHint = `B → A ในรอบนี้ยังไม่ถึง (โบนัสสูงสุด +${boostCapPercent}%) · ยังหนุนคะแนนรวมได้เล็กน้อย`;
    } else {
      progressHint = `โบนัสรวมสูงสุด +${boostCapPercent}% · อัปได้สูงสุดถึง ${projectedGrade} ในรอบนี้`;
    }
  } else if (bg === "A") {
    if (nextTh != null && nextTh - baseScore10 > 0 && nextTh - baseScore10 <= boostCap10 + 1e-6) {
      progressHint = `A → S ยังมีลุ้น · ถ้าทำครบชุด คาดว่าใช้ประมาณ 10–14 วัน`;
    } else if (nextTh != null && nextTh - baseScore10 > boostCap10) {
      progressHint = `A → S ในรอบนี้ยังสูงไปเล็กน้อย (โบนัสสูงสุด +${boostCapPercent}%) · ยังหนุนความชัดได้`;
    } else {
      progressHint = `โบนัสรวมสูงสุด +${boostCapPercent}% · อัปได้สูงสุดถึง ${projectedGrade} ในรอบนี้`;
    }
  } else if (bg === "D") {
    progressHint = `รอบนี้ยังไม่ใช่ตัว top · ปั้นต่อในรอบนี้ได้ไม่มาก (โบนัสสูงสุด +${boostCapPercent}%)`;
  } else if (bg === "S") {
    progressHint =
      "คะแนนในระบบอยู่ระดับสูงแล้ว · การปฏิบัติยังช่วยหนุนความชัดของการใช้ได้อีกเล็กน้อย";
  } else {
    progressHint = progressHint || `โบนัสรวมสูงสุด +${boostCapPercent}%`;
  }

  const baselineHint = buildBaselineHint({
    baseGrade: bg,
    reachableNextTier,
  });
  const scanNextHint = buildScanNextHint({
    baseGrade: bg,
    alignLabel: p.alignLabel,
    tensionLabel: p.tensionLabel,
  });

  const returnLoopHint =
    bg === "B" || bg === "A"
      ? "เป้าหมายรอบถัดไปคือหาตัวที่ขึ้น A หรือ S ได้เร็วกว่า · ถ้าจะหาต่อ ให้เทียบอีก 2–3 ชิ้นในสายเดียวกัน · ใช้ชิ้นนี้เป็นตัวตั้งเทียบไปก่อน"
      : "";

  const barFillPercent = Math.min(100, Math.max(0, (projectedScore10 / 10) * 100));

  return {
    title: "จังหวะหนุนของชิ้นนี้",
    subtitle: "เสริมตามความเชื่อ",
    baseGrade: baseGrade || "D",
    projectedGrade: projectedGrade || "D",
    baseScore10,
    projectedScore10,
    boostCapPercent,
    estimatedDaysToNextTier,
    progressHint,
    scanNextHint,
    baselineHint,
    returnLoopHint,
    /** @internal display — routine checklist */
    items: FAITH_ITEMS.map((row) => ({ ...row })),
    barFillPercent,
    note: "เป็นค่าประมาณการเพื่อช่วยอ่านภาพรวม ไม่ได้เปลี่ยนคะแนนหลักของรายงาน",
  };
}
