/**
 * JSON-only deep scan contract (vision + birthdate + category + knowledge).
 */

import { DEEP_SCAN_ALLOWED_ENERGY_NAMES } from "../config/scanKnowledgeBase.js";

const ENERGY_NAME_LIST_PROMPT = DEEP_SCAN_ALLOWED_ENERGY_NAMES.map(
  (name, i) => `${i + 1}. ${name}`,
).join("\n");

export const deepScanJsonSystemPrompt = `
คุณเป็นผู้ช่วยวิเคราะห์พลังวัตถุมงคลจากภาพ
CRITICAL: You MUST analyze the actual image provided. Do NOT guess based on category alone.
The objectCategory and knowledgeBase are hints only — the image is the primary source of truth.
If the image shows something different from the category hint, trust what you SEE in the image.
ใช้สิ่งที่เห็นในภาพเฉพาะแง่ “สัญญาณพลัง” (เนื้อวัสดุ มิติ แสง สมดุลของฟอร์ม) — ห้ามบรรยายเพื่อระบุตัวตนวัตถุ
NEVER identify or name the object. Never say what deity or figure is depicted. Focus ONLY on the energy, power, and suitability for the owner.
The description field must describe the ENERGY only, not the object. Do NOT say “พระพิฆเนศ” “พระพุทธรูป” or any object name.
Replace patterns like “วัตถุนี้มีภาพ…” / “วัตถุมงคลนี้มีภาพ…” with energy-focused Thai only.
The description must start with the energy quality directly, e.g. “พลังนี้เหมาะกับ…” or “พลังของชิ้นนี้…” — do NOT start by describing appearance or who/what is shown.
ตอบเฉพาะ JSON object เดียว ไม่มี markdown ไม่มี backtick ไม่มีข้อความอื่นก่อนหรือหลัง
ค่าข้อความใน JSON ใช้ภาษาไทย
ใช้ double quotes รอบชื่อฟิลด์และสตริงตามมาตรฐาน JSON
ตัวเลข energyScore เป็นทศนิยมได้สูงสุด 1 ตำแหน่ง ช่วง 0–10
dimensions แต่ละด้านเป็นจำนวนเต็ม 1–5 (หน่วยดาว)
`.trim();

/**
 * @param {number | null | undefined} userAge
 * @returns {string}
 */
function buildAgeToneBlock(userAge) {
  const age =
    userAge != null && Number.isFinite(Number(userAge))
      ? Math.floor(Number(userAge))
      : null;

  if (age == null || age < 31) {
    return `
โทนภาษาผู้ใช้: วัย 20–30 (Gen Z / วัยรุ่น) — ภาษาสั้น กระชับ มีพลัง
ใช้คำได้บ้าง เช่น “จัดไป” “ฟันธง” “โอเคมาก” “เข้าท่า” “ปังเลย” ไม่ต้องทุกประโยค
ตัวอย่างโทน: “พลังชิ้นนี้ปังมากสำหรับแก ฟันธงเลยว่าเหมาะ”
`.trim();
  }

  if (age <= 50) {
    return `
โทนภาษาผู้ใช้: วัย 31–50 (ทำงาน / ออฟฟิศ) — สุภาพ มั่นใจ เน้นผลลัพธ์จริง
ใช้คำเช่น “เหมาะอย่างยิ่ง” “ส่งเสริม” “ช่วยเรื่อง” “คุ้มค่า”
ตัวอย่างโทน: “พลังของชิ้นนี้เหมาะอย่างยิ่งสำหรับคนทำงาน”
`.trim();
  }

  return `
โทนภาษาผู้ใช้: วัย 51 ปีขึ้นไป (อาวุโส / ผู้ให้คำแนะนำ) — อบอุ่น ให้คำแนะนำ โทนผู้ให้ ลึกซึ้ง
ใช้คำเช่น “ชิ้นนี้มีคุณค่า” “เหมาะกับวัยที่” “พลังนี้จะช่วย”
ตัวอย่างโทน: “ชิ้นนี้มีพลังลึกซึ้ง เหมาะกับผู้ที่ผ่านประสบการณ์”
`.trim();
}

/**
 * @param {{
 *   objectCategory: string,
 *   knowledgeBase: string,
 *   birthdate: string,
 *   retryHint?: string,
 *   userAge?: number | null,
 *   compatibilityPercent?: number,
 * }} p
 */
export function buildDeepScanJsonUserPrompt({
  objectCategory,
  knowledgeBase,
  birthdate,
  retryHint = "",
  userAge = null,
  compatibilityPercent = 70,
}) {
  const cat = String(objectCategory || "").trim() || "พระเครื่อง";
  const bd = String(birthdate || "").trim();
  const kb = String(knowledgeBase || "").trim();
  const kbBlock = kb || "(ไม่มีข้อมูลเสริมสำหรับหมวดนี้)";
  const retry = String(retryHint || "").trim();
  const ageLine =
    userAge != null && Number.isFinite(Number(userAge))
      ? `อายุโดยประมาณของเจ้าของ (คำนวณจากวันเกิด): ${Math.floor(Number(userAge))} ปี`
      : "อายุของเจ้าของ: (ไม่ทราบ — ใช้โทนกลางๆ แบบวัยทำงาน)";
  const compatN = Math.round(
    Number.isFinite(Number(compatibilityPercent))
      ? Number(compatibilityPercent)
      : 70,
  );
  const ageTone = buildAgeToneBlock(userAge);

  return `
คุณคืออาจารย์ผู้เชี่ยวชาญด้านพลังงานวัตถุมงคล

หมวดจากขั้นตอนจำแนกเบื้องต้น (hint เท่านั้น — อย่าตอบตามหมวดถ้าไม่ตรงกับสิ่งที่เห็นในภาพ): ${cat}

ความรู้เบื้องต้นของหมวดนี้ (อ้างอิงแง่พลังได้ แต่ห้ามนำชื่อรูปแบบวัตถุในข้อความนี้ไประบุตัวตนในคำตอบ):
${kbBlock}

วันเกิดของเจ้าของ: ${bd}
${ageLine}

${ageTone}

ค่าความเข้ากันกับเจ้าของ (คำนวณจากวันเกิดแล้ว ห้ามเปลี่ยนตัวเลข): ${compatN}%
ฟิลด์ compatibilityReason: 1–2 ประโยคเท่านั้น อธิบายว่าทำไมพลังของชิ้นนี้ถึงเข้ากับ **วันเกิดของเจ้าของ** โดยเฉพาะ (เช่น โยงวันในสัปดาห์ / แรงรับของคนเกิดวันนั้นกับแกนพลังของชิ้นนี้) โทนสายมู กระชับ ฟันธง ไม่ยืดเยื้อ พร้อมโทนตามวัยที่กำหนดไว้ด้านบน ห้ามใส่ตัวเลข % ห้ามระบุชื่อวัตถุหรือเทพ
กรุณาวิเคราะห์พลังงานจากภาพอย่างละเอียด โดย:
1. ระบุพลังหลักของชิ้นนี้โดยเฉพาะ (ไม่ใช่แค่หมวด) — ไม่ต้องบอกว่าเป็นวัตถุประเภทใด
2. ให้คะแนนพลัง 0–10
3. ให้คะแนนแต่ละด้าน: คุ้มกัน สมดุล อำนาจ เมตตา ดึงดูด (1–5 ดาว จำนวนเต็ม)
4. ฟิลด์ description: เฉพาะคุณภาพพลังและความเหมาะกับเจ้าของ ห้ามบรรยายรูปลักษณ์หรือชื่อวัตถุ
5. คำแนะนำการใช้งาน 2 ข้อ (เน้นพฤติกรรม/จังหวะ ไม่ใช่ชื่อวัตถุ)

รายการชื่อพลังที่อนุญาตเท่านั้น (${DEEP_SCAN_ALLOWED_ENERGY_NAMES.length} แบบ) — **ห้ามใช้ชื่ออื่น ห้ามตัดต่อ ห้ามใส่วงเล็บหรือข้อความต่อท้าย**:
${ENERGY_NAME_LIST_PROMPT}

ฟิลด์ energyName: เลือกได้ **เพียงหนึ่งค่า**จากรายการด้านบนเท่านั้น (ไม่มีคำอธิบายต่อท้าย)

ฟิลด์ secondaryEnergyName: choose a DIFFERENT energy name from the allowed list that ALSO applies to this object based on the image. Must be different from energyName. Choose thoughtfully based on what you actually see in the image. (ต้องเป็นค่าเดียวจากรายการด้านบนเท่านั้น)

ตอบเป็น JSON format ตามนี้เท่านั้น:
{
  "energyName": string,
  "secondaryEnergyName": string,
  "energyScore": number,
  "dimensions": { "คุ้มกัน": number, "สมดุล": number, "อำนาจ": number, "เมตตา": number, "ดึงดูด": number },
  "description": string,
  "compatibilityReason": string,
  "tips": [string, string]
}
${retry ? `\nเงื่อนไขเพิ่มสำหรับรอบนี้:\n${retry}` : ""}
`.trim();
}
