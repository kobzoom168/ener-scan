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
  updateCachedScanSignals,
  shouldPersistDominantColorForCache,
  cacheRowHasPersistedObjectCategory,
  cacheRowHasPersistedDominantColor,
} from "../stores/scanResultCache.db.js";

import {
  hasRepeatedPhrase,
  hasRepeatedClosing,
  scoreTooSimilarToRecent,
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
 * @param {string} cleanBase64
 * @returns {Promise<{ output_text?: string }>}
 */
async function defaultInvokeClassifier(cleanBase64) {
  return await withOpenAi429RetryOnce(() => {
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
              image_url: `data:image/jpeg;base64,${cleanBase64}`,
            },
          ],
        },
      ],
    });
  });
}

/**
 * Lightweight vision step before deep scan: single Thai category label.
 * Empty input or OpenAI failure returns "อื่นๆ" (unknown / error path).
 * @param {string} imageBase64
 * @param {{ invokeClassifier?: (cleanBase64: string) => Promise<{ output_text?: string }> }} [deps]
 * @returns {Promise<string>}
 */
export async function classifyObjectCategory(imageBase64, deps = {}) {
  const clean = String(imageBase64 || "").trim();
  if (!clean) return "อื่นๆ";

  try {
    const invoke = deps.invokeClassifier ?? defaultInvokeClassifier;
    const response = await invoke(clean);
    const raw = String(response.output_text || "").trim();
    return normalizeClassifierCategoryLabel(raw);
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "OBJECT_CLASSIFY_ERROR_DEFAULT_USED",
        fallback: "อื่นๆ",
        message: String(err?.message || "").slice(0, 200),
      }),
    );
    return "อื่นๆ";
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

function logSimilarityReject(scope, detail) {
  console.log(
    JSON.stringify({
      event: "SCAN_SIMILARITY_REJECT",
      scope,
      saveRecentMode: "accepted_only",
      acceptedRecentCount: detail.acceptedRecentCount ?? null,
      ...detail,
    }),
  );
}

function validateOutput(
  text,
  userRecents,
  globalRecents,
  { acceptedRecentCount } = {},
) {
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

  const userSim = scoreTooSimilarToRecent(cleanText, userRecents, "user");
  if (userSim.tooSimilar) {
    logSimilarityReject("user_recent", {
      matchKind: userSim.matchKind,
      userRecentMaxNarrativeWord: Number(userSim.maxNarrativeWord.toFixed(4)),
      userRecentMaxNarrativeBigram: Number(userSim.maxNarrativeBigram.toFixed(4)),
      userRecentMaxFullWord: Number(userSim.maxFullWord.toFixed(4)),
      userRecentMaxFullBigram: Number(userSim.maxFullBigram.toFixed(4)),
      comparedNarrativeLength: userSim.comparedNarrativeLength,
      excludedStructuredSections: userSim.excludedStructuredSections,
      acceptedRecentCount:
        acceptedRecentCount != null ? acceptedRecentCount : userRecents.length,
    });
    return { isBad: true, reason: "too_similar_user_recent" };
  }

  const globalSim = scoreTooSimilarToRecent(cleanText, globalRecents, "global");
  if (globalSim.tooSimilar) {
    logSimilarityReject("global_recent", {
      matchKind: globalSim.matchKind,
      globalRecentMaxNarrativeWord: Number(globalSim.maxNarrativeWord.toFixed(4)),
      globalRecentMaxNarrativeBigram: Number(
        globalSim.maxNarrativeBigram.toFixed(4),
      ),
      globalRecentMaxFullWord: Number(globalSim.maxFullWord.toFixed(4)),
      globalRecentMaxFullBigram: Number(globalSim.maxFullBigram.toFixed(4)),
      comparedNarrativeLength: globalSim.comparedNarrativeLength,
      excludedStructuredSections: globalSim.excludedStructuredSections,
    });
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

export function buildRetryHint(lastOutput, attempt, reason) {
  const oneLine = String(lastOutput || "")
    .replace(/\s+/g, " ")
    .trim();
  const antiEcho =
    oneLine.length > 0
      ? ` ห้ามพิมพ์ซ้ำหรือพาราเฟรสใกล้เคียงกับช่วงนี้ของรอบก่อน: "${oneLine.slice(0, 220)}${oneLine.length > 220 ? "…" : ""}"`
      : "";

  const base =
    "ผลลัพธ์ก่อนหน้าคล้ายข้อความเดิมมากเกินไป ให้เขียนใหม่โดยเปลี่ยนคำเด่น มุมเล่า คำเปรียบเทียบ และคำปิดท้ายทั้งหมด แต่ยังคงความหมายเดิมและคง format เดิม";

  const reasonMap = {
    too_short: "เพิ่มรายละเอียดให้พออ่านรู้เรื่อง แต่ยังต้องกระชับ",
    banned_phrase: "ห้ามใช้วลีเปรียบเทียบเดิมหรือวลีมาตรฐานที่ซ้ำง่าย",
    repeated_closing:
      "เปลี่ยนประโยคปิดท้ายใหม่ทั้งหมด ห้ามใช้ประโยคชวนต่อเดิม",
    too_similar_user_recent:
      "โฟกัสที่ย่อหน้า ภาพรวม เหตุผลที่เข้ากับเจ้าของ ชิ้นนี้หนุนเรื่อง เหมาะใช้เมื่อ และปิดท้าย — ต้องใช้ประโยคเปิดใหม่ทั้งบล็อก ชุดอุปมาคนละชุด คนละสถานการณ์ชีวิต/บริบทการใช้ คนละคำคม/คำปิด ห้ามสลับแค่คำคุณศัพท์เดิม",
    too_similar_global_recent:
      "ผลลัพธ์นี้คล้ายกับเคสล่าสุดโดยรวมมากเกินไป ต้องเปลี่ยนภาพรวมและคำเปรียบเทียบให้เป็นคนละเรื่องเล่า",
    too_generic_feel:
      "ภาษายังกลางเกินไป ให้ทำให้เฉพาะชิ้นมากขึ้นและมีคำเด่นที่จำง่าย",
    empty_output: "ตอบใหม่ตาม format เดิมให้ครบทุกหัวข้อ",
  };

  const specific = reasonMap[reason] || "เขียนใหม่ให้สดขึ้น";
  const echoBlock =
    reason === "too_similar_user_recent" || reason === "too_similar_global_recent"
      ? antiEcho
      : "";

  return `${base} เงื่อนไขเฉพาะรอบนี้: ${specific}${echoBlock}`;
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
      const validation = validateOutput(text, userRecents, globalRecents, {
        acceptedRecentCount: userRecents.length,
      });
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

        const hasPersistedCategory = cacheRowHasPersistedObjectCategory(cached);
        const hasPersistedDom = cacheRowHasPersistedDominantColor(cached);

        const catP = (async () => {
          if (hasPersistedCategory) {
            return {
              objectCategory: String(cached.object_category).trim(),
              objectCategorySource: /** @type {const} */ ("cache_persisted"),
            };
          }
          try {
            const oc = await classifyObjectCategory(imageBase64);
            return {
              objectCategory: oc,
              objectCategorySource: /** @type {const} */ ("cache_classify"),
            };
          } catch (clasErr) {
            console.error("[SCAN_CACHE] classifyObjectCategory on cache hit failed:", {
              message: clasErr?.message,
            });
            return {
              objectCategory: null,
              objectCategorySource: /** @type {const} */ ("missing"),
            };
          }
        })();

        const domP = (async () => {
          if (hasPersistedDom) {
            return {
              dominantColorSlug: String(cached.dominant_color).trim().toLowerCase(),
              dominantColorSource: /** @type {const} */ ("cache_persisted"),
              domExtract: /** @type {const} */ (null),
            };
          }
          const ex = await extractDominantColorSlugFromBuffer(imageBuffer);
          return {
            dominantColorSlug:
              ex.source === "vision_v1" ? ex.slug : undefined,
            dominantColorSource:
              ex.source === "vision_v1"
                ? /** @type {const} */ ("vision_v1")
                : /** @type {const} */ ("none"),
            domExtract: ex,
          };
        })();

        const [cls, domR] = await Promise.all([catP, domP]);
        const objectCategory = cls.objectCategory;
        const objectCategorySource = cls.objectCategorySource;
        const dominantColorSlug = domR.dominantColorSlug;
        const dominantColorSource = domR.dominantColorSource;

        if (!hasPersistedCategory && objectCategorySource === "cache_classify" && objectCategory) {
          await updateCachedScanSignals(cached.id, {
            objectCategory,
            objectCategorySource: "cache_classify",
          });
        }
        if (
          !hasPersistedDom &&
          dominantColorSource === "vision_v1" &&
          shouldPersistDominantColorForCache(dominantColorSlug, "vision_v1")
        ) {
          await updateCachedScanSignals(cached.id, {
            dominantColor: dominantColorSlug,
            dominantColorSource: "vision_v1",
          });
        }

        console.log(
          JSON.stringify({
            event: "scan_result_cache",
            outcome: "hit",
            userId,
            cacheId: cached.id,
            elapsedMs: scanEndedAt - scanStartedAt,
            objectCategorySource,
            categoryFromCache: hasPersistedCategory,
            hasObjectCategory: Boolean(objectCategory && String(objectCategory).trim()),
            dominantColorSource,
            colorFromCache: hasPersistedDom,
            dominantColorSlug: dominantColorSlug ?? null,
          }),
        );
        if (domR.domExtract && domR.domExtract.source === "vision_v1") {
          console.log(
            JSON.stringify({
              event: "SCAN_DOMINANT_COLOR_V1",
              path: "cache_hit_reextract",
              userId,
              slug: domR.domExtract.slug,
              confidence: domR.domExtract.confidence,
              pixelCount: domR.domExtract.pixelCount ?? null,
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
  const finalValidation = validateOutput(finalText, userRecents, globalRecents, {
    acceptedRecentCount: userRecents.length,
  });

  console.log("[SCAN] final validation:", finalValidation);

  if (finalValidation.isBad) {
    console.log(
      "[SCAN] final output still not ideal, but returning best available result",
    );
    console.log(
      JSON.stringify({
        event: "SCAN_RECENT_SKIP",
        reason: "final_validation_bad",
        validationReason: finalValidation.reason,
        saveRecentMode: "accepted_only",
      }),
    );
  }

  /*
  ------------------------------------------------
  SAVE RECENT (accepted outputs only — avoid poisoning anti-repeat with rejected text)
  ------------------------------------------------
  */
  const storeStartedAt = Date.now();

  if (!finalValidation.isBad) {
    addRecentOutput(userId, finalText);
    console.log("[SCAN] recent output saved (accepted)");
  }

  const storeEndedAt = Date.now();

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
        objectCategory,
        objectCategorySource: "deep_scan",
        dominantColor: dominantColorSlug,
        dominantColorSource:
          dominantColorSource === "vision_v1" ? "vision_v1" : undefined,
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