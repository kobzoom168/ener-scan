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
ให้ข้อความกระชับ อ่านง่าย ดูเฉพาะชิ้น และหลีกเลี่ยงคำซ้ำจากเคสมาตรฐาน
${retryHint ? `\nเงื่อนไขเพิ่ม: ${retryHint}` : ""}
`;

  console.log("[OPENAI] generateScanText called");
  console.log("[OPENAI] birthdate:", birthdate);
  console.log("[OPENAI] retryHint:", retryHint || "none");
  console.log("[OPENAI] imageBase64 exists:", Boolean(imageBase64));

  const startedAt = Date.now();
  console.log("[OPENAI_TIMING] startedAt:", startedAt);

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0.8,
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

    const endedAt = Date.now();
    const elapsedMs = endedAt - startedAt;
    const elapsedSec = (elapsedMs / 1000).toFixed(2);

    const outputText = (response.output_text || "").trim();

    console.log("[OPENAI] output length:", outputText.length);
    console.log("[OPENAI_TIMING] endedAt:", endedAt);
    console.log("[OPENAI_TIMING] elapsedMs:", elapsedMs);
    console.log("[OPENAI_TIMING] elapsedSec:", elapsedSec);

    return outputText;
  } catch (error) {
    const endedAt = Date.now();
    const elapsedMs = endedAt - startedAt;
    const elapsedSec = (elapsedMs / 1000).toFixed(2);

    console.error("[OPENAI] request failed:", error?.message || error);
    console.error("[OPENAI_TIMING] failedAt:", endedAt);
    console.error("[OPENAI_TIMING] elapsedMs_before_fail:", elapsedMs);
    console.error("[OPENAI_TIMING] elapsedSec_before_fail:", elapsedSec);

    throw error;
  }
}