import { env } from "../../../config/env.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
  isGeminiConfigured,
} from "../../../integrations/gemini/geminiFlash.api.js";
import { GEMINI_CONSULT_SYSTEM, buildConsultUserPrompt } from "./geminiConsultPrompt.js";
import { buildScanHistoryContext, buildAxisTopContext } from "./recentScanContext.util.js";
import { buildCustomerFactsContext } from "./customerFactsContext.util.js";
import { buildKbContext } from "./kbRetrieval.util.js";
import { supabase } from "../../../config/supabase.js";
import { computePaidActive } from "../../../services/scanOfferAccess.resolver.js";

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
export async function runGeminiConsult(p) {
  if (!env.GEMINI_CONSULT_ENABLED) return null;
  if (!isGeminiConfigured()) return null;

  // Phase B: best-effort personalization from the user's own scan history
  // (multiple pieces, so it can compare "องค์ไหนแรงสุด/ดีสุด" + link the report)
  // + real account facts (birthdate on file, free/paid quota) so the model
  // never re-asks known data or guesses service rules.
  let recentScan = null;
  let customerFacts = null;
  let kbContext = null;
  let paidActive = false;
  let axisTop = null;
  const kbPromise = buildKbContext(p.userText).catch(() => null);
  if (p.userId) {
    [recentScan, customerFacts, kbContext, paidActive, axisTop] = await Promise.all([
      buildScanHistoryContext(p.userId, 6).catch(() => null),
      buildCustomerFactsContext(p.userId).catch(() => null),
      kbPromise,
      isPaidActiveCustomer(p.userId),
      buildAxisTopContext(p.userId).catch(() => null),
    ]);
  } else {
    kbContext = await kbPromise;
  }

  // แพ็กแอคทีฟ = สมองแพง (Opus) / ฟรี = สมองถูก (DeepSeek) — persona/guardrails ชุดเดียวกัน
  const consultModel = paidActive
    ? env.LLM_CONSULT_MODEL
    : env.LLM_CONSULT_MODEL_FREE || env.LLM_CONSULT_MODEL;

  const model = getGeminiFlashModel({
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
  if (!model) return null;

  let prompt = buildConsultUserPrompt({
    userText: p.userText,
    conversationHistory: p.conversationHistory,
    recentScan,
    customerFacts,
    kbContext,
    axisTop,
  });
  // ชั้นฟรี: ถามคำตอบคำ (กบ 16 ก.ค.) — ตอบตรงคำถาม สั้นสุด ไม่ขยายความเอง
  // (ลูกค้าแพ็กแอคทีฟใช้กติกา 2-4 บรรทัดใน system ตามเดิม = ดูแลเต็ม)
  if (!paidActive) {
    prompt += "\n\nข้อกำหนดรอบนี้: ตอบสั้นที่สุด ตรงคำถามพอ 1-2 ประโยค ไม่ต้องขยายความหรือชวนคุยต่อ ยกเว้นลูกค้าขอรายละเอียดชัด ๆ";
  }

  try {
    const text = await generateTextWithTimeout(
      model,
      prompt,
      env.GEMINI_CONSULT_TIMEOUT_MS,
    );
    const out = String(text || "").trim();
    console.log(
      JSON.stringify({
        event: "GEMINI_CONSULT",
        outcome: out ? "ok" : "empty",
        len: out.length,
        hasRecentScan: Boolean(recentScan),
        tier: paidActive ? "paid_opus" : "free_cheap",
        model: consultModel || "(front_default)",
      }),
    );
    return out || null;
  } catch (e) {
    console.log(
      JSON.stringify({
        event: "GEMINI_CONSULT",
        outcome: "error",
        message: (e && e.message) || String(e),
      }),
    );
    return null;
  }
}
