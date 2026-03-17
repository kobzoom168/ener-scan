import OpenAI from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/*
ผลลัพธ์ที่คืน

single_supported = มีวัตถุหลัก 1 ชิ้น และเป็นประเภทที่ Ener Scan รองรับ
multiple         = มีหลายชิ้น
unclear          = ภาพไม่ชัด / ไม่แน่ใจ
unsupported      = มี 1 ชิ้น แต่ไม่ใช่ประเภทที่ Ener Scan รองรับ
*/

function buildObjectCheckPrompt() {
  return `
ตรวจสอบภาพนี้ แล้วตอบเพียงคำเดียวจากตัวเลือกด้านล่าง

คำอธิบายระบบ:
Ener Scan รองรับเฉพาะ
- พระเครื่อง
- เครื่องราง
- คริสตัล / หิน
- วัตถุสายพลังที่เป็นชิ้นเดี่ยว

กติกา:
- single_supported = มีวัตถุหลัก 1 ชิ้น และเป็นประเภทที่ระบบรองรับ
- multiple = มีวัตถุมากกว่า 1 ชิ้น หรือเป็นภาพรวมที่มีของหลายอย่าง
- unclear = ภาพไม่ชัด มืด เบลอ ไกลเกินไป หรือไม่แน่ใจ
- unsupported = มีวัตถุหลัก 1 ชิ้น แต่ไม่ใช่ประเภทที่ระบบรองรับ เช่น โต๊ะทำงาน ห้อง คอมพิวเตอร์ ของใช้ทั่วไป เอกสาร คน สัตว์ อาหาร วิว

สำคัญ:
- ถ้าเป็นภาพโต๊ะ ห้อง ฉากกว้าง หรือมีของหลายอย่าง ให้ตอบ multiple
- ถ้าเป็นของใช้ทั่วไปที่ไม่ใช่วัตถุสายพลัง ให้ตอบ unsupported
- ถ้าไม่มั่นใจระหว่าง single_supported กับ unsupported ให้ตอบ unsupported
- ห้ามอธิบายเพิ่ม
- ตอบเพียงคำเดียวเท่านั้น

ตัวเลือกคำตอบ:
single_supported
multiple
unclear
unsupported
  `.trim();
}

function normalizeObjectCheckOutput(text) {
  const output = String(text || "").trim().toLowerCase();

  if (output === "multiple" || output.includes("multiple")) {
    return "multiple";
  }

  if (output === "unclear" || output.includes("unclear")) {
    return "unclear";
  }

  if (output === "unsupported" || output.includes("unsupported")) {
    return "unsupported";
  }

  if (
    output === "single_supported" ||
    output.includes("single_supported")
  ) {
    return "single_supported";
  }

  return null;
}

export async function checkSingleObject(imageBase64) {
  const cleanImageBase64 = String(imageBase64 || "").trim();

  console.log("[OBJECT_CHECK] start");
  console.log("[OBJECT_CHECK] imageBase64 length:", cleanImageBase64.length);

  if (!cleanImageBase64) {
    console.log("[OBJECT_CHECK] empty imageBase64 -> fallback unsupported");
    return "unsupported";
  }

  const startedAt = Date.now();

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      max_output_tokens: 20,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildObjectCheckPrompt(),
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${cleanImageBase64}`,
            },
          ],
        },
      ],
    });

    const rawOutput = String(response.output_text || "").trim();
    const normalized = normalizeObjectCheckOutput(rawOutput);

    const endedAt = Date.now();
    const elapsed = endedAt - startedAt;

    console.log("[OBJECT_CHECK] raw result:", rawOutput || "-");
    console.log("[OBJECT_CHECK] normalized result:", normalized || "invalid");
    console.log("[OBJECT_CHECK] elapsedMs:", elapsed);

    if (normalized) {
      return normalized;
    }

    console.log("[OBJECT_CHECK] invalid output -> fallback unsupported");
    return "unsupported";
  } catch (error) {
    const endedAt = Date.now();
    const elapsed = endedAt - startedAt;

    console.error("[OBJECT_CHECK] failed:", error?.message || error);
    console.error("[OBJECT_CHECK] elapsedMs_before_fail:", elapsed);

    // ถ้า AI ล้มเหลว ไม่ควรปล่อยผ่านเป็น single
    // ให้ถือว่าไม่รองรับไว้ก่อนเพื่อกันผลสแกนมั่ว
    return "unsupported";
  }
}