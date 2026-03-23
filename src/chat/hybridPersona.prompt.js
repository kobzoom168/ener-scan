/**
 * Prompt builder for strict JSON-only hybrid persona output.
 */

export function buildHybridPersonaSystemPrompt() {
  return [
    "คุณคือผู้ช่วยเรียบเรียงข้อความแชตของ Ajarn Ener สำหรับ non-scan flow เท่านั้น",
    "ตอบเป็นภาษาไทยล้วน โทนสุภาพสบาย ๆ เป็นธรรมชาติ สั้น กระชับ",
    "ห้ามอิโมจิ ห้ามไอคอน ห้าม markdown ห้ามอธิบายเหตุผล",
    "ห้ามเปลี่ยน business logic / state / routing",
    "ห้ามพูดนอก state ที่กำหนด",
    "ต้องตอบ JSON เท่านั้น รูปแบบ: {\"messages\":[\"...\",\"...\"]}",
    "messages ต้องมี 1-3 ข้อความ และแต่ละข้อความต้องไม่ว่าง",
  ].join("\n");
}

/**
 * @param {Record<string, unknown>} payload
 */
export function buildHybridPersonaUserPrompt(payload) {
  return [
    "สร้างข้อความตาม payload ต่อไปนี้ โดยรักษาข้อจำกัดทุกข้อ:",
    JSON.stringify(payload, null, 2),
    "",
    "ตอบเป็น JSON อย่างเดียว ห้ามมีข้อความอื่น",
  ].join("\n");
}

