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

export async function checkSingleObject(imageBase64) {
  console.log("[OBJECT_CHECK] start");
  console.log("[OBJECT_CHECK] imageBase64 length:", imageBase64?.length || 0);

  const startedAt = Date.now();

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
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
              `,
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${imageBase64}`,
            },
          ],
        },
      ],
    });

    const output = (response.output_text || "").trim().toLowerCase();

    const endedAt = Date.now();
    const elapsed = endedAt - startedAt;

    console.log("[OBJECT_CHECK] raw result:", output);
    console.log("[OBJECT_CHECK] elapsedMs:", elapsed);

    if (output.includes("multiple")) {
      return "multiple";
    }

    if (output.includes("unclear")) {
      return "unclear";
    }

    if (output.includes("unsupported")) {
      return "unsupported";
    }

    if (output.includes("single_supported")) {
      return "single_supported";
    }

    // fallback กรณี model ตอบหลุด format
    console.log("[OBJECT_CHECK] fallback to unsupported");
    return "unsupported";
  } catch (error) {
    console.error("[OBJECT_CHECK] failed:", error?.message || error);

    // ถ้า AI ล้มเหลว ไม่ควรปล่อยผ่านเป็น single แล้ว
    // ให้ถือว่าไม่รองรับไว้ก่อนเพื่อกันผลสแกนมั่ว
    return "unsupported";
  }
}