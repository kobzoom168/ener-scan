/**
 * JSON-only deep scan contract (vision + birthdate + category + knowledge).
 */

export const deepScanJsonSystemPrompt = `
คุณเป็นผู้ช่วยวิเคราะห์พลังวัตถุมงคลจากภาพ
CRITICAL: You MUST analyze the actual image provided. Do NOT guess based on category alone.
The objectCategory and knowledgeBase are hints only — the image is the primary source of truth.
If the image shows something different from the category hint, trust what you SEE in the image.
Describe the specific object visible (pose, frame, material cues), not only the category name.
ตอบเฉพาะ JSON object เดียว ไม่มี markdown ไม่มี backtick ไม่มีข้อความอื่นก่อนหรือหลัง
ค่าข้อความใน JSON ใช้ภาษาไทย
ใช้ double quotes รอบชื่อฟิลด์และสตริงตามมาตรฐาน JSON
ตัวเลข energyScore เป็นทศนิยมได้สูงสุด 1 ตำแหน่ง ช่วง 0–10
dimensions แต่ละด้านเป็นจำนวนเต็ม 1–5 (หน่วยดาว)
`.trim();

/**
 * @param {{
 *   objectCategory: string,
 *   knowledgeBase: string,
 *   birthdate: string,
 *   retryHint?: string,
 * }} p
 */
export function buildDeepScanJsonUserPrompt({
  objectCategory,
  knowledgeBase,
  birthdate,
  retryHint = "",
}) {
  const cat = String(objectCategory || "").trim() || "พระเครื่อง";
  const bd = String(birthdate || "").trim();
  const kb = String(knowledgeBase || "").trim();
  const kbBlock = kb || "(ไม่มีข้อมูลเสริมสำหรับหมวดนี้)";
  const retry = String(retryHint || "").trim();

  return `
คุณคืออาจารย์ผู้เชี่ยวชาญด้านพลังงานวัตถุมงคล

หมวดจากขั้นตอนจำแนกเบื้องต้น (hint เท่านั้น — อย่าตอบตามหมวดถ้าไม่ตรงกับสิ่งที่เห็นในภาพ): ${cat}

ความรู้เบื้องต้นของหมวดนี้ (อ้างอิงได้ แต่ต้องสอดคล้องกับภาพจริง ห้ามคัดลอกชื่อวัตถุจากข้อความด้านล่างถ้าภาพไม่ใช่แบบนั้น):
${kbBlock}

วันเกิดของเจ้าของ: ${bd}

กรุณาวิเคราะห์พลังงานของวัตถุในภาพอย่างละเอียด โดย:
1. ระบุพลังหลักของวัตถุชิ้นนี้โดยเฉพาะ (ไม่ใช่แค่หมวด)
2. ให้คะแนนพลัง 0-10
3. ให้คะแนนแต่ละด้าน: คุ้มกัน สมดุล อำนาจ เมตตา ดึงดูด (1-5 ดาว เป็นจำนวนเต็ม)
4. อธิบายว่าเหมาะกับเจ้าของอย่างไรโดยอิงจากวันเกิด
5. คำแนะนำการใช้งาน 2 ข้อ

ตอบเป็น JSON format ตามนี้เท่านั้น:
{
  "energyName": string,
  "energyScore": number,
  "dimensions": { "คุ้มกัน": number, "สมดุล": number, "อำนาจ": number, "เมตตา": number, "ดึงดูด": number },
  "description": string,
  "compatibility": string,
  "tips": [string, string]
}
${retry ? `\nเงื่อนไขเพิ่มสำหรับรอบนี้:\n${retry}` : ""}
`.trim();
}
