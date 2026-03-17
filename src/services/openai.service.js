import OpenAI from "openai";
import { env } from "../config/env.js";
import { deepScanSystemPrompt } from "../prompts/deepScan.prompt.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

function buildUserPrompt({ birthdate, retryHint = "" }) {
  const cleanBirthdate = String(birthdate || "").trim();
  const cleanRetryHint = String(retryHint || "").trim();

  return `
ข้อมูลเจ้าของวัตถุ:
วันเกิด: ${cleanBirthdate}

คำสั่ง:
ช่วยอ่านพลังจากภาพวัตถุนี้ตาม format ที่กำหนดไว้เท่านั้น
ต้องตอบให้กระชับ อ่านง่าย ดูเฉพาะชิ้น และฟังดูเป็นคำอ่านจริง ไม่ใช่ข้อความสำเร็จรูป
ห้ามเพิ่มหัวข้อใหม่
ห้ามอธิบายเกิน format
ห้ามใช้ภาษาอังกฤษ
ภาพรวมต้องมี 2 ประโยคเท่านั้น
หัวข้อ "ปิดท้าย" ต้องมี 1 ประโยคเท่านั้น
ถ้าพลังของภาพไม่ชัด ให้ยังตอบตาม format เดิม แต่ใช้ภาษาที่นุ่มและน่าเชื่อถือ
${cleanRetryHint ? `\nเงื่อนไขเพิ่มสำหรับรอบนี้:\n${cleanRetryHint}` : ""}
`.trim();
}

function validateInput({ imageBase64, birthdate }) {
  const cleanBirthdate = String(birthdate || "").trim();
  const cleanImageBase64 = String(imageBase64 || "").trim();

  if (!cleanBirthdate) {
    throw new Error("birthdate is required");
  }

  if (!cleanImageBase64) {
    throw new Error("imageBase64 is required");
  }

  return {
    cleanBirthdate,
    cleanImageBase64,
  };
}

export async function generateScanText({
  imageBase64,
  birthdate,
  retryHint = "",
}) {
  const { cleanBirthdate, cleanImageBase64 } = validateInput({
    imageBase64,
    birthdate,
  });

  const userPrompt = buildUserPrompt({
    birthdate: cleanBirthdate,
    retryHint,
  });

  console.log("[OPENAI] generateScanText called");
  console.log("[OPENAI] birthdate:", cleanBirthdate);
  console.log("[OPENAI] retryHint:", retryHint ? "provided" : "none");
  console.log("[OPENAI] imageBase64 exists:", Boolean(cleanImageBase64));

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
              image_url: `data:image/jpeg;base64,${cleanImageBase64}`,
            },
          ],
        },
      ],
    });

    const endedAt = Date.now();
    const elapsedMs = endedAt - startedAt;
    const elapsedSec = (elapsedMs / 1000).toFixed(2);

    const outputText = String(response.output_text || "").trim();

    console.log("[OPENAI] output length:", outputText.length);
    console.log("[OPENAI] output preview:", outputText.slice(0, 160));
    console.log("[OPENAI_TIMING] endedAt:", endedAt);
    console.log("[OPENAI_TIMING] elapsedMs:", elapsedMs);
    console.log("[OPENAI_TIMING] elapsedSec:", elapsedSec);

    if (!outputText) {
      throw new Error("OpenAI returned empty output_text");
    }

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