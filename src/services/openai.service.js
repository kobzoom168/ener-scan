import { runDeepScanPipeline } from "./deepScan.service.js";

export {
  generateDeepScanDraft,
  rewriteDeepScanDraft,
  openai,
} from "./openaiDeepScan.api.js";

function validateInput({ imageBase64, birthdate }) {
  const cleanBirthdate = String(birthdate || "").trim();
  const cleanImageBase64 = String(imageBase64 || "").trim();

  if (!cleanBirthdate) {
    throw new Error("birthdate is required");
  }

  if (!cleanImageBase64) {
    throw new Error("imageBase64 is required");
  }

  return {
    cleanBirthdate,
    cleanImageBase64,
  };
}

/**
 * Full pipeline: draft (gpt-4.1-mini, JSON contract → legacy Thai layout) → validate →
 * rewrite (gpt-4.1-mini) optional → validate → fallback.
 * Used by scan.service retry layer via `retryHint`.
 */
export async function generateScanText({
  imageBase64,
  birthdate,
  retryHint = "",
  objectCategory = "พระเครื่อง",
  knowledgeBase = "",
}) {
  const { cleanBirthdate, cleanImageBase64 } = validateInput({
    imageBase64,
    birthdate,
  });

  console.log("[OPENAI] generateScanText → runDeepScanPipeline");
  console.log("[OPENAI] birthdate:", cleanBirthdate);
  console.log("[OPENAI] retryHint:", retryHint ? "provided" : "none");
  console.log("[OPENAI] objectCategory:", objectCategory);
  console.log("[OPENAI] imageBase64 exists:", Boolean(cleanImageBase64));

  return runDeepScanPipeline({
    imageBase64: cleanImageBase64,
    birthdate: cleanBirthdate,
    retryHint,
    mimeType: "image/jpeg",
    objectCategory,
    knowledgeBase,
  });
}
