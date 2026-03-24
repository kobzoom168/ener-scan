import { env } from "../config/env.js";
import { deepScanSystemPrompt } from "../prompts/deepScan.prompt.js";
import {
  deepScanRewriteSystemPrompt,
  buildDeepScanRewriteUserPrompt,
} from "../prompts/deepScanRewrite.prompt.js";
import {
  generateDeepScanDraft,
  rewriteDeepScanDraft,
} from "./openaiDeepScan.api.js";
import {
  isDeepScanFormatValid,
  isDeepScanHumanReadable,
  isDeepScanPolished,
  isDeepScanTooDense,
  normalizeDeepScanText,
} from "./deepScanFormat.service.js";

function buildDeepScanUserPrompt({ birthdate, retryHint = "" }) {
  const cleanBirthdate = String(birthdate || "").trim();
  const cleanRetryHint = String(retryHint || "").trim();
  return `
กรุณาอ่านพลังจากวัตถุในภาพนี้ และเชื่อมโยงกับวันเกิดเจ้าของวัตถุ

วันเกิดเจ้าของวัตถุ: ${cleanBirthdate}

ข้อสำคัญ:
- ระบุผลให้อยู่ใน format ที่กำหนดเท่านั้น
- ใช้ภาษาคน อ่านง่าย
- ต้องรู้สึกเฉพาะชิ้น
- หลังชื่อพลังหลักและบุคลิกเท่านั้น ต้องมีวงเล็บ () อธิบายความหมายภาษาคนสั้น ๆ — โทนพลังไม่ใส่วงเล็กที่บรรทัดนั้น ให้ไปเล่าบริบทใน "ภาพรวม" และ "เหมาะใช้เมื่อ"
- ห้ามอธิบายศัพท์พลังซ้ำในหลายหัวข้อ — กระจายความหมายเป็นประสบการณ์ในภาพรวม/เหมาะใช้เมื่อ
- ทั้งฉบับห้ามใช้ "(" เกิน 5 ครั้ง (ลดความรก)
- ถ้าภาพไม่ชัด ให้ลดระดับความมั่นใจอย่างนุ่มนวล
${cleanRetryHint ? `\nเงื่อนไขเพิ่มสำหรับรอบนี้:\n${cleanRetryHint}` : ""}
`.trim();
}

/**
 * @param {{ imageBase64: string, birthdate: string, retryHint?: string, mimeType?: string }} opts
 */
export async function runDeepScanPipeline({
  imageBase64,
  birthdate,
  retryHint = "",
  mimeType = "image/jpeg",
}) {
  const userPrompt = buildDeepScanUserPrompt({ birthdate, retryHint });

  const draft = normalizeDeepScanText(
    await generateDeepScanDraft({
      systemPrompt: deepScanSystemPrompt,
      userPrompt,
      imageBase64,
      mimeType,
    }),
  );

  if (!isDeepScanFormatValid(draft)) {
    console.warn("[DEEP_SCAN] invalid draft format, using draft as fallback", {
      draftPreview: draft.slice(0, 300),
    });
    return draft;
  }

  if (!isDeepScanHumanReadable(draft)) {
    console.warn("[DEEP_SCAN] draft missing human-readable () on พลังหลัก/บุคลิก — consider enabling rewrite", {
      draftPreview: draft.slice(0, 280),
    });
  }
  if (isDeepScanTooDense(draft)) {
    console.warn("[DEEP_SCAN] draft too many '(' — may feel cluttered", {
      openParens: (draft.match(/\(/g) || []).length,
    });
  }

  if (!env.ENABLE_DEEP_SCAN_REWRITE) {
    return draft;
  }

  try {
    const rewritten = normalizeDeepScanText(
      await rewriteDeepScanDraft({
        systemPrompt: deepScanRewriteSystemPrompt,
        userPrompt: buildDeepScanRewriteUserPrompt(draft),
      }),
    );

    if (!isDeepScanFormatValid(rewritten)) {
      console.warn("[DEEP_SCAN] invalid rewritten format, fallback to draft", {
        rewrittenPreview: rewritten.slice(0, 300),
      });
      return draft;
    }

    if (!isDeepScanPolished(rewritten)) {
      const tooDense = isDeepScanTooDense(rewritten);
      const notHr = !isDeepScanHumanReadable(rewritten);
      console.warn(
        "[DEEP_SCAN] rewritten failed polish check, fallback to draft",
        {
          tooDense,
          notHumanReadable: notHr,
          openParens: (rewritten.match(/\(/g) || []).length,
          rewrittenPreview: rewritten.slice(0, 280),
        },
      );
      return draft;
    }

    return rewritten;
  } catch (error) {
    console.error("[DEEP_SCAN] rewrite failed, fallback to draft", {
      message: error?.message,
    });
    return draft;
  }
}

/** Alias — same as `runDeepScanPipeline` */
export const runDeepScanWithRewrite = runDeepScanPipeline;
