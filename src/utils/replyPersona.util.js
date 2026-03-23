/**
 * Ajarn Ener — generate 1–3 short Thai bubbles from persona config + pattern rotation.
 * Pattern/slot memory is scoped by userId + type + personaVariant (A/B/C).
 */

import { PERSONA_REPLY_CONFIG } from "../config/personaEner.th.js";
import { getAssignedPersonaVariant } from "./personaVariant.util.js";

const lastPatternSigByUser = new Map();
const lastSlotIndexByUser = new Map();
const lastRenderedSignatureByUser = new Map();

function serializePattern(slots) {
  return Array.isArray(slots) ? slots.join("-") : "";
}

function memoryVariantKey(personaVariant) {
  return String(personaVariant || "A").trim() || "A";
}

function stripEmojiIconsAndDecor(text) {
  const s = String(text || "");
  // Remove emoji/pictographs and common decorative glyphs used in copy.
  return s
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replaceAll("🔍", "")
    .replaceAll("🔒", "")
    .replaceAll("💳", "")
    .replaceAll("📎", "")
    .replaceAll("✅", "")
    .replaceAll("❌", "")
    .replaceAll("📜", "")
    .replace(/\s+/g, " ")
    .trim();
}

function signatureForMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((m) => String(m || "").trim())
    .join("\n\n");
}

/**
 * Pick the next pattern (slot order) for user + type + variant, avoiding immediate repeat.
 */
export function pickPattern(userId, type, personaVariant) {
  const pv = memoryVariantKey(personaVariant);
  const config = PERSONA_REPLY_CONFIG[type];
  if (!config || !Array.isArray(config.patterns) || config.patterns.length === 0) {
    return [];
  }

  const uid = String(userId || "").trim();
  const memKey = `${uid}:${type}:${pv}`;
  const patterns = config.patterns.filter(
    (p) => Array.isArray(p) && p.length > 0
  );
  if (patterns.length === 0) return [];

  const lastSig = lastPatternSigByUser.get(memKey);
  let candidates = patterns.filter((p) => serializePattern(p) !== lastSig);
  if (candidates.length === 0) candidates = patterns;

  const chosen =
    candidates[Math.floor(Math.random() * candidates.length)] || patterns[0];
  lastPatternSigByUser.set(memKey, serializePattern(chosen));
  return [...chosen];
}

/**
 * Pick one line from a slot pool without immediate repeat of the same index.
 */
export function pickSlotVariant(userId, type, slot, personaVariant) {
  const pv = memoryVariantKey(personaVariant);
  const config = PERSONA_REPLY_CONFIG[type];
  if (!config?.pools?.[slot]) return "";

  const pool = config.pools[slot];
  if (!Array.isArray(pool) || pool.length === 0) return "";

  const uid = String(userId || "").trim();
  const memKey = `${uid}:${type}:${pv}:${slot}`;
  const lastIdx = lastSlotIndexByUser.get(memKey);

  let idx;
  let guard = 0;
  do {
    idx = Math.floor(Math.random() * pool.length);
    guard += 1;
  } while (pool.length > 1 && idx === lastIdx && guard < 16);

  lastSlotIndexByUser.set(memKey, idx);
  return String(pool[idx] || "").trim().slice(0, 4900);
}

/**
 * @param {string} userId
 * @param {string} type
 * @param {{ personaVariant?: string, state?: string, userMessage?: string }} [opts]
 * @returns {Promise<{ messages: string[], patternUsed: string | null, bubbleCount: number, personaVariant: string }>}
 */
export async function generatePersonaReplyMeta(userId, type, opts = {}) {
  const personaVariant =
    opts.personaVariant ?? (await getAssignedPersonaVariant(userId));
  void opts;
  const config = PERSONA_REPLY_CONFIG[type];
  if (!config) {
    return {
      messages: [],
      patternUsed: null,
      bubbleCount: 0,
      personaVariant,
    };
  }

  const uid = String(userId || "").trim();
  const pvKey = memoryVariantKey(personaVariant);
  const dedupeKey = uid;

  const prevSig = lastRenderedSignatureByUser.get(dedupeKey) || null;
  const maxRegenerateAttempts = 2;
  const totalAttempts = 1 + maxRegenerateAttempts;

  let lastPatternUsed = null;
  let lastMessages = [];

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const chosen = pickPattern(userId, type, personaVariant);
    if (chosen.length === 0) {
      return {
        messages: [],
        patternUsed: null,
        bubbleCount: 0,
        personaVariant,
      };
    }

    const patternUsed = serializePattern(chosen);
    lastPatternUsed = patternUsed;

    const maxN = Math.min(
      Number(config.maxMessages) || 3,
      3,
      chosen.length
    );

    const messages = [];
    for (let i = 0; i < chosen.length && messages.length < maxN; i += 1) {
      const slot = chosen[i];
      const line = pickSlotVariant(userId, type, slot, personaVariant);
      const clean = stripEmojiIconsAndDecor(line);
      if (clean) messages.push(clean);
    }

    lastMessages = messages;
    const renderedSig = signatureForMessages(lastMessages);
    if (renderedSig && renderedSig !== prevSig) {
      lastRenderedSignatureByUser.set(dedupeKey, renderedSig);
      return {
        messages: lastMessages,
        patternUsed,
        bubbleCount: lastMessages.length,
        personaVariant,
      };
    }

    // Retry: clear "immediate repeat" memories for this user/type/variant.
    const memKey = `${uid}:${type}:${pvKey}`;
    lastPatternSigByUser.delete(memKey);
    for (const k of Array.from(lastSlotIndexByUser.keys())) {
      if (k.startsWith(`${uid}:${type}:${pvKey}:`)) {
        lastSlotIndexByUser.delete(k);
      }
    }
  }

  // Still identical: suppress send (messages = []).
  const renderedSig = signatureForMessages(lastMessages);
  if (renderedSig && renderedSig === prevSig) {
    return {
      messages: [],
      patternUsed: lastPatternUsed || null,
      bubbleCount: 0,
      personaVariant,
    };
  }

  if (renderedSig) lastRenderedSignatureByUser.set(dedupeKey, renderedSig);
  return {
    messages: lastMessages,
    patternUsed: lastPatternUsed || null,
    bubbleCount: lastMessages.length,
    personaVariant,
  };
}

/**
 * @param {string} userId
 * @param {string} type
 * @param {{ personaVariant?: string, state?: string, userMessage?: string }} [opts]
 * @returns {Promise<string[]>}
 */
export async function generatePersonaReply(userId, type, opts = {}) {
  const meta = await generatePersonaReplyMeta(userId, type, opts);
  return meta.messages;
}

/** @deprecated alias — use generatePersonaReply */
export async function generateConversation(userId, kind, opts) {
  return generatePersonaReply(userId, kind, opts || {});
}

export function clearPersonaMemory() {
  lastPatternSigByUser.clear();
  lastSlotIndexByUser.clear();
  lastRenderedSignatureByUser.clear();
}

/** @deprecated */
export function clearConversationPatternMemory() {
  clearPersonaMemory();
}
