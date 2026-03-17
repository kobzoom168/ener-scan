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

import { buildStartInstructionFlex } from "../services/flex/startInstruction.flex.js";

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

function isValidBirthdate(text) {
  return /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(String(text || "").trim());
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
    "ได้รับภาพแล้วครับ ✨",
    "",
    "Ener Scan รองรับเฉพาะ",
    "• พระเครื่อง",
    "• เครื่องราง",
    "• คริสตัล / หิน",
    "• วัตถุสายพลังที่เป็นชิ้นเดี่ยว",
    "",
    "กรุณาถ่าย 1 ชิ้นต่อ 1 รูป",
    "หากเป็นของหลายชิ้น กรุณาแยกส่งทีละภาพ",
    "",
    "รบกวนพิมพ์วันเกิดของเจ้าของวัตถุ เช่น",
    "14/09/1995",
  ].join("\n");
}

function buildWaitingBirthdateText() {
  return [
    "ตอนนี้ระบบกำลังรอวันเกิดของเจ้าของวัตถุอยู่ครับ",
    "กรุณาพิมพ์วันเกิด เช่น",
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

async function handleImageMessage({ client, event, userId, session }) {
  if (session.pendingImage) {
    console.log("[WEBHOOK] ignore image: waiting birthdate");
    await replyText(client, event.replyToken, buildWaitingBirthdateText());
    return;
  }

  const imageBuffer = await getImageBufferFromLineMessage(
    client,
    event.message.id
  );

  console.log("[WEBHOOK] image buffer length:", imageBuffer?.length || 0);

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

  try {
    await replyFlex(client, event.replyToken, buildStartInstructionFlex());
    console.log("[WEBHOOK] start instruction sent as flex");
  } catch (error) {
    console.error("[WEBHOOK] start instruction flex failed:", error);
    await replyText(client, event.replyToken, buildStartInstructionText());
    console.log("[WEBHOOK] fallback start instruction sent as text");
  }
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

async function runScanFlow({ client, event, userId, session, birthdate }) {
  const rate = checkScanRateLimit(userId);

  if (!rate.allowed) {
    await replyText(
      client,
      event.replyToken,
      buildRateLimitText(rate.retryAfterSec)
    );
    clearSession(userId);
    return;
  }

  const cooldown = getCooldownStatus(userId);

  if (!cooldown.allowed) {
    await replyText(
      client,
      event.replyToken,
      buildCooldownText(cooldown.remainingSec)
    );
    clearSession(userId);
    return;
  }

  setBirthdate(userId, birthdate);

  let resultText = "";

  try {
    resultText = await runDeepScan({
      imageBuffer: session.pendingImage.imageBuffer,
      birthdate,
      userId,
    });
  } catch (err) {
    console.error("[WEBHOOK] scan failed:", err?.message || err);

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

    if (err.message === "unsupported_object_type") {
      await replyText(
        client,
        event.replyToken,
        buildUnsupportedObjectText()
      );
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
    replyToken: event.replyToken,
    resultText,
  });

  clearSession(userId);
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
    await replyText(client, event.replyToken, buildIdleText());
    return;
  }

  if (!isValidBirthdate(text)) {
    await replyText(client, event.replyToken, buildInvalidBirthdateText());
    return;
  }

  await runScanFlow({
    client,
    event,
    userId,
    session,
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

      console.log("========== LINE WEBHOOK ==========");
      console.log("event count:", events.length);

      await Promise.all(
        events.map(async (event, index) => {
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
        })
      );

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[WEBHOOK] fatal:", error);
      res.status(500).json({ error: "webhook_failed" });
    }
  };
}