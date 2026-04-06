import { fnv1a32 } from "./moldaviteScores.util.js";

/** @typedef {"work"|"relationship"|"money"} MoldaviteLifeAreaKey */

/**
 * @typedef {{ label: string, score: number }} OwnerTraitScore
 */

/** Zodiac labels by month index (0-based). Thai-style Rasi from DOB month. */
const ZODIAC_BY_MONTH = [
  "มังกร",    // Jan
  "กุมภ์",    // Feb
  "มีน",      // Mar
  "เมษ",      // Apr
  "พฤษภ",    // May
  "เมถุน",    // Jun
  "กรกฎ",    // Jul
  "สิงห์",    // Aug
  "กันย์",    // Sep
  "ตุลย์",    // Oct
  "พิจิก",    // Nov
  "ธนู",      // Dec
];

const ZODIAC_FALLBACK = [
  "สิงห์", "เมษ", "กุมภ์", "มีน", "กรกฎ",
  "ตุลย์", "พฤษภ", "เมถุน", "มังกร", "ธนู", "กันย์", "พิจิก",
];

const TRAIT_LABELS = ["ใจนำ", "มั่นใจ", "ขยับเร็ว", "รับความรู้สึกไว"];

/**
 * Deterministic 45-90 axis values from birthdate string (or fallback seed).
 * Not astrology: symbolic rhythm / structure profile for radar overlay only.
 *
 * @param {string|null|undefined} birthdateUsed  e.g. DD/MM/YYYY or stored label
 * @param {string} fallbackSeed  scan id prefix etc. when DOB missing
 * @returns {{
 *   work: number,
 *   relationship: number,
 *   money: number,
 *   zodiacLabel: string,
 *   traitScores: OwnerTraitScore[],
 *   note: string,
 *   identityLabel: string,
 *   summaryLine: string,
 *   traits: string[],
 *   derivationNote: string,
 * }}
 */
export function deriveMoldaviteOwnerAxisProfile(birthdateUsed, fallbackSeed) {
  const seed =
    String(birthdateUsed || "").trim() ||
    `no_dob|${String(fallbackSeed || "scan").trim()}`;

  const spread = (suffix) => 45 + (fnv1a32(`${seed}|${suffix}`) % 46);

  const work = spread("owner_axis_work");
  const relationship = spread("owner_axis_relationship");
  const money = spread("owner_axis_money");

  // --- Zodiac label (from DOB month or deterministic fallback) ---
  const dobStr = String(birthdateUsed || "").trim();
  let zodiacLabel;
  const dobParts = dobStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dobParts) {
    const monthIdx = Math.max(0, Math.min(11, Number(dobParts[2]) - 1));
    zodiacLabel = ZODIAC_BY_MONTH[monthIdx];
  } else {
    const hZ = fnv1a32(`${seed}|zodiac`);
    zodiacLabel = ZODIAC_FALLBACK[hZ % ZODIAC_FALLBACK.length];
  }

  // --- Trait scores (4 items, deterministic 4-9 range) ---
  /** @type {OwnerTraitScore[]} */
  const traitScores = TRAIT_LABELS.map((label, i) => {
    const h = fnv1a32(`${seed}|trait_score_${i}`);
    const score = 4 + (h % 6); // 4-9
    return { label, score };
  });

  const note = dobStr
    ? "โปรไฟล์นี้สรุปจากวันเดือนปีเกิดเพื่อใช้เทียบกับกราฟ"
    : "ยังไม่มีวันเกิดในระบบ ใช้รหัสรายงานเป็นฐานจำลอง";

  // --- Legacy fields (kept for backward compat outside Moldavite V2) ---
  const hId = fnv1a32(`${seed}|owner_identity`);
  /** @type {readonly string[]} */
  const identityBank = [
    "คนอ่านจังหวะก่อนขยับ",
    "คนตั้งหลักก่อนเปลี่ยน",
    "คนที่ต้องเห็นภาพชัดก่อนตัดสินใจ",
    "คนใส่ใจขอบเขตก่อนปรับใหญ่",
    "คนวางโครงสร้างก่อนเร่งเกียร์",
    "คนรับรู้ความไม่แน่นอนแต่ต้องการจังหวะพัก",
  ];
  const identityLabel = identityBank[hId % identityBank.length];

  const hs = fnv1a32(`${seed}|owner_summary`);
  const summaries = [
    "แนวโน้มโดยรวม: เน้นโครงสร้างและจังหวะการขยับมากกว่าการเร่งแบบไม่มีจุดยืน",
    "แนวโน้มโดยรวม: ผสมระหว่างความระมัดระวังกับการพร้อมเปลี่ยนกรอบเมื่อจำเป็น",
    "แนวโน้มโดยรวม: ละเอียดเรื่องความสัมพันธ์และการสื่อสารเมื่อต้องเคลียร์ดีล",
    "แนวโน้มโดยรวม: ใส่ใจเรื่องกระแสและการตั้งเกณฑ์ก่อนปรับใหญ่",
  ];
  const summaryLine = summaries[hs % summaries.length];

  const hT = fnv1a32(`${seed}|owner_traits`);
  const traitBank = [
    "โฟกัสกับโครงสร้างและลำดับขั้นเมื่อต้องขยับ",
    "เปิดรับการปรับกรอบเมื่อเห็นภาพรวมชัด",
    "ใส่ใจขอบเขตความสัมพันธ์และคำพูด",
    "พิจารณาเรื่องกระแสและการตัดสินใจเชิงโครงสร้าง",
    "ชอบความชัดก่อนเร่ง เมื่อพร้อมจึงปล่อยเกียร์",
    "รับรู้ความไม่แน่นอนได้ แต่ต้องการจังหวะพัก",
  ];
  const traits = [
    traitBank[hT % traitBank.length],
    traitBank[(hT >> 3) % traitBank.length],
    traitBank[(hT >> 7) % traitBank.length],
  ].filter((t, i, a) => a.indexOf(t) === i).slice(0, 3);

  const derivationNote = dobStr
    ? "โปรไฟล์แกนสรุปจากวันเกิดแบบจำลองเชิงสัญลักษณ์ ไม่ใช่คำทำนายชะตาแบบเต็มระบบ"
    : "ยังไม่มีวันเกิดในระบบ ใช้รหัสรายงานเป็นฐานจำลองแนวโน้มแกนแทน";

  return {
    work,
    relationship,
    money,
    zodiacLabel,
    traitScores,
    note,
    identityLabel,
    summaryLine,
    traits,
    derivationNote,
  };
}
