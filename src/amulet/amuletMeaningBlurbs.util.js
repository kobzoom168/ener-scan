/**
 * Sacred amulet lane: verdict-style life blurbs per axis (short Thai, no hedging).
 * Used when payload omits custom `htmlReport.lifeAreaBlurbs`.
 */
import { POWER_LABEL_THAI } from "./amuletScores.util.js";

/** @typedef {import("./amuletScores.util.js").AmuletPowerKey} AmuletPowerKey */

/**
 * @param {string} seed
 * @param {AmuletPowerKey} key
 * @param {number} rank0to5 score rank after sort (0 = highest)
 */
function variant(seed, key, rank0to5) {
  const h =
    (String(seed || "").length +
      key.charCodeAt(0) * 17 +
      rank0to5 * 31) %
    2;
  return h;
}

/** Two short lines per axis: picked by variant; keeps rows distinct. */
const AXIS_VERDICT = {
  protection: [
    "กันแรงปะทะได้ตรง ๆ คุมจังหวะเมื่อเรื่องหนักเข้ามา",
    "ตั้งขอบเขตชัด ดันคุ้มครองตัวและคนรอบข้าง",
  ],
  metta: [
    "เปิดทางให้คนเกรงใจ คุยแล้วนุ่มลง",
    "เสริมเมตตา คนรอบตัวรับคุณง่ายขึ้น",
  ],
  baramee: [
    "มีน้ำหนักในบทบาท โผล่แล้วจำได้",
    "ดันบารมี ภาพลักษณ์และความน่าเชื่อถือขึ้นชัด",
  ],
  luck: [
    "เปิดทางโชค จังหวะใหม่เข้ามาเร็ว",
    "หนุนโอกาส ดันทางเลือกที่กำลังเปิด",
  ],
  fortune_anchor: [
    "ตั้งหลักได้ ไม่ไหลตามสถานการณ์ง่าย",
    "คุมจังหวะใจ กดความวุ่นให้ลงตัว",
  ],
  specialty: [
    "เหมาะขอพรเรื่องงาน ฝีมือ และความชำนาญเฉพาะตัว",
    "หนุนงานที่ต้องใช้ฝีมือ วิชา และความชำนาญ",
  ],
};

/**
 * @param {string} seed
 * @param {AmuletPowerKey} axisKey
 * @param {number} rank0to5
 */
export function buildAxisLifeBlurb(seed, axisKey, rank0to5) {
  const k = /** @type {AmuletPowerKey} */ (axisKey);
  const lines = AXIS_VERDICT[k] || [
    `เด่น ${POWER_LABEL_THAI[k]} · ใช้ได้ตรงจุด`,
    `หนุน ${POWER_LABEL_THAI[k]} · ส่งผลชัดเมื่อใช้ซ้ำ`,
  ];
  const i = variant(seed, k, rank0to5) % lines.length;
  return lines[i].replace(/\s+/g, " ").trim().slice(0, 96);
}
