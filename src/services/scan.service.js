import { generateScanText } from "./openai.service.js";
import { openai, withOpenAi429RetryOnce } from "./openaiDeepScan.api.js";
import { getKnowledgeForCategory } from "../config/scanKnowledgeBase.js";
import { generateWithRetry } from "./retry.service.js";
import { formatScanOutput } from "./formatter.service.js";
import { getImageHash } from "./dedupe.service.js";
import {
  getCachedScanResult,
  saveCachedScanResult,
  markCachedScanHit,
  getScanCacheVersion,
} from "../stores/scanResultCache.db.js";

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
import {
  createEmptyQualityAnalytics,
  enrichQualityAnalyticsForPersist,
  QUALITY_SKIP_REASONS,
} from "./deepScanQualityAnalytics.service.js";
import { extractDominantColorSlugFromBuffer } from "../utils/reports/reportPipelineDominantColor.util.js";

function toBase64(buffer) {
  return Buffer.isBuffer(buffer) ? buffer.toString("base64") : "";
}

const OBJECT_CLASSIFIER_DEFAULT = "พระเครื่อง";

const OBJECT_CLASSIFIER_VALID = [
  "พระเครื่อง",
  "คริสตัล/หิน",
  "เครื่องรางของขลัง",
  "พระบูชา",
  "อื่นๆ",
];

function normalizeClassifierCategoryLabel(text) {
  const t = String(text || "").trim();
  for (const label of OBJECT_CLASSIFIER_VALID) {
    if (t === label || t.includes(label)) return label;
  }
  return OBJECT_CLASSIFIER_DEFAULT;
}

/**
 * Lightweight vision step before deep scan: single Thai category label.
 * On any failure returns "พระเครื่อง".
 * @param {string} imageBase64
 * @returns {Promise<string>}
 */
export async function classifyObjectCategory(imageBase64) {
  const clean = String(imageBase64 || "").trim();
  if (!clean) return OBJECT_CLASSIFIER_DEFAULT;

  try {
    const response = await withOpenAi429RetryOnce(() => {
      const model = "gpt-4.1-mini";
      console.log("[OPENAI_MODEL]", model);
      return openai.responses.create({
        model,
        temperature: 0,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `You MUST decide from the actual pixels in the image (not from assumptions). Classify the object into exactly one category:
พระเครื่อง | คริสตัล/หิน | เครื่องรางของขลัง | พระบูชา | อื่นๆ
Reply with only the category name in Thai. Nothing else.`,
              },
              {
                type: "input_image",
                image_url: `data:image/jpeg;base64,${clean}`,
              },
            ],
          },
        ],
      });
    });
    const raw = String(response.output_text || "").trim();
    return normalizeClassifierCategoryLabel(raw);
  } catch (err) {
    console.error("[OBJECT_CLASSIFY] failed, using default category:", {
      message: err?.message,
    });
    return OBJECT_CLASSIFIER_DEFAULT;
  }
}

function isScanCacheBypassEnabled() {
  const v = String(
    process.env.SCAN_CACHE_BYPASS ||
      process.env.DISABLE_SCAN_RESULT_CACHE ||
      "",
  )
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function ensureScanInputs({ imageBuffer, birthdate, userId }) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error("invalid_image_buffer");
  }

  if (!String(birthdate || "").trim()) {
    throw new Error("missing_birthdate");
  }

  if (!String(userId || "").trim()) {
    throw new Error("missing_user_id");
  }
}

function validateOutput(text, userRecents, globalRecents) {
  const cleanText = String(text || "").trim();

  if (!cleanText || cleanText.length < 120) {
    return { isBad: true, reason: "too_short" };
  }

  if (hasRepeatedPhrase(cleanText)) {
    return { isBad: true, reason: "banned_phrase" };
  }

  if (hasRepeatedClosing(cleanText)) {
    return { isBad: true, reason: "repeated_closing" };
  }

  if (tooSimilarToRecent(cleanText, userRecents, 0.62)) {
    return { isBad: true, reason: "too_similar_user_recent" };
  }

  if (tooSimilarToRecent(cleanText, globalRecents, 0.7)) {
    return { isBad: true, reason: "too_similar_global_recent" };
  }

  const duplicateFeelCount = countMatchesFromList(cleanText, [
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
    repeated_closing:
      "เปลี่ยนประโยคปิดท้ายใหม่ทั้งหมด ห้ามใช้ประโยคชวนต่อเดิม",
    too_similar_user_recent:
      "ผลลัพธ์นี้คล้ายกับผลล่าสุดของผู้ใช้คนนี้มากเกินไป ต้องเปลี่ยนคำเด่นและโทนเล่า",
    too_similar_global_recent:
      "ผลลัพธ์นี้คล้ายกับเคสล่าสุดโดยรวมมากเกินไป ต้องเปลี่ยนภาพรวมและคำเปรียบเทียบ",
    too_generic_feel:
      "ภาษายังกลางเกินไป ให้ทำให้เฉพาะชิ้นมากขึ้นและมีคำเด่นที่จำง่าย",
    empty_output: "ตอบใหม่ตาม format เดิมให้ครบทุกหัวข้อ",
  };

  return `${base} เงื่อนไขเฉพาะรอบนี้: ${
    reasonMap[reason] || "เขียนใหม่ให้สดขึ้น"
  }`;
}

async function generateScanWithValidation({
  imageBase64,
  birthdate,
  userRecents,
  globalRecents,
  objectCategory,
  knowledgeBase,
}) {
  return generateWithRetry({
    maxRetries: 2,

    generateFn: async ({ attempt, retryHint }) => {
      const attemptStartedAt = Date.now();

      console.log(`[SCAN_ATTEMPT] #${attempt}`);
      console.log("[SCAN_ATTEMPT] retryHint:", retryHint || "none");

      const text = await generateScanText({
        imageBase64,
        birthdate,
        retryHint,
        objectCategory,
        knowledgeBase,
      });

      const attemptEndedAt = Date.now();

      console.log("[SCAN_ATTEMPT] output length:", String(text || "").length);
      console.log(
        "[SCAN_ATTEMPT] elapsedMs:",
        attemptEndedAt - attemptStartedAt
      );

      return text;
    },

    isBadOutputFn: (text) => {
      const validation = validateOutput(text, userRecents, globalRecents);
      console.log("[SCAN_VALIDATION]", validation);
      return validation;
    },

    buildRetryHintFn: buildRetryHint,
  });
}

export async function runDeepScan({ imageBuffer, birthdate, userId }) {
  const scanStartedAt = Date.now();

  console.log("[SCAN_TIMING] startedAt:", scanStartedAt);
  console.log("[SCAN] runDeepScan started");
  console.log("[SCAN] birthdate:", birthdate);
  console.log("[SCAN] userId:", userId);

  ensureScanInputs({ imageBuffer, birthdate, userId });

  const imageBase64 = toBase64(imageBuffer);

  console.log("[SCAN] image buffer length:", imageBuffer.length);
  console.log("[SCAN] image base64 length:", imageBase64.length);

  /*
  ------------------------------------------------
  PERSISTENT CACHE (after same validations as caller: buffer + birthdate)
  ------------------------------------------------
  */
  const cacheVersion = getScanCacheVersion();
  const skipCache = isScanCacheBypassEnabled();

  if (skipCache) {
    console.log(
      JSON.stringify({
        event: "scan_result_cache",
        outcome: "bypass",
        reason: "SCAN_CACHE_BYPASS or DISABLE_SCAN_RESULT_CACHE",
        cacheVersion,
        userId,
      }),
    );
  }

  let imageHash = "";
  try {
    imageHash = await getImageHash(imageBuffer);
    if (!skipCache) {
      const cached = await getCachedScanResult({
        imageHash,
        birthdate,
        promptVersion: cacheVersion,
      });
      if (cached?.result_text) {
        try {
          await markCachedScanHit(cached.id);
        } catch (hitErr) {
          console.error("[SCAN_CACHE] markCachedScanHit failed (ignored):", hitErr?.message);
        }
        const finalText = String(cached.result_text).trim();
        addRecentOutput(userId, finalText);
        const scanEndedAt = Date.now();
        /**
         * DB `scan_result_cache` does not persist `object_category` yet (only result_text + object_type).
         * Re-run the same vision classifier used on fresh scans so Object Energy gets a real label — not a guess from cache text.
         * Dominant color: re-extract from the same buffer (not from cached text).
         */
        const classifyPromise = (async () => {
          try {
            const oc = await classifyObjectCategory(imageBase64);
            return { objectCategory: oc, objectCategorySource: /** @type {const} */ ("cache_classify") };
          } catch (clasErr) {
            console.error("[SCAN_CACHE] classifyObjectCategory on cache hit failed:", {
              message: clasErr?.message,
            });
            return { objectCategory: null, objectCategorySource: /** @type {const} */ ("missing") };
          }
        })();
        const colorPromise = extractDominantColorSlugFromBuffer(imageBuffer);
        const [cls, domExtract] = await Promise.all([classifyPromise, colorPromise]);
        const objectCategory = cls.objectCategory;
        const objectCategorySource = cls.objectCategorySource;
        const dominantColorSlug =
          domExtract.source === "vision_v1" ? domExtract.slug : undefined;
        const dominantColorSource = domExtract.source === "vision_v1" ? "vision_v1" : "none";
        console.log(
          JSON.stringify({
            event: "scan_result_cache",
            outcome: "hit",
            userId,
            cacheId: cached.id,
            elapsedMs: scanEndedAt - scanStartedAt,
            objectCategorySource,
            hasObjectCategory: Boolean(objectCategory && String(objectCategory).trim()),
            dominantColorSource,
            dominantColorSlug: dominantColorSlug ?? null,
          }),
        );
        if (domExtract.source === "vision_v1") {
          console.log(
            JSON.stringify({
              event: "SCAN_DOMINANT_COLOR_V1",
              path: "cache_hit",
              userId,
              slug: domExtract.slug,
              confidence: domExtract.confidence,
              pixelCount: domExtract.pixelCount ?? null,
            }),
          );
        }
        return {
          resultText: finalText,
          fromCache: true,
          objectCategory,
          objectCategorySource,
          dominantColorSlug,
          dominantColorSource,
          qualityAnalytics: enrichQualityAnalyticsForPersist(
            createEmptyQualityAnalytics({
              improve_skipped_reason: QUALITY_SKIP_REASONS.FROM_CACHE,
              latency_ms: 0,
            }),
            { resultText: finalText },
          ),
        };
      }
    }
  } catch (cacheErr) {
    console.error("[SCAN_CACHE] lookup failed (continuing with OpenAI):", {
      message: cacheErr?.message,
      code: cacheErr?.code,
    });
  }

  /*
  ------------------------------------------------
  LOAD RECENTS
  ------------------------------------------------
  */
  const userRecents = getRecentOutputs(userId);
  const globalRecents = getGlobalRecentOutputs();

  console.log("[SCAN] user recent outputs:", userRecents.length);
  console.log("[SCAN] global recent outputs:", globalRecents.length);

  /*
  ------------------------------------------------
  OBJECT CATEGORY + KNOWLEDGE (before deep scan)
  ------------------------------------------------
  */
  const [objectCategory, domExtract] = await Promise.all([
    classifyObjectCategory(imageBase64),
    extractDominantColorSlugFromBuffer(imageBuffer),
  ]);
  const dominantColorSlug =
    domExtract.source === "vision_v1" ? domExtract.slug : undefined;
  const dominantColorSource =
    domExtract.source === "vision_v1" ? "vision_v1" : "none";
  if (domExtract.source === "vision_v1") {
    console.log(
      JSON.stringify({
        event: "SCAN_DOMINANT_COLOR_V1",
        path: "fresh_scan",
        userId,
        slug: domExtract.slug,
        confidence: domExtract.confidence,
        pixelCount: domExtract.pixelCount ?? null,
      }),
    );
  }
  const knowledgeBase = getKnowledgeForCategory(objectCategory);
  console.log("[SCAN] objectCategory:", objectCategory, {
    knowledgeChars: knowledgeBase.length,
  });

  /*
  ------------------------------------------------
  GENERATE AI
  ------------------------------------------------
  */
  const generateStartedAt = Date.now();

  const result = await generateScanWithValidation({
    imageBase64,
    birthdate,
    userRecents,
    globalRecents,
    objectCategory,
    knowledgeBase,
  });

  const generateEndedAt = Date.now();

  console.log(
    "[SCAN_TIMING] generateElapsedMs:",
    generateEndedAt - generateStartedAt
  );
  console.log("[SCAN] generate result:", {
    attempt: result.attempt,
    accepted: result.accepted,
    reason: result.reason,
  });

  /*
  ------------------------------------------------
  FORMAT OUTPUT
  ------------------------------------------------
  */
  const formatStartedAt = Date.now();

  const finalText = formatScanOutput(result.output);

  const formatEndedAt = Date.now();

  console.log("[SCAN] formatted length:", finalText.length);
  console.log(
    "[SCAN_TIMING] formatElapsedMs:",
    formatEndedAt - formatStartedAt
  );

  /*
  ------------------------------------------------
  FINAL VALIDATION
  ------------------------------------------------
  */
  const finalValidation = validateOutput(finalText, userRecents, globalRecents);

  console.log("[SCAN] final validation:", finalValidation);

  if (finalValidation.isBad) {
    console.log(
      "[SCAN] final output still not ideal, but returning best available result"
    );
  }

  /*
  ------------------------------------------------
  SAVE RECENT
  ------------------------------------------------
  */
  const storeStartedAt = Date.now();

  addRecentOutput(userId, finalText);

  const storeEndedAt = Date.now();

  console.log("[SCAN] recent output saved");
  console.log("[SCAN_TIMING] storeElapsedMs:", storeEndedAt - storeStartedAt);

  /*
  ------------------------------------------------
  SAVE CACHE (best-effort) — only when final validation passed (good quality)
  ------------------------------------------------
  */
  if (imageHash && !skipCache && !finalValidation.isBad) {
    try {
      await saveCachedScanResult({
        imageHash,
        birthdate,
        resultText: finalText,
        objectType: "single_supported",
        promptVersion: cacheVersion,
      });
      console.log(
        JSON.stringify({
          event: "scan_result_cache",
          outcome: "saved",
          userId,
          promptVersion: cacheVersion,
        })
      );
    } catch (saveErr) {
      console.error("[SCAN_CACHE] save failed (ignored):", saveErr?.message);
    }
  } else if (imageHash && skipCache) {
    console.log(
      JSON.stringify({
        event: "scan_result_cache",
        outcome: "skip_save",
        reason: "bypass",
        userId,
      }),
    );
  } else if (imageHash && finalValidation.isBad) {
    console.log(
      JSON.stringify({
        event: "scan_result_cache",
        outcome: "skip_save",
        reason: "final_validation_bad",
        validationReason: finalValidation.reason,
        userId,
      })
    );
  }

  /*
  ------------------------------------------------
  FINISH
  ------------------------------------------------
  */
  const scanEndedAt = Date.now();

  console.log("[SCAN_TIMING] totalElapsedMs:", scanEndedAt - scanStartedAt);

  const qualityAnalytics = enrichQualityAnalyticsForPersist(
    result.qualityAnalytics ?? null,
    { resultText: finalText },
  );

  console.log("[SCAN_QUALITY_ANALYTICS]", qualityAnalytics);

  return {
    resultText: finalText,
    fromCache: false,
    objectCategory,
    /** Thai classifier label — always from {@link classifyObjectCategory} on this image (fresh path). */
    objectCategorySource: "deep_scan",
    dominantColorSlug,
    dominantColorSource,
    qualityAnalytics,
  };
}