import { openai } from "./openaiDeepScan.api.js";
import { deepScanScoreSystemPrompt } from "../prompts/deepScanScore.prompt.js";
import { deepScanImproveSystemPrompt } from "../prompts/deepScanImprove.prompt.js";

/**
 * @param {string} raw
 * @returns {string}
 */
function extractJsonPayload(raw) {
  const s = String(raw || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

/** @returns {object} normalized score object */
export function safeParseDeepScanScore(raw) {
  try {
    const parsed = JSON.parse(extractJsonPayload(raw));

    return {
      readability: Number(parsed.readability || 0),
      specificity: Number(parsed.specificity || 0),
      life_relevance: Number(parsed.life_relevance || 0),
      language_flow: Number(parsed.language_flow || 0),
      memorability: Number(parsed.memorability || 0),
      total_score: Number(parsed.total_score || 0),
      weak_points: Array.isArray(parsed.weak_points) ? parsed.weak_points : [],
      improve_hint: String(parsed.improve_hint || "").trim(),
    };
  } catch {
    return {
      readability: 0,
      specificity: 0,
      life_relevance: 0,
      language_flow: 0,
      memorability: 0,
      total_score: 0,
      weak_points: ["parse_failed"],
      improve_hint: "ทำให้ภาษาอ่านง่ายขึ้น ชัดขึ้น และเฉพาะชิ้นมากขึ้น",
    };
  }
}

export async function scoreDeepScanText(text) {
  const startedAt = Date.now();

  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: deepScanScoreSystemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text }],
      },
    ],
    temperature: 0.2,
  });

  const raw = String(response.output_text || "").trim() || "{}";

  console.log("[DEEP_SCAN_SCORE_TIMING]", {
    model: "gpt-4o-mini",
    ms: Date.now() - startedAt,
    outputLength: raw.length,
  });

  return safeParseDeepScanScore(raw);
}

/**
 * @param {{ text: string, improveHint?: string, weakPoints?: string[] }} opts
 * @returns {Promise<string>}
 */
export async function improveDeepScanText({ text, improveHint, weakPoints = [] }) {
  const startedAt = Date.now();

  const userPrompt = `
ข้อความเดิม:
${text}

จุดที่ยังอ่อน:
${weakPoints.join(", ") || "-"}

คำแนะนำในการปรับ:
${improveHint || "-"}

ช่วยปรับข้อความตามกติกาเดิม โดยคง format เดิม 100%
`.trim();

  const response = await openai.responses.create({
    model: "gpt-4o",
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: deepScanImproveSystemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
    temperature: 0.7,
  });

  const improved = String(response.output_text || "").trim();

  console.log("[DEEP_SCAN_IMPROVE_TIMING]", {
    model: "gpt-4o",
    ms: Date.now() - startedAt,
    outputLength: improved.length,
  });

  return improved;
}
