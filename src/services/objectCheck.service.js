import { env } from "../config/env.js";
import { openai, withOpenAi429RetryOnce } from "./openaiDeepScan.api.js";

const OBJECT_CHECK_PROVIDER = "openai.responses";
const OBJECT_CHECK_MODEL = "gpt-4.1-mini";
const OBJECT_CHECK_TIMEOUT_MS = Number(env.OBJECT_CHECK_TIMEOUT_MS || 35000);
const OBJECT_CHECK_MAX_RETRIES = Number(env.OBJECT_CHECK_MAX_RETRIES || 0);

/*
ผลลัพธ์ที่คืน

single_supported = มีวัตถุสายพลังหลัก 1 ชิ้นเท่านั้น และเป็นประเภทที่ Ener Scan รองรับ
multiple         = มีหลายชิ้น / หลายรูป / คอลลาจ / screenshot รวมหลายภาพ / มีวัตถุเด่นมากกว่า 1 ชิ้น
unclear          = ภาพไม่ชัด / มืด / เบลอ / ไกลเกินไป / มองไม่แน่ใจ
unsupported      = มี 1 ชิ้น แต่ไม่ใช่ประเภทที่ Ener Scan รองรับ
*/

/**
 * If the model echoes a reason that clearly names a non-amulet subject,
 * treat as unsupported even when it also mentions single_supported.
 */
function outputSuggestsNonAmuletSubject(outputLower) {
  const hints = [
    "อาหาร",
    "ก๋วยเตี๋ยว",
    "ซุป",
    "เครื่องดื่ม",
    "ขนม",
    "coffee",
    "เบอร์เกอร์",
    "food",
    "soup",
    "noodle",
    "meal",
    "breakfast",
    "lunch",
    "dinner",
    "cuisine",
    "beverage",
    "snack",
    "fruit",
    "salad",
    "dessert",
    "human",
    "person",
    "people",
    "portrait",
    "selfie",
    "face",
    "body",
    "child",
    "man",
    "woman",
    "ใบหน้า",
    "ร่างกาย",
    "เซลฟี่",
    "ถ่ายคน",
    "animal",
    "สัตว์",
    "แมว",
    "หมา",
    "น้องหมา",
    "bird",
    "document",
    "เอกสาร",
    "screenshot",
    "หน้าจอ",
    "กระดาษ",
    "receipt",
    "สลิป",
    "landscape",
    "scenery",
    "ทิวทัศน์",
    "วิว",
    "mountain",
    "ท้องฟ้า",
    "ทะเล",
    "beach",
    "skyline",
    "ไม่ใช่วัตถุมงคล",
    "ไม่ใช่พระ",
    "not an amulet",
    "not sacred",
  ];
  return hints.some((h) => outputLower.includes(h));
}

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

  if (output.includes("single_supported") && outputSuggestsNonAmuletSubject(output)) {
    return "unsupported";
  }

  if (output.includes("single_supported")) {
    return "single_supported";
  }

  if (outputSuggestsNonAmuletSubject(output)) {
    return "unsupported";
  }

  return "unsupported";
}

export async function checkSingleObject(imageBase64) {
  const base64Len = imageBase64?.length || 0;
  const imageBytesApprox = Math.max(0, Math.floor((base64Len * 3) / 4));
  const startedAt = Date.now();
  const maxAttempts = Math.max(1, 1 + OBJECT_CHECK_MAX_RETRIES);

  console.log(
    JSON.stringify({
      event: "OBJECT_CHECK_START",
      provider: OBJECT_CHECK_PROVIDER,
      model: OBJECT_CHECK_MODEL,
      imageBase64Length: base64Len,
      imageBytesApprox,
      timeoutMs: OBJECT_CHECK_TIMEOUT_MS,
      maxAttempts,
    }),
  );

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      const response = await Promise.race([
        withOpenAi429RetryOnce(() => {
          const model = OBJECT_CHECK_MODEL;
          console.log("[OPENAI_MODEL]", model);
          return openai.responses.create({
            model,
            temperature: 0,
            input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `
ตรวจสอบภาพนี้ แล้วตอบเพียงคำเดียวจากตัวเลือกด้านล่าง (ห้ามตอบคำอื่น)

คำอธิบายระบบ:
Ener Scan รองรับเฉพาะวัตถุมงคล/พลังแบบชิ้นเดียวที่ชัดเจน:
- พระเครื่อง, เครื่องราง, คริสตัล/หินที่ถือเป็นวัตถุเด่น, พระบูชา, วัตถุมงคล
- เครื่องประดับสายพลังที่รวมเป็นวัตถุ 1 ชิ้น เช่น สร้อย 1 เส้น กำไล 1 วง ลูกประคำ 1 วง

ต้องตอบ unsupported ทันที (แม้มีแค่ชิ้นเดียวในภาพ) หากเป็นหัวข้อใดหนึ่งต่อไปนี้:
- อาหาร เครื่องดื่ม ขนม ก๋วยเตี๋ยว ซุป จานอาหาร หรือสิ่งที่เป็นหลักของภาพเป็นอาหาร/เครื่องดื่ม
- คน ใบหน้า ร่างกาย เซลฟี่ ภาพถ่ายบุคคล หรือคนเป็นจุดเด่นของภาพ
- สัตว์ (เลี้ยงหรือป่า) เป็นหลักของภาพ
- เอกสาร กระดาษ หนังสือ บัตร สลิป หรือภาพ screenshot/แคปหน้าจอ ข้อความแชท แอป
- ทิวทัศน์ วิวธรรมชาติ ทะเล ภูเขา ท้องฟ้า ถนน ฉากกว้างที่ไม่มีวัตถุมงคลชิ้นเดียวเป็นจุดเด่น
- ของใช้ทั่วไป ของเล่น อุปกรณ์ ยานพาหนะ ของตกแต่งบ้าน ที่ไม่ใช่วัตถุมงคลตามรายการรองรับด้านบน

กติกาตัดสิน:
- single_supported = วัตถุมงคล/พลังหลัก 1 ชิ้น (ประเภทที่รองรับ) และภาพชัดพอประเมิน
- multiple = วัตถุมงคลแยกกันมากกว่า 1 ชิ้น / หลายรูปในภาพเดียว / คอลลาจ / screenshot รวมหลายภาพ
- unclear = ภาพมืด เบลอ ไกลเกินไป หรือมองไม่ชัดว่ามีวัตถุอะไร
- unsupported = ไม่ใช่วัตถุที่รองรับ (รวมทั้งกรณีด้านบน: อาหาร คน สัตว์ เอกสาร ทิวทัศน์ ฯลฯ)

สำคัญมาก:
- ถ้าหลักของภาพเป็นอาหารหรือเครื่องดื่ม ให้ตอบ unsupported เสมอ (ไม่ใช่ single_supported)
- ถ้าเป็นสร้อย 1 เส้น, กำไล 1 วง, ลูกประคำ 1 วง หรือวัตถุที่หลายเม็ดแต่รวมเป็นชิ้นเดียว ให้ตอบ single_supported
- ห้ามนับเม็ดหิน/ลูกปัดของวัตถุเดียวเป็น multiple
- multiple เฉพาะเมื่อมีวัตถุแยกกันหลายชิ้นจริง ๆ หรือคอลลาจ/screenshot หลายภาพ
- ถ้าไม่มั่นใจระหว่าง single_supported กับ multiple ให้ตอบ multiple
- ถ้าไม่มั่นใจระหว่าง single_supported กับ unsupported ให้ตอบ unsupported
- ห้ามอธิบาย ห้ามใส่ประโยค ตอบเพียงหนึ่งคำจากรายการเท่านั้น

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
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("object_check_timeout")), OBJECT_CHECK_TIMEOUT_MS),
        ),
      ]);

      const normalized = normalizeObjectCheckOutput(response?.output_text || "");
      const endedAt = Date.now();
      console.log(
        JSON.stringify({
          event: "OBJECT_CHECK_END",
          provider: OBJECT_CHECK_PROVIDER,
          model: OBJECT_CHECK_MODEL,
          attempt,
          attemptsTotal: maxAttempts,
          result: normalized,
          elapsedMs: endedAt - startedAt,
          attemptElapsedMs: endedAt - attemptStartedAt,
          endCause: "success",
        }),
      );
      return normalized;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || "");
      const timeout = /timeout/i.test(message);
      const status = Number(error?.status || 0);
      const retryable =
        timeout ||
        status === 408 ||
        status === 409 ||
        status === 429 ||
        status >= 500;
      const willRetry = retryable && attempt < maxAttempts;
      console.error(
        JSON.stringify({
          event: "OBJECT_CHECK_FAIL",
          provider: OBJECT_CHECK_PROVIDER,
          model: OBJECT_CHECK_MODEL,
          attempt,
          attemptsTotal: maxAttempts,
          timeout,
          retryable,
          willRetry,
          status: Number.isFinite(status) ? status : 0,
          message,
          elapsedMs: Date.now() - startedAt,
          attemptElapsedMs: Date.now() - attemptStartedAt,
          endCause: willRetry ? "retry" : "fallback_unsupported",
        }),
      );
      if (!willRetry) break;
    }
  }

  console.error("[OBJECT_CHECK] failed:", lastError?.message || lastError);
  return "unsupported";
}