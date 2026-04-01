/**
 * Short Thai glosses for {@link DEEP_SCAN_ALLOWED_ENERGY_NAMES} — parenthetical human hooks
 * for "พลังหลัก" line (format + readability checks). Keep varied wording to reduce copy similarity.
 */
const ENERGY_GLOSS = /** @type {Record<string, string>} */ ({
  พลังคุ้มครอง: "เน้นเกราะใจและความปลอดภัยเชิงสัญลักษณ์",
  พลังบารมี: "เน้นบารมีและแรงหนุนในการตัดสินใจ",
  พลังโชคลาภ: "เน้นโอกาสและจังหวะดีที่เข้ามาแบบไม่ตั้งใจ",
  พลังดูดเงิน: "เน้นกระแสรับกับเรื่องเงินและการแลกเปลี่ยน",
  พลังเปิดทาง: "เน้นเส้นทางใหม่และการเชื่อมโยง",
  พลังการงาน: "เน้นความต่อเนื่องและความรับผิดชอบในงาน",
  พลังวาสนา: "เน้นโชคชะตาและจังหวะชีวิตโดยรวม",
  พลังเสน่หา: "เน้นความอบอุ่นและการถูกมองในแง่ดี",
  พลังเมตตา: "เน้นความเอื้อเฟื้อและการให้อภัย",
  พลังมหานิยม: "เน้นการถูกยอมรับและความน่าไว้วางใจ",
  พลังสมดุล: "เน้นความพอดีและความนิ่งกลางจังหวะวุ่น",
  พลังใจนิ่ง: "เน้นความนิ่งและการไม่วอกแวกง่าย",
  พลังปัญญา: "เน้นความชัดเจนและการมองเห็นมุมที่ลึกขึ้น",
});

/**
 * @param {string} energyName
 * @returns {string}
 */
export function glossForPrimaryEnergyName(energyName) {
  const k = String(energyName || "").trim();
  if (ENERGY_GLOSS[k]) return ENERGY_GLOSS[k];
  return "อ่านจากแกนพลังที่โดดที่สุดในชิ้นนี้";
}

/**
 * If `พลังหลัก:` line has no `()`, append a single gloss — idempotent.
 * @param {string} text
 * @returns {string}
 */
export function ensurePrimaryEnergyLineHasGloss(text) {
  const t = String(text || "");
  const needle = "พลังหลัก:";
  const idx = t.indexOf(needle);
  if (idx < 0) return t;
  const lineStart = idx;
  const after = t.slice(lineStart);
  const nl = after.indexOf("\n");
  const line = (nl < 0 ? after : after.slice(0, nl)).trim();
  if (line.includes("(") && line.includes(")")) return t;

  const valuePart = line.slice(needle.length).trim();
  if (!valuePart) return t;
  const baseName = valuePart.split(/\s+/)[0] || valuePart;
  const gloss = glossForPrimaryEnergyName(baseName);
  const replacement = `${needle} ${valuePart} (${gloss})`;
  const end = nl < 0 ? t.length : lineStart + nl;
  return t.slice(0, lineStart) + replacement + t.slice(end);
}
