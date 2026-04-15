import { env } from "../../../config/env.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
  isGeminiConfigured,
} from "../../../integrations/gemini/geminiFlash.api.js";
import { getGeminiConversationHistory } from "../../../utils/conversationHistory.util.js";
import { extractBirthdateCandidate } from "../../../utils/extractBirthdateCandidate.util.js";
import {
  buildSemanticCatcherPrompt,
  SEMANTIC_CATCHER_SYSTEM_PROMPT,
} from "./semanticCatcherPrompt.js";

export const SEMANTIC_CATCHER_CONSUME_THRESHOLD_STRICT = 0.82;
export const SEMANTIC_CATCHER_CONSUME_THRESHOLD_RELAXED = 0.78;

const ALLOWLIST = {
  waiting_birthdate: new Set([
    "provide_birthdate",
    "generic_ack",
    "birthdate_change_intent",
  ]),
  birthdate_change_waiting_date: new Set([
    "provide_birthdate",
    "confirm_no",
    "generic_ack",
  ]),
  paywall_offer_single: new Set([
    "pay_intent",
    "package_ack",
    "wait_tomorrow",
    "generic_ack",
    "status_check",
  ]),
  awaiting_slip: new Set([
    "resend_qr",
    "pay_intent",
    "slip_claim_without_image",
    "status_check",
    "generic_ack",
  ]),
  pending_verify: new Set([
    "status_check",
    "generic_ack",
    "pay_intent",
  ]),
};

const RELAXED_INTENTS = new Set([
  "pay_intent",
  "package_ack",
  "status_check",
]);

function emptyOut() {
  return {
    intent: "unknown",
    confidence: 0,
    safe_to_consume: false,
    state_guess: "unknown",
    extracted: {
      birthdate_candidate: null,
      package_candidate_text: null,
      status_phrase: null,
    },
    reason_short: "",
  };
}

function normalizeIntent(v) {
  const s = String(v || "").trim();
  return s || "unknown";
}

/**
 * @param {unknown} raw
 */
export function parseSemanticCatcherJson(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  const m = t.match(/\{[\s\S]*\}/);
  const slice = m ? m[0] : t;
  try {
    const o = JSON.parse(slice);
    if (!o || typeof o !== "object") return null;
    return {
      intent: normalizeIntent(o.intent),
      confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0)),
      safe_to_consume: Boolean(o.safe_to_consume),
      state_guess: String(o.state_guess || "unknown").trim() || "unknown",
      extracted: {
        birthdate_candidate: o?.extracted?.birthdate_candidate
          ? String(o.extracted.birthdate_candidate).trim()
          : null,
        package_candidate_text: o?.extracted?.package_candidate_text
          ? String(o.extracted.package_candidate_text).trim()
          : null,
        status_phrase: o?.extracted?.status_phrase
          ? String(o.extracted.status_phrase).trim()
          : null,
      },
      reason_short: String(o.reason_short || "").trim(),
    };
  } catch {
    return null;
  }
}

function isAckLike(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  if (t.length > 18) return false;
  return /^(โอเค|โอเคครับ|โอเคค่ะ|โอเคคับ|ok|okay|ได้|ได้ครับ|รับทราบ|อืม|อือ|ครับ|ค่ะ|คับ)$/.test(
    t,
  );
}

function isConfirmNo(text) {
  const t = String(text || "").trim().toLowerCase();
  return /^(ไม่|ไม่ใช่|ไม่ใช่ครับ|ไม่ใช่ค่ะ|ไม่เอา|ยกเลิก|no)$/.test(t);
}

function hasPayIntent(text) {
  return /(จ่าย|ชำระ|โอน|ปลดล็อก|payment|pay|เอาเลย|ตกลงเอา|พร้อมจ่าย)/i.test(
    String(text || ""),
  );
}

function hasResendQrIntent(text) {
  return /(ขอ.*qr|ขอ.*คิวอาร์|ส่ง.*qr|ส่ง.*คิวอาร์|qr.*อีกที|คิวอาร์.*อีกที|qr ใหม่|qrอีก)/i.test(
    String(text || ""),
  );
}

function hasStatusIntent(text) {
  return /(ถึงไหน|สถานะ|คืบหน้า|เมื่อไหร่|รอนาน|ตรวจ.*แล้ว|อนุมัติ.*ยัง|pending)/i.test(
    String(text || ""),
  );
}

function hasWaitTomorrow(text) {
  return /(พรุ่งนี้|ไว้ก่อน|ยังไม่เอา|เดี๋ยวค่อย|วันหลัง)/i.test(String(text || ""));
}

function hasPackageAck(text) {
  return /(\d+\s*บาท|แพ็ก|แพค|แพคเกจ|ใช่ไหม|เอาแพ็ก|เอาแพค)/i.test(
    String(text || ""),
  );
}

function hasBirthdateChangeIntent(text) {
  return /(เปลี่ยน.*วันเกิด|แก้.*วันเกิด|อัปเดต.*วันเกิด)/i.test(String(text || ""));
}

function hasSlipClaimWithoutImage(text) {
  return /(โอนแล้ว|จ่ายแล้ว|ชำระแล้ว|ส่งสลิปแล้ว|แนบสลิปแล้ว)/i.test(String(text || ""));
}

/**
 * @param {{
 *   activeState: string,
 *   text: string,
 *   extractedBirthdate: ReturnType<typeof extractBirthdateCandidate>
 * }} p
 */
export function heuristicSemanticCatcher({ activeState, text, extractedBirthdate }) {
  const out = emptyOut();
  out.state_guess = String(activeState || "unknown");
  out.reason_short = "heuristic_unknown";
  const trimmed = String(text || "").trim();
  if (!trimmed) return out;

  if (extractedBirthdate.ambiguous) {
    out.intent = "provide_birthdate";
    out.confidence = 0.91;
    out.safe_to_consume = false;
    out.reason_short = "multiple_birthdate_candidates";
    return out;
  }

  if (hasBirthdateChangeIntent(trimmed)) {
    out.intent = "birthdate_change_intent";
    out.confidence = 0.92;
    out.reason_short = "birthdate_change_phrase";
  } else if (isConfirmNo(trimmed)) {
    out.intent = "confirm_no";
    out.confidence = 0.9;
    out.reason_short = "confirm_no_phrase";
  } else if (extractedBirthdate.candidate) {
    out.intent = "provide_birthdate";
    out.confidence = 0.92;
    out.extracted.birthdate_candidate = extractedBirthdate.candidate;
    out.reason_short = "single_birthdate_candidate";
  } else if (hasResendQrIntent(trimmed)) {
    out.intent = "resend_qr";
    out.confidence = 0.86;
    out.reason_short = "resend_qr_phrase";
  } else if (hasStatusIntent(trimmed)) {
    out.intent = "status_check";
    out.confidence = 0.84;
    out.extracted.status_phrase = trimmed.slice(0, 100);
    out.reason_short = "status_phrase";
  } else if (hasWaitTomorrow(trimmed)) {
    out.intent = "wait_tomorrow";
    out.confidence = 0.84;
    out.reason_short = "wait_tomorrow_phrase";
  } else if (hasSlipClaimWithoutImage(trimmed)) {
    out.intent = "slip_claim_without_image";
    out.confidence = 0.84;
    out.reason_short = "slip_claim_text_only";
  } else if (hasPayIntent(trimmed)) {
    out.intent = "pay_intent";
    out.confidence = 0.83;
    out.reason_short = "pay_intent_phrase";
  } else if (hasPackageAck(trimmed)) {
    out.intent = "package_ack";
    out.confidence = 0.82;
    out.extracted.package_candidate_text = trimmed.slice(0, 100);
    out.reason_short = "package_ack_phrase";
  } else if (isAckLike(trimmed)) {
    out.intent = "generic_ack";
    out.confidence = 0.82;
    out.reason_short = "generic_ack_phrase";
  }

  return out;
}

/**
 * @param {string} activeState
 * @param {string} intent
 * @param {number} confidence
 * @param {ReturnType<typeof extractBirthdateCandidate>} extractedBirthdate
 */
export function shouldConsume(activeState, intent, confidence, extractedBirthdate) {
  const s = String(activeState || "unknown");
  const i = normalizeIntent(intent);
  if (!ALLOWLIST[s]?.has(i)) return false;
  const threshold = RELAXED_INTENTS.has(i)
    ? SEMANTIC_CATCHER_CONSUME_THRESHOLD_RELAXED
    : SEMANTIC_CATCHER_CONSUME_THRESHOLD_STRICT;
  if (confidence < threshold) return false;
  if (i === "provide_birthdate") {
    return Boolean(extractedBirthdate.candidate && !extractedBirthdate.ambiguous);
  }
  return true;
}

/**
 * @param {{
 *   activeState: string,
 *   text: string,
 *   conversationHistory: { role: "user"|"bot", text: string }[],
 *   extractedBirthdate: ReturnType<typeof extractBirthdateCandidate>,
 * }} p
 */
function buildCatcherPayload({
  activeState,
  text,
  conversationHistory,
  extractedBirthdate,
}) {
  return JSON.stringify({
    truth: {
      active_state: activeState,
      allowed_intents: Array.from(ALLOWLIST[activeState] || []),
      consume_threshold_strict: SEMANTIC_CATCHER_CONSUME_THRESHOLD_STRICT,
      consume_threshold_relaxed: SEMANTIC_CATCHER_CONSUME_THRESHOLD_RELAXED,
      fail_closed: true,
    },
    user_input: String(text || ""),
    pre_extracted: {
      birthdate_candidates: extractedBirthdate.candidates,
      ambiguous_birthdate: extractedBirthdate.ambiguous,
    },
    conversation_history: conversationHistory || [],
  });
}

/**
 * @param {string} payload
 * @returns {Promise<string>}
 */
async function runGeminiSemanticCatcher(payload) {
  if (!isGeminiConfigured()) throw new Error("gemini_not_configured");
  const model = getGeminiFlashModel({
    systemInstruction: SEMANTIC_CATCHER_SYSTEM_PROMPT,
    jsonMode: true,
  });
  if (!model) throw new Error("gemini_model_unavailable");
  return await generateTextWithTimeout(
    model,
    buildSemanticCatcherPrompt(payload),
    env.GEMINI_FRONT_TIMEOUT_MS,
  );
}

/**
 * @param {{
 *   userId: string,
 *   activeState: "waiting_birthdate"|"birthdate_change_waiting_date"|"paywall_offer_single"|"awaiting_slip"|"pending_verify",
 *   text: string,
 *   runModel?: (payload: string) => Promise<string>,
 * }} p
 * @returns {Promise<import("./semanticCatcher.types.js").SemanticCatcherOutput & {
 *   meta: {
 *     source: "heuristic" | "gemini" | "fallback",
 *     rejected_reason?: string | null,
 *   }
 * }>}
 */
export async function runSemanticCatcher(p) {
  const userId = String(p?.userId || "").trim();
  const activeState = String(p?.activeState || "unknown");
  const text = String(p?.text || "");
  const out = emptyOut();
  out.state_guess = activeState;

  const extractedBirthdate = extractBirthdateCandidate(text);
  out.extracted.birthdate_candidate = extractedBirthdate.candidate;

  const heuristic = heuristicSemanticCatcher({
    activeState,
    text,
    extractedBirthdate,
  });
  let chosen = heuristic;
  /** @type {"heuristic"|"gemini"|"fallback"} */
  let source = "heuristic";
  /** @type {string | null} */
  let rejectedReason = null;

  const maybeNeedsGemini =
    heuristic.intent === "unknown" ||
    (heuristic.confidence < SEMANTIC_CATCHER_CONSUME_THRESHOLD_STRICT &&
      !extractedBirthdate.ambiguous);

  if (maybeNeedsGemini) {
    try {
      const history = userId
        ? await getGeminiConversationHistory(userId, 8, 1800)
        : [];
      const payload = buildCatcherPayload({
        activeState,
        text,
        conversationHistory: history,
        extractedBirthdate,
      });
      const modelRunner = p.runModel || runGeminiSemanticCatcher;
      const raw = await modelRunner(payload);
      const parsed = parseSemanticCatcherJson(raw);
      if (parsed) {
        chosen = parsed;
        source = "gemini";
      } else {
        source = "fallback";
        rejectedReason = "invalid_json";
      }
    } catch (e) {
      source = "fallback";
      rejectedReason = String(e?.message || e || "gemini_error").slice(0, 120);
    }
  }

  const intent = normalizeIntent(chosen.intent);
  const confidence = Math.max(0, Math.min(1, Number(chosen.confidence) || 0));
  const safe = shouldConsume(
    activeState,
    intent,
    confidence,
    extractedBirthdate,
  );
  const final = {
    intent,
    confidence,
    safe_to_consume: safe,
    state_guess:
      String(chosen.state_guess || "").trim() || String(activeState || "unknown"),
    extracted: {
      birthdate_candidate:
        chosen?.extracted?.birthdate_candidate ||
        extractedBirthdate.candidate ||
        null,
      package_candidate_text: chosen?.extracted?.package_candidate_text || null,
      status_phrase: chosen?.extracted?.status_phrase || null,
    },
    reason_short: String(chosen.reason_short || "").trim(),
  };

  if (extractedBirthdate.ambiguous) {
    final.safe_to_consume = false;
    final.reason_short = final.reason_short || "multiple_birthdate_candidates";
  } else if (!ALLOWLIST[activeState]?.has(final.intent)) {
    final.safe_to_consume = false;
    final.reason_short = final.reason_short || "intent_not_allowed_in_state";
  } else if (!final.safe_to_consume) {
    final.reason_short = final.reason_short || "below_threshold_or_not_safe";
  }

  return {
    ...final,
    meta: {
      source,
      rejected_reason: rejectedReason,
    },
  };
}

