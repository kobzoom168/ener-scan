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
  let rankingAllowed = false;
  const kbPromise = buildKbContext(p.userText).catch(() => null);
  if (p.userId) {
    [recentScan, customerFacts, kbContext, paidActive, axisTop, rankingAllowed] = await Promise.all([
      buildScanHistoryContext(p.userId, 6).catch(() => null),
      buildCustomerFactsContext(p.userId).catch(() => null),
      kbPromise,
      isPaidActiveCustomer(p.userId),
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
  if (!model) return null;

  let prompt = buildConsultUserPrompt({
    userText: p.userText,
    conversationHistory: p.conversationHistory,
    recentScan,
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

  try {
    const text = await generateTextWithTimeout(
      model,
      prompt,
      env.GEMINI_CONSULT_TIMEOUT_MS,
    );
    let out = String(text || "").trim();
    // ขยะท้ายคำตอบจากโมเดล (เคสจริง 11 ส.ค.: Opus ปิดท้ายด้วยบรรทัด "พูดno"):
    // บรรทัดสุดท้ายสั้น ๆ มีตัวละติน ไม่มีลิงก์/ตัวเลข และไม่จบแบบประโยคไทยปกติ → ตัดทิ้ง
    const lines = out.split("\n");
    const last = (lines[lines.length - 1] || "").trim();
    if (
      lines.length > 1 &&
      last.length > 0 &&
      last.length <= 12 &&
      /[A-Za-z]/.test(last) &&
      !/https?:\/\//.test(last) &&
      !/\d/.test(last) &&
      !/(ครับ|ค่ะ|นะ|เลย|จ้า)$/.test(last)
    ) {
      console.log(JSON.stringify({ event: "GEMINI_CONSULT_TRAILING_JUNK_STRIPPED", junk: last.slice(0, 20) }));
      out = lines.slice(0, -1).join("\n").trim();
    }
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
