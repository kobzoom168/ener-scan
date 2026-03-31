/**
 * Short Thai highlights for Object Energy v1 (HTML / expandable).
 */

import { FLEX_THAI_LABEL_BY_DIMENSION } from "./objectEnergyFormula.util.js";

/**
 * @param {import("./objectEnergyFormula.util.js").EnergyProfile} profile
 * @param {import("./objectEnergyFormula.util.js").EnergyStars} stars
 * @param {{ key: string, labelThai: string }} mainEnergyResolved
 * @param {number} confidence
 * @param {string[]} [extraFromCheck]
 * @returns {string[]}
 */
export function buildObjectEnergyExplainBullets(
  profile,
  stars,
  mainEnergyResolved,
  confidence,
  extraFromCheck = [],
) {
  const lines = [];

  const ranked = /** @type {const} */ ([
    "balance",
    "protection",
    "authority",
    "compassion",
    "attraction",
  ])
    .map((k) => ({
      key: k,
      score: profile[k],
      stars: stars[k],
      th: FLEX_THAI_LABEL_BY_DIMENSION[k],
    }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];
  if (top && second) {
    lines.push(
      `แกนที่โดดที่สุดคือ ${top.th} (ประมาณ ${top.stars}/5 ดาว) รองลงมา ${second.th}`,
    );
  }

  lines.push(
    `พลังหลักที่สรุปจากโปรไฟล์: ${mainEnergyResolved.labelThai} (${mainEnergyResolved.key})`,
  );

  const confPct = Math.round(confidence * 100);
  lines.push(
    confPct >= 72
      ? `ความมั่นใจของสัญญาณรวมอยู่ในเกณฑ์ดี (ประมาณ ${confPct}%)`
      : `สัญญาณบางส่วนใช้ค่ากลาง — ความมั่นใจรวมประมาณ ${confPct}% (เหมาะเป็นภาพรวม ไม่ใช่คะแนนเชิงตัดสิน)`,
  );

  const ex = extraFromCheck.filter(Boolean).slice(0, 1);
  if (ex.length) lines.push(ex[0]);

  return lines.slice(0, 4);
}
