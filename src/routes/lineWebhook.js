import line from "@line/bot-sdk";

import {
  getSession,
  setPendingImage,
  clearSession,
  clearSessionIfFlowVersionMatches,
} from "../stores/session.store.js";

import { getSavedBirthdate } from "../stores/userProfile.db.js";

import {
  getEventTimestamp,
  isUserProcessingImage,
  setUserProcessingImage,
  clearUserProcessingImage,
  isInImageBurstWindow,
  markAcceptedImageEvent,
  clearLatestScanJob,
  bumpUserFlowVersion,
  blockUserForRequest,
  isUserBlockedForRequest,
  cleanupExpiredRequestBlocks,
} from "../stores/runtime.store.js";

import { getScanHistory } from "../stores/scanHistory.store.js";
import { getUserStats } from "../stores/userStats.store.js";

import { getImageBufferFromLineMessage } from "../services/image.service.js";
import { isDuplicateImage } from "../services/dedupe.service.js";
import { checkSingleObject } from "../services/objectCheck.service.js";

import { replyText } from "../services/lineReply.service.js";
import { buildStartInstructionFlex } from "../services/flex/startInstruction.flex.js";
import {
  buildUnsupportedObjectFlex,
  buildIdleFlex,
  buildDuplicateImageFlex,
  buildMultipleObjectsFlex,
  buildUnclearImageFlex,
} from "../services/flex/status.flex.js";

import {
  isValidBirthdate,
  toBase64,
  formatHistory,
  formatBangkokDateTime,
  buildStartInstructionText,
  buildMultiImageInRequestText,
  buildMultipleObjectsText,
  buildUnclearImageText,
  buildUnsupportedObjectText,
  buildDuplicateImageText,
  buildNoHistoryText,
  buildNoStatsText,
  buildIdleText,
  buildInvalidBirthdateText,
  buildSystemErrorText,
  isHistoryCommand,
  isStatsCommand,
  groupImageEventCountByUser,
} from "../utils/webhookText.util.js";

import {
  replyFlexWithFallback,
  runScanFlow,
} from "../handlers/scanFlow.handler.js";

function buildWaitingBirthdateText() {
  return [
    "ตอนนี้ระบบกำลังรอวันเกิดของภาพก่อนหน้าอยู่ครับ",
    "กรุณาส่งวันเกิดของเจ้าของวัตถุก่อน เช่น 14/09/1995",
  ].join("\n");
}

async function handleHistoryCommand({ client, replyToken, userId }) {
  const history = getScanHistory(userId);

  if (!history.length) {
    await replyText(client, replyToken, buildNoHistoryText());
    return;
  }

  const formatted = formatHistory(history);
  await replyText(
    client,
    replyToken,
    `📜 ประวัติการสแกนล่าสุด\n\n${formatted}`
  );
}

async function handleStatsCommand({ client, replyToken, userId }) {
  const stats = getUserStats(userId);

  if (!stats) {
    await replyText(client, replyToken, buildNoStatsText());
    return;
  }

  const last = stats.lastScanAt ? formatBangkokDateTime(stats.lastScanAt) : "-";

  await replyText(
    client,
    replyToken,
    [
      "📊 สถิติการสแกนของคุณ",
      "",
      `สแกนทั้งหมด: ${stats.totalScans} ครั้ง`,
      `พลังที่พบบ่อย: ${stats.topEnergy}`,
      `คะแนนเฉลี่ย: ${stats.avgScore} / 10`,
      `สแกนล่าสุด: ${last}`,
    ].join("\n")
  );
}

async function handleImageMessage({ client, event, userId, session }) {
  const eventTimestamp = getEventTimestamp(event);
  const flowVersion = bumpUserFlowVersion(userId);

  if (isUserBlockedForRequest(userId)) {
    console.log("[WEBHOOK] ignore image: request-blocked", {
      userId,
      eventTimestamp,
      flowVersion,
    });
    return;
  }

  if (isUserProcessingImage(userId)) {
    console.log("[WEBHOOK] ignore image: active processing", userId);
    return;
  }

  /*
  ------------------------------------------------
  ถ้ากำลังรอวันเกิดอยู่ ห้ามรับรูปใหม่
  - ไม่เปิดเคสใหม่
  - ไม่ล้าง pendingImage เดิม
  - ตอบเตือนให้ส่งวันเกิดก่อน
  ------------------------------------------------
  */
  if (session.pendingImage) {
    console.log("[WEBHOOK] ignore image: waiting birthdate", {
      userId,
      flowVersion,
      sessionFlowVersion: session.flowVersion || 0,
    });

    await replyText(client, event.replyToken, buildWaitingBirthdateText());
    return;
  }

  /*
  ------------------------------------------------
  burst guard
  ใช้กันกรณีหลายรูปถี่ผิดปกติ
  แต่ตอนนี้เช็กหลัง session.pendingImage แล้ว
  เพื่อไม่ให้ไปล้างเคสที่กำลังรอวันเกิด
  ------------------------------------------------
  */
  if (isInImageBurstWindow(userId, eventTimestamp)) {
    console.log("[WEBHOOK] reject image: burst window", userId, eventTimestamp);

    blockUserForRequest(userId);
    clearLatestScanJob(userId);
    clearSession(userId);

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildMultipleObjectsFlex(),
      fallbackText: buildMultiImageInRequestText(),
      logLabel: "multi image burst flex",
    });
    return;
  }

  setUserProcessingImage(userId);

  try {
    if (isUserBlockedForRequest(userId)) {
      console.log(
        "[WEBHOOK] ignore image after processing lock: request-blocked",
        {
          userId,
          flowVersion,
        }
      );
      return;
    }

    const imageBuffer = await getImageBufferFromLineMessage(
      client,
      event.message.id
    );

    if (isUserBlockedForRequest(userId)) {
      console.log("[WEBHOOK] ignore image after download: request-blocked", {
        userId,
        flowVersion,
      });
      return;
    }

    console.log("[WEBHOOK] image buffer length:", imageBuffer?.length || 0);
    console.log("[WEBHOOK] flowVersion(image):", flowVersion);

    const isDuplicate = await isDuplicateImage(imageBuffer);

    if (isDuplicate) {
      markAcceptedImageEvent(userId, eventTimestamp);
      clearLatestScanJob(userId);
      clearSessionIfFlowVersionMatches(userId, flowVersion);

      await replyFlexWithFallback({
        client,
        replyToken: event.replyToken,
        flex: buildDuplicateImageFlex(),
        fallbackText: buildDuplicateImageText(),
        logLabel: "duplicate image flex",
      });
      return;
    }

    if (isUserBlockedForRequest(userId)) {
      console.log("[WEBHOOK] ignore image after dedupe: request-blocked", {
        userId,
        flowVersion,
      });
      return;
    }

    const imageBase64 = toBase64(imageBuffer);
    const objectCheck = await checkSingleObject(imageBase64);

    console.log("[WEBHOOK] object check result:", objectCheck);

    if (objectCheck === "multiple") {
      markAcceptedImageEvent(userId, eventTimestamp);
      clearLatestScanJob(userId);
      clearSessionIfFlowVersionMatches(userId, flowVersion);

      console.log("[WEBHOOK] image rejected as multiple", {
        userId,
        messageId: event.message.id,
        timestamp: event.timestamp,
        flowVersion,
      });

      await replyFlexWithFallback({
        client,
        replyToken: event.replyToken,
        flex: buildMultipleObjectsFlex(),
        fallbackText: buildMultipleObjectsText(),
        logLabel: "multiple objects flex",
      });
      return;
    }

    if (objectCheck === "unclear") {
      markAcceptedImageEvent(userId, eventTimestamp);
      clearLatestScanJob(userId);
      clearSessionIfFlowVersionMatches(userId, flowVersion);

      await replyFlexWithFallback({
        client,
        replyToken: event.replyToken,
        flex: buildUnclearImageFlex(),
        fallbackText: buildUnclearImageText(),
        logLabel: "unclear image flex",
      });
      return;
    }

    if (objectCheck === "unsupported") {
      markAcceptedImageEvent(userId, eventTimestamp);
      clearLatestScanJob(userId);
      clearSessionIfFlowVersionMatches(userId, flowVersion);

      await replyFlexWithFallback({
        client,
        replyToken: event.replyToken,
        flex: buildUnsupportedObjectFlex(),
        fallbackText: buildUnsupportedObjectText(),
        logLabel: "unsupported object flex",
      });
      return;
    }

    if (objectCheck !== "single_supported") {
      markAcceptedImageEvent(userId, eventTimestamp);
      clearLatestScanJob(userId);
      clearSessionIfFlowVersionMatches(userId, flowVersion);

      await replyFlexWithFallback({
        client,
        replyToken: event.replyToken,
        flex: buildUnsupportedObjectFlex(),
        fallbackText: buildUnsupportedObjectText(),
        logLabel: "unsupported object flex",
      });
      return;
    }

    if (isUserBlockedForRequest(userId)) {
      console.log("[WEBHOOK] ignore image before accept: request-blocked", {
        userId,
        flowVersion,
      });
      return;
    }

    markAcceptedImageEvent(userId, eventTimestamp);

    let savedBirthdate = null;

    try {
      console.log("[WEBHOOK] before getSavedBirthdate", { userId });
      savedBirthdate = await getSavedBirthdate(userId);
      console.log("[WEBHOOK] after getSavedBirthdate:", {
        userId,
        savedBirthdate,
      });
    } catch (error) {
      console.error("[WEBHOOK] getSavedBirthdate failed:", {
        userId,
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });
    }

    if (isUserBlockedForRequest(userId)) {
      console.log("[WEBHOOK] ignore image before next step: request-blocked", {
        userId,
        flowVersion,
      });
      return;
    }

    if (savedBirthdate) {
      console.log("[WEBHOOK] using saved birthdate:", savedBirthdate);

      await runScanFlow({
        client,
        replyToken: event.replyToken,
        userId,
        imageBuffer,
        birthdate: savedBirthdate,
        flowVersion,
      });
      return;
    }

    setPendingImage(
      userId,
      {
        messageId: event.message.id,
        imageBuffer,
      },
      flowVersion
    );

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildStartInstructionFlex(),
      fallbackText: buildStartInstructionText(),
      logLabel: "start instruction flex",
    });
  } finally {
    clearUserProcessingImage(userId);
  }
}

async function handleTextMessage({ client, event, userId, session }) {
  const text = String(event.message.text || "").trim();
  const lowerText = text.toLowerCase();

  console.log("[WEBHOOK] text received:", {
    userId,
    text,
    hasPendingImage: !!session.pendingImage,
    sessionFlowVersion: session.flowVersion || 0,
  });

  if (isHistoryCommand(text, lowerText)) {
    await handleHistoryCommand({
      client,
      replyToken: event.replyToken,
      userId,
    });
    return;
  }

  if (isStatsCommand(text, lowerText)) {
    await handleStatsCommand({
      client,
      replyToken: event.replyToken,
      userId,
    });
    return;
  }

  if (!session.pendingImage) {
    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildIdleFlex(),
      fallbackText: buildIdleText(),
      logLabel: "idle flex",
    });
    return;
  }

  if (!isValidBirthdate(text)) {
    await replyText(client, event.replyToken, buildInvalidBirthdateText());
    return;
  }

  const flowVersion = session.flowVersion || 0;

  console.log("[WEBHOOK] use session flowVersion(text):", flowVersion);
  console.log("[WEBHOOK] going to runScanFlow from text", {
    userId,
    birthdate: text,
    flowVersion,
  });

  await runScanFlow({
    client,
    replyToken: event.replyToken,
    userId,
    imageBuffer: session.pendingImage.imageBuffer,
    birthdate: text,
    flowVersion,
  });
}

async function handleEvent({ client, event }) {
  if (event.type !== "message") return;
  if (!event.replyToken) return;

  const userId = event.source?.userId;

  if (!userId) {
    await replyText(client, event.replyToken, "ไม่พบข้อมูลผู้ใช้ครับ");
    return;
  }

  if (isUserBlockedForRequest(userId)) {
    console.log("[WEBHOOK] skip event: request-blocked", {
      userId,
      eventType: event.type,
      messageType: event.message?.type || "no-message-type",
    });
    return;
  }

  const session = getSession(userId);

  if (event.message?.type === "image") {
    await handleImageMessage({ client, event, userId, session });
    return;
  }

  if (event.message?.type === "text") {
    await handleTextMessage({ client, event, userId, session });
    return;
  }

  console.log("[WEBHOOK] skip unsupported message");
}

export function lineWebhookRouter(lineConfig) {
  const client = new line.Client(lineConfig);

  return async (req, res) => {
    try {
      const events = Array.isArray(req.body.events) ? req.body.events : [];
      const imageCountByUser = groupImageEventCountByUser(events);
      const multiImageUsersReplied = new Set();

      console.log("========== LINE WEBHOOK ==========");
      console.log("event count:", events.length);
      console.log(
        "[WEBHOOK] imageCountByUser:",
        Object.fromEntries(imageCountByUser)
      );

      cleanupExpiredRequestBlocks();

      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];

        try {
          console.log(`\n----- event #${index + 1} -----`);
          console.log("[WEBHOOK] type:", event.type);
          console.log(
            "[WEBHOOK] userId:",
            event.source?.userId || "no-user-id"
          );
          console.log(
            "[WEBHOOK] message type:",
            event.message?.type || "no-message-type"
          );
          console.log("[WEBHOOK] timestamp:", event.timestamp || "no-timestamp");

          const userId = event.source?.userId;

          /*
          ------------------------------------------------
          หลายรูปใน request เดียว = reject ทั้งก้อน
          ------------------------------------------------
          */
          if (
            userId &&
            event.type === "message" &&
            event.message?.type === "image" &&
            (imageCountByUser.get(userId) || 0) > 1
          ) {
            const flowVersion = bumpUserFlowVersion(userId);

            blockUserForRequest(userId);
            clearLatestScanJob(userId);
            clearSession(userId);

            if (!multiImageUsersReplied.has(userId) && event.replyToken) {
              multiImageUsersReplied.add(userId);

              console.log("[WEBHOOK] multi image request rejected", {
                userId,
                flowVersion,
              });

              await replyFlexWithFallback({
                client,
                replyToken: event.replyToken,
                flex: buildMultipleObjectsFlex(),
                fallbackText: buildMultiImageInRequestText(),
                logLabel: "multi image request flex",
              });
            }

            console.log(
              "[WEBHOOK] skip image because multiple image events in same request",
              userId
            );
            continue;
          }

          await handleEvent({ client, event });
        } catch (err) {
          console.error(`[WEBHOOK] event #${index + 1} error:`, err);

          if (event.replyToken) {
            try {
              await replyText(
                client,
                event.replyToken,
                buildSystemErrorText()
              );
            } catch (replyErr) {
              console.error("[WEBHOOK] fallback error reply failed:", replyErr);
            }
          }
        }
      }

      cleanupExpiredRequestBlocks();

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[WEBHOOK] fatal:", error);
      res.status(500).json({ error: "webhook_failed" });
    }
  };
}