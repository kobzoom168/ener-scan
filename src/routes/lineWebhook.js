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
      console.log("raw body:", JSON.stringify(req.body, null, 2));

      await Promise.all(
        events.map(async (event, index) => {
          try {
            console.log(`\n----- handling event #${index + 1} -----`);
            console.log("event.type:", event.type);
            console.log("replyToken exists:", Boolean(event.replyToken));
            console.log("userId:", event.source?.userId || "no-user-id");
            console.log(
              "message.type:",
              event.message?.type || "no-message-type"
            );
            console.log("timestamp:", event.timestamp || "no-timestamp");

            await handleEvent({ client, event });

            console.log(`event #${index + 1} handled successfully`);
          } catch (error) {
            console.error(`handleEvent error on event #${index + 1}:`, error);

            if (event.replyToken) {
              try {
                await replyText(
                  client,
                  event.replyToken,
                  "ขออภัยครับ ระบบขัดข้องชั่วคราว ลองส่งใหม่อีกครั้งได้เลยครับ"
                );
                console.log("fallback reply sent");
              } catch (replyError) {
                console.error("fallback reply failed:", replyError);
              }
            }
          }
        })
      );

      console.log("webhook response: 200");
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("webhook fatal error:", error);
      res.status(500).json({ error: "webhook_failed" });
    }
  };
}

async function handleEvent({ client, event }) {
  if (event.type !== "message") {
    console.log("skip: event is not message");
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
  console.log("current session:", {
    hasPendingImage: Boolean(session.pendingImage),
    birthdate: session.birthdate || null,
  });

  if (event.message?.type === "image") {
    console.log("step: received image");

    const imageBuffer = await getImageBufferFromLineMessage(
      client,
      event.message.id
    );
    console.log("image buffer size:", imageBuffer.length);

    const isDuplicate = await isDuplicateImage(imageBuffer);
    console.log("is duplicate image:", isDuplicate);

    if (isDuplicate) {
      console.log("reply: duplicate image warning");
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

    console.log("session updated: pendingImage set");
    console.log("reply: ask for birthdate");

    await replyText(
      client,
      event.replyToken,
      "ได้รับภาพแล้วครับ ✨\nรบกวนพิมพ์วันเกิดของเจ้าของวัตถุ เช่น 14/09/1995"
    );
    return;
  }

  if (event.message?.type === "text") {
    const text = event.message.text?.trim() || "";
    console.log("step: received text");
    console.log("text:", text);

    if (!session.pendingImage) {
      console.log("reply: no pending image in session");
      await replyText(
        client,
        event.replyToken,
        "ส่งรูปวัตถุมาได้เลยครับ แล้วผมจะให้กรอกวันเกิดเจ้าของต่อให้"
      );
      return;
    }

    if (!isValidBirthdate(text)) {
      console.log("reply: invalid birthdate format");
      await replyText(
        client,
        event.replyToken,
        "รูปแบบวันเกิดยังไม่ถูกครับ\nลองพิมพ์แบบ 14/09/1995"
      );
      return;
    }

    setBirthdate(userId, text);
    console.log("session updated: birthdate set");

    console.log("step: running deep scan...");
    const resultText = await runDeepScan({
      imageBuffer: session.pendingImage.imageBuffer,
      birthdate: text,
      userId,
    });

    console.log("scan result length:", resultText.length);
    console.log("reply: sending final scan result");

    try {
      const flexMessage = buildScanFlex(resultText);
      await replyFlex(client, event.replyToken, flexMessage);
      console.log("final flex reply sent");
    } catch (flexError) {
      console.error("flex reply failed, fallback to text:", flexError);
      await replyText(client, event.replyToken, resultText);
      console.log("final text fallback sent");
    }

    clearSession(userId);
    console.log("session cleared");
    return;
  }

  console.log("skip: unsupported message type");
}