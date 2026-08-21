import { env } from "../../../config/env.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
  isGeminiConfigured,
} from "../../../integrations/gemini/geminiFlash.api.js";
import { GEMINI_CONSULT_SYSTEM, buildConsultUserPrompt } from "./geminiConsultPrompt.js";
import { buildScanHistoryTyped, buildAxisTopContext } from "./recentScanContext.util.js";
import { buildCustomerFactsContext } from "./customerFactsContext.util.js";
import { buildKbContext } from "./kbRetrieval.util.js";
import { supabase } from "../../../config/supabase.js";
import { computePaidActive } from "../../../services/scanOfferAccess.resolver.js";
import { getValue, setLargeValueWithTtl } from "../../../redis/scanV2Redis.js";

/**
 * แพ็กแอคทีฟ = Opus (LLM_CONSULT_MODEL) / ฟรี-แพ็กหมด = โมเดลถูก (LLM_CONSULT_MODEL_FREE)
 * (กบ 16 ก.ค.: ค่าแชทคือรูรั่วหลัก — จ่ายสมองแพงเฉพาะลูกค้าที่จ่ายเรา)
 * เช็คพลาด = ถือว่าจ่าย (ไม่ลดเกรดลูกค้าจริงเพราะระบบเราสะดุด)
 * @param {string|undefined} userId
 * @returns {Promise<boolean>}
 */
async function isPaidActiveCustomer(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  try {
    const { data: u } = await supabase
      .from("app_users")
      .select("paid_until,paid_remaining_scans")
      .eq("line_user_id", uid)
      .maybeSingle();
    return computePaidActive(
      u?.paid_until,
      Number(u?.paid_remaining_scans) || 0,
      new Date(),
    );
  } catch {
    return true;
  }
}

/**
 * Answer an amulet/crystal KNOWLEDGE question as อาจารย์ Ener (grounded + guarded).
 * Runs on the front LLM (OpenRouter). Returns the Thai answer, or null when
 * disabled / not configured / model failed (caller falls back to a generic reply).
 *
 * @param {{ userId?: string, userText: string, conversationHistory?: { role: string, text: string }[] }} p
 * @returns {Promise<string | null>}
 */
export async function runGeminiConsult(p, deps = {}) {
  // P0-6 (Codex): งบเรียกโมเดลที่ลูกค้าเห็น ≤2 ครั้งต่อเทิร์น ใช้ร่วมกันทุก guard
  // guard ตัวหลัง (money/tone) ที่เรียกซ้ำหลังงบหมด = ต้องได้ null แล้วไป deterministic
  if (p.turnBudget && p.turnBudget.attempted >= (p.turnBudget.max || 2)) {
    console.log(JSON.stringify({ event: "LLM_TURN_BUDGET_EXHAUSTED", callSite: "gemini_front_consult" }));
    return null;
  }
  if (!env.GEMINI_CONSULT_ENABLED) return null;
  if (!deps.generate && !isGeminiConfigured()) return null;

  // Phase B: best-effort personalization from the user's own scan history
  // (multiple pieces, so it can compare "องค์ไหนแรงสุด/ดีสุด" + link the report)
  // + real account facts (birthdate on file, free/paid quota) so the model
  // never re-asks known data or guesses service rules.
  let recentScan = null;
  let customerFacts = null;
  let kbContext = null;
  let paidActive = false;
  let axisTop = null;
  let rankingAllowed = false;
  const kbPromise = buildKbContext(p.userText).catch(() => null);
  if (p.userId) {
    [recentScan, customerFacts, kbContext, paidActive, axisTop, rankingAllowed] = await Promise.all([
      (deps.scanHistory || buildScanHistoryTyped)(p.userId, 6).catch(() => null),
      buildCustomerFactsContext(p.userId).catch(() => null),
      kbPromise,
      (deps.isPaidActive || isPaidActiveCustomer)(p.userId),
      buildAxisTopContext(p.userId).catch(() => null),
      // สิทธิ์ดูอันดับในแชท = SSOT เดียวกับเซ็นเซอร์หน้ารายงาน (จ่ายใน 3 วัน) — กบ 18 ส.ค.
      (async () => {
        const { hasRecentPaidAccess } = await import("../../../services/everPaid.service.js");
        return hasRecentPaidAccess(p.userId);
      })().catch(() => false),
    ]);
  } else {
    kbContext = await kbPromise;
  }
  // ไม่มีสิทธิ์อันดับ: ตัด context ชิ้นเด่นต่อด้านทิ้ง — โมเดลไม่มีข้อมูลให้หลุด
  if (!rankingAllowed) axisTop = null;

  // แพ็กแอคทีฟ = สมองแพง (Opus) / ฟรี = สมองถูก (DeepSeek) — persona/guardrails ชุดเดียวกัน
  const consultModel = paidActive
    ? env.LLM_CONSULT_MODEL
    : env.LLM_CONSULT_MODEL_FREE || env.LLM_CONSULT_MODEL;

  const model = getGeminiFlashModel({
    callSite: "consult",
    systemInstruction: GEMINI_CONSULT_SYSTEM,
    jsonMode: false,
    temperature: 0.7,
    timeoutMs: env.GEMINI_CONSULT_TIMEOUT_MS,
    // ลูกค้าจ่าย = ดูแลเต็ม (กบ 16 ก.ค.) / ฟรี = กระชับพิเศษ ประหยัด output
    maxTokens: paidActive ? 1536 : 512,
    // Customer-visible replies deserve the smartest brain; planner/phrasing
    // stay on the cheap fast model. e.g. LLM_CONSULT_MODEL=anthropic/claude-opus-4.8
    modelOverride: consultModel,
    // system prompt อาจารย์ ~14k chars ซ้ำทุกข้อความ → แคช (จ่ายซ้ำแค่ ~10%)
    cacheSystemPrompt: true,
    // ชั้นฟรี (DeepSeek): ปิดโหมดคิดในใจ กันกิน max_tokens จนคำตอบโดนตัด
    disableReasoning: !paidActive,
  });
  if (!model && !deps.generate) return null;

  let prompt = buildConsultUserPrompt({
    userText: p.userText,
    conversationHistory: p.conversationHistory,
    recentScan: recentScan?.promptText || null,
    customerFacts,
    kbContext,
    axisTop,
  });
  // handoff state MVP (persona hardening 12 ส.ค.): บอกโมเดลว่ารอบก่อนใครพูดอยู่
  // — ต่อเนื่องเรื่องเดิมไม่ต้อง handoff ซ้ำ / เพิ่งเป็นแอดมิน ค่อยเปิด handoff เมื่อเข้าเรื่องพลัง
  if (p.lastSpeaker) {
    prompt += `\n\nสถานะบทสนทนา: ข้อความก่อนหน้าของเราเป็นเสียง "${p.lastSpeaker}" — ถ้าลูกค้าถามต่อเนื่องเรื่องเดิม ให้เสียงเดิมตอบต่อทันที ไม่ต้องเกริ่น handoff ซ้ำ · เปลี่ยนหัวข้อเป็นเงิน/ระบบ = เสียงแอดมิน (ผม)`;
  }
  // pre-send guard สั่งแก้ (retry ครั้งเดียวจาก orchestrator)
  if (p.extraDirective) {
    prompt += `\n\nข้อกำหนดเพิ่มรอบนี้ (สำคัญสุด): ${p.extraDirective}`;
  }
  // เกตอันดับ (กบ 18 ส.ค.): คนไม่มีประวัติจ่ายใน 3 วัน ห้ามได้อันดับ/ชิ้นแรงสุดจากแชท
  if (!rankingAllowed) {
    prompt += "\n\nข้อกำหนดสิทธิ์รอบนี้: ลูกค้ายังไม่มีสิทธิ์ดูอันดับ/ชิ้นเด่นเปรียบเทียบ — ถ้าถามหาชิ้นแรงสุด/คะแนนสูงสุด/จัดอันดับ ห้ามระบุชื่อชิ้นหรือตัวเลขเปรียบเทียบ ให้ตอบสั้น ๆ ว่าเปิดรายงานชิ้นล่าสุดแล้วเลื่อนลงด้านล่าง มีอันดับครบทุกด้าน";
  }
  // ชั้นฟรี: ถามคำตอบคำ (กบ 16 ก.ค.) — ตอบตรงคำถาม สั้นสุด ไม่ขยายความเอง
  // (ลูกค้าแพ็กแอคทีฟใช้กติกา 2-4 บรรทัดใน system ตามเดิม = ดูแลเต็ม)
  if (!paidActive) {
    prompt += "\n\nข้อกำหนดรอบนี้: ตอบสั้นที่สุด ตรงคำถามพอ 1-2 ประโยค ไม่ต้องขยายความหรือชวนคุยต่อ ยกเว้นลูกค้าขอรายละเอียดชัด ๆ";
  }

  // telemetry ช่องห่างระหว่าง consult ต่อคน (Codex 13 ส.ค.: ใช้คำนวณ break-even
  // ของ cache TTL 5 นาที vs 1 ชม. จากพฤติกรรมจริง ก่อนตัดสินใจแตะ cache)
  try {
    const tsKey = `consult:last_ts:${String(p.userId || "anon")}`;
    const prevTs = Number(await getValue(tsKey)) || 0;
    const nowTs = Date.now();
    if (prevTs > 0) {
      console.log(
        JSON.stringify({
          event: "CONSULT_TURN_SPACING",
          secSinceLast: Math.round((nowTs - prevTs) / 1000),
          tier: paidActive ? "paid" : "free",
          promptChars: GEMINI_CONSULT_SYSTEM.length + prompt.length,
        }),
      );
    }
    await setLargeValueWithTtl(tsKey, String(nowTs), 24 * 3600);
  } catch { /* telemetry ห้ามขวาง */ }

  // เฟส 2 (Codex B1/P1): gateway เป็นเจ้าของ "ทุก" การเรียกโมเดล รวม call แรก
  // → call แรกล้ม/timeout/ว่าง ก็ออก LLM_FACTUAL_FALLBACK_USED จาก contract จริง ไม่หลุด outer catch
  const { enforceLlmCustomerOutput } = await import("../llmOutputContract.util.js");
  const { resolveExpectedRole, finalizeIntent } = await import("./intentContract.util.js");
  const evidence = buildConsultEvidence({ recentScan, kbContext });
  let contract = p.intentContract || null;
  if (!contract) {
    // ผู้เรียกไม่ส่ง contract = ไม่ใช่ default เงียบ ๆ — log แล้วใช้ค่าเข้มสุด
    console.log(JSON.stringify({ event: "LLM_INTENT_CONTRACT_MISSING", callSite: "gemini_front_consult" }));
    contract = { userIntent: null, userAskedAdvice: false, requiredNextAction: false, allowQuestion: false };
  }
  // role ตัดจาก evidence จริง (ไม่ใช่ flag ที่ caller เดา)
  const expectedRole = resolveExpectedRole(contract, evidence);

  const stripTrailingJunk = (text) => {
    let out = String(text || "").trim();
    // ขยะท้ายคำตอบจากโมเดล (เคสจริง 11 ส.ค.: Opus ปิดท้ายด้วยบรรทัด "พูดno")
    const lines = out.split("\n");
    const last = (lines[lines.length - 1] || "").trim();
    if (
      lines.length > 1 &&
      last.length > 0 &&
      last.length <= 12 &&
      /[A-Za-z]/.test(last) &&
      !/https?:\/\//.test(last) &&
      !/\d/.test(last)
    ) {
      console.log(JSON.stringify({ event: "GEMINI_CONSULT_TRAILING_JUNK_STRIPPED", junk: last.slice(0, 20) }));
      out = lines.slice(0, -1).join("\n").trim();
    }
    return out;
  };

  const guarded = await enforceLlmCustomerOutput(
    {
      callSite: "gemini_front_consult",
      replyType: "gemini_front_consult",
      userText: p.userText,
      userIntent: finalizeIntent(contract, evidence),
      userAskedAdvice: contract.userAskedAdvice === true,
      requiredNextAction: contract.requiredNextAction === true,
      allowQuestion: contract.allowQuestion === true,
      expectedRole,
      evidence,
      turnBudget: p.turnBudget,
    },
    {
      generate: async (directive) => {
        const fullPrompt = directive
          ? `${prompt}\n\nแก้ตามนี้: ${directive}\nตอบใหม่สั้น ๆ`
          : prompt;
        const text = await (deps.generate || ((m, pr, ms) => generateTextWithTimeout(m, pr, ms)))(model, fullPrompt, env.GEMINI_CONSULT_TIMEOUT_MS);
        const out = stripTrailingJunk(text);
        console.log(
          JSON.stringify({
            event: "GEMINI_CONSULT",
            outcome: out ? "ok" : "empty",
            attempt: directive ? 2 : 1,
            len: out.length,
            hasRecentScan: Boolean(recentScan),
            tier: paidActive ? "paid_opus" : "free_cheap",
            model: consultModel || "(front_default)",
          }),
        );
        return out;
      },
    },
  );
  return guarded.text || null;
}

/**
 * แปลง context ของ consult เป็น typed evidence (Codex P0-2)
 * — ต้องมี "ค่า" จริงเท่านั้นถึงปลดล็อก claim หมวดนั้น
 */
export function buildConsultEvidence({ recentScan, kbContext } = {}) {
  const scans = Array.isArray(recentScan?.items) ? recentScan.items : [];
  const scores = scans.map((s) => Number(s?.score)).filter((n) => Number.isFinite(n));
  const percentages = scans.map((s) => Number(s?.compatPercent)).filter((n) => Number.isFinite(n));
  const energyTags = scans.flatMap((s) => (Array.isArray(s?.energyTags) ? s.energyTags : []));
  return {
    report: {
      ids: scans.map((s) => String(s?.reportId || "")).filter(Boolean),
      scores,
      percentages,
      energyTags,
      luckyAttributes: [],
      materials: [],
    },
    // kbContext เป็น prompt string — ยังไม่มี typed provenance/material fact → ไม่ปลดล็อกอะไร
    kb: { ids: kbContext ? ["kb"] : [], provenanceFacts: [], materialFacts: [] },
    tool: {},
  };
}
