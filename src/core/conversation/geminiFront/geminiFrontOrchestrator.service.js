import { getGeminiFrontMode } from "./geminiFront.featureFlags.js";
import { buildPlannerContextPayload } from "./geminiPlannerContext.builder.js";
import { runGeminiPlanner } from "./geminiPlanner.service.js";
import {
  validateProposedAction,
  allowedActionsForPhase1State,
} from "./geminiActionValidator.js";
import { executeConversationAction } from "../../actions/conversationActions.js";
import {
  buildAllowedFactsForPhrasing,
  buildNextStepHint,
} from "./geminiPhrasingContext.builder.js";
import { runGeminiPhrasing } from "./geminiPhrasing.service.js";
import { runGeminiConsult } from "./geminiConsult.service.js";
import { logGeminiOrchestrator } from "./geminiFront.telemetry.js";
import { getGeminiConversationHistory } from "../../../utils/conversationHistory.util.js";

/**
 * สถานะเงิน/สิทธิ์ = ข้อเท็จจริงจากระบบเท่านั้น — LLM ห้ามประกาศเอง
 * (เคสจริง 12 ก.ค.: สลิปยัง pending แต่ Opus ตอบ "ได้สลิปแล้ว เปิดสิทธิ์ให้เรียบร้อย
 * สแกนได้ 4 ครั้ง" = สัญญาสิทธิ์ปลอมกับลูกค้า)
 */
const ENTITLEMENT_CLAIM_RE =
  /เปิดสิทธิ์(?:ให้)?(?:แล้ว|เรียบร้อย)|อนุมัติ(?:แล้ว|เรียบร้อย)|(?:ได้|รับ)สลิปแล้ว|สแกนได้(?:อีก)?\s*\d+\s*ครั้ง|(?:ยังมี|เหลือ)สิทธิ์|สิทธิ์(?:ยัง)?เหลือ/;

/** ข้อความตายตัวเมื่อ guard จับได้ — ตามสถานะจริง */
function safeTextForBlockedClaim(phase1State) {
  if (phase1State === "pending_verify") {
    return "สลิปกำลังตรวจอยู่ครับ พอเรียบร้อยอาจารย์จะแจ้งเปิดสิทธิ์ในแชตนี้ทันที รอแปปนึงครับ";
  }
  if (phase1State === "awaiting_slip") {
    return "ยังไม่เห็นสลิปเข้ามาครับ โอนแล้วแนบสลิปในแชตนี้ได้เลย เดี๋ยวอาจารย์เปิดสิทธิ์ให้ทันที";
  }
  return "เดี๋ยวอาจารย์เช็กสถานะให้ก่อนครับ แล้วแจ้งกลับในแชตนี้";
}

/**
 * @param {{
 *   userId: string,
 *   text: string,
 *   lowerText?: string,
 *   phase1State: import('./geminiFront.featureFlags.js').GeminiPhase1StateKey,
 *   conversationOwner: string,
 *   paymentState: string,
 *   flowState: string,
 *   accessState: string,
 *   pendingPaymentStatus: string | null,
 *   selectedPackageKey: string | null,
 *   noProgressStreak?: number,
 *   sendGatewayReply: (o: {
 *     replyType: string,
 *     semanticKey: string,
 *     text: string,
 *     alternateTexts?: string[],
 *   }) => Promise<void>,
 *   delegates: import('../../actions/conversationAction.types.js').GeminiFrontDelegates,
 * }} ctx
 * @returns {Promise<{ handled: boolean, mode?: string, reason?: string }>}
 */
export async function runGeminiFrontOrchestrator(ctx) {
  const mode = getGeminiFrontMode();
  if (mode === "off") {
    return { handled: false, reason: "flag_off", mode: "off" };
  }

  const phase1 = ctx.phase1State;
  if (!phase1) {
    return { handled: false, reason: "not_phase1" };
  }

  const allowedActions = allowedActionsForPhase1State(phase1);
  const conversationHistory = await getGeminiConversationHistory(ctx.userId, 8, 2000);
  const plannerPayload = buildPlannerContextPayload({
    userId: ctx.userId,
    text: ctx.text,
    phase1State: phase1,
    conversationOwner: ctx.conversationOwner,
    paymentState: ctx.paymentState,
    flowState: ctx.flowState,
    accessState: ctx.accessState,
    pendingPaymentStatus: ctx.pendingPaymentStatus,
    selectedPackageKey: ctx.selectedPackageKey,
    allowedActions,
    conversationHistory,
    noProgressStreak: ctx.noProgressStreak,
  });
  const plannerJson = JSON.stringify(plannerPayload);

  /** Shadow telemetry runs in `invokePhase1GeminiShadow` (webhook); no planner call here. */
  if (mode === "shadow") {
    return { handled: false, mode: "shadow", reason: "shadow_webhook" };
  }

  const plan = await runGeminiPlanner(plannerJson);
  if (!plan) {
    logGeminiOrchestrator({ mode: "active", reason: "planner_null" });
    return { handled: false, reason: "planner_null", mode: "active" };
  }

  const v = validateProposedAction({
    phase1State: phase1,
    proposed_action: plan.proposed_action,
    confidence: plan.confidence,
  });

  const resolved = v.resolved_action;
  const toolFirst = await executeConversationAction({
    resolvedAction: resolved,
    delegates: ctx.delegates,
  });
  if (toolFirst.handled) {
    logGeminiOrchestrator({
      mode: "active",
      handled: true,
      via: "tool",
      resolved,
    });
    return { handled: true, mode: "active" };
  }

  /** คำต้องห้าม persona: องค์ → ชิ้น (เว้นคำประกอบอย่าง องค์กร/องค์ประกอบ) —
      กฎอยู่ใน prompt แล้วแต่ LLM หลุดจริง (เคสกบ 12 ก.ค. "ทีละองค์นะ") = ต้องกันที่ทางออก */
  function sanitizePersonaWords(text) {
    return String(text || "").replace(/องค์(?!กร|การ|ประกอบ|รวม|ความรู้|ประชุม)/g, "ชิ้น");
  }

  /** คำตอบค้างท่อ (เคสจริง prod 12 ก.ค.): ลูกค้าถามตอนยังไม่ส่งรูป → Opus ตอบช้า
      "ยังไม่เห็นรูป" ไปโผล่หลังรูปเข้าแล้ว — ก่อนส่ง เช็คว่ามีรูปเพิ่งเข้า/กำลังสแกนไหม */
  async function guardStaleNoImageClaim(text) {
    if (!/ยังไม่เห็นรูป|ยังไม่มีรูป|ไม่เห็นรูปเข้ามา|ไม่มีรูปเข้ามา/.test(String(text || ""))) return text;
    try {
      const { supabase } = await import("../../../config/supabase.js");
      const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("scan_jobs")
        .select("id")
        .eq("line_user_id", String(ctx.userId || "").trim())
        .gte("created_at", since)
        .limit(1);
      if (Array.isArray(data) && data.length > 0) {
        console.log(
          JSON.stringify({
            event: "GEMINI_STALE_NO_IMAGE_CLAIM_BLOCKED",
            lineUserIdPrefix: String(ctx.userId || "").slice(0, 8),
          }),
        );
        return "รับรูปแล้วครับ อาจารย์กำลังเพ่งดูให้อยู่ เดี๋ยวผลตามมาในแชทนี้";
      }
    } catch {
      /* เช็คไม่ได้ = ปล่อยข้อความเดิม */
    }
    return text;
  }

  /** guard สิทธิ์ปลอม: ใช้กับทุกข้อความ LLM ขาออกจาก orchestrator นี้ */
  function guardEntitlementClaims(text, via) {
    text = sanitizePersonaWords(text);
    if (ctx.accessState === "paid_active") return text; // สิทธิ์จริง พูดถึงสิทธิ์ได้
    if (!ENTITLEMENT_CLAIM_RE.test(String(text || ""))) return text;
    console.warn(
      JSON.stringify({
        event: "GEMINI_ENTITLEMENT_CLAIM_BLOCKED",
        phase1State: phase1,
        accessState: ctx.accessState,
        via,
        sample: String(text).slice(0, 120),
      }),
    );
    return safeTextForBlockedClaim(phase1);
  }

  /** Customer-visible answer via the smart consult brain (Opus + real facts).
      Used for consult/help/chit-chat so the cheap model never writes to the
      customer directly unless consult fails. */
  async function tryConsultReply(via) {
    const consultText = await runGeminiConsult({
      userId: ctx.userId,
      userText: ctx.text,
      conversationHistory,
    });
    if (!consultText) return false;
    const guardedConsult = await guardStaleNoImageClaim(
      guardEntitlementClaims(consultText.slice(0, 1800), via),
    );
    await ctx.sendGatewayReply({
      replyType: "gemini_front_consult",
      semanticKey: `gemini_front_consult:${phase1}`,
      text: guardedConsult,
      alternateTexts: [],
    });
    logGeminiOrchestrator({ mode: "active", handled: true, via });
    return true;
  }

  if (resolved === "consult_amulet") {
    if (await tryConsultReply("consult")) return { handled: true, mode: "active" };
    // consult failed → fall through to a safe generic phrase (below)
  }

  if (resolved === "send_help_reply") {
    // Smart brain first — help answers are exactly where flash-lite sounded flat.
    if (await tryConsultReply("consult_help")) return { handled: true, mode: "active" };
    const ph = await runGeminiPhrasing({
      allowedFacts: buildAllowedFactsForPhrasing({
        phase1State: phase1,
        planner: plan,
        payload: plannerPayload,
        validationDenyReason: v.deny_reason,
      }),
      nextStep: "ตอบคำถามช่วยเหลือสั้นๆ เป็นภาษาไทย ไม่สมมติสถานะการชำระเงิน",
      replyStyle: plan.reply_style,
      userText: ctx.text,
      conversationHistory,
    });
    if (ph) {
      await ctx.sendGatewayReply({
        replyType: "gemini_front_help",
        semanticKey: `gemini_front_help:${phase1}`,
        text: guardEntitlementClaims(ph.slice(0, 1200), "help_phrase"),
        alternateTexts: [],
      });
      logGeminiOrchestrator({ mode: "active", handled: true, via: "help_phrase" });
      return { handled: true, mode: "active" };
    }
  }

  const shouldPhrase =
    resolved === "noop_phrase_only" ||
    Boolean(v.deny_reason) ||
    resolved === "get_conversation_context" ||
    resolved === "handoff_to_scan" ||
    resolved === "consult_amulet";

  if (!shouldPhrase) {
    logGeminiOrchestrator({
      mode: "active",
      handled: false,
      reason: "unhandled_or_no_delegate",
      resolved,
    });
    return { handled: false, reason: "delegate_unimplemented", mode: "active" };
  }

  // Chit-chat / context replies (no state correction pending) → smart brain first.
  if (!v.deny_reason && (resolved === "noop_phrase_only" || resolved === "get_conversation_context")) {
    if (await tryConsultReply("consult_chat")) return { handled: true, mode: "active" };
  }

  const ph = await runGeminiPhrasing({
    allowedFacts: buildAllowedFactsForPhrasing({
      phase1State: phase1,
      planner: plan,
      payload: plannerPayload,
      validationDenyReason: v.deny_reason,
    }),
    nextStep: buildNextStepHint(phase1, v.deny_reason),
    replyStyle: plan.reply_style,
    userText: ctx.text,
    conversationHistory,
  });

  if (!ph) {
    return { handled: false, reason: "phrasing_null", mode: "active" };
  }

  await ctx.sendGatewayReply({
    replyType: "gemini_front_reply",
    semanticKey: `gemini_front:${phase1}`,
    text: guardEntitlementClaims(ph.slice(0, 1200), "noop_phrase"),
    alternateTexts: [],
  });
  logGeminiOrchestrator({ mode: "active", handled: true, via: "noop_phrase" });
  return { handled: true, mode: "active" };
}
