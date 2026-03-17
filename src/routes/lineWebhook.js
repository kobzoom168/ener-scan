import line from "@line/bot-sdk";

import {
  getSession,
  setPendingImage,
  setBirthdate,
  clearSession,
} from "../stores/session.store.js";

import {
  getSavedBirthdate,
  saveBirthdate,
} from "../stores/userProfile.store.js";

import { getImageBufferFromLineMessage } from "../services/image.service.js";
import { isDuplicateImage } from "../services/dedupe.service.js";
import { runDeepScan } from "../services/scan.service.js";
import { checkSingleObject } from "../services/objectCheck.service.js";

import { replyText, replyFlex } from "../services/lineReply.service.js";
import { buildScanFlex } from "../services/flex/flex.service.js";

import { buildStartInstructionFlex } from "../services/flex/startInstruction.flex.js";
import {
  buildUnsupportedObjectFlex,
  buildIdleFlex,
  buildDuplicateImageFlex,
  buildMultipleObjectsFlex,
  buildUnclearImageFlex,
  buildRateLimitFlex,
  buildCooldownFlex,
} from "../services/flex/status.flex.js";

import { checkScanRateLimit } from "../stores/rateLimit.store.js";
import {
  getCooldownStatus,
  setCooldownNow,
} from "../stores/cooldown.store.js";

import { getScanHistory, addScanHistory } from "../stores/scanHistory.store.js";
import {
  updateUserStats,
  getUserStats,
} from "../stores/userStats.store.js";

import { parseScanResultForHistory } from "../services/history/history.parser.js";

/*
------------------------------------------------
ANTI-SPAM IMAGE GUARDS
1) activeImageUsers = กัน event ซ้อนระหว่างกำลังประมวลผล
2) lastAcceptedImageEventAtMap = กันรูปถี่เกินไปหลังเพิ่งรับเคสก่อนหน้า
------------------------------------------------
*/
const activeImageUsers = new Set();
const lastAcceptedImageEventAtMap = new Map();
const IMAGE_BURST_WINDOW_MS = 8000;

function getEventTimestamp(event) {
  const ts = Number(event?.timestamp || 0);
  return Number.isFinite(ts) && ts > 0 ? ts : Date.now();
}

function isInImageBurstWindow(userId, eventTimestamp) {
  const lastAcceptedEventAt = lastAcceptedImageEventAtMap.get(userId);
  if (!lastAcceptedEventAt) return false;
  return eventTimestamp - lastAcceptedEventAt < IMAGE_BURST_WINDOW_MS;
}

function markAcceptedImageEvent(userId, eventTimestamp) {
  lastAcceptedImageEventAtMap.set(userId, eventTimestamp);
}

function isValidBirthdate(text) {
  return /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(String(text || "").trim());
}

function toBase64(buffer) {
  return buffer.toString("base64");
}

function formatBangkokDateTime(time) {
  return new Date(time).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHistory(history) {
  return history
    .slice(0, 5)
    .map((h, i) => {
      const formatted = formatBangkokDateTime(h.time);

      const mainEnergy =
        h.mainEnergy && h.mainEnergy !== "-" ? ` | ${h.mainEnergy}` : "";

      const score =
        h.energyScore && h.energyScore !== "-"
          ? ` | ${h.energyScore}/10`
          : "";

      return `${i + 1}. ${formatted}${mainEnergy}${score}`;
    })
    .join("\n");
}

function buildStartInstructionText() {
  return [
    "ได้รับภาพที่ผ่านเงื่อนไขแล้วครับ ✨",
    "",
    "รบกวนพิมพ์วันเกิดของเจ้าของวัตถุ เช่น",
    "14/09/1995",
  ].join("\n");
}

function buildMultiImageInRequestText() {
  return [
    "🔍 Ener Scan",
    "",
    "ระบบพบว่าคุณส่งมาหลายรูปพร้อมกัน",
    "กรุณาส่งเพียง 1 รูปต่อ 1 ครั้ง",
    "",
    "หากมีหลายชิ้น กรุณาแยกส่งทีละรูปแล้วค่อยสแกนใหม่ครับ",
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

function buildUnsupportedObjectText() {
  return [
    "Ener Scan ยังไม่รองรับภาพประเภทนี้ครับ",
    "",
    "ระบบรองรับเฉพาะ",
    "• พระเครื่อง",
    "• เครื่องราง",
    "• คริสตัล / หิน",
    "• วัตถุสายพลังแบบชิ้นเดี่ยว",
    "",
    "กรุณาส่งภาพใหม่ที่ตรงประเภทอีกครั้งครับ",
  ].join("\n");
}

function buildDuplicateImageText() {
  return [
    "🔍 Ener Scan",
    "",
    "ระบบพบว่ารูปนี้เคยถูกสแกนแล้ว",
    "กรุณาส่งภาพใหม่ของวัตถุครับ",
  ].join("\n");
}

function buildRateLimitText(retryAfterSec = 0) {
  return [
    "🔍 Ener Scan",
    "",
    "ระบบมีการใช้งานต่อเนื่อง",
    retryAfterSec > 0
      ? `กรุณารออีก ${retryAfterSec} วินาทีก่อนสแกนใหม่`
      : "กรุณารอสักครู่ก่อนสแกนใหม่",
  ].join("\n");
}

function buildCooldownText(remainingSec = 0) {
  return [
    "🔍 Ener Scan",
    "",
    remainingSec > 0
      ? `กรุณารออีก ${remainingSec} วินาทีก่อนสแกนใหม่`
      : "กรุณารอสักครู่ก่อนสแกนใหม่",
    "เพื่อให้ระบบอ่านพลังได้เสถียรมากขึ้นครับ",
  ].join("\n");
}

function buildNoHistoryText() {
  return "ยังไม่มีประวัติการสแกนครับ";
}

function buildNoStatsText() {
  return "ยังไม่มีสถิติการสแกนครับ";
}

function buildIdleText() {
  return "ส่งรูปวัตถุมาได้เลยครับ\nกรุณาถ่ายวัตถุ 1 ชิ้นต่อ 1 รูป";
}

function buildInvalidBirthdateText() {
  return ["รูปแบบวันเกิดยังไม่ถูกครับ", "ลองพิมพ์แบบ", "14/09/1995"].join(
    "\n"
  );
}

function buildSystemErrorText() {
  return "ขออภัยครับ ระบบขัดข้องชั่วคราว ลองส่งใหม่อีกครั้งได้เลยครับ";
}

function isHistoryCommand(text, lowerText) {
  return lowerText === "history" || text === "ประวัติ";
}

function isStatsCommand(text, lowerText) {
  return lowerText === "stats" || text === "สถิติ";
}

function groupImageEventCountByUser(events = []) {
  const map = new Map();

  for (const event of events) {
    if (event?.type !== "message") continue;
    if (event?.message?.type !== "image") continue;

    const userId = event?.source?.userId;
    if (!userId) continue;

    map.set(userId, (map.get(userId) || 0) + 1);
  }

  return map;
}

async function replyFlexWithFallback({
  client,
  replyToken,
  flex,
  fallbackText,
  logLabel = "status flex",
}) {
  try {
    await replyFlex(client, replyToken, flex);
    console.log(`[WEBHOOK] ${logLabel} sent as flex`);
  } catch (error) {
    console.error(`[WEBHOOK] ${logLabel} failed:`, error);
    await replyText(client, replyToken, fallbackText);
    console.log(`[WEBHOOK] ${logLabel} fallback sent as text`);
  }
}

async function handleHistoryCommand({ client, replyToken, userId }) {
  const history = getScanHistory(userId);

  if (!history.length) {
    await replyText(client, replyToken, buildNoHistoryText());
    return;
  }

  const formatted = formatHistory(history);
  await replyText(client, replyToken, `📜 ประวัติการสแกนล่าสุด\n\n${formatted}`);
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

function saveScanArtifacts(userId, resultText) {
  const parsed = parseScanResultForHistory(resultText);

  const scanItem = {
    time: Date.now(),
    result: resultText,
    energyScore: parsed.energyScore,
    mainEnergy: parsed.mainEnergy,
    compatibility: parsed.compatibility,
  };

  addScanHistory(userId, scanItem);
  updateUserStats(userId, scanItem);

  console.log("[WEBHOOK] history saved");
  console.log("[WEBHOOK] stats updated");
}

async function replyScanResult({ client, replyToken, resultText }) {
  try {
    const flex = buildScanFlex(resultText);
    await replyFlex(client, replyToken, flex);
    console.log("[WEBHOOK] replied with flex");
  } catch (flexError) {
    console.error("[WEBHOOK] flex reply failed:", flexError);
    await replyText(client, replyToken, resultText);
    console.log("[WEBHOOK] fallback replied with text");
  }
}

async function runScanFlow({
  client,
  replyToken,
  userId,
  imageBuffer,
  birthdate,
}) {
  const rate = checkScanRateLimit(userId);

  if (!rate.allowed) {
    await replyFlexWithFallback({
      client,
      replyToken,
      flex: buildRateLimitFlex(rate.retryAfterSec),
      fallbackText: buildRateLimitText(rate.retryAfterSec),
      logLabel: "rate limit flex",
    });
    clearSession(userId);
    return;
  }

  const cooldown = getCooldownStatus(userId);

  if (!cooldown.allowed) {
    await replyFlexWithFallback({
      client,
      replyToken,
      flex: buildCooldownFlex(cooldown.remainingSec),
      fallbackText: buildCooldownText(cooldown.remainingSec),
      logLabel: "cooldown flex",
    });
    clearSession(userId);
    return;
  }

  setBirthdate(userId, birthdate);
  saveBirthdate(userId, birthdate);

  let resultText = "";

  try {
    resultText = await runDeepScan({
      imageBuffer,
      birthdate,
      userId,
    });
  } catch (err) {
    console.error("[WEBHOOK] scan failed:", err?.message || err);

    if (err.message === "multiple_objects_detected") {
      await replyFlexWithFallback({
        client,
        replyToken,
        flex: buildMultipleObjectsFlex(),
        fallbackText: buildMultipleObjectsText(),
        logLabel: "multiple objects flex",
      });
      clearSession(userId);
      return;
    }

    if (err.message === "image_unclear") {
      await replyFlexWithFallback({
        client,
        replyToken,
        flex: buildUnclearImageFlex(),
        fallbackText: buildUnclearImageText(),
        logLabel: "unclear image flex",
      });
      clearSession(userId);
      return;
    }

    if (err.message === "unsupported_object_type") {
      await replyFlexWithFallback({
        client,
        replyToken,
        flex: buildUnsupportedObjectFlex(),
        fallbackText: buildUnsupportedObjectText(),
        logLabel: "unsupported object flex",
      });
      clearSession(userId);
      return;
    }

    clearSession(userId);
    throw err;
  }

  saveScanArtifacts(userId, resultText);
  setCooldownNow(userId);

  await replyScanResult({
    client,
    replyToken,
    resultText,
  });

  clearSession(userId);
}

async function handleImageMessage({ client, event, userId, session }) {
  const eventTimestamp = getEventTimestamp(event);

  if (activeImageUsers.has(userId)) {
    console.log("[WEBHOOK] ignore image: active processing", userId);
    return;
  }

  if (isInImageBurstWindow(userId, eventTimestamp)) {
    console.log("[WEBHOOK] ignore image: burst window", userId, eventTimestamp);
    return;
  }

  if (session.pendingImage) {
    console.log("[WEBHOOK] ignore image: waiting birthdate", userId);
    return;
  }

  activeImageUsers.add(userId);

  try {
    const imageBuffer = await getImageBufferFromLineMessage(
      client,
      event.message.id
    );

    console.log("[WEBHOOK] image buffer length:", imageBuffer?.length || 0);

    const isDuplicate = await isDuplicateImage(imageBuffer);

    if (isDuplicate) {
      markAcceptedImageEvent(userId, eventTimestamp);
      await replyFlexWithFallback({
        client,
        replyToken: event.replyToken,
        flex: buildDuplicateImageFlex(),
        fallbackText: buildDuplicateImageText(),
        logLabel: "duplicate image flex",
      });
      return;
    }

    const imageBase64 = toBase64(imageBuffer);
    const objectCheck = await checkSingleObject(imageBase64);

    console.log("[WEBHOOK] object check result:", objectCheck);

    if (objectCheck === "multiple") {
      markAcceptedImageEvent(userId, eventTimestamp);
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
      await replyFlexWithFallback({
        client,
        replyToken: event.replyToken,
        flex: buildUnsupportedObjectFlex(),
        fallbackText: buildUnsupportedObjectText(),
        logLabel: "unsupported object flex",
      });
      return;
    }

    markAcceptedImageEvent(userId, eventTimestamp);

    const savedBirthdate = getSavedBirthdate(userId);

    if (savedBirthdate) {
      console.log("[WEBHOOK] using saved birthdate:", savedBirthdate);

      await runScanFlow({
        client,
        replyToken: event.replyToken,
        userId,
        imageBuffer,
        birthdate: savedBirthdate,
      });
      return;
    }

    setPendingImage(userId, {
      messageId: event.message.id,
      imageBuffer,
    });

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildStartInstructionFlex(),
      fallbackText: buildStartInstructionText(),
      logLabel: "start instruction flex",
    });
  } finally {
    activeImageUsers.delete(userId);
  }
}

async function handleTextMessage({ client, event, userId, session }) {
  const text = String(event.message.text || "").trim();
  const lowerText = text.toLowerCase();

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

  await runScanFlow({
    client,
    replyToken: event.replyToken,
    userId,
    imageBuffer: session.pendingImage.imageBuffer,
    birthdate: text,
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

          if (
            userId &&
            event.type === "message" &&
            event.message?.type === "image" &&
            (imageCountByUser.get(userId) || 0) > 1
          ) {
            if (!multiImageUsersReplied.has(userId) && event.replyToken) {
              multiImageUsersReplied.add(userId);

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

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[WEBHOOK] fatal:", error);
      res.status(500).json({ error: "webhook_failed" });
    }
  };
}