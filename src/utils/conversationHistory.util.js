import { supabase } from "../config/supabase.js";

/** @typedef {{ role: "user"|"bot", text: string, created_at: string }} ConversationHistoryRow */

const DEFAULT_LIMIT = 8;
const GEMINI_HISTORY_CHAR_CAP = 2000;

function lineChars(role, text) {
  return String(role || "").length + String(text || "").length + 4;
}

/**
 * Trim oldest-first messages so total characters stay under cap (role+text only).
 * @param {Array<{ role: string, text: string }>} messagesOldestFirst
 * @param {number} [maxChars]
 * @returns {{ role: "user"|"bot", text: string }[]}
 */
export function trimHistoryForGemini(messagesOldestFirst, maxChars = GEMINI_HISTORY_CHAR_CAP) {
  const cap = Number(maxChars) > 0 ? Number(maxChars) : GEMINI_HISTORY_CHAR_CAP;
  const list = Array.isArray(messagesOldestFirst) ? [...messagesOldestFirst] : [];
  const out = [];
  for (const m of list) {
    const role = m.role === "bot" ? "bot" : "user";
    const text = String(m.text || "").trim();
    if (!text) continue;
    out.push({ role, text });
  }
  let total = 0;
  for (const m of out) {
    total += lineChars(m.role, m.text);
  }
  while (out.length > 0 && total > cap) {
    const removed = out.shift();
    if (removed) total -= lineChars(removed.role, removed.text);
  }
  return out;
}

/**
 * Last `limit` messages for a LINE user, oldest first (for model context).
 * On any failure returns [].
 *
 * @param {string} userId
 * @param {number} [limit]
 * @returns {Promise<ConversationHistoryRow[]>}
 */
export async function getRecentConversationHistory(userId, limit = DEFAULT_LIMIT) {
  const uid = String(userId || "").trim();
  const lim = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 10);
  if (!uid) return [];

  try {
    const { data, error } = await supabase
      .from("line_conversation_messages")
      .select("role,text,created_at")
      .eq("line_user_id", uid)
      .order("created_at", { ascending: false })
      .limit(lim);

    if (error) {
      console.error("[CONV_HISTORY] select failed:", {
        lineUserIdPrefix: uid.slice(0, 8),
        code: error.code,
        message: error.message,
      });
      return [];
    }
    const rows = Array.isArray(data) ? data : [];
    const normalized = rows
      .map((r) => ({
        role: r.role === "bot" ? "bot" : "user",
        text: String(r.text || "").trim(),
        created_at:
          r.created_at != null ? String(r.created_at) : new Date(0).toISOString(),
      }))
      .filter((r) => r.text.length > 0);

    normalized.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return normalized;
  } catch (err) {
    console.error("[CONV_HISTORY] select exception (ignored):", {
      lineUserIdPrefix: uid.slice(0, 8),
      message: err?.message,
    });
    return [];
  }
}

/**
 * Fetch + cap for Gemini planner/phrasing (strip timestamps from payload).
 * @param {string} userId
 * @param {number} [limit]
 * @param {number} [maxChars]
 */
export async function getGeminiConversationHistory(userId, limit, maxChars) {
  const raw = await getRecentConversationHistory(userId, limit);
  return trimHistoryForGemini(raw, maxChars);
}
