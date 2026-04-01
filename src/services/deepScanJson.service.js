/**
 * Parse model JSON output and render to legacy Thai deep-scan layout
 * (compatible with flex parser, history parser, format validation).
 */

import { SCAN_DIMENSION_TO_FALLBACK_ENERGY } from "../config/scanKnowledgeBase.js";
import { glossForPrimaryEnergyName } from "../utils/deepScanHumanGloss.util.js";
import { sortDimensionKeysForStarDisplay } from "./flex/flex.utils.js";

const DIM_KEYS = ["คุ้มกัน", "สมดุล", "อำนาจ", "เมตตา", "ดึงดูด"];

export function stripEnergyNameParenSuffix(s) {
  const t = String(s || "").trim();
  const i = t.indexOf("(");
  return i >= 0 ? t.slice(0, i).trim() : t;
}

/**
 * Extract JSON object string from model output (fences or raw).
 * @param {string} raw
 * @returns {string | null}
 */
export function extractJsonObjectString(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = fence ? fence[1].trim() : s;
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return inner.slice(start, end + 1);
}

/**
 * @param {string} raw
 * @returns {{
 *   energyName: string,
 *   secondaryEnergyName: string,
 *   energyScore: number,
 *   dimensions: Record<string, number>,
 *   description: string,
 *   compatibilityReason: string,
 *   tips: string[],
 * } | null}
 */
export function parseDeepScanModelJson(raw) {
  try {
    const jsonStr = extractJsonObjectString(raw);
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr);
    const energyScore = Number(parsed.energyScore);
    const description = String(parsed.description || "").trim();
    const compatibilityLegacy = String(parsed.compatibility || "").trim();
    const compatibilityReason = String(
      parsed.compatibilityReason || compatibilityLegacy || "",
    ).trim();
    const tipsIn = Array.isArray(parsed.tips)
      ? parsed.tips.map((t) => String(t || "").trim()).filter(Boolean)
      : [];
    const dimIn = parsed.dimensions && typeof parsed.dimensions === "object"
      ? parsed.dimensions
      : {};

    /** @type {Record<string, number>} */
    const dimensions = {};
    for (const k of DIM_KEYS) {
      const n = Number(dimIn[k]);
      dimensions[k] = Number.isFinite(n)
        ? Math.min(5, Math.max(1, Math.round(n)))
        : 3;
    }

    if (!description || !compatibilityReason) return null;

    const rankedKeys = sortDimensionKeysForStarDisplay(dimensions);
    const energyName = SCAN_DIMENSION_TO_FALLBACK_ENERGY[rankedKeys[0]];
    const secondaryEnergyName = stripEnergyNameParenSuffix(
      String(parsed.secondaryEnergyName ?? "").trim(),
    );

    return {
      energyName,
      secondaryEnergyName,
      energyScore: Number.isFinite(energyScore)
        ? Math.min(10, Math.max(0, energyScore))
        : 5,
      dimensions,
      description,
      compatibilityReason,
      tips: tipsIn.length >= 2 ? tipsIn.slice(0, 2) : tipsIn,
    };
  } catch {
    return null;
  }
}

function clampPctFromScore(score) {
  const base = Math.round(Number(score) * 10);
  return Math.min(95, Math.max(50, base));
}

function resolveCompatPercent(p, options = {}) {
  const opt = options.compatibilityPercent;
  if (opt != null && Number.isFinite(Number(opt))) {
    return Math.min(95, Math.max(65, Math.round(Number(opt))));
  }
  return clampPctFromScore(p.energyScore);
}

function splitTwoShortParagraphs(text) {
  const t = String(text || "").trim();
  if (!t) return ["", ""];
  const parts = t.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[1]];
  const mid = Math.floor(t.length / 2);
  let cut = t.indexOf(" ", mid);
  if (cut < 0) cut = t.indexOf("。");
  if (cut < 10) return [t, t];
  return [t.slice(0, cut).trim(), t.slice(cut).trim()];
}

function starLine(label, n) {
  const v = Math.min(5, Math.max(0, Math.round(Number(n) || 0)));
  const filled = "★".repeat(v);
  const empty = "☆".repeat(5 - v);
  return `• ${label}: ${filled}${empty} — ${v}/5 ดาว`;
}

/**
 * @param {NonNullable<ReturnType<typeof parseDeepScanModelJson>>} p
 * @param {string} objectCategory
 * @param {{ compatibilityPercent?: number }} [options]
 * @returns {string}
 */
export function renderDeepScanJsonToLegacyText(p, objectCategory, options = {}) {
  void objectCategory;
  const scoreDisplay = Number.isFinite(p.energyScore)
    ? p.energyScore.toFixed(1).replace(/\.0$/, "")
    : String(p.energyScore);
  const compatPct = resolveCompatPercent(p, options);
  const [sum1, sum2] = splitTwoShortParagraphs(p.description);
  const topDim = DIM_KEYS.reduce(
    (best, k) =>
      (p.dimensions[k] || 0) > (p.dimensions[best] || 0) ? k : best,
    "สมดุล",
  );

  const tip1 = p.tips[0] || "ตั้งเจตนาก่อนใช้หรือสวมใกล้ตัวในช่วงสำคัญ";
  const tip2 =
    p.tips[1] ||
    "หลีกเลี่ยงการโชว์ในที่พลุกพล่านถ้ารู้สึกว่าพลังรบกวนง่าย";

  const dimBlock = DIM_KEYS.map((k) => starLine(k, p.dimensions[k])).join(
    "\n",
  );

  return `
ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener

ระดับพลัง: ${scoreDisplay} / 10
พลังหลัก: ${p.energyName} (${glossForPrimaryEnergyName(p.energyName)})
ความสอดคล้องกับเจ้าของ: ${compatPct}%

ลักษณะพลัง
• บุคลิก: โดดเด่นด้าน ${topDim} (สอดคล้องกับแกนพลังของชิ้นนี้)
• โทนพลัง: หลากมิติ | ดูจากคะแนนรายด้าน (สังเกตความต่างของคะแนนแต่ละมิติ)
• พลังซ่อน: ${p.description}

${dimBlock}

ภาพรวม
${sum1 || p.description}
${sum2 || ""}

เหตุผลที่เข้ากับเจ้าของ
${p.compatibilityReason}

ชิ้นนี้หนุนเรื่อง
• ${tip1}
• ${tip2}

เหมาะใช้เมื่อ
• ${tip1}
• ${p.compatibilityReason.slice(0, Math.min(80, p.compatibilityReason.length))}

อาจไม่เด่นเมื่อ
เจ้าของยังไม่พร้อมรับฟังหรือใช้ข้อควรระวังของวัตถุมงคลอย่างต่อเนื่อง

ควรใช้แบบไหน
${tip2}

ปิดท้าย
หากอยากคุยต่อหรือสแกนชิ้นอื่น ส่งรูปมาได้เลยครับ
`.trim();
}
