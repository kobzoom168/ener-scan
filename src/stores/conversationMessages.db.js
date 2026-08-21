import { supabase } from "../config/supabase.js";

const MAX_MESSAGE_CHARS = 8000;

/** คำการเงินที่ห้ามหลุดจากปากอาจารย์ (persona 2 ชั้น 11 ส.ค. 2026) — ใช้ร่วมกับ chat quality monitor */
export const AJARN_MONEY_RE =
  /(\d+\s*บาท|ค่าครู|แพ็กเกจ|แพ็คเกจ|โปรโมชั่น|สลิป|โอนเงิน|พร้อมเพย์|คิวอาร์|\bQR\b|เปิดสิทธิ์|ชำระ|ราคา)/i;

/**
 * เสียงอาจารย์หลุดคำการเงิน → แจ้ง Telegram ทันที (ไม่รอรายงานเช้า) — best-effort + dedupe 1 ชม./คน
 * @param {string} uid
 * @param {string} body
 */
async function maybeAlertAjarnMoneyBreach(uid, body) {
  try {
    if (!AJARN_MONEY_RE.test(body)) return;
    const { tryDedupeOnce } = await import("../redis/scanV2Redis.js");
    if (!(await tryDedupeOnce(`chatq:money_alert:${uid}`, 3600))) return;
    const { sendTelegramText, isTelegramConfigured } = await import(
      "../services/telegramNotify.service.js"
    );
    if (!isTelegramConfigured()) return;
    await sendTelegramText(
      [
        "🔴 CRITICAL: เสียงอาจารย์หลุดคำการเงิน (แจ้งทันที)",
        `user: ${uid}`,
        `ข้อความ: "${body.slice(0, 300)}"`,
        "กติกา persona: เรื่องเงินต้องเป็นเสียงแอดมินเท่านั้น",
      ].join("\n"),
    );
    console.log(
      JSON.stringify({ event: "CHAT_QUALITY_MONEY_BREACH_ALERT", lineUserIdPrefix: uid.slice(0, 8) }),
    );
  } catch {
    /* alert พังห้ามกระทบ flow */
  }
}

/**
 * Persist a LINE text bubble for conversation history (best-effort; logs on failure).
 * @param {string} lineUserId
 * @param {"user"|"bot"} role
 * @param {string} text
 * @param {{ speakerRole?: "admin"|"ajarn"|"consult"|"system", replyType?: string, source?: string } | null} [meta]
 *   persona 2 ชั้น: บอกว่าข้อความ bot เป็นเสียงใคร — เก็บลง metadata_json ให้ monitor ตรวจแบบ role-based
 * @returns {Promise<void>}
 */
/** ที่เก็บ history ตอน CONVERSATION_HISTORY_SINK=memory (เทสต์อ่านกลับได้) */
export const MEMORY_SINK = [];

export async function insertLineConversationMessage(lineUserId, role, text, meta = null) {
  const uid = String(lineUserId || "").trim();
  const r = String(role || "").trim();
  if (!uid || (r !== "user" && r !== "bot")) return;

  const body = String(text || "").slice(0, MAX_MESSAGE_CHARS);
  if (!body) return;

  const cleanMeta =
    meta && typeof meta === "object"
      ? {
          ...(meta.speakerRole ? { speakerRole: String(meta.speakerRole).slice(0, 20) } : {}),
          ...(meta.replyType ? { replyType: String(meta.replyType).slice(0, 60) } : {}),
          ...(meta.source ? { source: String(meta.source).slice(0, 30) } : {}),
        }
      : null;
  const hasMeta = Boolean(cleanMeta && Object.keys(cleanMeta).length);

  if (r === "bot" && cleanMeta?.speakerRole === "ajarn") {
    void maybeAlertAjarnMoneyBreach(uid, body);
  }

  // CONVERSATION_HISTORY_SINK=memory → เก็บในหน่วยความจำ ไม่แตะ DB (hermetic tests)
  if (String(process.env.CONVERSATION_HISTORY_SINK || "").trim().toLowerCase() === "memory") {
    MEMORY_SINK.push({ lineUserId: uid, role: r, text: body, meta: cleanMeta, at: Date.now() });
    if (MEMORY_SINK.length > 500) MEMORY_SINK.splice(0, MEMORY_SINK.length - 500);
    return;
  }

  try {
    let { error } = await supabase.from("line_conversation_messages").insert({
      line_user_id: uid,
      role: r,
      text: body,
      ...(hasMeta ? { metadata_json: cleanMeta } : {}),
    });
    // คอลัมน์ metadata_json ยังไม่ apply (migration 051) → ห้ามทำ history หาย ลองใหม่แบบไม่มี meta
    if (error && hasMeta) {
      ({ error } = await supabase.from("line_conversation_messages").insert({
        line_user_id: uid,
        role: r,
        text: body,
      }));
    }
    if (error) {
      console.error("[CONV_MSG] insert failed:", {
        lineUserIdPrefix: uid.slice(0, 8),
        role: r,
        code: error.code,
        message: error.message,
      });
    }
  } catch (err) {
    console.error("[CONV_MSG] insert exception (ignored):", {
      lineUserIdPrefix: uid.slice(0, 8),
      message: err?.message,
    });
  }
}
