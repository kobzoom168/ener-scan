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
    too_similar_user_recent: "ผลลัพธ์นี้คล้ายกับผลล่าสุดของผู้ใช้คนนี้มากเกินไป ต้องเปลี่ยนคำเด่นและโทนเล่า",
    too_similar_global_recent: "ผลลัพธ์นี้คล้ายกับเคสล่าสุดโดยรวมมากเกินไป ต้องเปลี่ยนภาพรวมและคำเปรียบเทียบ",
    too_generic_feel: "ภาษายังกลางเกินไป ให้ทำให้เฉพาะชิ้นมากขึ้นและมีคำเด่นที่จำง่าย",
  };

  return `${base} เงื่อนไขเฉพาะรอบนี้: ${reasonMap[reason] || "เขียนใหม่ให้สดขึ้น"}`;
}

export async function runDeepScan({ imageBuffer, birthdate, userId }) {
  const imageBase64 = toBase64(imageBuffer);
  const userRecents = getRecentOutputs(userId);
  const globalRecents = getGlobalRecentOutputs();

  console.log("runDeepScan started");
  console.log("birthdate:", birthdate);
  console.log("user recent outputs count:", userRecents.length);
  console.log("global recent outputs count:", globalRecents.length);
  console.log("image base64 length:", imageBase64.length);

  const result = await generateWithRetry({
    maxRetries: 2,
    generateFn: async ({ attempt, retryHint }) => {
      console.log(`generate attempt #${attempt}`);
      const text = await generateScanText({
        imageBase64,
        birthdate,
        retryHint,
      });
      console.log(`attempt #${attempt} output length:`, text.length);
      return text;
    },
    isBadOutputFn: (text) => validateOutput(text, userRecents, globalRecents),
    buildRetryHintFn: buildRetryHint,
  });

  let finalText = formatScanOutput(result.output);

  const finalValidation = validateOutput(finalText, userRecents, globalRecents);
  console.log("final validation:", finalValidation);

  addRecentOutput(userId, finalText);
  console.log("recent output saved");

  return finalText;
}