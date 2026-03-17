import OpenAI from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/*
ผลลัพธ์ที่คืน

single   = มีวัตถุหลัก 1 ชิ้น
multiple = มีหลายชิ้น
unclear  = ภาพไม่ชัด / มองไม่ออก
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
ตรวจสอบภาพนี้

คำถาม:
ภาพนี้มี "วัตถุหลัก" กี่ชิ้น

กติกา:
- single = มีวัตถุหลัก 1 ชิ้น
- multiple = มีมากกว่า 1 ชิ้น
- unclear = ภาพไม่ชัดหรือไม่แน่ใจ

ตอบเพียงคำเดียว:
single
multiple
unclear
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

    console.log("[OBJECT_CHECK] result:", output);
    console.log("[OBJECT_CHECK] elapsedMs:", elapsed);

    if (
      output.includes("multiple")
    ) {
      return "multiple";
    }

    if (
      output.includes("unclear")
    ) {
      return "unclear";
    }

    return "single";

  } catch (error) {

    console.error(
      "[OBJECT_CHECK] failed:",
      error?.message || error
    );

    // ถ้า AI ล้มเหลว ให้ผ่านไปก่อน
    return "single";
  }
}