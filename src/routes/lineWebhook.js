import line from "@line/bot-sdk";

import {
  getSession,
  setPendingImage,
  setBirthdate,
  clearSession,
} from "../stores/session.store.js";

import { getImageBufferFromLineMessage } from "../services/image.service.js";
import { isDuplicateImage } from "../services/dedupe.service.js";
import { runDeepScan } from "../services/scan.service.js";

import { replyText, replyFlex } from "../services/lineReply.service.js";
import { buildScanFlex } from "../services/flex.service.js";

function isValidBirthdate(text) {
  return /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(String(text || "").trim());
}

function buildStartInstructionText() {
  return [
    "ได้รับภาพแล้วครับ ✨",
    "กรุณาถ่ายวัตถุ 1 ชิ้นต่อ 1 รูป",
    "หากมีหลายชิ้น กรุณาแยกส่งทีละภาพ",
    "",
    "รบกวนพิมพ์วันเกิดของเจ้าของวัตถุ เช่น",
    "14/09/1995",
  ].join("\n");
}

function buildMultipleObjectsText() {
  return [
    "🔍 Ener Scan",
    "",
    "ระบบพบว่าวัตถุในภาพมีมากกว่า 1 ชิ้น",
    "เพื่อให้การวิเคราะห์ชัดเจน",
    "กรุณาถ่ายวัตถุเพียง 1 ชิ้นต่อ 1 รูป",
    "",
    "แล้วส่งมาใหม่อีกครั้งครับ",
  ].join("\n");
}

function buildUnclearImageText() {
  return [
    "ภาพยังไม่ชัดเจนพอสำหรับการวิเคราะห์",
    "ลองถ่ายใหม่ให้เห็นวัตถุชัด ๆ",
    "และให้มีเพียง 1 ชิ้นต่อ 1 รูปครับ",
  ].join("\n");
}

export function lineWebhookRouter(lineConfig) {
  const client = new line.Client(lineConfig);

  return async (req, res) => {
    try {
      const events = Array.isArray(req.body.events) ? req.body.events : [];

      console.log("========== LINE WEBHOOK ==========");
      console.log("event count:", events.length);

      await Promise.all(
        events.map(async (event, index) => {
          try {
            console.log(`\n----- event #${index + 1} -----`);
            console.log("type:", event.type);
            console.log("userId:", event.source?.userId || "no-user-id");
            console.log("message type:", event.message?.type || "no-message-type");
            console.log("timestamp:", event.timestamp || "no-timestamp");

            await handleEvent({ client, event });

            console.log(`event #${index + 1} handled successfully`);
          } catch (err) {
            console.error(`event #${index + 1} error:`, err);

            if (event.replyToken) {
              try {
                await replyText(
                  client,
                  event.replyToken,
                  "ขออภัยครับ ระบบขัดข้องชั่วคราว ลองส่งใหม่อีกครั้งได้เลยครับ"
                );
              } catch (replyErr) {
                console.error("fallback error reply failed:", replyErr);
              }
            }
          }
        })
      );

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("webhook fatal:", error);
      res.status(500).json({ error: "webhook_failed" });
    }
  };
}

async function handleEvent({ client, event }) {
  if (event.type !== "message") {
    console.log("skip: not message event");
    return;
  }

  if (!event.replyToken) {
    console.log("skip: no reply token");
    return;
  }

  const userId = event.source?.userId;

  if (!userId) {
    console.log("stop: no userId");
    await replyText(client, event.replyToken, "ไม่พบข้อมูลผู้ใช้ครับ");
    return;
  }

  const session = getSession(userId);

  console.log("session:", {
    hasPendingImage: Boolean(session.pendingImage),
    birthdate: session.birthdate || null,
  });

  /*
   * -------------------------
   * IMAGE MESSAGE
   * -------------------------
   */
  if (event.message?.type === "image") {
    console.log("step: received image");

    // ถ้ามี pendingImage อยู่แล้ว แปลว่าระบบกำลังรอวันเกิด
    // ให้ ignore รูปใหม่ เพื่อกันเคสส่งหลายรูปติดกันแล้ว bot ตอบหลายครั้ง
    if (session.pendingImage) {
      console.log("ignore image: already waiting for birthdate");
      return;
    }

    const imageBuffer = await getImageBufferFromLineMessage(
      client,
      event.message.id
    );

    console.log("image size:", imageBuffer.length);

    const isDuplicate = await isDuplicateImage(imageBuffer);
    console.log("is duplicate:", isDuplicate);

    if (isDuplicate) {
      await replyText(
        client,
        event.replyToken,
        "🔍 Ener Scan\n\nระบบพบว่ารูปนี้เคยถูกสแกนแล้ว\nหากต้องการวิเคราะห์ใหม่ กรุณาส่งภาพใหม่ของวัตถุครับ"
      );
      return;
    }

    setPendingImage(userId, {
      messageId: event.message.id,
      imageBuffer,
    });

    console.log("pending image saved");
    await replyText(client, event.replyToken, buildStartInstructionText());
    return;
  }

  /*
   * -------------------------
   * TEXT MESSAGE
   * -------------------------
   */
  if (event.message?.type === "text") {
    const text = String(event.message.text || "").trim();

    console.log("step: received text");
    console.log("text:", text);

    if (!session.pendingImage) {
      await replyText(
        client,
        event.replyToken,
        [
          "ส่งรูปวัตถุมาได้เลยครับ",
          "กรุณาถ่ายวัตถุ 1 ชิ้นต่อ 1 รูป",
          "แล้วผมจะให้กรอกวันเกิดเจ้าของต่อให้",
        ].join("\n")
      );
      return;
    }

    if (!isValidBirthdate(text)) {
      await replyText(
        client,
        event.replyToken,
        "รูปแบบวันเกิดยังไม่ถูกครับ\nลองพิมพ์แบบ\n14/09/1995"
      );
      return;
    }

    setBirthdate(userId, text);
    console.log("birthdate saved");

    let resultText = "";

    try {
      console.log("running deep scan...");

      resultText = await runDeepScan({
        imageBuffer: session.pendingImage.imageBuffer,
        birthdate: text,
        userId,
      });

      console.log("scan finished, result length:", resultText.length);
    } catch (err) {
      console.error("scan error:", err);

      if (err.message === "multiple_objects_detected") {
        await replyText(client, event.replyToken, buildMultipleObjectsText());
        clearSession(userId);
        console.log("session cleared after multiple_objects_detected");
        return;
      }

      if (err.message === "image_unclear") {
        await replyText(client, event.replyToken, buildUnclearImageText());
        clearSession(userId);
        console.log("session cleared after image_unclear");
        return;
      }

      clearSession(userId);
      console.log("session cleared after unexpected scan error");
      throw err;
    }

    try {
      const flex = buildScanFlex(resultText);

      console.log("trying flex reply...");
      await replyFlex(client, event.replyToken, flex);
      console.log("flex reply success");
    } catch (flexError) {
      console.error("flex failed:", flexError);

      await replyText(client, event.replyToken, resultText);
      console.log("text fallback success");
    }

    clearSession(userId);
    console.log("session cleared after success");
    return;
  }

  console.log("skip: unsupported message type");
}