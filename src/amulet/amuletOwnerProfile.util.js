import { fnv1a32, POWER_ORDER, AMULET_PEAK_SHORT_THAI } from "./amuletScores.util.js";

/**
 * Deterministic owner-side power profile for HTML (placeholder; not ground truth).
 * Vector is smoothed from birthdate + session so it correlates less randomly across axes.
 * @param {string|null|undefined} birthdateUsed
 * @param {string} seedKey
 */
export function deriveAmuletOwnerPowerProfile(birthdateUsed, seedKey) {
  const base = `${String(birthdateUsed || "").trim()}|${String(seedKey || "").trim()}|amulet_owner`;
  const h0 = fnv1a32(base);

  const monthHint = (() => {
    const m = String(birthdateUsed || "").match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) return Number(m[2]) || 1;
    return 1 + (h0 % 12);
  })();

  /** Month biases two axes slightly (stable for same birthdate). */
  const warm = POWER_ORDER[monthHint % 6];
  const cool = POWER_ORDER[(monthHint + 3) % 6];

  /** @type {Record<string, number>} */
  const owner = {};
  POWER_ORDER.forEach((k, i) => {
    let v = 44 + (fnv1a32(`${base}|${k}|${i}`) % 28);
    if (k === warm) v += 4 + (h0 % 5);
    if (k === cool) v += 2 + (h0 % 4);
    owner[k] = Math.min(92, Math.max(38, Math.round(v)));
  });

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

  let ownerPeakKey = POWER_ORDER[0];
  let ownerMax = -1;
  for (const k of POWER_ORDER) {
    if (owner[k] > ownerMax) {
      ownerMax = owner[k];
      ownerPeakKey = k;
    }
  }
  const ownerPeakShort =
    AMULET_PEAK_SHORT_THAI[/** @type {keyof typeof AMULET_PEAK_SHORT_THAI} */ (ownerPeakKey)];

  return {
    ownerPower: owner,
    zodiacLabel: `จังหวะเกิดเดือน${zodiacShort}`,
    ownerPeakKey,
    traitScores: [
      { label: "สงบ", score: 5 + (h0 % 5) },
      { label: "มุ่งมั่น", score: 5 + (fnv1a32(`${base}|t1`) % 5) },
      { label: "เปิดรับ", score: 4 + (fnv1a32(`${base}|t2`) % 5) },
      { label: "ระมัดระวัง", score: 4 + (fnv1a32(`${base}|t3`) % 5) },
    ],
    note: `โปรไฟล์คุณดัน${ownerPeakShort} · เทียบคะแนนกับพลังวัตถุ`,
  };
}
