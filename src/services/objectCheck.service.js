import OpenAI from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/*
ผลลัพธ์ที่คืน

single_supported = มีวัตถุสายพลังหลัก 1 ชิ้นเท่านั้น และเป็นประเภทที่ Ener Scan รองรับ
multiple         = มีหลายชิ้น / หลายรูป / คอลลาจ / screenshot รวมหลายภาพ / มีวัตถุเด่นมากกว่า 1 ชิ้น
unclear          = ภาพไม่ชัด / มืด / เบลอ / ไกลเกินไป / มองไม่แน่ใจ
unsupported      = มี 1 ชิ้น แต่ไม่ใช่ประเภทที่ Ener Scan รองรับ
*/

function normalizeObjectCheckOutput(outputText) {
  const output = String(outputText || "").trim().toLowerCase();

  console.log("[OBJECT_CHECK] raw result:", output);

  if (
    output.includes("multiple") ||
    output.includes("many") ||
    output.includes("several") ||
    output.includes("more than one") ||
    output.includes("หลาย") ||
    output.includes("มากกว่า 1") ||
    output.includes("มากกว่า1") ||
    output.includes("หลายชิ้น") ||
    output.includes("คอลลาจ") ||
    output.includes("collage") ||
    output.includes("หลายรูป")
  ) {
    return "multiple";
  }

  if (
    output.includes("unclear") ||
    output.includes("blur") ||
    output.includes("blurry") ||
    output.includes("ไม่ชัด") ||
    output.includes("เบลอ") ||
    output.includes("มืด")
  ) {
    return "unclear";
  }

  if (
    output.includes("unsupported") ||
    output.includes("not supported") ||
    output.includes("ไม่รองรับ")
  ) {
    return "unsupported";
  }

  if (output.includes("single_supported")) {
    return "single_supported";
  }

  return "unsupported";
}

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

กติกาตัดสิน:
- single_supported = มีวัตถุหลักเพียง 1 ชิ้นเท่านั้น และเป็นประเภทที่ระบบรองรับ
- multiple = มีวัตถุมากกว่า 1 ชิ้น, มีหลายรูปในภาพเดียว, เป็นภาพคอลลาจ, เป็น screenshot ที่รวมหลายภาพ, หรือมีหลายวัตถุที่ควรแยกส่ง
- unclear = ภาพไม่ชัด มืด เบลอ ไกลเกินไป หรือไม่แน่ใจ
- unsupported = มีวัตถุหลัก 1 ชิ้น แต่ไม่ใช่ประเภทที่ระบบรองรับ

สำคัญมาก:
- ถ้ามีพระ 2 องค์, เครื่องราง 2 ชิ้น, หินหลายก้อน, หรือวัตถุสายพลังหลายชิ้นในภาพเดียว ให้ตอบ multiple
- ถ้าเป็นภาพรวมหลายช่อง / คอลลาจ / รวมหลายรูปในภาพเดียว ให้ตอบ multiple
- ถ้ามีวัตถุรองอื่นปรากฏร่วมกับวัตถุหลักอย่างชัดเจน ให้ตอบ multiple
- ห้ามตอบ single_supported ถ้าในภาพไม่ได้มีเพียง 1 ชิ้นจริง ๆ
- ต่อให้ทุกชิ้นในภาพเป็นของที่ระบบรองรับ ก็ยังต้องตอบ multiple ถ้ามีมากกว่า 1 ชิ้น
- ถ้าไม่มั่นใจระหว่าง single_supported กับ multiple ให้ตอบ multiple
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

    const normalized = normalizeObjectCheckOutput(response.output_text || "");

    const endedAt = Date.now();
    const elapsed = endedAt - startedAt;

    console.log("[OBJECT_CHECK] normalized result:", normalized);
    console.log("[OBJECT_CHECK] elapsedMs:", elapsed);

    return normalized;
  } catch (error) {
    console.error("[OBJECT_CHECK] failed:", error?.message || error);
    return "unsupported";
  }
}