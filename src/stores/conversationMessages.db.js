import { supabase } from "../config/supabase.js";

const MAX_MESSAGE_CHARS = 8000;

/**
 * Persist a LINE text bubble for conversation history (best-effort; logs on failure).
 * @param {string} lineUserId
 * @param {"user"|"bot"} role
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function insertLineConversationMessage(lineUserId, role, text) {
  const uid = String(lineUserId || "").trim();
  const r = String(role || "").trim();
  if (!uid || (r !== "user" && r !== "bot")) return;

  const body = String(text || "").slice(0, MAX_MESSAGE_CHARS);
  if (!body) return;

  try {
    const { error } = await supabase.from("line_conversation_messages").insert({
      line_user_id: uid,
      role: r,
      text: body,
    });
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
