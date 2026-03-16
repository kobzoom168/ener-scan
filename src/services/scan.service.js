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

  console.log("runDeepScan started");
  console.log("birthdate:", birthdate);
  console.log("recent outputs count:", recentOutputs.length);
  console.log("image base64 length:", imageBase64.length);

  const output = await generateWithRetry({
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
    isBadOutputFn: (text) => {
      if (!text || text.length < 120) {
        console.log("bad output: too short or empty");
        return true;
      }

      if (hasRepeatedPhrase(text)) {
        console.log("bad output: repeated banned phrase");
        return true;
      }

      if (tooSimilarToRecent(text, recentOutputs, 0.62)) {
        console.log("bad output: too similar to recent outputs");
        return true;
      }

      return false;
    },
    buildRetryHintFn: () => {
      return "ผลลัพธ์ก่อนหน้าคล้ายข้อความเดิมมากเกินไป ให้เขียนใหม่โดยเปลี่ยนคำเปรียบเทียบ มุมเล่า และคำปิดท้ายทั้งหมด แต่ยังคงความหมายเดิมและคง format เดิม";
    },
  });

  const finalText = formatScanOutput(output);

  console.log("final formatted output length:", finalText.length);

  addRecentOutput(userId, finalText);
  console.log("recent output saved");

  return finalText;
}