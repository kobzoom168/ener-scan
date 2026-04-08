import { fnv1a32, POWER_ORDER } from "./amuletScores.util.js";

const OWNER_PROFILE_SUMMARY_BY_POWER = {
  protection: "เจ้าของรับพลังแบบค่อย ๆ ดูทิศทาง และเด่นเมื่อได้ตั้งหลักก่อน",
  metta: "เจ้าของรับพลังผ่านบรรยากาศรอบตัวได้ดี และเด่นเมื่ออยู่ในจังหวะที่คนเปิดรับ",
  baramee: "เจ้าของรับพลังแบบนิ่งแต่ชัด และเด่นเมื่อวางตัวมั่นคงก่อนขยับ",
  luck: "เจ้าของรับพลังเมื่อเห็นช่องทางชัด และเด่นเมื่อค่อย ๆ เปิดจังหวะให้ตัวเอง",
  fortune_anchor: "เจ้าของรับพลังแบบค่อยเป็นค่อยไป และเด่นเมื่อได้ตั้งหลักให้แน่นก่อน",
  specialty: "เจ้าของรับพลังแบบเลือกจังหวะเฉพาะตัว และเด่นเมื่อรู้ว่าควรขยับตอนไหน",
};

/**
 * Deterministic owner-side power profile for HTML (placeholder; not ground truth).
 * @param {string|null|undefined} birthdateUsed
 * @param {string} seedKey
 */
export function deriveAmuletOwnerPowerProfile(birthdateUsed, seedKey) {
  const base = `${String(birthdateUsed || "").trim()}|${String(seedKey || "").trim()}|amulet_owner`;
  const h0 = fnv1a32(base);

  /** @type {Record<string, number>} */
  const owner = {};
  POWER_ORDER.forEach((k, i) => {
    const h = fnv1a32(`${base}|${k}|${i}`);
    owner[k] = 38 + (h % 52);
  });
  const leadPower = [...POWER_ORDER].sort((a, b) => {
    const db = (Number(owner[b]) || 0) - (Number(owner[a]) || 0);
    if (db !== 0) return db;
    return POWER_ORDER.indexOf(a) - POWER_ORDER.indexOf(b);
  })[0];

  return {
    ownerPower: owner,
    summaryLine:
      OWNER_PROFILE_SUMMARY_BY_POWER[leadPower] ||
      "เจ้าของรับพลังแบบค่อย ๆ ดูจังหวะ และเด่นเมื่อได้ตั้งหลักก่อน",
    traitScores: [
      { label: "ตั้งหลักดี", score: 5 + (h0 % 5) },
      { label: "รับพลังเป็นจังหวะ", score: 5 + (fnv1a32(`${base}|t1`) % 5) },
      { label: "ใจนิ่งเวลาเลือก", score: 4 + (fnv1a32(`${base}|t2`) % 5) },
      { label: "ระวังแรงรอบตัว", score: 4 + (fnv1a32(`${base}|t3`) % 5) },
    ],
    note: "โปรไฟล์นี้สรุปจากวันเดือนปีเกิดเพื่อใช้เทียบกับมิติพลังของวัตถุ",
  };
}

