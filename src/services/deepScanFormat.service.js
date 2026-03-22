const REQUIRED_HEADINGS = [
  "ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener",
  "ระดับพลัง:",
  "พลังหลัก:",
  "ความสอดคล้องกับเจ้าของ:",
  "ลักษณะพลัง",
  "ภาพรวม",
  "เหตุผลที่เข้ากับเจ้าของ",
  "ชิ้นนี้หนุนเรื่อง",
  "เหมาะใช้เมื่อ",
  "อาจไม่เด่นเมื่อ",
  "ควรใช้แบบไหน",
  "ปิดท้าย",
];

export function isDeepScanFormatValid(text) {
  if (!text || typeof text !== "string") return false;
  return REQUIRED_HEADINGS.every((heading) => text.includes(heading));
}

export function normalizeDeepScanText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
