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

import { checkScanRateLimit } from "../stores/rateLimit.store.js";
import { getScanHistory, addScanHistory } from "../stores/scanHistory.store.js";


function isValidBirthdate(text) {
  return /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(String(text || "").trim());
}


function formatHistory(history) {
  return history
    .slice(0, 5)
    .map((h, i) => {
      const date = new Date(h.time);

      const formatted = date.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      return `${i + 1}. ${formatted}`;
    })
    .join("\n");
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


function buildRateLimitText() {
  return [
    "🔍 Ener Scan",
    "",
    "ระบบมีการใช้งานต่อเนื่อง",
    "กรุณารอสักครู่ก่อนสแกนใหม่",
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
            console.log("message type:", event.message?.type);

            await handleEvent({ client, event });

          } catch (err) {

            console.error(`event #${index + 1} error:`, err);

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


  /*
  -------------------------
  IMAGE MESSAGE
  -------------------------
  */

  if (event.message?.type === "image") {

    if (session.pendingImage) {
      console.log("ignore image: waiting birthdate");
      return;
    }

    const imageBuffer = await getImageBufferFromLineMessage(
      client,
      event.message.id
    );

    const isDuplicate = await isDuplicateImage(imageBuffer);

    if (isDuplicate) {

      await replyText(
        client,
        event.replyToken,
        "🔍 Ener Scan\n\nระบบพบว่ารูปนี้เคยถูกสแกนแล้ว\nกรุณาส่งภาพใหม่ของวัตถุครับ"
      );

      return;
    }

    setPendingImage(userId, {
      messageId: event.message.id,
      imageBuffer,
    });

    await replyText(client, event.replyToken, buildStartInstructionText());

    return;

  }



  /*
  -------------------------
  TEXT MESSAGE
  -------------------------
  */

  if (event.message?.type === "text") {

    const text = String(event.message.text || "").trim();



    /*
    -------------------------
    HISTORY COMMAND
    -------------------------
    */

    if (text.toLowerCase() === "history" || text === "ประวัติ") {

      const history = getScanHistory(userId);

      if (history.length === 0) {

        await replyText(client, event.replyToken, "ยังไม่มีประวัติการสแกนครับ");

        return;

      }

      const formatted = formatHistory(history);

      await replyText(
        client,
        event.replyToken,
        `📜 ประวัติการสแกนล่าสุด\n\n${formatted}`
      );

      return;

    }



    if (!session.pendingImage) {

      await replyText(
        client,
        event.replyToken,
        "ส่งรูปวัตถุมาได้เลยครับ\nกรุณาถ่ายวัตถุ 1 ชิ้นต่อ 1 รูป"
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



    /*
    -------------------------
    RATE LIMIT
    -------------------------
    */

    const rate = checkScanRateLimit(userId);

    if (!rate.allowed) {

      await replyText(client, event.replyToken, buildRateLimitText());

      clearSession(userId);

      return;

    }



    setBirthdate(userId, text);



    let resultText = "";



    try {

      resultText = await runDeepScan({
        imageBuffer: session.pendingImage.imageBuffer,
        birthdate: text,
        userId,
      });

    } catch (err) {

      if (err.message === "multiple_objects_detected") {

        await replyText(client, event.replyToken, buildMultipleObjectsText());

        clearSession(userId);

        return;

      }

      if (err.message === "image_unclear") {

        await replyText(client, event.replyToken, buildUnclearImageText());

        clearSession(userId);

        return;

      }

      clearSession(userId);

      throw err;

    }



    /*
    -------------------------
    SAVE HISTORY
    -------------------------
    */

    addScanHistory(userId, {
      time: Date.now(),
      result: resultText
    });



    try {

      const flex = buildScanFlex(resultText);

      await replyFlex(client, event.replyToken, flex);

    } catch (flexError) {

      await replyText(client, event.replyToken, resultText);

    }



    clearSession(userId);

    return;

  }



  console.log("skip unsupported message");

}