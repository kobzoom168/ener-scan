import { env } from "../../../config/env.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
  isGeminiConfigured,
} from "../../../integrations/gemini/geminiFlash.api.js";
import { getGeminiConversationHistory } from "../../../utils/conversationHistory.util.js";
import {
  buildStateSafeClarifierPrompt,
  STATE_SAFE_CLARIFIER_SYSTEM_PROMPT,
} from "./stateSafeClarifierPrompt.js";

export const STATE_SAFE_CLARIFIER_SAFE_THRESHOLD = 0.8;

const ALLOWED_STATES = new Set([
  "paywall_offer_single",
  "waiting_birthdate",
  "awaiting_slip",
  "pending_verify",
]);

const ALLOWED_INTENTS = new Set([
  "explain_offer_value",
  "explain_next_step",
  "explain_how_scan_works",
  "explain_single_image_rule",
  "recommendation_question",
  "off_topic_recoverable",
  "unknown",
]);

const ALLOWED_BRIDGES = new Set([
  "pay_intent",
  "provide_birthdate",
  "send_one_image",
  "resend_qr",
  "upload_slip",
  "wait_status",
  "unknown",
]);

function safeText(v, max = 220) {
  return String(v || "")
    .trim()
    .slice(0, max);
}

function normalizeIntent(v) {
  const s = safeText(v, 64) || "unknown";
  return ALLOWED_INTENTS.has(s) ? s : "unknown";
}

function normalizeBridge(v) {
  const s = safeText(v, 64) || "unknown";
  return ALLOWED_BRIDGES.has(s) ? s : "unknown";
}

function emptyOut() {
  return {
    intent: "unknown",
    confidence: 0,
    safe_to_answer: false,
    answer_short: "",
    bridge_back_to: "unknown",
    reason_short: "",
  };
}

export function parseStateSafeClarifierJson(raw) {
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
      safe_to_answer: Boolean(o.safe_to_answer),
      answer_short: safeText(o.answer_short || "", 360),
      bridge_back_to: normalizeBridge(o.bridge_back_to),
      reason_short: safeText(o.reason_short || "", 120),
    };
  } catch {
    return null;
  }
}

function hasOfferValueQuestion(text) {
  return /(ได้อะไร|คุ้มไหม|49\s*บาท.*อะไร|แพ็ก.*อะไร|ราคา.*อะไร)/i.test(
    String(text || ""),
  );
}

function hasNextStepQuestion(text) {
  return /(ต้อง.*ทำ|ต้อง.*โอน|ทำยังไง|ยังไงต่อ|ขั้นตอน|ทำอะไรต่อ|โอนตรงไหน|ส่งรูปแล้ว|ส่งแล้วนะ|ผมส่งแล้ว)/i.test(
    String(text || ""),
  );
}

function hasHowScanWorks(text) {
  return /(แอป.*ยังไง|วิธีใช้|ใช้งานยังไง|สแกนยังไง|ทำงานยังไง)/i.test(
    String(text || ""),
  );
}

function hasSingleImageRuleQuestion(text) {
  return /(หลายชิ้น|หลายองค์|หลายรูป|ส่งหลาย|ทีละกี่รูป|รูปเดียว)/i.test(
    String(text || ""),
  );
}

function hasRecommendationQuestion(text) {
  return /(เหมาะกับ|แนะนำ|ควรใช้|ดวง.*แบบไหน|เครื่องรางแบบไหน)/i.test(
    String(text || ""),
  );
}

function hasRecoverableOffTopic(text) {
  return /(ยังงง|งง|เรื่องอื่น|ไม่ค่อยเข้าใจ|สรุปสั้น|สรุปให้หน่อย)/i.test(
    String(text || ""),
  );
}

function buildPaywallAnswer(intent, facts) {
  const price = Number(facts?.priceThb) || 49;
  const scans = Number(facts?.scanCount) || 4;
  const hours = Number(facts?.windowHours) || 24;
  if (intent === "explain_offer_value") {
    return {
      answer_short: `แพ็กนี้ใช้สแกนเพิ่มได้ ${scans} ครั้ง ภายใน ${hours} ชั่วโมงครับ`,
      bridge_back_to: "pay_intent",
    };
  }
  if (intent === "explain_next_step") {
    return {
      answer_short: "ถ้าพร้อม เดี๋ยวระบบส่งรายละเอียดกับคิวอาร์ให้ครับ",
      bridge_back_to: "pay_intent",
    };
  }
  if (intent === "explain_single_image_rule") {
    return {
      answer_short: `ระบบดูทีละ 1 รูปนะครับ เพื่อให้วิเคราะห์ได้แม่นที่สุด แพ็กนี้ใช้ได้ ${scans} ครั้งครับ`,
      bridge_back_to: "pay_intent",
    };
  }
  if (intent === "recommendation_question") {
    return {
      answer_short:
        "ระบบจะดูจากวัตถุที่ส่งเข้ามาทีละชิ้นครับ แล้วประเมินว่าชิ้นไหนเข้ากับคุณมากกว่า",
      bridge_back_to: "pay_intent",
    };
  }
  if (intent === "explain_how_scan_works") {
    return {
      answer_short: "ใช้งานง่ายครับ ส่งรูปวัตถุมา 1 รูป แล้วระบบจะอ่านให้ทีละชิ้น",
      bridge_back_to: "pay_intent",
    };
  }
  if (intent === "off_topic_recoverable") {
    return {
      answer_short: `ถ้าจะสรุปสั้น ๆ คือ แพ็กนี้ ${price} บาท ใช้สแกนเพิ่มได้ ${scans} ครั้งใน ${hours} ชั่วโมงครับ`,
      bridge_back_to: "pay_intent",
    };
  }
  return null;
}

function buildBirthdateAnswer(intent) {
  if (
    intent === "explain_next_step" ||
    intent === "explain_how_scan_works" ||
    intent === "explain_single_image_rule" ||
    intent === "recommendation_question" ||
    intent === "off_topic_recoverable"
  ) {
    return {
      answer_short: "ตอนนี้ขอเก็บวันเกิดก่อนครับ เพื่อให้ระบบอ่านผลได้ตรงขึ้น",
      bridge_back_to: "provide_birthdate",
    };
  }
  return null;
}

function buildAwaitingSlipAnswer(intent) {
  if (intent === "explain_next_step") {
    return {
      answer_short:
        "ขั้นตอนต่อไปคือโอนตามคิวอาร์ แล้วส่งรูปสลิปในแชตนี้ได้เลยครับ",
      bridge_back_to: "upload_slip",
    };
  }
  if (intent === "off_topic_recoverable") {
    return {
      answer_short:
        "ตอนนี้โฟลว์นี้รอหลักฐานการโอนครับ ถ้าต้องการคิวอาร์ใหม่ผมส่งให้ได้ทันที",
      bridge_back_to: "resend_qr",
    };
  }
  return null;
}

function buildPendingVerifyAnswer(intent) {
  if (intent === "explain_next_step" || intent === "off_topic_recoverable") {
    return {
      answer_short:
        "ตอนนี้ระบบรับข้อมูลสลิปแล้วครับ เหลือรอแอดมินตรวจสอบก่อนปลดล็อก",
      bridge_back_to: "wait_status",
    };
  }
  return null;
}

export function heuristicStateSafeClarifier({ activeState, text, facts }) {
  const out = emptyOut();
  const state = String(activeState || "");
  if (!ALLOWED_STATES.has(state)) {
    out.reason_short = "state_not_supported";
    return out;
  }

  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    out.reason_short = "empty_input";
    return out;
  }

  let intent = "unknown";
  if (hasOfferValueQuestion(normalizedText)) intent = "explain_offer_value";
  else if (hasNextStepQuestion(normalizedText)) intent = "explain_next_step";
  else if (hasHowScanWorks(normalizedText)) intent = "explain_how_scan_works";
  else if (hasSingleImageRuleQuestion(normalizedText)) intent = "explain_single_image_rule";
  else if (hasRecommendationQuestion(normalizedText)) intent = "recommendation_question";
  else if (hasRecoverableOffTopic(normalizedText)) intent = "off_topic_recoverable";

  out.intent = intent;
  if (intent === "unknown") {
    out.reason_short = "no_recoverable_side_question";
    return out;
  }

  /** @type {{answer_short: string, bridge_back_to: string} | null} */
  let answer = null;
  if (state === "paywall_offer_single") answer = buildPaywallAnswer(intent, facts);
  else if (state === "waiting_birthdate") answer = buildBirthdateAnswer(intent);
  else if (state === "awaiting_slip") answer = buildAwaitingSlipAnswer(intent);
  else if (state === "pending_verify") answer = buildPendingVerifyAnswer(intent);

  if (!answer) {
    out.reason_short = "intent_not_grounded_in_state";
    return out;
  }

  out.confidence = 0.84;
  out.answer_short = answer.answer_short;
  out.bridge_back_to = normalizeBridge(answer.bridge_back_to);
  out.safe_to_answer = out.confidence >= STATE_SAFE_CLARIFIER_SAFE_THRESHOLD;
  out.reason_short = "grounded_heuristic";
  return out;
}

function buildPayload({ activeState, text, facts, conversationHistory }) {
  return JSON.stringify({
    truth: {
      active_state: activeState,
      safe_threshold: STATE_SAFE_CLARIFIER_SAFE_THRESHOLD,
      allowed_intents: Array.from(ALLOWED_INTENTS),
      allowed_bridges: Array.from(ALLOWED_BRIDGES),
      facts,
      fail_closed: true,
    },
    user_input: String(text || ""),
    conversation_history: conversationHistory || [],
  });
}

async function runGeminiClarifier(payload) {
  if (!isGeminiConfigured()) throw new Error("gemini_not_configured");
  const model = getGeminiFlashModel({
    systemInstruction: STATE_SAFE_CLARIFIER_SYSTEM_PROMPT,
    jsonMode: true,
  });
  if (!model) throw new Error("gemini_model_unavailable");
  return await generateTextWithTimeout(
    model,
    buildStateSafeClarifierPrompt(payload),
    env.GEMINI_FRONT_TIMEOUT_MS,
  );
}

export function buildStateSafeBridgeBackText(bridgeBackTo) {
  const b = normalizeBridge(bridgeBackTo);
  if (b === "pay_intent") return 'ถ้าพร้อม ตอบว่า "จ่าย" ได้เลยครับ';
  if (b === "provide_birthdate") return "ตอนนี้ขอวันเกิดก่อนครับ เช่น 19/08/2528";
  if (b === "send_one_image") return "ส่งรูปวัตถุทีละ 1 รูปได้เลยครับ";
  if (b === "resend_qr") return 'ถ้าต้องการคิวอาร์อีกครั้ง บอกว่า "ขอ QR อีกที" ได้เลยครับ';
  if (b === "upload_slip") return "โอนแล้วแนบสลิปในแชตนี้ได้เลยครับ";
  if (b === "wait_status")
    return "ตอนนี้รอแอดมินตรวจสลิปก่อนครับ รอแจ้งผลในแชตนี้ได้เลยครับ";
  return "";
}

export function composeStateSafeClarifierText(out) {
  const answer = safeText(out?.answer_short || "", 360);
  const bridge = buildStateSafeBridgeBackText(out?.bridge_back_to || "unknown");
  if (answer && bridge) return `${answer}\n\n${bridge}`;
  if (answer) return answer;
  return bridge;
}

export async function runStateSafeClarifier(p) {
  const activeState = String(p?.activeState || "unknown");
  const text = String(p?.text || "");
  const userId = String(p?.userId || "").trim();
  const facts = p?.facts && typeof p.facts === "object" ? p.facts : {};
  const heuristic = heuristicStateSafeClarifier({ activeState, text, facts });
  let chosen = heuristic;
  /** @type {"heuristic"|"gemini"|"fallback"} */
  let source = "heuristic";
  /** @type {string | null} */
  let rejectedReason = null;

  if (heuristic.intent === "unknown") {
    try {
      const history = userId ? await getGeminiConversationHistory(userId, 6, 1800) : [];
      const payload = buildPayload({ activeState, text, facts, conversationHistory: history });
      const modelRunner = p.runModel || runGeminiClarifier;
      const raw = await modelRunner(payload);
      const parsed = parseStateSafeClarifierJson(raw);
      if (parsed) {
        chosen = parsed;
        source = "gemini";
      } else {
        source = "fallback";
        rejectedReason = "invalid_json";
      }
    } catch (e) {
      source = "fallback";
      rejectedReason = safeText(e?.message || e || "clarifier_error", 120);
    }
  }

  const final = {
    intent: normalizeIntent(chosen.intent),
    confidence: Math.max(0, Math.min(1, Number(chosen.confidence) || 0)),
    safe_to_answer: Boolean(chosen.safe_to_answer),
    answer_short: safeText(chosen.answer_short || "", 360),
    bridge_back_to: normalizeBridge(chosen.bridge_back_to),
    reason_short: safeText(chosen.reason_short || "", 120),
  };

  if (!ALLOWED_STATES.has(activeState)) {
    final.safe_to_answer = false;
    final.reason_short = final.reason_short || "state_not_supported";
  } else if (!ALLOWED_INTENTS.has(final.intent)) {
    final.safe_to_answer = false;
    final.reason_short = final.reason_short || "intent_not_allowed";
  } else if (!final.answer_short) {
    final.safe_to_answer = false;
    final.reason_short = final.reason_short || "empty_answer";
  } else if (final.confidence < STATE_SAFE_CLARIFIER_SAFE_THRESHOLD) {
    final.safe_to_answer = false;
    final.reason_short = final.reason_short || "below_threshold";
  }

  return {
    ...final,
    meta: {
      source,
      rejected_reason: rejectedReason,
    },
  };
}
