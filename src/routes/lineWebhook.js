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
            console.log("userId:", event.source?.userId);
            console.log("message type:", event.message?.type);

            await handleEvent({ client, event });
          } catch (err) {
            console.error("event error:", err);

            if (event.replyToken) {
              await replyText(
                client,
                event.replyToken,
                "ขออภัยครับ ระบบขัดข้องชั่วคราว ลองส่งใหม่อีกครั้งได้เลยครับ"
              );
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
  if (event.type !== "message") return;
  if (!event.replyToken) return;

  const userId = event.source?.userId;

  if (!userId) {
    await replyText(client, event.replyToken, "ไม่พบข้อมูลผู้ใช้ครับ");
    return;
  }

  const session = getSession(userId);

  console.log("session:", {
    pendingImage: !!session.pendingImage,
    birthdate: session.birthdate || null,
  });

  /*
  -------------------------
  IMAGE MESSAGE
  -------------------------
  */

  if (event.message.type === "image") {
    console.log("received image");

    // 🔒 กันส่งหลายรูปตอนรอ birthdate
    if (session.pendingImage) {
      console.log("ignore image: already waiting birthdate");
      return;
    }

    const imageBuffer = await getImageBufferFromLineMessage(
      client,
      event.message.id
    );

    console.log("image size:", imageBuffer.length);

    const isDuplicate = await isDuplicateImage(imageBuffer);

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

    await replyText(
      client,
      event.replyToken,
      "ได้รับภาพแล้วครับ ✨\nกรุณาถ่ายวัตถุ 1 ชิ้นต่อ 1 รูป\n\nรบกวนพิมพ์วันเกิดของเจ้าของวัตถุ เช่น\n14/09/1995"
    );

    return;
  }

  /*
  -------------------------
  TEXT MESSAGE
  -------------------------
  */

  if (event.message.type === "text") {
    const text = event.message.text?.trim();

    if (!session.pendingImage) {
      await replyText(
        client,
        event.replyToken,
        "ส่งรูปวัตถุมาได้เลยครับ แล้วผมจะให้กรอกวันเกิดเจ้าของต่อให้"
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

    console.log("running scan...");

    let resultText;

    try {
      resultText = await runDeepScan({
        imageBuffer: session.pendingImage.imageBuffer,
        birthdate: text,
        userId,
      });
    } catch (err) {
      console.error("scan error:", err);

      if (err.message === "multiple_objects_detected") {
        await replyText(
          client,
          event.replyToken,
          "กรุณาถ่ายภาพวัตถุเพียง 1 ชิ้นต่อ 1 รูป แล้วส่งมาอีกครั้งครับ"
        );
        clearSession(userId);
        return;
      }

      if (err.message === "image_unclear") {
        await replyText(
          client,
          event.replyToken,
          "ภาพยังไม่ชัดเจนพอสำหรับการวิเคราะห์\nลองถ่ายใหม่ให้เห็นวัตถุชัด ๆ ครับ"
        );
        clearSession(userId);
        return;
      }

      throw err;
    }

    /*
    -------------------------
    SEND RESULT
    -------------------------
    */

    try {
      const flex = buildScanFlex(resultText);

      await replyFlex(client, event.replyToken, flex);

      console.log("reply flex success");
    } catch (flexError) {
      console.error("flex failed:", flexError);

      await replyText(client, event.replyToken, resultText);

      console.log("fallback text success");
    }

    clearSession(userId);

    return;
  }

  console.log("unsupported message type");
}