/**
 * ตรวจคุณภาพแชทรายวัน (กบ 19 ก.ค. 2026): ทุกเช้า 6 โมง (เวลาไทย) ไล่บทสนทนา 24 ชม
 * ที่ผ่านมา ให้ LLM ตัวถูก (DeepSeek ชั้นฟรี) ตรวจว่าบอทตอบอยู่ใน flow ไหม หลุดบท/เดา/งง/
 * มี bug ข้อความไหม → สรุปภาษาไทยละเอียด (เวลา + LINE userId เต็ม + quote ข้อความ)
 * ส่งเข้า Telegram ให้กบ copy ทั้งก้อนไปให้ Claude แก้ต่อได้เลย
 *
 * pattern เดียวกับ renewalReminder: ถูกเรียกทุกนาทีจาก maintenanceWorker แล้ว
 * self-gate ชั่วโมง 6 Bangkok + redis dedupe รายวัน · พังตรงไหน = ข้ามรอบ ไม่ล้ม worker
 */
import { supabase } from "../config/supabase.js";
import { tryDedupeOnce } from "../redis/scanV2Redis.js";
import {
  getGeminiFlashModel,
  generateTextWithTimeout,
} from "../integrations/gemini/geminiFlash.api.js";
import { env } from "../config/env.js";
import { sendTelegramText, isTelegramConfigured } from "./telegramNotify.service.js";
import { setAppSetting } from "../stores/appSettings.db.js";
import { getBangkokDayUtcRangeExclusiveEnd } from "../utils/bangkokTime.util.js";

const REPORT_HOUR_BKK = (() => {
  const n = Number(process.env.CHAT_QUALITY_REPORT_HOUR);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.floor(n) : 6;
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

const ANALYZER_SYSTEM = `You are a strict Thai QA auditor for "อาจารย์เอเนอร์" — a LINE OA where customers scan sacred objects (พระเครื่อง/เครื่องราง/หิน/กำไล) and chat with an AI persona called อาจารย์.

You receive one conversation transcript (24h window). Judge ONLY the bot's replies. Flag real problems:
- หลุดบท: bot admits being AI/บอท/ระบบ/โมเดล/แอดมิน, or breaks the อาจารย์ persona
- เดา/มโน: bot invents facts, dates, prices, piece names, ดวง readings, or claims to be doing something it cannot do (e.g. "กำลังดูข้อมูลอยู่")
- ผิด flow: customer clearly wants to pay / asks about packages / sends slip context but bot answers off-track; or customer asks a direct question and bot answers something else or repeats itself
- ไม่ต่อเนื่อง (กบ 21 ก.ค.): the customer is in the middle of asking about topic X but the bot switches to a different topic, ignores the pending question, or answers a question the customer did not ask. When the bot does not understand, the CORRECT behavior is one short clarifying question — guessing and answering something unrelated must be flagged
- งง/วน: bot replies that contradict earlier replies, loop the same phrasing, or leave the customer visibly confused/annoyed
- bug text: raw error strings, template placeholders, broken formatting, dash characters (— – " - ") used as sentence separators, mixed languages ผิดที่
- เกินขอบเขต: guarantees results (รวยแน่/ถูกหวยแน่), authenticity/price judgements (แท้/เก๊/ราคา), medical claims
- ผิดภาษา: customer writes in English but bot replies in Thai (or vice versa) — bot must always match the customer's language
- ผิดโทน (กบ 21 ก.ค.): the อาจารย์ persona is a calm 41-year-old master — flag replies that are over-accommodating/ประจบ/ตามใจลูกค้าเกินเหตุ, overly excited, joking around, or apologizing repeatedly. Also flag AI-style punctuation: em/en dashes (— –) or quotation marks (" ") around words — real people typing chat do not use these

CRITICAL CONTEXT — the nature of this business (กบ 21 ก.ค.): this is a faith/energy-reading service. The อาจารย์ persona is INTENTIONALLY presented as a human master. Customers must never know it is AI. Therefore:
- In-persona spiritual language is CORRECT and must NOT be flagged: "เข้าสมาธิ", "เพ่งพลัง", "อาจารย์ดูให้", "จับพลังงาน", "รอแป๊บ เดี๋ยวอ่านให้" while a real scan is in progress — this is the desired human-master roleplay, not hallucination.
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
function buildTranscript(rows) {
  const lines = rows.map(
    (r) =>
      `[${bangkokHm(r.created_at)}] ${r.role === "bot" ? "บอท" : "ลูกค้า"}: ${String(r.text || "").slice(0, 500)}`,
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
    ? ["", `(หมายเหตุ: บทสนทนายาวเกิน ${MAX_USERS_ANALYZED} ราย ตรวจ ${MAX_USERS_ANALYZED} รายแรกตามเวลา)`]
    : [];
  return [...head, ...blocks, ...tail, "", "คัดลอกเคสด้านบนส่งให้ Claude แก้ต่อได้เลย"].join("\n");
}

/**
 * เรียกทุกนาทีจาก maintenanceWorker — ยิงจริงวันละครั้งตอน 6 โมงเช้า (Bangkok)
 * @param {Date} [now]
 * @returns {Promise<{ skipped?: string, sent?: boolean, convCount?: number, problems?: number }>}
 */
export async function runChatQualityDailySweep(now = new Date()) {
  if (
    String(process.env.CHAT_QUALITY_REPORT_ENABLED ?? "true").trim().toLowerCase() === "false"
  ) {
    return { skipped: "disabled" };
  }
  if (!isTelegramConfigured()) return { skipped: "telegram_not_configured" };
  if (bangkokHour(now) !== REPORT_HOUR_BKK) return { skipped: "not_report_hour" };

  const dateKey = bangkokDateKey(now);
  const first = await tryDedupeOnce(`scan_v2:chat_quality_report:${dateKey}`, 40 * 3600);
  if (!first) return { skipped: "already_sent_today" };

  // กบ 21 ก.ค.: ดึงเต็มวันปฏิทินของเมื่อวาน 00:00-23:59 เวลาไทย (ไม่ใช่ 24 ชม ย้อนจากตอนรัน)
  const reportDateKey = bangkokDateKey(new Date(now.getTime() - 24 * 3600 * 1000));
  const dayRange = getBangkokDayUtcRangeExclusiveEnd(reportDateKey);
  const { data: rows, error } = await supabase
    .from("line_conversation_messages")
    .select("line_user_id,role,text,created_at")
    .gte("created_at", dayRange.startIso)
    .lt("created_at", dayRange.endIso)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);
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
  const userIds = [...byUser.keys()].filter((uid) =>
    byUser.get(uid).some((r) => r.role === "user"),
  );
  const truncatedUsers = userIds.length > MAX_USERS_ANALYZED;
  const targetIds = userIds.slice(0, MAX_USERS_ANALYZED);

  let okCount = 0;
  let analyzeFailed = 0;
  const problemCases = [];
  for (const uid of targetIds) {
    const convRows = byUser.get(uid);
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
  // เก็บฉบับล่าสุดให้ Hermes Agent ดึงผ่าน /internal/chat-quality/latest (best-effort)
  try {
    await setAppSetting("chat_quality_last_report", {
      dateKey: reportDateKey,
      text: report,
      createdAt: new Date().toISOString(),
    });
  } catch {}

  const sent = await sendTelegramText(report);
  console.log(
    JSON.stringify({
      event: "CHAT_QUALITY_DAILY_REPORT",
      dateKey,
      convCount: targetIds.length,
      okCount,
      problems: problemCases.length,
      analyzeFailed,
      telegramOk: sent.ok,
      telegramReason: sent.reason ?? null,
    }),
  );
  return { sent: sent.ok, convCount: targetIds.length, problems: problemCases.length };
}
