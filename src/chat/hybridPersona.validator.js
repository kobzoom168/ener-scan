function hasEmojiOrIcon(s) {
  const text = String(s || "");
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text);
}

function extractJsonObject(raw) {
  const s = String(raw || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

/**
 * @param {string} raw
 * @param {{
 *   requiredPhrases?: string[],
 *   forbiddenPhrases?: string[],
 *   maxMessages?: number,
 *   maxCharsPerMessage?: number,
 * }} rules
 * @returns {{ ok: true, messages: string[] } | { ok: false, reason: string }}
 */
export function validateHybridPersonaOutput(raw, rules = {}) {
  const maxMessages = Math.min(3, Math.max(1, Number(rules.maxMessages) || 3));
  const maxCharsPerMessage = Math.max(
    20,
    Number(rules.maxCharsPerMessage) || 90
  );
  const requiredPhrases = (rules.requiredPhrases || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const forbiddenPhrases = (rules.forbiddenPhrases || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  let parsed;
  try {
    parsed = JSON.parse(extractJsonObject(raw));
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "invalid_shape" };
  }
  if (!Array.isArray(parsed.messages)) {
    return { ok: false, reason: "messages_not_array" };
  }
  if (parsed.messages.length < 1 || parsed.messages.length > maxMessages) {
    return { ok: false, reason: "messages_length_out_of_range" };
  }

  const messages = parsed.messages
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  if (messages.length < 1 || messages.length > maxMessages) {
    return { ok: false, reason: "messages_empty_or_trimmed_out" };
  }

  for (const m of messages) {
    if (!/[\u0E00-\u0E7F]/.test(m)) {
      return { ok: false, reason: "not_thai_text" };
    }
    if (hasEmojiOrIcon(m)) {
      return { ok: false, reason: "contains_emoji_or_icon" };
    }
    if (m.length > maxCharsPerMessage) {
      return { ok: false, reason: "message_too_long" };
    }
    if (/^[-*#`]/.test(m) || /```/.test(m)) {
      return { ok: false, reason: "contains_markdown_like" };
    }
  }

  const combined = messages.join("\n");
  for (const bad of forbiddenPhrases) {
    if (bad && combined.includes(bad)) {
      return { ok: false, reason: "contains_forbidden_phrase" };
    }
  }
  if (requiredPhrases.length > 0) {
    const hasAnyRequired = requiredPhrases.some((p) => combined.includes(p));
    if (!hasAnyRequired) {
      return { ok: false, reason: "missing_required_phrase" };
    }
  }

  return { ok: true, messages };
}

