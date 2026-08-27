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
  resolveToneGuardedText,
  sanitizeForeignLinks,
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

  // P0 idle bypass (Codex 18 ส.ค. — telemetry 15-17 ส.ค.: planner 36 / consult 36
  // จับคู่ทุกเทิร์น +~750ms): idle/scan_ready_idle อนุญาตแค่ noop_phrase_only กับ
  // consult_amulet และทั้งคู่จบที่ tryConsultReply — เข้า consult ตรง guard/context เดิม
  // ทุกชั้น · consult ไม่ได้ = handled:false ให้ deterministic idle fallback (0 AI เพิ่ม)
  if ((phase1 === "idle" || phase1 === "scan_ready_idle") && ctx.allowIdleDirectConsult === true) {
    const consultOutcome = await tryConsultReply("consult_idle_direct");
    if (consultOutcome === "sent") {
      logGeminiOrchestrator({ mode: "active", handled: true, via: "idle_bypass" });
      return { handled: true, mode: "active" };
    }
    if (consultOutcome === "defer_payment") {
      return { handled: false, mode: "active", deferTo: "deterministic_payment" };
    }
    logGeminiOrchestrator({ mode: "active", handled: false, reason: "idle_bypass_consult_null" });
    return { handled: false, reason: "idle_bypass_consult_null", mode: "active" };
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
    // บทบาทตัดจาก route ก่อน generate (flow-role เคส 2/13) · guard ทุกตัวใช้ regenerate budget ร่วม
    // (primary + regenerate รวมสูงสุด 1 = model calls ≤ 2) · ยังผิด = deterministic fallback ไม่เงียบ
    const { routeConsultRole, roleDirectiveFor } = await import("../consultRoleRoute.util.js");
    const { runConsultGuardChain } = await import("../consultGuardChain.util.js");
    const routedRole = routeConsultRole(ctx.text);
    const roleDirective = roleDirectiveFor(routedRole);
    const userMoneyIntent =
      typeof ctx.userMoneyIntent === "boolean"
        ? ctx.userMoneyIntent
        : USER_MONEY_INTENT_RE.test(String(ctx.text || ""));
    const inPaymentState = /paywall|payment|slip|verify|awaiting/i.test(String(phase1 || ""));
    const guardCtx = { userMoneyIntent, inPaymentState };
    let hasReport = false;
    if (routedRole === "ajarn") {
      try {
        const { hasDeliveredReport } = await import("../../../services/scanV2/deliveredEvidence.util.js");
        hasReport = await hasDeliveredReport(ctx.userId);
      } catch { hasReport = false; }
    }
    const chain = await runConsultGuardChain({
      generate: (directive) =>
        runGeminiConsult({
          userId: ctx.userId,
          userText: ctx.text,
          conversationHistory,
          lastSpeaker: lastSpeaker || null,
          ...(directive ? { extraDirective: directive } : {}),
        }),
      postProcess: async (t) => {
        let g = await guardStaleNoImageClaim(guardEntitlementClaims(String(t).slice(0, 1800), via));
        const linkRes = sanitizeForeignLinks(g);
        if (linkRes.stripped.length > 0) {
          console.warn(JSON.stringify({ event: "CONSULT_FOREIGN_LINK_STRIPPED", via, stripped: linkRes.stripped }));
          g = linkRes.text || NEUTRAL_RECOVERY_FALLBACK;
        }
        return g;
      },
      routedRole,
      roleDirective,
      moneyCtx: guardCtx,
      hasReport,
      maxRegenerate: 1,
      log: (event, data) => console.warn(JSON.stringify({ event, via, ...data })),
    });
    if (chain.outcome === "empty") return false;
    if (chain.outcome === "defer_payment") {
      console.warn(JSON.stringify({ event: "AJARN_MONEY_PRESEND_DEFER_TO_PAYMENT_FLOW", via }));
      return "defer_payment";
    }
    const guardedConsult = chain.text;
    console.log(JSON.stringify({ event: "CONSULT_GUARD_CHAIN", via, modelCalls: chain.modelCalls, guardOutcome: chain.guardOutcome, reasons: chain.reasons }));
    // role router: route ตัดบทไว้แล้ว = ใช้บทนั้น (ผ่าน guard/fallback มาแล้ว) · ไม่ได้ route = resolve เดิม
    const speaker = routedRole === "ajarn" ? "ajarn" : routedRole === "admin" ? "admin" : resolveSpeakerRole(guardedConsult);
    const sendRes = await ctx.sendGatewayReply({
      replyType: "gemini_front_consult",
      semanticKey: `gemini_front_consult:${phase1}`,
      text: guardedConsult,
      alternateTexts: [],
      speakerRoleOverride: speaker === "unknown" ? "consult" : speaker,
    });
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
