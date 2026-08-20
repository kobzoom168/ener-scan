/**
 * ตรวจคุณภาพแชทรายวัน (กบ 19 ก.ค. 2026): ทุกเช้า 6 โมง (เวลาไทย) ไล่บทสนทนา 24 ชม
 * ที่ผ่านมา ให้ LLM ตัวถูก (DeepSeek ชั้นฟรี) ตรวจว่าบอทตอบอยู่ใน flow ไหม หลุดบท/เดา/งง/
 * มี bug ข้อความไหม → สรุปภาษาไทยละเอียด (เวลา + LINE userId เต็ม + quote ข้อความ)
 * ส่งเข้า Telegram ให้กบ copy ทั้งก้อนไปให้ Claude แก้ต่อได้เลย
 *
 * pattern เดียวกับ renewalReminder: ถูกเรียกทุกนาทีจาก maintenanceWorker แล้ว
 * self-gate ชั่วโมง 6 Bangkok + redis dedupe รายวัน · พังตรงไหน = ข้ามรอบ ไม่ล้ม worker
 */
import crypto from "node:crypto";
import { supabase } from "../config/supabase.js";
import { acquireShortLockStrict, releaseShortLock, renewShortLockStrict } from "../redis/scanV2Redis.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
} from "../integrations/gemini/geminiFlash.api.js";
import { env } from "../config/env.js";
import { sendTelegramText, isTelegramConfigured, chunkTelegramText } from "./telegramNotify.service.js";
import { setAppSetting, getAppSetting } from "../stores/appSettings.db.js";
import { getBangkokDayUtcRangeExclusiveEnd } from "../utils/bangkokTime.util.js";
import { CURATOR_SYSTEM, curateWithFallback, buildDegradedReport } from "./chatQualityCurated.util.js";
import { runReportDeliveryCycle } from "./chatQualityReportOutbox.util.js";

const REPORT_HOUR_BKK = (() => {
  const n = Number(process.env.CHAT_QUALITY_REPORT_HOUR);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.floor(n) : 6;
})();
// รอบ retry: partial failure/curate ล้ม → worker (ทุกนาที) ตามต่อจนถึงชั่วโมงนี้
const REPORT_RETRY_UNTIL_HOUR_BKK = (() => {
  const n = Number(process.env.CHAT_QUALITY_REPORT_RETRY_UNTIL_HOUR);
  return Number.isFinite(n) && n >= REPORT_HOUR_BKK && n <= 23 ? Math.floor(n) : 11;
})();
const CURATE_TIMEOUT_MS = (() => {
  const n = Number(process.env.CHAT_QUALITY_CURATE_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 5000 ? Math.floor(n) : 45000;
})();
const MAX_ROWS = 4000;
const MAX_TRANSCRIPT_CHARS_PER_USER = 6000;
const MAX_USERS_ANALYZED = 60;
const LLM_TIMEOUT_MS = 25000;

function bangkokHour(now) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

function bangkokDateKey(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function bangkokHm(iso) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "??:??";
  }
}

export const ANALYZER_SYSTEM = `You are a strict Thai QA auditor for "Ener Scan" — a LINE OA where customers scan sacred objects (พระเครื่อง/เครื่องราง/หิน/กำไล) and chat with TWO bot personas in one chat.

TWO ROLES (persona 2 ชั้น — กบ 11 ส.ค. 2026). Transcript bot lines may be tagged บอท(แอดมิน) / บอท(อาจารย์) / บอท (unknown legacy):
- แอดมิน = front-desk service person, calls himself ผม. His job: รับรูป เก็บข้อมูล แจ้งคิว ค่าครู/สิทธิ์/สลิป วิธีใช้ แก้ปัญหา. Saying "ผมเป็นแอดมิน" or relaying "เดี๋ยวผมส่งให้อาจารย์" is CORRECT behavior — never flag admin voice as persona break.
- อาจารย์ = the master who does readings only. Calls himself อาจารย์. He must NEVER mention money in any form (บาท ค่าครู แพ็ก สิทธิ์ ราคา โอน สลิป QR โปร) and never sell.
Role violations to flag:
- แอดมินตีความพลัง/ให้คะแนน/แนะนำเชิงวิชาเอง = violation (reading is อาจารย์'s job)
- อาจารย์พูดเรื่องเงิน/ชวนเปิดสิทธิ์ = violation ร้ายแรงสุด (severity high เสมอ)
- Handoff: first พลัง question of a topic should get a short admin handoff (เดี๋ยวผมเรียนถามอาจารย์ให้) then an อาจารย์ answer. Follow-up questions on the SAME topic must NOT repeat the handoff (handoff ทุกข้อความ = flag ความรำคาญ). Admin saying he will forward to อาจารย์ with NO answer following = flag.
- Mixed message (พลัง+เงินในข้อความเดียว) should be answered in two voices: อาจารย์ ส่วนพลัง แล้วแอดมินส่วนเงิน — อาจารย์ตอบส่วนเงินเอง = flag.

You receive one conversation transcript (24h window). Judge ONLY the bot's replies. Flag real problems:
- หลุดบท: bot admits being AI/บอท/ระบบ/โมเดล, or breaks whichever persona is speaking (NOTE: admin voice ผม/แอดมิน is a valid persona, NOT a break)
- เดา/มโน: bot invents facts, dates, prices, piece names, ดวง readings, or claims to be doing something it cannot do (e.g. "กำลังดูข้อมูลอยู่")
- ผิด flow: customer clearly wants to pay / asks about packages / sends slip context but bot answers off-track; or customer asks a direct question and bot answers something else or repeats itself
- ไม่ต่อเนื่อง (กบ 21 ก.ค.): the customer is in the middle of asking about topic X but the bot switches to a different topic, ignores the pending question, or answers a question the customer did not ask. When the bot does not understand, the CORRECT behavior is one short clarifying question — guessing and answering something unrelated must be flagged
- งง/วน: bot replies that contradict earlier replies, loop the same phrasing, or leave the customer visibly confused/annoyed
- bug text: raw error strings, template placeholders, broken formatting, dash characters (— – " - ") used as sentence separators, mixed languages ผิดที่
- เกินขอบเขต: guarantees results (รวยแน่/ถูกหวยแน่), authenticity/price judgements (แท้/เก๊/ราคา), medical claims
- ผิดภาษา: customer writes in English but bot replies in Thai (or vice versa) — bot must always match the customer's language
- ผิดโทน (กบ 21 ก.ค. + 11 ส.ค.): อาจารย์ voice is a calm master — flag อาจารย์ replies that are over-accommodating/ประจบ, overly excited, joking, or apologizing. แอดมิน voice is service-minded (ขอโทษสั้น ๆ ได้เมื่อผิดจริง) but flag call-center/AI phrasing: "ขออภัยในความไม่สะดวก" "ยินดีให้บริการ" "เข้าใจแล้วครับ/รับทราบครับ/แน่นอนครับ" ขึ้นต้นประโยค. Flag joking tone in ANY voice: 555 / ฮ่า ๆ / มุกตลก / แซวลูกค้า (กบ 11 ส.ค.: ทุกข้อความต้องจริงจัง). Also flag AI-style punctuation in ANY voice: em/en dashes (— –) or quotation marks (" ") around words — real people typing chat do not use these
- อวย (กบ 24 ก.ค. — กฏหลัก): flag any gushing/hyping/over-praising a piece — คำอย่าง สวยมาก เยี่ยมมาก สุดยอด พลังแรงมาก โดดเด่นมาก หายากมาก ปัง เป็นบุญ — อาจารย์พูดข้อเท็จจริงนิ่ง ๆ ไม่ประโคม การอวยคือผิดกฏหลักต้อง flag เสมอ
- มโนรายละเอียดวัตถุ (กบ 24 ก.ค. — เคสจริง: พระบูชาโลหะ บอทตอบว่า "เนื้อผง" + "ส่งมาเมื่อวานนี้" ทั้งที่สแกนวันนี้): flag เมื่อบอทระบุเนื้อวัตถุ (เนื้อผง/โลหะ/ว่าน/ดิน ฯลฯ) หรือเดาช่วงเวลา (เมื่อวาน/วันนี้) ที่ไม่มีในข้อมูล — ระบบไม่เคยระบุเนื้อ บอทห้ามแต่งขึ้นเอง · ยังใช้ false-positive trap ข้อ 1 (ตัวเลขคะแนน/เปอร์เซ็นต์จากรายงานจริงไม่ใช่การมโน) ตามเดิม เฉพาะ "เนื้อ/เวลา" ที่ไม่มีทางรู้จากระบบเท่านั้นที่ flag
- อวยสรุปเอง (กบ 24 ก.ค.): customer ตอบสั้น ๆ (ได้ครับ/โอเค/โชว์ได้เลย) แล้วบอทยกผลสแกนล่าสุดขึ้นมาเล่าเองทั้งที่ไม่มีคนถาม = flag (ต้องรับสั้น ๆ จบ)
- ทวงสลิปหลังจ่ายแล้ว (กบ 29 ก.ค. — เคสจริง: ลูกค้าจ่าย+ระบบเปิดสิทธิ์แล้ว แต่บอทตอบ "โอนแล้วส่งสลิปมาได้เลย" ซ้ำ 2 รอบ): flag เมื่อบอทพูดเรื่องโอน/QR/ส่งสลิป ทั้งที่ในบทสนทนามีข้อความยืนยันเปิดสิทธิ์ไปแล้ว หรือบริบทชัดว่าลูกค้าจ่ายจบแล้ว — เรื่องจ่ายจบต้องไม่ถูกยกกลับมา
  ⚠️ false-positive trap (30 ก.ค. — เคสจริง analyzer พลาด): ข้อความ "✅ ตรวจสลิปเรียบร้อย เปิดสิทธิ์แล้ว ส่งรูปเข้ามาได้เลย" คือ**ข้อความยืนยัน**ของระบบหลังจ่ายสำเร็จ ไม่ใช่การทวงสลิป ห้าม flag เด็ดขาด และซ้ำหลายครั้งในวันเดียวได้ถ้าลูกค้าซื้อแพ็กหลายรอบ (เคสจริง: ลูกค้าซื้อ 49 บาท 5 รอบ/วัน = ยืนยัน 5 ครั้ง ถูกต้อง) — flag เฉพาะบอท**ขอ/ทวง**สลิปหรือชวนโอน ("โอนแล้วส่งสลิปมา", "แตะปุ่มโอนตาม QR") หลังบริบทจ่ายจบแล้วเท่านั้น

CRITICAL CONTEXT — the nature of this business (กบ 21 ก.ค.): this is a faith/energy-reading service. Both personas are INTENTIONALLY presented as real people (แอดมินคนจริง + อาจารย์คนจริง). Customers must never know it is AI. Therefore:
- In-persona language is CORRECT and must NOT be flagged: "เพ่งพลัง", "อาจารย์ดูให้", "จับพลังงาน", "เดี๋ยวผมส่งให้อาจารย์", "รอแป๊บ เดี๋ยวอ่านให้" while a real scan is in progress — this is the desired roleplay, not hallucination.
- What IS a violation: revealing it is AI/บอท/"ระบบ" (any self-reference as a system), OR stating concrete numbers/results (เปอร์เซ็นต์เข้ากับดวง, คะแนน, ด้านเด่น) that the system has not actually computed in a delivered report, OR contradicting the real flow.
- Judge "เดา/มโน" ONLY for invented facts and numbers — never for staying in character as a human master.

Do NOT flag: normal polite replies, the bot declining to answer authenticity/price (that is correct), short answers, system paywall cards, image messages you cannot see, in-persona master roleplay as described above.

Two false-positive traps to avoid (กบ 22 ก.ค. — both happened):
1. NUMBERS FROM REAL REPORTS: you cannot see the scan reports, but the bot can. If the conversation shows a scan completed earlier (customer sent a photo and got a result), numbers the bot quotes (คะแนน/เปอร์เซ็นต์/ด้านเด่น) usually come from that real report — do NOT flag them. Only flag invented numbers when it is clear no report exists yet (e.g. customer just sent the photo, bot said "รอสักครู่", then suddenly quotes results before any delivery).
2. SYSTEM PAYWALL TEXT: messages listing package prices right after the customer runs out of free quota (pattern: "ใช้สิทธิ์สแกนฟรีครบแล้ว" + prices 29/49/399) are automated system templates the owner designed — correct behavior, never flag as "เสนอขายเอง".

Reply JSON only:
{"ok": true|false, "summary": "<=1 Thai sentence about this conversation>", "issues": [{"time":"HH:MM","who":"bot","quote":"<exact quoted text, <=200 chars>","problem":"<Thai, short, specific>","severity":"low|med|high"}]}
ok=true when no issues. Copy quotes exactly from the transcript. Max 5 issues, worst first.`;

/**
 * @param {Array<{ role: string, text: string, created_at: string }>} rows
 * @returns {string}
 */
function speakerLabel(r) {
  if (r.role !== "bot") return "ลูกค้า";
  const sp = String(r.metadata_json?.speakerRole || "").trim();
  if (sp === "admin") return "บอท(แอดมิน)";
  if (sp === "ajarn") return "บอท(อาจารย์)";
  if (sp === "consult") return "บอท(แชทตอบลูกค้า อาจเป็นได้ทั้งสองเสียง)";
  return "บอท";
}

function buildTranscript(rows) {
  const lines = rows.map(
    (r) => `[${bangkokHm(r.created_at)}] ${speakerLabel(r)}: ${String(r.text || "").slice(0, 500)}`,
  );
  let out = lines.join("\n");
  if (out.length > MAX_TRANSCRIPT_CHARS_PER_USER) {
    out = out.slice(out.length - MAX_TRANSCRIPT_CHARS_PER_USER);
    out = `(ตัดช่วงต้นออก เกินขนาด)\n${out}`;
  }
  return out;
}

function safeParseJson(raw) {
  const s = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} transcript
 * @returns {Promise<{ ok: boolean, summary?: string, issues?: Array<{time?: string, quote?: string, problem?: string, severity?: string}> } | null>}
 */
async function analyzeConversation(transcript) {
  const model = getGeminiFlashModel({
    callSite: "chatQuality",
    systemInstruction: ANALYZER_SYSTEM,
    jsonMode: true,
    temperature: 0.1,
    timeoutMs: LLM_TIMEOUT_MS,
    maxTokens: 900,
    modelOverride: env.LLM_CONSULT_MODEL_FREE,
    cacheSystemPrompt: true,
    disableReasoning: true,
  });
  if (!model) return null;
  const raw = await generateTextWithTimeout(model, transcript, LLM_TIMEOUT_MS);
  return safeParseJson(raw);
}

/**
 * ประกอบรายงานไทยแบบ copy ส่งต่อได้ทั้งก้อน
 */
function buildReportText({ dateKey, convCount, okCount, problemCases, analyzeFailed, truncatedUsers }) {
  const head = [
    `📋 ตรวจแชทของวันที่ ${dateKey} (00:00-23:59 เวลาไทย)`,
    `บทสนทนา ${convCount} ราย · ปกติ ${okCount} · มีประเด็น ${problemCases.length}${analyzeFailed ? ` · ตรวจไม่ได้ ${analyzeFailed}` : ""}`,
  ];
  if (!problemCases.length) {
    head.push("", "✅ วันนี้ไม่พบปัญหา บอทตอบอยู่ใน flow ทุกบทสนทนา");
    return head.join("\n");
  }
  const blocks = [];
  for (const c of problemCases) {
    const lines = [
      "",
      `⚠️ ${c.severity === "high" ? "🔴" : c.severity === "med" ? "🟠" : "🟡"} [${c.time || "??:??"}] ${c.userId}`,
      `ปัญหา: ${c.problem}`,
    ];
    if (c.quote) lines.push(`ข้อความบอท: "${c.quote}"`);
    if (c.contextSummary) lines.push(`สรุปบทสนทนา: ${c.contextSummary}`);
    blocks.push(lines.join("\n"));
  }
  const tail = truncatedUsers
    ? ["", `(หมายเหตุ: บทสนทนายาวเกิน ${MAX_USERS_ANALYZED} ราย ตรวจ ${MAX_USERS_ANALYZED} รายตามลำดับความสำคัญ (ด่า/เงิน/คุยเยอะ ก่อน))`]
    : [];
  return [...head, ...blocks, ...tail, "", "คัดลอกเคสด้านบนส่งให้ Claude แก้ต่อได้เลย"].join("\n");
}

/**
 * สร้างรายงานดิบของวัน (deterministic checks + ตรวจต่อบทสนทนา) — throw เมื่อ DB พัง
 * @returns {Promise<{ text: string, convCount: number, deterministicIncidents: number, problems: number }>}
 */
export async function buildBaseReportData(reportDateKey) {
  const dayRange = getBangkokDayUtcRangeExclusiveEnd(reportDateKey);
  let { data: rows, error } = await supabase
    .from("line_conversation_messages")
    .select("line_user_id,role,text,created_at,metadata_json")
    .gte("created_at", dayRange.startIso)
    .lt("created_at", dayRange.endIso)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);
  if (error) {
    // migration 051 (metadata_json) ยังไม่ apply → ตรวจต่อแบบไม่มี speaker tag ดีกว่าข้ามทั้งวัน
    ({ data: rows, error } = await supabase
      .from("line_conversation_messages")
      .select("line_user_id,role,text,created_at")
      .gte("created_at", dayRange.startIso)
      .lt("created_at", dayRange.endIso)
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS));
  }
  if (error) throw error;

  /** @type {Map<string, Array<{ role: string, text: string, created_at: string }>>} */
  const byUser = new Map();
  for (const r of rows || []) {
    const uid = String(r.line_user_id || "").trim();
    if (!uid) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(r);
  }
  // ต้องมีข้อความลูกค้าอย่างน้อย 1 (บอท push ฝ่ายเดียว เช่น แจ้งเตือน ไม่ต้องตรวจ)
  // จัดลำดับความสำคัญแทน 60 คนแรกตามเวลา (11 ส.ค.): ด่า/เงิน/คุยเยอะ มาก่อน
  const { prioritizeUsers, runDeterministicChecks } = await import(
    "./chatQualityDeterministic.util.js"
  );
  const userIds = prioritizeUsers(byUser);
  const truncatedUsers = userIds.length > MAX_USERS_ANALYZED;
  const targetIds = userIds.slice(0, MAX_USERS_ANALYZED);

  let okCount = 0;
  let analyzeFailed = 0;
  let deterministicIncidents = 0;
  const problemCases = [];
  for (const uid of targetIds) {
    const convRows = byUser.get(uid);
    // deterministic ก่อน (โค้ดจับแม่นกว่า LLM): อาจารย์+คำเงิน / ข้อความวนซ้ำ / handoff ค้าง
    try {
      for (const f of runDeterministicChecks(convRows).slice(0, 5)) {
        problemCases.push({ userId: uid, ...f, contextSummary: "" });
        deterministicIncidents += 1;
      }
    } catch { /* deterministic พังไม่ขวาง LLM */ }
    try {
      const verdict = await analyzeConversation(buildTranscript(convRows));
      if (!verdict) {
        analyzeFailed += 1;
        continue;
      }
      const issues = Array.isArray(verdict.issues) ? verdict.issues : [];
      if (verdict.ok !== false || issues.length === 0) {
        okCount += 1;
        continue;
      }
      for (const it of issues.slice(0, 5)) {
        problemCases.push({
          userId: uid,
          time: String(it.time || "").slice(0, 5),
          quote: String(it.quote || "").slice(0, 220),
          problem: String(it.problem || "ไม่ระบุ").slice(0, 300),
          severity: String(it.severity || "med"),
          contextSummary: String(verdict.summary || "").slice(0, 200),
        });
      }
    } catch (e) {
      analyzeFailed += 1;
      console.log(
        JSON.stringify({
          event: "CHAT_QUALITY_ANALYZE_ERROR",
          lineUserIdPrefix: uid.slice(0, 10),
          message: String(e?.message || e).slice(0, 160),
        }),
      );
    }
  }

  const sevRank = { high: 0, med: 1, low: 2 };
  problemCases.sort((a, b) => (sevRank[a.severity] ?? 1) - (sevRank[b.severity] ?? 1));

  const report = buildReportText({
    dateKey: reportDateKey,
    convCount: targetIds.length,
    okCount,
    problemCases,
    analyzeFailed,
    truncatedUsers,
  });
  // เก็บฉบับล่าสุดให้ดึงผ่าน /internal/chat-quality/latest (best-effort)
  try {
    await setAppSetting("chat_quality_last_report", {
      dateKey: reportDateKey,
      text: report,
      createdAt: new Date().toISOString(),
    });
  } catch {}
  console.log(
    JSON.stringify({
      event: "CHAT_QUALITY_BASE_REPORT_BUILT",
      reportDateKey,
      convCount: targetIds.length,
      okCount,
      problems: problemCases.length,
      analyzeFailed,
      deterministicIncidents,
    }),
  );
  return {
    text: report,
    convCount: targetIds.length,
    deterministicIncidents,
    problems: problemCases.length,
  };
}

const OUTBOX_KEY = (reportDateTH) => `chat_quality_outbox:${reportDateTH}`;
// lease จริงถูก clamp ที่ 10 นาที (acquireShortLock สูงสุด 600s) — build worst-case
// ~27 นาที จึงต้อง renew compare-token ทุก 60s ระหว่าง cycle (Codex รอบสอง)
const REPORT_LEASE_TTL_MS = 10 * 60 * 1000;
const REPORT_LEASE_RENEW_MS = 60 * 1000;

/** chain ของ model คัดกรอง — แต่ละตัว timeout ของตัวเอง (env CSV override ได้) */
function curateModelChain() {
  const csv = String(process.env.CHAT_QUALITY_CURATE_MODELS || "").trim();
  const models = csv
    ? csv.split(",").map((s) => s.trim()).filter(Boolean)
    : ["google/gemini-2.5-flash", String(env.LLM_CONSULT_MODEL_FREE || "").trim()].filter(Boolean);
  return [...new Set(models)].map((model) => ({ model, timeoutMs: CURATE_TIMEOUT_MS }));
}

async function callCurateModel(model, prompt, timeoutMs) {
  const m = getGeminiFlashModel({
    callSite: "chatQualityCurate",
    systemInstruction: CURATOR_SYSTEM,
    temperature: 0.2,
    timeoutMs,
    maxTokens: 3000,
    modelOverride: model,
    disableReasoning: true,
  });
  if (!m) throw new Error("model_unavailable");
  return generateTextWithTimeout(m, prompt, timeoutMs);
}

/**
 * เรียกทุกนาทีจาก maintenanceWorker — ทำงานจริงในหน้าต่าง 6 โมงถึง RETRY_UNTIL
 * (Bangkok) · idempotent ผ่าน durable outbox ต่อ reportDateTH: ครบแล้วรันซ้ำ =
 * finalized ไม่ส่งซ้ำ · partial = ตามส่งเฉพาะส่วนที่ขาด (แทน tryDedupeOnce เดิม
 * ที่ fail-open + claim ก่อนส่ง — Codex C7 / incident 20 ส.ค.)
 * @param {Date} [now]
 * @param {object} [deps] DI สำหรับเทสต์ — override ได้ทุกชั้น
 */
export async function runChatQualityDailySweep(now = new Date(), deps = {}) {
  if (
    String(process.env.CHAT_QUALITY_REPORT_ENABLED ?? "true").trim().toLowerCase() === "false"
  ) {
    return { skipped: "disabled" };
  }
  const telegramReady = deps.isTelegramConfigured ? deps.isTelegramConfigured() : isTelegramConfigured();
  if (!telegramReady) return { skipped: "telegram_not_configured" };
  const h = bangkokHour(now);
  if (h < REPORT_HOUR_BKK || h > REPORT_RETRY_UNTIL_HOUR_BKK) return { skipped: "not_report_hour" };

  // กบ 21 ก.ค.: รายงานคือเต็มวันปฏิทินของเมื่อวาน 00:00-23:59 เวลาไทย
  const reportDateTH = bangkokDateKey(new Date(now.getTime() - 24 * 3600 * 1000));
  const key = OUTBOX_KEY(reportDateTH);
  const lineEnabled =
    String(process.env.CHAT_QUALITY_REPORT_LINE_ENABLED ?? "false").trim().toLowerCase() === "true" &&
    typeof deps.lineSend === "function";

  return runReportDeliveryCycle({
    reportDateTH,
    loadOutbox: deps.loadOutbox || (async () => (await getAppSetting(key)) || null),
    saveOutbox: deps.saveOutbox || (async (ob) => setAppSetting(key, ob)),
    // strict (Codex B1): redis ไม่มี/พัง = ไม่ได้ lease — ห้าม fail-open เป็น token ปลอม
    // (acquireShortLock เดิมคืน random token เมื่อไม่มี redis → ทุก instance คิดว่าถือ lease)
    acquireLease:
      deps.acquireLease ||
      (async () => {
        const r = await acquireShortLockStrict(`chat_quality:report:${reportDateTH}`, REPORT_LEASE_TTL_MS);
        return r.ok === true ? r.token : null;
      }),
    releaseLease:
      deps.releaseLease || ((token) => releaseShortLock(`chat_quality:report:${reportDateTH}`, token)),
    renewLease:
      deps.renewLease || ((token) => renewShortLockStrict(`chat_quality:report:${reportDateTH}`, token, REPORT_LEASE_TTL_MS)),
    renewIntervalMs: Number(deps.renewIntervalMs) > 0 ? Number(deps.renewIntervalMs) : REPORT_LEASE_RENEW_MS,
    buildBase: deps.buildBase || (() => buildBaseReportData(reportDateTH)),
    curate:
      deps.curate ||
      ((baseText) =>
        curateWithFallback(baseText, {
          models: curateModelChain(),
          callModel: callCurateModel,
        })),
    buildDegraded: deps.buildDegraded || buildDegradedReport,
    chunkText: deps.chunkText || chunkTelegramText,
    hashChunk: deps.hashChunk || ((t) => crypto.createHash("sha1").update(String(t)).digest("hex").slice(0, 16)),
    channels: deps.channels || {
      telegram: { enabled: true, send: (text) => sendTelegramText(text) },
      line: { enabled: lineEnabled, send: (text) => deps.lineSend(text) },
    },
    notify: deps.notify || ((text) => sendTelegramText(text)),
    renotifyEveryAttempts: deps.renotifyEveryAttempts,
    nowIso: deps.nowIso,
    log: deps.log,
  });
}
