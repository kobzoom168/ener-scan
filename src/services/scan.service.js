import { generateScanText } from "./openai.service.js";
import { generateWithRetry } from "./retry.service.js";
import { formatScanOutput } from "./formatter.service.js";

import {
  hasRepeatedPhrase,
  hasRepeatedClosing,
  tooSimilarToRecent,
  countMatchesFromList,
} from "../utils/similarity.js";

import {
  addRecentOutput,
  getRecentOutputs,
  getGlobalRecentOutputs,
} from "../stores/recentOutputs.store.js";

function toBase64(buffer) {
  return buffer.toString("base64");
}

function validateOutput(text, userRecents, globalRecents) {
  if (!text || text.length < 120) {
    return { isBad: true, reason: "too_short" };
  }

  if (hasRepeatedPhrase(text)) {
    return { isBad: true, reason: "banned_phrase" };
  }

  if (hasRepeatedClosing(text)) {
    return { isBad: true, reason: "repeated_closing" };
  }

  if (tooSimilarToRecent(text, userRecents, 0.62)) {
    return { isBad: true, reason: "too_similar_user_recent" };
  }

  if (tooSimilarToRecent(text, globalRecents, 0.70)) {
    return { isBad: true, reason: "too_similar_global_recent" };
  }

  const duplicateFeelCount = countMatchesFromList(text, [
    "ความสงบ",
    "ความมั่นคง",
    "นิ่ง",
    "หนักแน่น",
    "นำทาง",
  ]);

  if (duplicateFeelCount >= 4) {
    return { isBad: true, reason: "too_generic_feel" };
  }

  return { isBad: false, reason: "ok" };
}

function buildRetryHint(lastOutput, attempt, reason) {
  const base =
    "ผลลัพธ์ก่อนหน้าคล้ายข้อความเดิมมากเกินไป ให้เขียนใหม่โดยเปลี่ยนคำเด่น มุมเล่า คำเปรียบเทียบ และคำปิดท้ายทั้งหมด แต่ยังคงความหมายเดิมและคง format เดิม";

  const reasonMap = {
    too_short: "เพิ่มรายละเอียดให้พออ่านรู้เรื่อง แต่ยังต้องกระชับ",
    banned_phrase: "ห้ามใช้วลีเปรียบเทียบเดิมหรือวลีมาตรฐานที่ซ้ำง่าย",
    repeated_closing: "เปลี่ยนประโยคปิดท้ายใหม่ทั้งหมด ห้ามใช้ประโยคชวนต่อเดิม",
    too_similar_user_recent:
      "ผลลัพธ์นี้คล้ายกับผลล่าสุดของผู้ใช้คนนี้มากเกินไป ต้องเปลี่ยนคำเด่นและโทนเล่า",
    too_similar_global_recent:
      "ผลลัพธ์นี้คล้ายกับเคสล่าสุดโดยรวมมากเกินไป ต้องเปลี่ยนภาพรวมและคำเปรียบเทียบ",
    too_generic_feel:
      "ภาษายังกลางเกินไป ให้ทำให้เฉพาะชิ้นมากขึ้นและมีคำเด่นที่จำง่าย",
  };

  return `${base} เงื่อนไขเฉพาะรอบนี้: ${
    reasonMap[reason] || "เขียนใหม่ให้สดขึ้น"
  }`;
}

export async function runDeepScan({ imageBuffer, birthdate, userId }) {
  const scanStartedAt = Date.now();
  console.log("[SCAN_TIMING] startedAt:", scanStartedAt);
  console.log("[SCAN] runDeepScan started");
  console.log("[SCAN] birthdate:", birthdate);
  console.log("[SCAN] userId:", userId);

  const imageBase64 = toBase64(imageBuffer);
  const userRecents = getRecentOutputs(userId);
  const globalRecents = getGlobalRecentOutputs();

  console.log("[SCAN] user recent outputs count:", userRecents.length);
  console.log("[SCAN] global recent outputs count:", globalRecents.length);
  console.log("[SCAN] image base64 length:", imageBase64.length);

  const generateStartedAt = Date.now();
  console.log("[SCAN_TIMING] generate_startedAt:", generateStartedAt);

  const result = await generateWithRetry({
    maxRetries: 2,
    generateFn: async ({ attempt, retryHint }) => {
      const attemptStartedAt = Date.now();
      console.log(`[SCAN_ATTEMPT] #${attempt} startedAt:`, attemptStartedAt);
      console.log(`[SCAN_ATTEMPT] #${attempt} retryHint:`, retryHint || "none");

      const text = await generateScanText({
        imageBase64,
        birthdate,
        retryHint,
      });

      const attemptEndedAt = Date.now();
      const attemptElapsedMs = attemptEndedAt - attemptStartedAt;
      const attemptElapsedSec = (attemptElapsedMs / 1000).toFixed(2);

      console.log(`[SCAN_ATTEMPT] #${attempt} output length:`, text.length);
      console.log(`[SCAN_ATTEMPT] #${attempt} endedAt:`, attemptEndedAt);
      console.log(`[SCAN_ATTEMPT] #${attempt} elapsedMs:`, attemptElapsedMs);
      console.log(`[SCAN_ATTEMPT] #${attempt} elapsedSec:`, attemptElapsedSec);

      return text;
    },
    isBadOutputFn: (text) => {
      const validation = validateOutput(text, userRecents, globalRecents);
      console.log("[SCAN_VALIDATION] result:", validation);
      return validation;
    },
    buildRetryHintFn: buildRetryHint,
  });

  const generateEndedAt = Date.now();
  const generateElapsedMs = generateEndedAt - generateStartedAt;
  const generateElapsedSec = (generateElapsedMs / 1000).toFixed(2);

  console.log("[SCAN_TIMING] generate_endedAt:", generateEndedAt);
  console.log("[SCAN_TIMING] generate_elapsedMs:", generateElapsedMs);
  console.log("[SCAN_TIMING] generate_elapsedSec:", generateElapsedSec);

  const formatStartedAt = Date.now();
  console.log("[SCAN_TIMING] format_startedAt:", formatStartedAt);

  const finalText = formatScanOutput(result.output);

  const formatEndedAt = Date.now();
  const formatElapsedMs = formatEndedAt - formatStartedAt;
  const formatElapsedSec = (formatElapsedMs / 1000).toFixed(2);

  console.log("[SCAN] final formatted output length:", finalText.length);
  console.log("[SCAN_TIMING] format_endedAt:", formatEndedAt);
  console.log("[SCAN_TIMING] format_elapsedMs:", formatElapsedMs);
  console.log("[SCAN_TIMING] format_elapsedSec:", formatElapsedSec);

  const finalValidation = validateOutput(finalText, userRecents, globalRecents);
  console.log("[SCAN] final validation:", finalValidation);
  console.log("[SCAN] retry accepted:", result.accepted);
  console.log("[SCAN] retry final reason:", result.reason);
  console.log("[SCAN] retry final attempt:", result.attempt);

  const storeStartedAt = Date.now();
  console.log("[SCAN_TIMING] store_startedAt:", storeStartedAt);

  addRecentOutput(userId, finalText);

  const storeEndedAt = Date.now();
  const storeElapsedMs = storeEndedAt - storeStartedAt;
  const storeElapsedSec = (storeElapsedMs / 1000).toFixed(2);

  console.log("[SCAN] recent output saved");
  console.log("[SCAN_TIMING] store_endedAt:", storeEndedAt);
  console.log("[SCAN_TIMING] store_elapsedMs:", storeElapsedMs);
  console.log("[SCAN_TIMING] store_elapsedSec:", storeElapsedSec);

  const scanEndedAt = Date.now();
  const totalElapsedMs = scanEndedAt - scanStartedAt;
  const totalElapsedSec = (totalElapsedMs / 1000).toFixed(2);

  console.log("[SCAN_TIMING] endedAt:", scanEndedAt);
  console.log("[SCAN_TIMING] totalElapsedMs:", totalElapsedMs);
  console.log("[SCAN_TIMING] totalElapsedSec:", totalElapsedSec);

  return finalText;
}