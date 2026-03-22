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
import {
  improveDeepScanText,
  scoreDeepScanText,
} from "./deepScanQuality.service.js";
import {
  createEmptyQualityAnalytics,
  QUALITY_SKIP_REASONS,
} from "./deepScanQualityAnalytics.service.js";

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
 * @returns {Promise<{ text: string, qualityAnalytics: Object }>}
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
    return {
      text: draft,
      qualityAnalytics: createEmptyQualityAnalytics({
        improve_skipped_reason: QUALITY_SKIP_REASONS.DRAFT_FORMAT_INVALID,
        latency_ms: 0,
      }),
    };
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

  let finalText = draft;

  if (env.ENABLE_DEEP_SCAN_REWRITE) {
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
      } else if (!isDeepScanPolished(rewritten)) {
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
      } else {
        finalText = rewritten;
      }
    } catch (error) {
      console.error("[DEEP_SCAN] rewrite failed, fallback to draft", {
        message: error?.message,
      });
    }
  }

  let qa = createEmptyQualityAnalytics();

  if (!env.ENABLE_DEEP_SCAN_SCORING) {
    qa = createEmptyQualityAnalytics({
      scoring_enabled: false,
      improve_skipped_reason: QUALITY_SKIP_REASONS.SCORING_DISABLED,
      latency_ms: 0,
    });
    return { text: finalText, qualityAnalytics: qa };
  }

  if (!isDeepScanFormatValid(finalText) || !isDeepScanPolished(finalText)) {
    qa = createEmptyQualityAnalytics({
      scoring_enabled: true,
      improve_skipped_reason: QUALITY_SKIP_REASONS.NOT_ELIGIBLE_NOT_POLISHED,
      latency_ms: 0,
    });
    return { text: finalText, qualityAnalytics: qa };
  }

  const qLayerStart = Date.now();

  try {
    const quality = await scoreDeepScanText(finalText);

    console.log("[DEEP_SCAN_QUALITY_SCORE]", quality);

    const total = Number(quality.total_score);
    const scoreParseFailed =
      Array.isArray(quality.weak_points) &&
      quality.weak_points.includes("parse_failed");

    qa.scoring_enabled = true;

    if (scoreParseFailed) {
      qa.score_before = null;
      qa.score_after = null;
      qa.improve_skipped_reason = QUALITY_SKIP_REASONS.SCORE_PARSE_FAILED;
    } else if (Number.isFinite(total) && total >= env.DEEP_SCAN_HIGH_QUALITY_SCORE) {
      console.log("[DEEP_SCAN] high quality, skip improve", {
        total_score: total,
        high: env.DEEP_SCAN_HIGH_QUALITY_SCORE,
      });
      qa.improve_skipped_reason = QUALITY_SKIP_REASONS.HIGH_QUALITY_SKIP;
    } else if (
      Number.isFinite(total) &&
      total <= env.DEEP_SCAN_IMPROVE_FLOOR_SCORE
    ) {
      console.warn("[DEEP_SCAN_IMPROVE_THROTTLE_SKIP]", {
        total_score: total,
        floor: env.DEEP_SCAN_IMPROVE_FLOOR_SCORE,
      });
      qa.improve_skipped_reason = QUALITY_SKIP_REASONS.FLOOR_THROTTLE;
    } else if (
      Number.isFinite(total) &&
      total >= env.DEEP_SCAN_MIN_QUALITY_SCORE
    ) {
      qa.improve_skipped_reason = QUALITY_SKIP_REASONS.IMPROVE_NOT_NEEDED;
    } else if (!env.ENABLE_DEEP_SCAN_AUTO_IMPROVE) {
      qa.improve_skipped_reason = QUALITY_SKIP_REASONS.AUTO_IMPROVE_OFF;
    }

    if (!scoreParseFailed) {
      qa.score_before = Number.isFinite(total) ? total : null;
      qa.score_after = qa.score_before;
    }

    const shouldImprove =
      env.ENABLE_DEEP_SCAN_AUTO_IMPROVE &&
      !scoreParseFailed &&
      Number.isFinite(total) &&
      total < env.DEEP_SCAN_MIN_QUALITY_SCORE &&
      total > env.DEEP_SCAN_IMPROVE_FLOOR_SCORE &&
      total < env.DEEP_SCAN_HIGH_QUALITY_SCORE;

    if (shouldImprove) {
      console.warn("[DEEP_SCAN_QUALITY_BELOW_THRESHOLD]", {
        total_score: total,
        min: env.DEEP_SCAN_MIN_QUALITY_SCORE,
        high: env.DEEP_SCAN_HIGH_QUALITY_SCORE,
        floor: env.DEEP_SCAN_IMPROVE_FLOOR_SCORE,
      });

      const scoreBeforeImprove = total;
      qa.improve_attempted = true;
      qa.improve_skipped_reason = null;

      const improved = normalizeDeepScanText(
        await improveDeepScanText({
          text: finalText,
          improveHint: quality.improve_hint,
          weakPoints: quality.weak_points,
        }),
      );

      if (
        !improved ||
        !isDeepScanFormatValid(improved) ||
        !isDeepScanPolished(improved)
      ) {
        console.warn("[DEEP_SCAN_IMPROVE_FALLBACK]", {
          reason: !improved ? "empty_output" : "validation_failed",
          improvedPreview: improved?.slice(0, 280),
        });
        qa.improve_skipped_reason =
          QUALITY_SKIP_REASONS.IMPROVE_VALIDATION_FAILED;
      } else {
        try {
          const improvedScore = await scoreDeepScanText(improved);
          const rescoreParseFailed =
            Array.isArray(improvedScore.weak_points) &&
            improvedScore.weak_points.includes("parse_failed");
          const after = Number(improvedScore.total_score);
          const delta =
            Number.isFinite(after) && Number.isFinite(scoreBeforeImprove)
              ? after - scoreBeforeImprove
              : null;

          qa.delta = delta;

          if (rescoreParseFailed) {
            console.warn("[DEEP_SCAN_IMPROVE_RESCORE_UNTRUSTED]", {
              reason: "parse_failed",
              score_before: scoreBeforeImprove,
            });
            qa.improve_skipped_reason = QUALITY_SKIP_REASONS.RESCORE_UNTRUSTED;
          } else if (!Number.isFinite(after) || after <= scoreBeforeImprove) {
            console.warn("[DEEP_SCAN_IMPROVE_NO_GAIN]", {
              before: scoreBeforeImprove,
              after,
              delta,
            });
            qa.improve_skipped_reason = QUALITY_SKIP_REASONS.NO_GAIN;
            qa.score_after = qa.score_before;
          } else {
            finalText = improved;
            qa.improve_applied = true;
            qa.improve_skipped_reason = null;
            qa.score_after = Number.isFinite(after) ? after : qa.score_before;
            console.log("[DEEP_SCAN_IMPROVE_APPLIED]", {
              total_score_before: scoreBeforeImprove,
              total_score_after: after,
              delta,
            });
          }
        } catch (rescoreErr) {
          console.warn("[DEEP_SCAN_IMPROVE_RESCORE_FAILED]", {
            message: rescoreErr?.message,
            score_before: scoreBeforeImprove,
          });
          qa.improve_skipped_reason = QUALITY_SKIP_REASONS.RESCORE_FAILED;
        }
      }
    }

    qa.latency_ms = Math.max(0, Date.now() - qLayerStart);
  } catch (error) {
    console.error("[DEEP_SCAN] scoring/improve failed, skip quality layer", {
      message: error?.message,
    });
    qa = createEmptyQualityAnalytics({
      scoring_enabled: true,
      improve_skipped_reason: QUALITY_SKIP_REASONS.QUALITY_LAYER_ERROR,
      latency_ms: Math.max(0, Date.now() - qLayerStart),
    });
  }

  return { text: finalText, qualityAnalytics: qa };
}

/** Alias — same as `runDeepScanPipeline` */
export const runDeepScanWithRewrite = runDeepScanPipeline;
