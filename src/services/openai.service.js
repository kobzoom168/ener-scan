import OpenAI from "openai";
import { env } from "../config/env.js";
import { deepScanSystemPrompt } from "../prompts/deepScan.prompt.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export async function generateScanText({
  imageBase64,
  birthdate,
  retryHint = "",
}) {
  const userPrompt = `
ข้อมูลเจ้าของ:
วันเกิด: ${birthdate}

คำสั่ง:
ช่วยอ่านพลังจากภาพวัตถุนี้ตาม format ที่กำหนด
${retryHint ? `\nเงื่อนไขเพิ่ม: ${retryHint}` : ""}
`;

  console.log("generateScanText called");
  console.log("birthdate:", birthdate);
  console.log("retryHint:", retryHint || "none");
  console.log("imageBase64 exists:", Boolean(imageBase64));

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    temperature: 0.6,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: deepScanSystemPrompt,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: userPrompt,
          },
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${imageBase64}`,
          },
        ],
      },
    ],
  });

  const outputText = (response.output_text || "").trim();
  console.log("openai output length:", outputText.length);

  return outputText;
}