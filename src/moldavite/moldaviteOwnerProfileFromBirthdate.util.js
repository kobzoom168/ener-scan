import { fnv1a32 } from "./moldaviteScores.util.js";

/** @typedef {"work"|"relationship"|"money"} MoldaviteLifeAreaKey */

/**
 * Deterministic 45–90 axis values from birthdate string (or fallback seed).
 * Not astrology — symbolic rhythm / structure profile for radar overlay only.
 *
 * @param {string|null|undefined} birthdateUsed — e.g. DD/MM/YYYY or stored label
 * @param {string} fallbackSeed — scan id prefix etc. when DOB missing
 * @returns {{
 *   work: number,
 *   relationship: number,
 *   money: number,
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

  const hT = fnv1a32(`${seed}|owner_traits`);
  /** @type {readonly string[]} */
  const traitBank = [
    "โฟกัสกับโครงสร้างและลำดับขั้นเมื่อต้องขยับ",
    "เปิดรับการปรับกรอบเมื่อเห็นภาพรวมชัด",
    "ใส่ใจขอบเขตความสัมพันธ์และคำพูด",
    "พิจารณาเรื่องกระแสและการตัดสินใจเชิงโครงสร้าง",
    "ชอบความชัดก่อนเร่ง — เมื่อพร้อมจึงปล่อยเกียร์",
    "รับรู้ความไม่แน่นอนได้ แต่ต้องการจังหวะพัก",
  ];
  const traits = [
    traitBank[hT % traitBank.length],
    traitBank[(hT >> 3) % traitBank.length],
    traitBank[(hT >> 7) % traitBank.length],
  ].filter((t, i, a) => a.indexOf(t) === i).slice(0, 3);

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

  const derivationNote = String(birthdateUsed || "").trim()
    ? "โปรไฟล์แกนสรุปจากวันเกิดแบบจำลองเชิงสัญลักษณ์ — ไม่ใช่คำทำนายชะตาแบบเต็มระบบ"
    : "ยังไม่มีวันเกิดในระบบ — ใช้รหัสรายงานเป็นฐานจำลองแนวโน้มแกนแทน";

  return {
    work,
    relationship,
    money,
    identityLabel,
    summaryLine,
    traits,
    derivationNote,
  };
}
