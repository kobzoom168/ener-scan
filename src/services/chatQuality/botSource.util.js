/**
 * แหล่งที่มาของข้อความบอท (Codex 19 ต.ค. 2026 ข้อ 7): แยกตาม "ผู้สร้างข้อความจริง" ไม่ใช่ชื่อ replyType อย่างเดียว
 *  - บันทึกใหม่: nonScanReply.gateway ประทับ metadata_json.source = "llm" เมื่อข้อความมาจากโมเดล
 *    (ทั้งข้อความ: gemini_front_* / paywall_question_consult · หรือ rephrase ด้วย conversation model = usedAi)
 *    "flow" = template ของ flow · "worker" = ข้อความจาก worker (ack/ผลสแกน) · "human" = แอดมินคนจริง (admin_assist_reply)
 *  - แถวเก่า (ก่อนประทับ): ใช้รายชื่อ replyType ที่ตรวจจากโค้ดว่าเรียกโมเดลจริง + กติกา suffix _deterministic = template
 * ใช้โดย chatQualityDeterministic.util + chatQualityDailyReport (pure · ไม่แตะ env/DB)
 */

/** replyType ที่ "ข้อความทั้งก้อน" มาจากโมเดล — ที่มาในโค้ด: */
export const LLM_REPLY_TYPES = Object.freeze(new Set([
  "gemini_front_consult",      // geminiFrontOrchestrator.service.js runGeminiConsult
  "gemini_front_reply",        // geminiFrontOrchestrator.service.js runGeminiPhrasing
  "gemini_front_help",         // geminiFrontOrchestrator.service.js runGeminiPhrasing (ไม่ใช่ *_deterministic)
  "paywall_question_consult",  // lineWebhook.js runGeminiConsult หลัง paywall
]));

/** ข้อความตายตัวแม้ชื่อคล้าย AI — suffix _deterministic (เช่น gemini_front_help_deterministic, free_quota_exhausted_deterministic) */
export function isDeterministicReplyType(rt) { return /_deterministic$/.test(String(rt || "")); }
export function isLlmReplyType(rt) { const t = String(rt || "").trim(); return !isDeterministicReplyType(t) && LLM_REPLY_TYPES.has(t); }

/**
 * @returns {"llm"|"template"|"human"|"unknown"|null} null = ไม่ใช่บอท
 *  - source "llm" → llm · "human" → human · "worker"/"flow"/"deterministic" → template (เว้น replyType อยู่ในรายชื่อ LLM = llm)
 *  - ไม่มี source: replyType ใน LLM list → llm · suffix _deterministic หรือมี replyType → template · ไม่มีอะไรเลย → unknown
 */
export function classifyBotSource(row) {
  if (row?.role !== "bot") return null;
  const m = row.metadata_json || {};
  const src = String(m.source || "");
  const rt = String(m.replyType || "");
  if (src === "llm") return "llm";
  if (src === "human") return "human";
  if (isDeterministicReplyType(rt)) return "template";
  if (isLlmReplyType(rt)) return "llm";
  if (src === "worker" || src === "flow" || src === "deterministic") return "template";
  if (rt) return "template";
  return "unknown";
}
