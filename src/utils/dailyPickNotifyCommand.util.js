/**
 * คำสั่ง/คำถามเรื่องแจ้งเตือนหนุนดวงรายเช้า — แยกไฟล์เพื่อทดสอบได้โดยไม่ต้องโหลด webhook
 *
 * กติกา (Codex 17 ก.ย.): **คำถามไม่เปลี่ยนค่า · คำสั่งชัดเจนจึงเปลี่ยนค่า**
 *   "หยุดแจ้งเตือน"      → off  (เปลี่ยนค่า)
 *   "เปิดแจ้งเตือน"       → on   (เปลี่ยนค่า)
 *   "ปิดแจ้งเตือนยังไง"   → help (ตอบวิธีแบบ deterministic ไม่แตะค่า ไม่ให้ AI ไปสัญญาแทน)
 */
const POLITE_TAIL = /(ครับ|ค่ะ|คะ|ฮะ|จ้า|นะ|หน่อย|ที)+$/u;
const QUESTION_HINT = /(ยังไง|อย่างไร|ไง|ทำไง|ทำยังไง|วิธี|ได้ไหม|ได้มั้ย|ยัง|เหรอ|หรอ|มั้ย|ไหม|\?|？)/u;

function normalize(text) {
  return String(text || "").trim().replace(/\s+/g, "").replace(POLITE_TAIL, "");
}

export function matchDailyPickNotifyCommand(text) {
  const raw = String(text || "").trim();
  const t = normalize(raw);
  if (!t) return null;
  const mentionsNotify = /แจ้งเตือน/u.test(t);
  if (!mentionsNotify) return null;

  // คำสั่งเป๊ะเท่านั้นที่เปลี่ยนค่า
  if (t === "หยุดแจ้งเตือน" || t === "ปิดแจ้งเตือน") return "off";
  if (t === "เปิดแจ้งเตือน" || t === "รับแจ้งเตือน") return "on";

  // ถามถึงการปิด/เปิดแจ้งเตือน → ตอบวิธีแบบ deterministic ไม่เปลี่ยนค่า
  if (QUESTION_HINT.test(raw) && /(ปิด|หยุด|เปิด|รับ|ยกเลิก|เอาออก)/u.test(t)) return "help";
  return null;
}

export const DAILY_PICK_NOTIFY_HELP_TEXT =
  "ถ้าไม่อยากรับข้อความหนุนดวงตอนเช้า พิมพ์คำว่า หยุดแจ้งเตือน มาได้เลยครับ " +
  "อยากรับอีกครั้งพิมพ์ เปิดแจ้งเตือน ครับ";
