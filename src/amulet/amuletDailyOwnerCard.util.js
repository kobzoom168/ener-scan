/**
 * Sacred amulet — daily owner context vs object-day boost.
 * Owner/day copy is stable for the same birthdate + same Bangkok calendar day (no scan/object ids).
 */

import {
  AMULET_PEAK_SHORT_THAI,
  POWER_LABEL_THAI,
} from "./amuletScores.util.js";

/**
 * Bangkok wall date (UTC+7) for stable “วันนี้” across reports generated the same local day.
 * @param {string|null|undefined} iso
 */
export function bangkokCalendarParts(iso) {
  const t = Date.parse(String(iso || "").trim());
  const ms = (Number.isFinite(t) ? t : Date.now()) + 7 * 60 * 60 * 1000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const dow = d.getUTCDay();
  const key = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { y, m, day, dow, key };
}

/**
 * Birth month 1–12 and weekday 0=Sun from DD/MM/YYYY (fallbacks if parse fails).
 * @param {string|null|undefined} birthdateUsed
 */
function birthMonthAndWeekday0Sun(birthdateUsed) {
  const m = String(birthdateUsed || "").match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return { month: 6, wd0Sun: 3 };
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return { month: 6, wd0Sun: 3 };
  if (y < 100) y = y >= 50 ? 1900 + y : 2000 + y;
  const utc = Date.UTC(y, mo - 1, d, 12, 0, 0);
  return { month: Math.min(12, Math.max(1, mo)), wd0Sun: new Date(utc).getUTCDay() };
}

/** โทนวัน — ไม่ผูกวัตถุ (สั้นลงเล็กน้อยเพื่ออ่านบนมือถือ) */
const DAILY_TONES = [
  "วันนี้เหมาะเทียบหลายชิ้นแบบไม่เร่ง",
  "โทนวันนี้นิ่งพอดี เห็นความต่างชิ้นละชิ้นชัดขึ้น",
  "วันนี้เหมาะอ่านแบบใจเย็น ให้เวลารายละเอียดเล็ก ๆ",
  "จังหวะวันนี้เน้นตัดสินใจด้วยเหตุผลมากกว่าอารมณ์วูบเดียว",
  "วันนี้เหมาะเทียบหลายชิ้นแล้วค่อยเลือกตัวที่ใช่",
  "โทนวันนี้เน้นความชัด — จัดลำดับว่าอะไรสำคัญกว่า",
  "วันนี้เหมาะสังเกตความต่างระหว่างชิ้นอย่างใจเย็น",
];

const DAILY_SCAN_HINTS = [
  "สแกนเพิ่มวันนี้ เทียบสายเมตตาหรือบารมีก่อน",
  "สแกนเพิ่ม ลองเทียบโทนคุ้มครองหรือหนุนดวงใกล้กัน",
  "สแกนต่อวันนี้ ยึด “เข้ากับคุณ” เป็นตั้งต้นมากกว่าแค่คะแนนสูงสุด",
  "เทียบหลายชิ้น ดูทั้งพลังเด่นกับด้านที่ส่งกับคุณคู่กัน",
  "หาชิ้นใหม่วันนี้ ลองสายงานเฉพาะหรือโชคลาภคู่ของเดิม",
  "สแกนซ้ำวันเดียวกัน ใช้รูปและวันเกิดเดิมให้ผลเทียบตรง",
];

/**
 * Stable daily owner card — same `birthdateUsed` + same Bangkok calendar day from `generatedAtIso` ⇒ same strings (no object/scan id).
 * Two short lines only (compact HTML surface).
 *
 * @param {{ birthdateUsed?: string|null; generatedAtIso?: string|null }} p
 */
export function buildSacredAmuletDailyOwnerCard(p) {
  const { dow } = bangkokCalendarParts(p.generatedAtIso);
  const { month, wd0Sun } = birthMonthAndWeekday0Sun(p.birthdateUsed);
  const idxBase = (dow * 17 + month * 5 + wd0Sun * 11) % DAILY_TONES.length;
  const idxHint = (idxBase + 4) % DAILY_SCAN_HINTS.length;

  return {
    title: "วันนี้มีแรงของคุณ",
    line1: DAILY_TONES[idxBase],
    line2: DAILY_SCAN_HINTS[idxHint],
  };
}

/**
 * Object + day line — may change per scan (peak / align / tension / compat).
 *
 * @param {object} p
 * @param {number|null|undefined} p.compatibilityPercent
 * @param {string} p.peakKey
 * @param {string} p.alignKey
 * @param {string} p.tensionKey
 */
export function buildTodayObjectBoostLine(p) {
  const pk = String(p.peakKey || "protection").trim();
  const ak = String(p.alignKey || pk).trim();
  const tk = String(p.tensionKey || pk).trim();
  const compat = Number(p.compatibilityPercent);
  const c = Number.isFinite(compat) ? Math.min(100, Math.max(0, compat)) : 70;

  const alignL =
    POWER_LABEL_THAI[/** @type {keyof typeof POWER_LABEL_THAI} */ (ak)] ||
    POWER_LABEL_THAI.protection;
  const shortAlign = alignL.includes("และ") ? alignL.split("และ")[0].trim() : alignL;
  const shortPeak =
    AMULET_PEAK_SHORT_THAI[/** @type {keyof typeof AMULET_PEAK_SHORT_THAI} */ (pk)] ||
    String(pk);
  const tensionL =
    POWER_LABEL_THAI[/** @type {keyof typeof POWER_LABEL_THAI} */ (tk)] ||
    POWER_LABEL_THAI.protection;
  const shortTension = tensionL.includes("และ") ? tensionL.split("และ")[0].trim() : tensionL;

  if (c >= 76) {
    return `วันนี้ชิ้นนี้ช่วยดัน${shortAlign}ได้ดีเมื่อเทียบกับจังหวะคุณ`;
  }
  if (c >= 62) {
    const tensionFrag =
      tk !== ak && shortTension
        ? ` · มุม${shortTension}ของชิ้นนี้เหมาะใช้เป็นจุดเทียบมากกว่าจุดเด่นวันนี้`
        : "";
    return `วันนี้ชิ้นนี้ส่งกับ${alignL}พอดี · ค่อย ๆ เทียบชิ้นอื่นในวันเดียวกันจะเห็นชัดขึ้น${tensionFrag}`;
  }
  return `วันนี้ชิ้นนี้ยังไม่เด่นสุด ลองเทียบชิ้นที่ส่งทาง${shortPeak}เพิ่ม · ถ้าเทียบหลายชิ้น ให้ดูด้าน${shortTension}เป็นจุดอ้างอิงไปก่อน`;
}
