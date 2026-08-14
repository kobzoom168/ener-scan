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
import {
  resolveSpeakerRole,
  evaluateMoneyGuard,
  evaluateToneGuard,
  USER_MONEY_INTENT_RE,
  NEUTRAL_RECOVERY_FALLBACK,
} from "../personaRole.util.js";
import { getValue, setLargeValueWithTtl } from "../../../redis/scanV2Redis.js";

/** handoff state MVP: เสียงล่าสุดของบทสนทนา (TTL 30 นาที) */
const lastSpeakerKey = (uid) => `persona:last_speaker:${uid}`;
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
    return "สลิปกำลังตรวจอยู่ครับ พอเรียบร้อยผมเปิดสิทธิ์แล้วแจ้งในแชตนี้ทันที รอแปปนึงครับ";
  }
  if (phase1State === "awaiting_slip") {
    return "ยังไม่เห็นสลิปเข้ามาครับ โอนแล้วแนบสลิปในแชตนี้ได้เลย เดี๋ยวผมเปิดสิทธิ์ให้ทันที";
  }
  return "เดี๋ยวผมเช็กสถานะให้ก่อนครับ แล้วแจ้งกลับในแชตนี้";
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

  /** คำต้องห้าม persona (กันที่ทางออก — prompt ขอแล้วแต่ LLM หลุดจริง):
      องค์ → ชิ้น, แบรนด์ = Ener เฉย ๆ, และห้ามขีดคั่นประโยค (— – -) โทน AI ชัด
      ขีดใน URL/เบอร์โทร/คำติดกันไม่โดน (กรองเฉพาะขีดที่มีช่องว่างรอบ/หัวบรรทัด) */
  function sanitizePersonaWords(text) {
    let t = String(text || "");
    t = t.replace(/องค์(?!กร|การ|ประกอบ|รวม|ความรู้|ประชุม)/g, "ชิ้น");
    t = t.replace(/Ener\s*สายมู/g, "Ener");
    t = t.replace(/[—–]/g, " ");
    t = t.replace(/(^|\n)[ \t]*-[ \t]+/g, "$1");
    t = t.replace(/[ \t]-[ \t]/g, " ");
    t = t.replace(/[ \t]{2,}/g, " ");
    return t.trim();
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
    const lastSpeaker = await getValue(lastSpeakerKey(ctx.userId)).catch(() => null);
    const consultText = await runGeminiConsult({
      userId: ctx.userId,
      userText: ctx.text,
      conversationHistory,
      lastSpeaker: lastSpeaker || null,
    });
    if (!consultText) return false;
    let guardedConsult = await guardStaleNoImageClaim(
      guardEntitlementClaims(consultText.slice(0, 1800), via),
    );
    // pre-send money guard สองชั้น (Codex รอบ 5): ①เงินต้องออกจากเสียงแอดมิน
    // ②และต้องเป็นจังหวะที่ลูกค้าถามเงิน/อยู่ payment state เท่านั้น (unsolicited = block
    // แม้เสียงแอดมิน — ไม่งั้น guard แค่ย้ายการขายไปให้อีกคนพูด)
    // SSOT ก่อน (isPaymentCommand/isPromoInquiryText จาก webhook ส่งเป็น boolean) —
    // regex เป็น fallback ให้ caller เก่าเท่านั้น (Codex รอบ 6)
    const userMoneyIntent =
      typeof ctx.userMoneyIntent === "boolean"
        ? ctx.userMoneyIntent
        : USER_MONEY_INTENT_RE.test(String(ctx.text || ""));
    const inPaymentState = /paywall|payment|slip|verify|awaiting/i.test(String(phase1 || ""));
    const guardCtx = { userMoneyIntent, inPaymentState };
    const verdict1 = evaluateMoneyGuard(guardedConsult, guardCtx);
    if (!verdict1.ok) {
      console.warn(
        JSON.stringify({
          event: "AJARN_MONEY_PRESEND_BLOCKED",
          via,
          reason: verdict1.reason,
          attempt: 1,
          sample: guardedConsult.slice(0, 120),
        }),
      );
      const retry = await runGeminiConsult({
        userId: ctx.userId,
        userText: ctx.text,
        conversationHistory,
        lastSpeaker: lastSpeaker || null,
        extraDirective:
          verdict1.reason === "unsolicited"
            ? "คำตอบก่อนหน้าของคุณผิดกติกาใหญ่: พูดเรื่องเงิน/ค่าครู/สิทธิ์ทั้งที่ลูกค้าไม่ได้ถาม — ตอบใหม่โดยตัดเรื่องเงิน/ค่าครู/สิทธิ์/แพ็กออกทั้งหมด ตอบเฉพาะเรื่องที่ลูกค้าถามเท่านั้น"
            : "คำตอบก่อนหน้าของคุณผิดกติกาใหญ่: พูดเรื่องเงิน/ค่าครู/สิทธิ์โดยไม่ใช่เสียงแอดมิน — ตอบใหม่: ส่วนที่เป็นเงินต้องพูดเป็นเสียงแอดมิน (เรียกตัวเองว่า ผม) เท่านั้น หรือถ้าเงินไม่จำเป็นต่อคำถาม ให้ตัดเรื่องเงินออกทั้งหมด",
      });
      const retryGuarded = retry
        ? await guardStaleNoImageClaim(guardEntitlementClaims(retry.slice(0, 1800), via))
        : null;
      if (retryGuarded && evaluateMoneyGuard(retryGuarded, guardCtx).ok) {
        guardedConsult = retryGuarded;
      } else if (userMoneyIntent) {
        // ลูกค้าถามเงินจริง → ออกจาก orchestrator ทันที (typed outcome — ห้ามไหลลง
        // Gemini phrasing) ให้ deterministic payment flow ของ webhook ชั้นนอกตอบ
        console.warn(
          JSON.stringify({ event: "AJARN_MONEY_PRESEND_DEFER_TO_PAYMENT_FLOW", via }),
        );
        return "defer_payment";
      } else {
        console.warn(
          JSON.stringify({ event: "AJARN_MONEY_PRESEND_FALLBACK", via, reason: verdict1.reason }),
        );
        guardedConsult = NEUTRAL_RECOVERY_FALLBACK;
      }
    }
    // pre-send tone guard (Codex 14 ส.ค.): คำชม/ปลอบต้องห้าม → retry ครั้งเดียว
    // retry ยังหลุด = ส่งฉบับที่ไม่มีคำต้องห้ามถ้ามี ไม่งั้นส่งของเดิม + log ให้ monitor เห็น
    // (ดีกว่า fallback กลาง ๆ ที่ทิ้งคำถามลูกค้า — โทนหลุดเบากว่าไม่ตอบ)
    const tone1 = evaluateToneGuard(guardedConsult);
    if (!tone1.ok) {
      console.warn(
        JSON.stringify({
          event: "TONE_PRESEND_BLOCKED",
          via,
          match: tone1.match,
          attempt: 1,
          sample: guardedConsult.slice(0, 120),
        }),
      );
      const toneRetry = await runGeminiConsult({
        userId: ctx.userId,
        userText: ctx.text,
        conversationHistory,
        lastSpeaker: lastSpeaker || null,
        extraDirective: `คำตอบก่อนหน้าของคุณผิดกติกาโทน: มีคำชม/ปลอบต้องห้าม ("${tone1.match}") — ตอบใหม่โดยไม่ใช้คำตัดสินเชิงชม (ใช้ได้ดีแล้ว ถือว่าดี) และไม่ปลอบ (ไม่ต้องกังวล เดี๋ยวก็เจอ สบายใจได้) บอกตัวเลข/ข้อเท็จจริงกับขั้นถัดไปตรง ๆ`,
      });
      const toneRetryGuarded = toneRetry
        ? await guardStaleNoImageClaim(guardEntitlementClaims(toneRetry.slice(0, 1800), via))
        : null;
      if (
        toneRetryGuarded &&
        evaluateToneGuard(toneRetryGuarded).ok &&
        evaluateMoneyGuard(toneRetryGuarded, guardCtx).ok
      ) {
        guardedConsult = toneRetryGuarded;
      } else {
        console.warn(
          JSON.stringify({ event: "TONE_PRESEND_STILL", via, match: tone1.match }),
        );
      }
    }
    // role router (Codex C3): resolve เสียงจริงก่อนส่ง — history/monitor ได้ tag ตรง
    const speaker = resolveSpeakerRole(guardedConsult);
    const sendRes = await ctx.sendGatewayReply({
      replyType: "gemini_front_consult",
      semanticKey: `gemini_front_consult:${phase1}`,
      text: guardedConsult,
      alternateTexts: [],
      // unknown = surface resolve ไม่ได้ → คง tag consult ตามจริง ไม่อ้างว่า resolved
      speakerRoleOverride: speaker === "unknown" ? "consult" : speaker,
    });
    // จำเสียงล่าสุด 30 นาที (handoff hint — ยังไม่ใช่ state เต็ม topic/turnId/scanResultId)
    // เขียนเฉพาะข้อความที่ส่งจริง — dedupe/suppress ห้ามอัปเดต state (Codex รอบ 4 ข้อ 6)
    if ((speaker === "ajarn" || speaker === "admin") && sendRes?.sent === true) {
      void setLargeValueWithTtl(lastSpeakerKey(ctx.userId), speaker, 1800).catch(() => {});
    }
    logGeminiOrchestrator({ mode: "active", handled: true, via, speaker });
    return "sent";
  }

  if (resolved === "consult_amulet") {
    {
      const consultOutcome = await tryConsultReply("consult");
      if (consultOutcome === "sent") return { handled: true, mode: "active" };
      if (consultOutcome === "defer_payment") {
        // ออกทั้ง orchestrator — ห้ามไหลลง phrasing (Codex รอบ 5 ข้อ 1)
        return { handled: false, mode: "active", deferTo: "deterministic_payment" };
      }
    }
    // consult failed → fall through to a safe generic phrase (below)
  }

  if (resolved === "send_help_reply") {
    // Smart brain first — help answers are exactly where flash-lite sounded flat.
    {
      const consultOutcome = await tryConsultReply("consult_help");
      if (consultOutcome === "sent") return { handled: true, mode: "active" };
      if (consultOutcome === "defer_payment") {
        // ออกทั้ง orchestrator — ห้ามไหลลง phrasing (Codex รอบ 5 ข้อ 1)
        return { handled: false, mode: "active", deferTo: "deterministic_payment" };
      }
    }
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
    {
      const consultOutcome = await tryConsultReply("consult_chat");
      if (consultOutcome === "sent") return { handled: true, mode: "active" };
      if (consultOutcome === "defer_payment") {
        // ออกทั้ง orchestrator — ห้ามไหลลง phrasing (Codex รอบ 5 ข้อ 1)
        return { handled: false, mode: "active", deferTo: "deterministic_payment" };
      }
    }
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
