import { generateScanText } from "./openai.service.js";
import { generateWithRetry } from "./retry.service.js";
import { formatScanOutput } from "./formatter.service.js";

import {
  hasRepeatedPhrase,
  tooSimilarToRecent,
} from "../utils/similarity.js";

import {
  addRecentOutput,
  getRecentOutputs,
} from "../stores/recentOutputs.store.js";

function toBase64(buffer) {
  return buffer.toString("base64");
}

export async function runDeepScan({ imageBuffer, birthdate, userId }) {
  const imageBase64 = toBase64(imageBuffer);
  const recentOutputs = getRecentOutputs(userId);

  const output = await generateWithRetry({
    maxRetries: 2,
    generateFn: async ({ retryHint }) => {
      return generateScanText({
        imageBase64,
        birthdate,
        retryHint,
      });
    },
    isBadOutputFn: (text) => {
      if (!text || text.length < 120) return true;
      if (hasRepeatedPhrase(text)) return true;
      if (tooSimilarToRecent(text, recentOutputs, 0.62)) return true;
      return false;
    },
    buildRetryHintFn: () => {
      return "ผลลัพธ์ก่อนหน้าคล้ายข้อความมาตรฐานหรือซ้ำกับเคสเก่าเกินไป ให้เขียนใหม่โดยเปลี่ยนคำเปรียบเทียบ มุมเล่า และคำปิดท้ายทั้งหมด แต่ยังคงความหมายเดิมและคง format เดิม";
    },
  });

  const finalText = formatScanOutput(output);
  addRecentOutput(userId, finalText);

  return finalText;
}