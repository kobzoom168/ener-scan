import { env } from "../config/env.js";

const DEFAULT_ALLOWED_TYPES = [
  "waiting_birthdate_guidance",
  "pending_verify",
  "paywall",
];

function parseAllowedTypes(raw) {
  const src = String(raw || "").trim();
  if (!src) return DEFAULT_ALLOWED_TYPES;
  return src
    .split(",")
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

export const HYBRID_PERSONA_ALLOWED_TYPE_SET = new Set(
  parseAllowedTypes(env.HYBRID_PERSONA_ALLOWED_TYPES)
);

/**
 * Build AI policy per reply type.
 * `requiredPhrases` means "at least one phrase must appear".
 */
export function getHybridPersonaPolicy(replyType) {
  const t = String(replyType || "").trim();
  if (t === "waiting_birthdate_guidance") {
    return {
      goal: "guide the user back to the required birthdate step",
      requiredPhrases: ["14/09/1995", "14/09/2538"],
      forbiddenPhrases: ["ผลสแกน", "โอน", "จ่ายเงิน", "payment", "admin"],
      maxMessages: 3,
      maxCharsPerMessage: 90,
      state: "waiting_birthdate",
    };
  }
  if (t === "pending_verify") {
    return {
      goal: "tell user slip is in verification queue and keep user waiting calmly",
      requiredPhrases: [],
      forbiddenPhrases: ["จ่ายเงินซ้ำ", "โอนใหม่", "ผลสแกน", "payment"],
      maxMessages: 3,
      maxCharsPerMessage: 90,
      state: "pending_verify",
    };
  }
  if (t === "paywall") {
    return {
      goal: "gentle paywall bridge after preview, invite payment command without hard sell",
      requiredPhrases: ["จ่ายเงิน"],
      forbiddenPhrases: ["ผลสแกนละเอียด", "การันตี", "admin"],
      maxMessages: 3,
      maxCharsPerMessage: 90,
      state: "payment_required",
    };
  }
  return null;
}

