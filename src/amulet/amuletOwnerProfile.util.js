import { fnv1a32, POWER_ORDER } from "./amuletScores.util.js";

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

  const monthHint = (() => {
    const m = String(birthdateUsed || "").match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) return Number(m[2]) || 1;
    return 1 + (h0 % 12);
  })();

  const zodiacShort = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ][(monthHint - 1) % 12];

  return {
    ownerPower: owner,
    zodiacLabel: `จังหวะเกิดเดือน${zodiacShort} (สรุปสัญลักษณ์)`,
    traitScores: [
      { label: "สงบ", score: 5 + (h0 % 5) },
      { label: "มุ่งมั่น", score: 5 + (fnv1a32(`${base}|t1`) % 5) },
      { label: "เปิดรับ", score: 4 + (fnv1a32(`${base}|t2`) % 5) },
      { label: "ระมัดระวัง", score: 4 + (fnv1a32(`${base}|t3`) % 5) },
    ],
    note: "สรุปจากวันเกิดเพื่อเทียบกับหกมิติบนกราฟ",
  };
}
