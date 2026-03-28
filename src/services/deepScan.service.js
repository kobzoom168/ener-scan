import { env } from "../config/env.js";
import {
  deepScanJsonSystemPrompt,
  buildDeepScanJsonUserPrompt,
} from "../prompts/deepScanJson.prompt.js";
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
import {
  parseDeepScanModelJson,
  renderDeepScanJsonToLegacyText,
} from "./deepScanJson.service.js";

/**
 * @param {{ imageBase64: string, birthdate: string, retryHint?: string, mimeType?: string, objectCategory?: string, knowledgeBase?: string }} opts
 */
export async function runDeepScanPipeline({
  imageBase64,
  birthdate,
  retryHint = "",
  mimeType = "image/jpeg",
  objectCategory = "พระเครื่อง",
  knowledgeBase = "",
}) {
  const userPrompt = buildDeepScanJsonUserPrompt({
    objectCategory,
    knowledgeBase,
    birthdate,
    retryHint,
  });

  const rawModelText = normalizeDeepScanText(
    await generateDeepScanDraft({
      systemPrompt: deepScanJsonSystemPrompt,
      userPrompt,
      imageBase64,
      mimeType,
    }),
  );

  const parsed = parseDeepScanModelJson(rawModelText);
  const draft = normalizeDeepScanText(
    parsed
      ? renderDeepScanJsonToLegacyText(parsed, objectCategory)
      : rawModelText,
  );

  if (!parsed) {
    console.warn("[DEEP_SCAN] JSON parse failed, using raw model text", {
      preview: rawModelText.slice(0, 200),
    });
  }

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
