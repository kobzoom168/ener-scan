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
import { replyText } from "../services/lineReply.service.js";

function isValidBirthdate(text) {
  return /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text.trim());
}

export function lineWebhookRouter(lineConfig) {
  const client = new line.Client(lineConfig);

  return async (req, res) => {
    try {
      const events = Array.isArray(req.body.events) ? req.body.events : [];

      await Promise.all(
        events.map(async (event) => {
          try {
            await handleEvent({ client, event });
          } catch (error) {
            console.error("handleEvent error:", error);

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
      console.error("webhook error:", error);
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

  if (event.message.type === "image") {
    const imageBuffer = await getImageBufferFromLineMessage(client, event.message.id);

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
      "ได้รับภาพแล้วครับ ✨\nรบกวนพิมพ์วันเกิดของเจ้าของวัตถุ เช่น 14/09/1995"
    );
    return;
  }

  if (event.message.type === "text") {
    const text = event.message.text?.trim() || "";

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
        "รูปแบบวันเกิดยังไม่ถูกครับ\nลองพิมพ์แบบ 14/09/1995"
      );
      return;
    }

    setBirthdate(userId, text);

    const resultText = await runDeepScan({
      imageBuffer: session.pendingImage.imageBuffer,
      birthdate: text,
      userId,
    });

    await replyText(client, event.replyToken, resultText);
    clearSession(userId);
  }
}